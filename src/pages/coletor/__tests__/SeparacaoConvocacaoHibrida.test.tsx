import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SeparacaoIniciarPage } from "@/pages/coletor/SeparacaoIniciarPage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  navegar: vi.fn(),
  aviso: vi.fn(),
  erro: vi.fn(),
  sucesso: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
  },
}));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const offline = vi.hoisted(() => ({ isOnline: true, cacheData: async () => {}, getCachedData: async () => null }));
vi.mock("@/contexts/OfflineContext", () => ({ useOffline: () => offline }));
// Referências estáveis, como o hook real devolve (evita re-render infinito no teste)
const cacheOndas = vi.hoisted(() => ({
  data: [{ movimento_saida_id: "onda-1", numero_onda: 10, pedidos: "123", tipo_venda: "VENDAS", prioridade: "NORMAL", status: "LIBERADO" }],
  loading: false, isFromCache: false, error: null, refetch: () => Promise.resolve(),
}));
vi.mock("@/hooks/useOfflineCache", () => ({ useOfflineCache: () => cacheOndas }));
const dialogo = vi.hoisted(() => ({ dialogProps: {} as Record<string, unknown> }));
vi.mock("@/hooks/useResultDialog", () => ({
  useResultDialog: () => Object.assign(dialogo, { showWarning: mocks.aviso, showError: mocks.erro, showSuccess: mocks.sucesso }),
}));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));
vi.mock("@/components/coletor/FiltroOndasSheet", () => ({ FiltroOndasSheet: () => null }));

let raiz: Root | undefined;
let container: HTMLDivElement;

async function montar() {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => { raiz?.render(<SeparacaoIniciarPage onNavigate={mocks.navegar} />); });
}

const botao = (texto: RegExp) => Array.from(container.querySelectorAll("button")).find((b) => texto.test(b.textContent || ""));

async function clicar(texto: RegExp) {
  const b = botao(texto);
  if (!b) throw new Error(`Botão não encontrado: ${texto}`);
  await act(async () => { b.click(); });
}

const chamadas = (nome: string) => mocks.rpc.mock.calls.filter(([n]) => n === nome);

function responder(resumo: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  mocks.rpc.mockImplementation(async (nome: string) => {
    if (nome === "separacao_verificar_itens_cancelados") return { data: { tem_itens_cancelados: false }, error: null };
    if (nome === "rpc_coletor_onda_resumo") return { data: { sucesso: true, totais: { tarefas_abertas: 3, tarefas_livres: 3, minhas_tarefas: 0, itens: 3, enderecos: 2, quantidade_pendente: 35 }, operadores: [], ...resumo }, error: null };
    if (nome in extra) return { data: extra[nome], error: null };
    if (nome === "separacao_buscar_tarefas") return { data: [{ tarefa_id: "t1", produto_id: "p1" }], error: null };
    return { data: null, error: null };
  });
}

describe("coletor — convocação híbrida na separação", () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    Object.values(mocks).forEach((m) => m.mockReset());
    localStorage.setItem("core_tenant_id", "tenant");
    localStorage.setItem("core_empresa_id", "empresa");
    localStorage.setItem("core_usuario_id", "usuario");
  });
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); });

  it("selecionar a onda só consulta o resumo; nada é reservado", async () => {
    responder({ pode_assumir: true });
    await montar();
    await clicar(/Onda #10/);
    expect(chamadas("rpc_coletor_onda_resumo")).toHaveLength(1);
    expect(chamadas("rpc_coletor_assumir_etapa")).toHaveLength(0);
    expect(chamadas("separacao_buscar_tarefas")).toHaveLength(0);
    expect(container.textContent).toMatch(/Disponível — você pode assumir/);
    expect(botao(/Assumir e iniciar separação/)).toBeTruthy();
  });

  it("assumir chama a RPC e só então busca as tarefas", async () => {
    responder({ pode_assumir: true }, { rpc_coletor_assumir_etapa: { sucesso: true, codigo: "ETAPA_ASSUMIDA", mensagem: "3 tarefa(s)" } });
    await montar();
    await clicar(/Onda #10/);
    await clicar(/Assumir e iniciar separação/);
    const ordem = mocks.rpc.mock.calls.map(([n]) => n).filter((n) => n === "rpc_coletor_assumir_etapa" || n === "separacao_buscar_tarefas");
    expect(ordem).toEqual(["rpc_coletor_assumir_etapa", "separacao_buscar_tarefas"]);
    expect(chamadas("rpc_coletor_assumir_etapa")[0][1]).toEqual({
      p_tenant_id: "tenant", p_empresa_id: "empresa", p_usuario_id: "usuario", p_movimento_saida_id: "onda-1", p_etapa: "SEP",
    });
    expect(sessionStorage.getItem("coletor_separacao_movimento_id")).toBe("onda-1");
  });

  it("outro operador chegou antes: mostra o motivo e não busca tarefas", async () => {
    responder({ pode_assumir: true }, { rpc_coletor_assumir_etapa: { sucesso: false, codigo: "ETAPA_JA_ASSUMIDA", mensagem: "Esta etapa já está com PAULO." } });
    await montar();
    await clicar(/Onda #10/);
    await clicar(/Assumir e iniciar separação/);
    expect(mocks.erro).toHaveBeenCalledWith(expect.objectContaining({ codigo: "ETAPA_JA_ASSUMIDA" }), expect.anything());
    expect(chamadas("separacao_buscar_tarefas")).toHaveLength(0);
  });

  it("onda designada a outro: botão bloqueado com o motivo", async () => {
    responder({ pode_assumir: false, codigo: "ONDA_DESIGNADA", mensagem: "Onda designada para JOSE pelo gestor." });
    await montar();
    await clicar(/Onda #10/);
    expect(container.textContent).toMatch(/Onda designada para JOSE pelo gestor/);
    expect(botao(/Indisponível/)?.disabled).toBe(true);
  });

  it("assumida pelo próprio operador: pode sair da etapa", async () => {
    responder(
      { pode_assumir: true, ja_e_meu: true, convocado_pelo_gestor: false, totais: { tarefas_abertas: 3, tarefas_livres: 0, minhas_tarefas: 3, itens: 3, enderecos: 2, quantidade_pendente: 35 } },
      { rpc_coletor_sair_etapa: { sucesso: true, codigo: "ETAPA_DEVOLVIDA", mensagem: "3 tarefa(s) devolvida(s) para a fila." } },
    );
    await montar();
    await clicar(/Onda #10/);
    expect(botao(/Continuar separação/)).toBeTruthy();
    await clicar(/Sair da etapa/);
    expect(chamadas("rpc_coletor_sair_etapa")).toHaveLength(1);
    expect(mocks.sucesso).toHaveBeenCalledWith("3 tarefa(s) devolvida(s) para a fila.");
  });

  it("convocada pelo gestor: não oferece sair", async () => {
    responder({ pode_assumir: true, ja_e_meu: true, convocado_pelo_gestor: true });
    await montar();
    await clicar(/Onda #10/);
    expect(container.textContent).toMatch(/Convocada para você pelo gestor/);
    expect(botao(/Sair da etapa/)).toBeUndefined();
  });
});
