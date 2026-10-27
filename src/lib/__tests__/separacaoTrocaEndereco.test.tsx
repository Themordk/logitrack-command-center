import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SeparacaoEnderecoPage } from "@/pages/coletor/SeparacaoEnderecoPage";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), navegar: vi.fn(), aviso: vi.fn(), erro: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/coletor/ScanField", () => ({ ScanField: ({ onScan }: { onScan: (s: string) => void }) => <input aria-label="scan" onChange={e => onScan(e.target.value)} /> }));
vi.mock("@/contexts/OfflineContext", () => ({ useOffline: () => ({ isOnline: true }) }));
vi.mock("@/hooks/useCancelamentoRealtime", () => ({ useCancelamentoRealtime: () => ({ notificacoes: [], dismissNotificacao: vi.fn() }) }));
vi.mock("@/hooks/useFeedback", () => ({ useFeedback: () => ({ error: vi.fn() }) }));
vi.mock("@/hooks/useResultDialog", () => ({ useResultDialog: () => ({ showWarning: mocks.aviso, showError: mocks.erro, showParsedError: mocks.erro, dialogProps: {} }) }));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));

let raiz: Root | undefined;
let container: HTMLDivElement;
async function montar() {
  container = document.createElement("div"); document.body.append(container);
  raiz = createRoot(container);
  await act(async () => { raiz?.render(<SeparacaoEnderecoPage onNavigate={mocks.navegar} />); });
}
const botoes = () => Array.from(container.querySelectorAll("button"));
async function clicar(alvo: RegExp | string) {
  const botao = typeof alvo === "string"
    ? container.querySelector<HTMLButtonElement>(`button[aria-label="${alvo}"]`)
    : botoes().find(b => alvo.test(b.textContent || ""));
  if (!botao) throw new Error(`Ação não encontrada: ${alvo}`);
  await act(async () => { botao.click(); });
}
async function abrirOutrosEnderecos() {
  await clicar("Mais opções");
  await clicar(/Outros Endereços do Produto/);
}
const chamadas = (nome: string) => mocks.rpc.mock.calls.filter(([n]) => n === nome);

const semSaldo = { tarefa_id: "t1", produto_id: "p1", tipo_controle: "SEM_CONTROLE", sku: "496", produto: "NEWLUB", endereco_id: "r100", endereco: "R100-P01-N01-A01", tipo_endereco: "PICKING", situacao_saldo: "SEM_SALDO_PICKING", saldo_endereco: 0, ordem_tarefa: 1, quantidade_requerida: 1 };
const comSaldo = { ...semSaldo, situacao_saldo: "OK", saldo_endereco: 10 };
const alt = (id: string, extra: Record<string, unknown> = {}) => ({ endereco_id: id, endereco: id.toUpperCase(), tipo_endereco: "PICKING", saldo: 15, lote: null, data_validade: null, atende_total: true, picking_mapeado: false, ...extra });

type Respostas = { lista?: unknown[]; troca?: unknown; tarefas?: unknown[] };
function backend({ lista = [], troca = { sucesso: true, codigo: "ENDERECO_TROCADO", mensagem: "ok" }, tarefas = [] }: Respostas) {
  mocks.rpc.mockImplementation(async (nome: string) => {
    if (nome === "separacao_listar_enderecos_alternativos") return { data: lista, error: null };
    if (nome === "separacao_trocar_endereco") return { data: troca, error: null };
    if (nome === "separacao_buscar_tarefas") return { data: tarefas, error: null };
    return { data: null, error: null };
  });
}

describe("troca de endereço pelo modal Outros Endereços", () => {
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear();
    Object.values(mocks).forEach(m => m.mockReset());
    localStorage.setItem("core_tenant_id", "tenant"); localStorage.setItem("core_empresa_id", "empresa"); localStorage.setItem("core_usuario_id", "usuario");
    sessionStorage.setItem("coletor_separacao_movimento_id", "onda");
  });
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); });

  it("tarefa sem saldo: grava o endereço escolhido e libera o scan do novo endereço (caso 2166)", async () => {
    sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify([semSaldo]));
    backend({ lista: [alt("r04")], tarefas: [{ ...comSaldo, endereco_id: "r04", endereco: "R04-P01-N01-A01", saldo_endereco: 15 }] });
    await montar();
    await abrirOutrosEnderecos();
    expect(chamadas("separacao_listar_enderecos_alternativos")[0][1]).toEqual({ p_tenant_id: "tenant", p_tarefa_id: "t1" });

    await clicar(/R04/);
    await clicar(/^Confirmar$/);

    expect(chamadas("separacao_trocar_endereco")[0][1]).toEqual({ p_tenant_id: "tenant", p_tarefa_id: "t1", p_endereco_id: "r04", p_usuario_id: "usuario" });
    expect(chamadas("separacao_buscar_tarefas")).toHaveLength(1);
    expect(container.querySelector("input[aria-label=scan]")).not.toBeNull();
    expect(container.textContent).toContain("R04-P01-N01-A01");
    expect(container.textContent).not.toContain("Outros Endereços do Produto");
    expect(mocks.navegar).not.toHaveBeenCalled();
  });

  it("com vários endereços, envia exatamente o que o operador escolheu", async () => {
    sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify([comSaldo]));
    backend({ lista: [alt("ra"), alt("rb")], tarefas: [{ ...comSaldo, endereco_id: "rb", endereco: "RB" }] });
    await montar();
    await abrirOutrosEnderecos();
    await clicar(/^RB/);
    await clicar(/^Confirmar$/);
    expect(chamadas("separacao_trocar_endereco")[0][1]).toMatchObject({ p_endereco_id: "rb" });
  });

  it("tarefa com saldo não pula mais a leitura do endereço nem guarda troca só no navegador", async () => {
    sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify([comSaldo]));
    backend({ lista: [alt("r04")], tarefas: [{ ...comSaldo, endereco_id: "r04", endereco: "R04" }] });
    await montar();
    await abrirOutrosEnderecos();
    await clicar(/R04/);
    await clicar(/^Confirmar$/);
    expect(mocks.navegar).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("coletor_separacao_tarefa_atual") || "").not.toContain("endereco_alternativo_id");
    expect(container.querySelector("input[aria-label=scan]")).not.toBeNull();
  });

  it("recusa do backend mostra o erro, mantém o modal e não rebusca", async () => {
    sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify([semSaldo]));
    const recusa = { sucesso: false, codigo: "SALDO_INSUFICIENTE", mensagem: "Saldo do endereço não atende a quantidade da tarefa." };
    backend({ lista: [alt("r04")], troca: recusa });
    await montar();
    await abrirOutrosEnderecos();
    await clicar(/R04/);
    await clicar(/^Confirmar$/);
    expect(mocks.erro).toHaveBeenCalledWith(recusa, expect.anything());
    expect(chamadas("separacao_buscar_tarefas")).toHaveLength(0);
    expect(container.textContent).toContain("Outros Endereços do Produto");
  });

  it("endereço que não atende a quantidade aparece desabilitado", async () => {
    sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify([semSaldo]));
    backend({ lista: [alt("r09", { saldo: 0.5, atende_total: false })] });
    await montar();
    await abrirOutrosEnderecos();
    const opcao = botoes().find(b => /R09/.test(b.textContent || ""));
    expect(opcao?.disabled).toBe(true);
    expect(container.textContent).toContain("Saldo não atende a quantidade da tarefa");
  });
});
