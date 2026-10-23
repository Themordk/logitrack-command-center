import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  navegar: vi.fn(),
  movimentos: [] as unknown[],
  updateChain: { eq: vi.fn(), is: vi.fn() },
  update: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: vi.fn(() => ({ update: mocks.update })),
  },
}));
vi.mock("@/hooks/useOfflineCache", () => ({
  useOfflineCache: () => ({ data: mocks.movimentos, loading: false, isFromCache: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/contexts/OcorrenciaColetorContext", () => ({ useOcorrenciaColetorContext: () => ({ setFabVisivel: vi.fn(), setContexto: vi.fn() }) }));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/coletor/FiltroRecebimentoSheet", () => ({ FiltroRecebimentoSheet: () => null }));
vi.mock("@/hooks/useResultDialog", () => ({ useResultDialog: () => ({ showWarning: vi.fn(), showParsedError: vi.fn(), dialogProps: {} }) }));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecebimentoIniciarPage } from "@/pages/coletor/RecebimentoIniciarPage";

const mov = (over: Record<string, unknown>) => ({
  id: "m1", numero_movimento: 374, status: "LIBERADO", tipo_entrada_id: null, tipo_entrada: "Compra",
  prioridade: "NORMAL", devolucao: false, crossdocking: false, parceiro: "CLIENTE", parceiro_busca: "cliente",
  notas: "196942", qtd_documentos: 1, box: "ENTRADA", placa_veiculo: null, confirma_volume: false,
  total_volume: 1, total_volume_conferido: null, qtd_itens: 10, qtd_itens_pendentes: 4,
  conferencia_iniciada_em: null, conferente_nome: null, iniciado_pelo_usuario: false, created_at: null,
  ...over,
});

let raiz: Root | undefined;
let container: HTMLDivElement;
async function montar() {
  container = document.createElement("div"); document.body.append(container);
  raiz = createRoot(container);
  await act(async () => { raiz?.render(<RecebimentoIniciarPage onNavigate={mocks.navegar} />); });
}
const botao = (re: RegExp) => Array.from(container.querySelectorAll("button")).find(b => re.test(b.textContent || ""));

describe("Selecionar Movimento com armazenagem em paralelo", () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("core_tenant_id", "t1");
    localStorage.setItem("core_usuario_id", "u2");
    localStorage.setItem("core_empresa_id", "e1");
    mocks.navegar.mockReset();
    mocks.updateChain.eq.mockReset().mockReturnValue(mocks.updateChain);
    mocks.updateChain.is.mockReset().mockResolvedValue({ error: null });
    mocks.update.mockReset().mockReturnValue(mocks.updateChain);
    mocks.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  });
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); });

  it("mostra LIB_ARMAZENAGEM e ARMAZENAGEM_PARCIAL com aviso de armazenagem em andamento", async () => {
    mocks.movimentos = [
      mov({ id: "a", numero_movimento: 1, status: "LIB_ARMAZENAGEM" }),
      mov({ id: "b", numero_movimento: 2, status: "ARMAZENAGEM_PARCIAL" }),
      mov({ id: "c", numero_movimento: 3, status: "EM_CONFERENCIA" }),
    ];
    await montar();
    expect(container.textContent).toMatch(/LIB\. ARMAZ\./);
    expect(container.textContent).toMatch(/ARMAZ\. PARCIAL/);
    expect(container.textContent?.match(/Armazenagem em andamento/g)).toHaveLength(2);
  });

  it("segundo conferente não sobrescreve quem iniciou a conferência", async () => {
    mocks.movimentos = [mov({ status: "ARMAZENAGEM_PARCIAL", conferencia_iniciada_em: "2026-10-23T13:00:00Z" })];
    await montar();
    await act(async () => { botao(/#374/)?.click(); });
    await act(async () => { botao(/INICIAR CONFERÊNCIA/)?.click(); });

    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ conferencia_iniciada_por: "u2" }));
    expect(mocks.updateChain.eq).toHaveBeenCalledWith("id", "m1");
    expect(mocks.updateChain.is).toHaveBeenCalledWith("conferencia_iniciada_em", null);
    expect(mocks.rpc).toHaveBeenCalledWith("entrada_conferencia_buscar_tarefas", expect.objectContaining({ p_movimento_entrada_id: "m1" }));
    expect(mocks.navegar).toHaveBeenCalledWith("/coletor/recebimento/execucao");
  });
});
