import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({ navegar: vi.fn(), destino: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("@/lib/armazenagemService", async (orig) => ({
  ...(await orig<typeof import("@/lib/armazenagemService")>()),
  buscarDestinoArmazenagem: mocks.destino,
}));
vi.mock("@/contexts/OfflineContext", () => ({ useOffline: () => ({ isOnline: true, cacheData: vi.fn(() => Promise.resolve()), getCachedData: vi.fn() }) }));
vi.mock("@/contexts/OcorrenciaColetorContext", () => ({ useOcorrenciaColetorContext: () => ({ setFabVisivel: vi.fn() }) }));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/coletor/ScanField", () => ({
  ScanField: ({ label, lastScanned }: { label: string; lastScanned?: string }) => <div data-testid="scan" data-label={label}>{lastScanned}</div>,
}));
vi.mock("@/components/coletor/ProdutoHeader", () => ({ ProdutoHeader: () => null }));
vi.mock("@/components/coletor/StatusOverlay", () => ({ StatusOverlay: () => null }));
vi.mock("@/components/ocorrencia/OcorrenciaBottomSheet", () => ({ OcorrenciaBottomSheet: () => null }));
vi.mock("@/hooks/useResultDialog", () => ({ useResultDialog: () => ({ showWarning: vi.fn(), showError: vi.fn(), dialogProps: {} }) }));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));

import { ArmazenagemIniciarPage } from "@/pages/coletor/ArmazenagemIniciarPage";

const destino = {
  sucesso: true,
  produto: { produto_id: "tinta", sku: "9037130", descricao: "TINTA", usa_picking: true, varios_pickings: false, fator_caixa: 1 },
  tarefa: { tarefa_id: "t1", requerida: 24, executada: 0, restante: 24 },
  quantidade: 24,
  pickings: [{ endereco_id: "end1", endereco: "R01-P02-N03-A101", situacao: "OCUPADO", saldo: 56, est_minimo: 1, est_maximo: null, cabe: null, status: "SEM_LIMITE" }],
  pulmao: { saldo: 0, enderecos: 0, habilitado: true, enderecos_disponiveis: 3 },
  recomendacao: { destino: "PICKING", endereco_id: "end1", endereco: "R01-P02-N03-A101", quantidade_picking: 24, quantidade_pulmao: 0, quantidade_sem_destino: 0, motivo: "Picking com espaço" },
};

let raiz: Root | undefined;
let container: HTMLDivElement;
async function montar() {
  container = document.createElement("div"); document.body.append(container);
  raiz = createRoot(container);
  await act(async () => { raiz?.render(<ArmazenagemIniciarPage onNavigate={mocks.navegar} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}
const botao = (re: RegExp) => Array.from(container.querySelectorAll("button")).find(b => re.test(b.textContent || ""));

describe("/iniciar recebendo a conferência feita na lista", () => {
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear(); mocks.navegar.mockReset();
    mocks.destino.mockReset(); mocks.destino.mockResolvedValue(destino);
    Object.entries({
      tarefa_id: "t1", produto_id: "tinta", produto_desc: "TINTA", produto_sku: "9037130",
      qtd_restante: "24", qtd_requerida: "24", qtd_executada: "0", fator: "12",
    }).forEach(([k, v]) => sessionStorage.setItem(`coletor_armazenagem_${k}`, v));
  });
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); });

  it("com EAN conferido na lista abre liberada e segue para a execução mantendo o fator", async () => {
    sessionStorage.setItem("coletor_armazenagem_ean_confirmado", JSON.stringify({ tarefa_id: "t1", codigo: "17891234567897" }));
    await montar();
    const scan = container.querySelector('[data-testid="scan"]');
    expect(scan?.getAttribute("data-label")).toBe("Produto conferido");
    expect(scan?.textContent).toBe("17891234567897");
    expect(container.textContent).not.toMatch(/Bipe o produto para liberar o destino/);
    expect(sessionStorage.getItem("coletor_armazenagem_ean_confirmado")).toBeNull();
    const seguir = botao(/SEGUIR PARA O PICKING/);
    expect(seguir?.disabled).toBe(false);
    await act(async () => { seguir?.click(); });
    expect(mocks.navegar).toHaveBeenCalledWith("/coletor/armazenagem/execucao");
    expect(sessionStorage.getItem("coletor_armazenagem_fator")).toBe("12");
    expect(sessionStorage.getItem("coletor_armazenagem_destino_endereco_id")).toBe("end1");
  });

  it("sem conferência na lista continua exigindo o bipe do EAN", async () => {
    await montar();
    expect(container.querySelector('[data-testid="scan"]')?.getAttribute("data-label")).toBe("Bipe o EAN do produto");
    expect(container.textContent).toMatch(/Bipe o produto para liberar o destino/);
    expect(botao(/SEGUIR PARA O PICKING/)?.disabled).toBe(true);
  });

  it("conferência de outra tarefa não libera esta", async () => {
    sessionStorage.setItem("coletor_armazenagem_ean_confirmado", JSON.stringify({ tarefa_id: "t2", codigo: "789" }));
    await montar();
    expect(container.textContent).toMatch(/Bipe o produto para liberar o destino/);
    expect(botao(/SEGUIR PARA O PICKING/)?.disabled).toBe(true);
  });
});
