import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({ navegar: vi.fn(), movimentos: [] as unknown[], rpc: vi.fn(), sucesso: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: vi.fn() } }));
vi.mock("@/hooks/useOfflineCache", () => ({
  useOfflineCache: () => ({ data: mocks.movimentos, loading: false, isFromCache: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/contexts/OfflineContext", () => ({ useOffline: () => ({ isOnline: true }) }));
vi.mock("@/contexts/OcorrenciaColetorContext", () => ({ useOcorrenciaColetorContext: () => ({ setFabVisivel: vi.fn(), setContexto: vi.fn() }) }));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/coletor/FiltroRecebimentoSheet", () => ({ FiltroRecebimentoSheet: () => null }));
vi.mock("@/hooks/useResultDialog", () => ({
  useResultDialog: () => ({ showWarning: vi.fn(), showParsedError: vi.fn(), showError: vi.fn(), showSuccess: mocks.sucesso, dialogProps: {} }),
}));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecebimentoIniciarPage } from "@/pages/coletor/RecebimentoIniciarPage";
import { precisaEscolherAoSair } from "@/lib/sairEtapaService";

const mov = { id: "m1", numero_movimento: 327, status: "EM_CONFERENCIA", tipo_entrada_id: null, tipo_entrada: "COMPRAS",
  prioridade: "URGENTE", devolucao: false, crossdocking: false, parceiro: "PARCEIRO A", parceiro_busca: "parceiro a",
  notas: "10", qtd_documentos: 1, box: "DOCA", placa_veiculo: null, confirma_volume: false, total_volume: 10,
  total_volume_conferido: null, qtd_itens: 3, qtd_itens_pendentes: 3, conferencia_iniciada_em: null,
  conferente_nome: null, iniciado_pelo_usuario: false, created_at: null };

let raiz: Root | undefined;
let container: HTMLDivElement;
async function montar() {
  container = document.createElement("div"); document.body.append(container);
  raiz = createRoot(container);
  await act(async () => { raiz?.render(<RecebimentoIniciarPage onNavigate={mocks.navegar} />); });
  await act(async () => { await Promise.resolve(); });
}
const botao = (re: RegExp) => Array.from(container.querySelectorAll("button")).find((b) => re.test(b.textContent || ""));
const chamadas = (nome: string) => mocks.rpc.mock.calls.filter((c) => c[0] === nome);

describe("Recebimento no padrão da separação: Com você e Sair com um toque", () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("core_tenant_id", "t1"); localStorage.setItem("core_usuario_id", "u1"); localStorage.setItem("core_empresa_id", "e1");
    mocks.movimentos = [mov];
    mocks.sucesso.mockReset();
    mocks.rpc.mockReset().mockImplementation(async (nome: string, a?: Record<string, unknown>) => {
      if (nome === "rpc_coletor_entrada_atribuicoes") {
        return { data: [{ movimento_entrada_id: "m1", atribuido_ao_usuario: true, operador_nome: "Izaias", qtd_operadores: 1, minhas_tarefas: 3 }], error: null };
      }
      if (nome === "rpc_coletor_sair_etapa") {
        return { data: a?.p_simular
          ? { sucesso: true, codigo: "SIMULACAO", resumo: { total: 3, nao_iniciadas: 3, em_execucao: 0, com_progresso: 0, produto_em_maos: 0 } }
          : { sucesso: true, codigo: "ETAPA_DEVOLVIDA", mensagem: "3 tarefa(s) devolvida(s) para a fila.", tarefas_devolvidas: 3, tarefas_mantidas: 0 }, error: null };
      }
      return { data: [], error: null };
    });
  });
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); });

  it("card mostra prioridade, 'Com você' e o botão de continuar", async () => {
    await montar();
    expect(chamadas("rpc_coletor_entrada_atribuicoes")[0][1]).toEqual(expect.objectContaining({ p_movimento_ids: ["m1"], p_tipo_codigo: "ENTR-CONF" }));
    expect(container.textContent).toMatch(/Movimento #327/);
    expect(container.textContent).toMatch(/URGENTE/);
    expect(container.textContent).toMatch(/Com você: Izaias/);
    await act(async () => { botao(/Movimento #327/)?.click(); });
    expect(botao(/Continuar conferência/)).toBeTruthy();
  });

  it("sem tarefa em execução, Sair devolve direto, sem abrir folha", async () => {
    await montar();
    await act(async () => { botao(/Movimento #327/)?.click(); });
    await act(async () => { botao(/Sair da etapa/)?.click(); });
    const sair = chamadas("rpc_coletor_sair_etapa");
    expect(sair).toHaveLength(2);
    expect(sair[0][1]).toEqual(expect.objectContaining({ p_contexto_tipo: "MOVIMENTO_ENTRADA", p_contexto_id: "m1", p_etapa: "ENTR-CONF", p_simular: true }));
    expect(sair[1][1]).toEqual(expect.objectContaining({ p_simular: false }));
    expect(container.textContent).not.toMatch(/Devolver/);
    expect(mocks.sucesso).toHaveBeenCalledWith("3 tarefa(s) devolvida(s) para a fila.");
  });

  it("regra de quando precisa escolher", () => {
    const base = { sucesso: true, codigo: "SIMULACAO" };
    expect(precisaEscolherAoSair({ ...base, resumo: { total: 2, nao_iniciadas: 2, em_execucao: 0, com_progresso: 0, produto_em_maos: 0 } })).toBe(false);
    expect(precisaEscolherAoSair({ ...base, resumo: { total: 2, nao_iniciadas: 1, em_execucao: 1, com_progresso: 0, produto_em_maos: 0 } })).toBe(true);
    expect(precisaEscolherAoSair({ ...base, resumo: { total: 2, nao_iniciadas: 1, em_execucao: 0, com_progresso: 1, produto_em_maos: 0 } })).toBe(true);
    expect(precisaEscolherAoSair({ sucesso: false, codigo: "ATRIBUICAO_DO_GESTOR" })).toBe(true);
  });
});
