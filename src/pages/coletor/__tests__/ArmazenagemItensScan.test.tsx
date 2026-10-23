import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  embalagens: [] as unknown[],
  hus: [] as unknown[],
  embErro: null as null | { message: string },
  eanOutroProduto: [] as unknown[],
  from: vi.fn(),
  navegar: vi.fn(),
  aviso: vi.fn(),
  cache: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain = (tabela: string) => {
    let porEan = false;
    const resultado = () =>
      tabela !== "produto_embalagem"
        ? { data: mocks.hus, error: null }
        : porEan
          ? { data: mocks.eanOutroProduto, error: null }
          : { data: mocks.embErro ? null : mocks.embalagens, error: mocks.embErro };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "in", "not", "neq", "limit"]) q[m] = vi.fn(() => q);
    q.eq = vi.fn(() => { porEan = true; return q; });
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
    return q;
  };
  return { supabase: { rpc: mocks.rpc, from: (t: string) => { mocks.from(t); return chain(t); } } };
});
vi.mock("@/hooks/useOfflineCache", async () => {
  const React = await import("react");
  return {
    useOfflineCache: (_k: string, fetcher: () => Promise<unknown>) => {
      const [data, setData] = React.useState<unknown>(null);
      const [loading, setLoading] = React.useState(true);
      React.useEffect(() => { fetcher().then(d => { setData(d); setLoading(false); }); }, [fetcher]);
      return { data, loading, isFromCache: false, refetch: vi.fn() };
    },
  };
});
vi.mock("@/lib/offlineStore", () => ({ cacheData: mocks.cache }));
vi.mock("@/contexts/OcorrenciaColetorContext", () => ({ useOcorrenciaColetorContext: () => ({ setFabVisivel: vi.fn(), setContexto: vi.fn() }) }));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/coletor/RefreshListButton", () => ({ RefreshListButton: () => null }));
vi.mock("@/components/coletor/ScanField", () => ({
  ScanField: ({ onScan, label, disabled }: { onScan: (s: string) => void; label: string; disabled?: boolean }) => (
    <input aria-label="scan" data-label={label} disabled={disabled} onKeyDown={e => { if (e.key === "Enter") onScan((e.target as HTMLInputElement).value); }} />
  ),
}));
// O overlay conclui imediatamente, simulando o fim da animação.
vi.mock("@/components/coletor/StatusOverlay", async () => {
  const React = await import("react");
  return {
    StatusOverlay: ({ type, message, onDone }: { type: string | null; message: string; onDone: () => void }) => {
      React.useEffect(() => { if (type) onDone(); }, [type, onDone]);
      return type ? <div data-testid="overlay">{message}</div> : null;
    },
  };
});
vi.mock("@/hooks/useFeedback", () => ({ useFeedback: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/hooks/useResultDialog", () => ({ useResultDialog: () => ({ showWarning: mocks.aviso, showError: vi.fn(), dialogProps: {} }) }));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));

import { ArmazenagemItensPage } from "@/pages/coletor/ArmazenagemItensPage";

const base = {
  referencia: "0680095", lote: "", validade: null, fabricacao: null, varios_pickings: false,
  picking_endereco_id: "end1", picking_endereco_desc: "R01-P02-N03-A101", picking_rua: 1, picking_predio: 2, picking_nivel: 3, picking_apto: 101,
  saldo_picking: 56, picking_est_minimo: 1, picking_est_maximo: 20, picking_ok: true, fator_caixa: 1,
  quantidade_requerida: 24, quantidade_executada: 0, qtd_restante: 24,
};
const tinta = { ...base, tarefa_id: "t1", movimento_entrada_item_id: "mi1", produto_id: "tinta", sku: "9037130", descricao: "TINTA SPRAY BRANCO" };
const pincelA = { ...base, tarefa_id: "t2", movimento_entrada_item_id: "mi2", produto_id: "pincel", sku: "111", descricao: "PINCEL", lote: "L1" };
const pincelB = { ...base, tarefa_id: "t3", movimento_entrada_item_id: "mi3", produto_id: "pincel", sku: "111", descricao: "PINCEL", lote: "L2" };

let raiz: Root | undefined;
let container: HTMLDivElement;
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
async function montar() {
  container = document.createElement("div"); document.body.append(container);
  raiz = createRoot(container);
  await act(async () => { raiz?.render(<ArmazenagemItensPage onNavigate={mocks.navegar} />); });
  await flush();
}
async function bipar(codigo: string) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="scan"]');
  if (!input) throw new Error("campo de leitura não renderizado");
  input.value = codigo;
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  await flush();
}
const cards = () => Array.from(container.querySelectorAll<HTMLElement>('[data-testid="item-armazenagem"]'));
const ss = (k: string) => sessionStorage.getItem(`coletor_armazenagem_${k}`);

describe("lista de itens da armazenagem com leitura de EAN", () => {
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear();
    mocks.rpc.mockReset(); mocks.navegar.mockReset(); mocks.aviso.mockReset(); mocks.cache.mockClear(); mocks.from.mockReset();
    mocks.embErro = null;
    mocks.eanOutroProduto = [];
    localStorage.setItem("core_tenant_id", "tenant"); localStorage.setItem("core_empresa_id", "empresa");
    sessionStorage.setItem("coletor_armazenagem_movimento_id", "mov");
    sessionStorage.setItem("coletor_armazenagem_movimento_numero", "353");
    mocks.rpc.mockResolvedValue({ data: [tinta, pincelA, pincelB], error: null });
    mocks.embalagens = [
      { produto_id: "tinta", ean: "7891234567890", fator: 1, ativo: true },
      { produto_id: "tinta", ean: "17891234567897", fator: 12, ativo: true },
      { produto_id: "pincel", ean: "7890000000001", fator: 1, ativo: true },
    ];
    mocks.hus = [{ tarefa_id: "t1", hu: "hu-uuid", hu_rel: { codigo_hu: "HU-0001", tipo_hu: "PALETE", tamanho: "P" } }];
  });
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); });

  it("busca as embalagens dos produtos da lista e mostra o campo de leitura", async () => {
    await montar();
    expect(mocks.from).toHaveBeenCalledWith("produto_embalagem");
    expect(cards()).toHaveLength(3);
    expect(container.querySelector('input[aria-label="scan"]')?.getAttribute("data-label")).toMatch(/EAN/);
    expect(mocks.cache).toHaveBeenCalledWith("ean_emb_produto_tinta", expect.arrayContaining([{ ean: "17891234567897", fator: 12 }]), 480);
  });

  it("EAN de caixa confirma o produto e vai para /iniciar com o fator da embalagem", async () => {
    await montar();
    await bipar("17891234567897");
    expect(mocks.navegar).toHaveBeenCalledWith("/coletor/armazenagem/iniciar");
    expect(ss("tarefa_id")).toBe("t1");
    expect(ss("fator")).toBe("12");
    expect(JSON.parse(ss("ean_confirmado") || "{}")).toEqual({ tarefa_id: "t1", codigo: "17891234567897" });
    expect(ss("hu_codigo")).toBe("HU-0001");
  });

  it("SKU não é aceito: avisa e não navega", async () => {
    await montar();
    await bipar("9037130");
    expect(mocks.navegar).not.toHaveBeenCalled();
    expect(mocks.aviso).toHaveBeenCalledWith("EAN não encontrado neste movimento", expect.objectContaining({ instruction: expect.stringMatching(/SKU/) }));
  });

  it("EAN cadastrado de produto fora do movimento avisa o operador", async () => {
    mocks.eanOutroProduto = [{ produto_id: "rolo" }];
    await montar();
    await bipar("7895555555555");
    expect(mocks.navegar).not.toHaveBeenCalled();
    expect(mocks.aviso).toHaveBeenCalledWith("Produto não pertence ao Movimento #353", expect.anything());
  });

  it("offline não consulta o servidor e mostra EAN não encontrado", async () => {
    await montar();
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.eanOutroProduto = [{ produto_id: "rolo" }];
    mocks.from.mockClear();
    await bipar("7895555555555");
    online.mockRestore();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.aviso).toHaveBeenCalledWith("EAN não encontrado neste movimento", expect.anything());
  });

  it("offline o bipe usa o mapa já carregado e confirma o produto", async () => {
    await montar();
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await bipar("7891234567890");
    online.mockRestore();
    expect(mocks.navegar).toHaveBeenCalledWith("/coletor/armazenagem/iniciar");
    expect(ss("fator")).toBe("1");
  });

  it("mesmo produto em duas tarefas filtra e destaca; o toque leva a conferência junto", async () => {
    await montar();
    await bipar("7890000000001");
    expect(mocks.navegar).not.toHaveBeenCalled();
    expect(cards()).toHaveLength(2);
    expect(container.textContent).toMatch(/2 de 3 item/);
    await act(async () => { cards()[1].click(); });
    expect(mocks.navegar).toHaveBeenCalledWith("/coletor/armazenagem/iniciar");
    expect(ss("tarefa_id")).toBe("t3");
    expect(JSON.parse(ss("ean_confirmado") || "{}")).toEqual({ tarefa_id: "t3", codigo: "7890000000001" });
  });

  it("Limpar desfaz o filtro", async () => {
    await montar();
    await bipar("7890000000001");
    const limpar = Array.from(container.querySelectorAll("button")).find(b => /Limpar/.test(b.textContent || ""));
    await act(async () => { limpar?.click(); });
    expect(cards()).toHaveLength(3);
  });

  it("HU localiza a tarefa mas não confirma o EAN", async () => {
    await montar();
    await bipar("hu-0001");
    expect(mocks.navegar).toHaveBeenCalledWith("/coletor/armazenagem/iniciar");
    expect(ss("tarefa_id")).toBe("t1");
    expect(ss("ean_confirmado")).toBeNull();
  });

  it("toque no card sem bipe mantém o fluxo atual e limpa conferência antiga", async () => {
    sessionStorage.setItem("coletor_armazenagem_ean_confirmado", JSON.stringify({ tarefa_id: "t1", codigo: "x" }));
    await montar();
    await act(async () => { cards()[0].click(); });
    expect(ss("tarefa_id")).toBe("t1");
    expect(ss("fator")).toBe("1");
    expect(ss("ean_confirmado")).toBeNull();
  });

  it("falha ao ler embalagens não derruba a lista", async () => {
    mocks.embErro = { message: "falhou" };
    await montar();
    expect(cards()).toHaveLength(3);
    await bipar("7891234567890");
    expect(mocks.navegar).not.toHaveBeenCalled();
    expect(mocks.aviso).toHaveBeenCalled();
  });
});
