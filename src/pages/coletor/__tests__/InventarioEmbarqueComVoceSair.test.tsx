import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({ navegar: vi.fn(), inventarios: [] as unknown[], cargas: [] as unknown[], rpc: vi.fn(), sucesso: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: vi.fn() } }));
vi.mock("@/hooks/useOfflineCache", () => ({
  useOfflineCache: () => ({ data: mocks.inventarios, loading: false, isFromCache: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@/contexts/OfflineContext", () => ({ useOffline: () => ({ isOnline: true, cacheData: vi.fn(), getCachedData: vi.fn() }) }));
vi.mock("@/hooks/useOfflineAction", () => ({ useOfflineAction: () => ({ execute: vi.fn() }) }));
vi.mock("@/components/coletor/OnlineOnlyNotice", () => ({ OnlineOnlyNotice: () => null, useOnlineOnlyBlocked: () => false }));
vi.mock("@/components/coletor/FiltroCargasSheet", () => ({ FiltroCargasSheet: () => null }));
vi.mock("@/lib/cargaService", () => ({ cargaService: { buscarCargasColetor: async () => mocks.cargas } }));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/hooks/useResultDialog", () => ({
  useResultDialog: () => ({ showWarning: vi.fn(), showParsedError: vi.fn(), showError: vi.fn(), showSuccess: mocks.sucesso, dialogProps: {} }),
}));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InventarioListPage } from "@/pages/coletor/InventarioListPage";
import { EmbarqueCargasPage } from "@/pages/coletor/EmbarqueCargasPage";

let raiz: Root | undefined;
let container: HTMLDivElement;
async function montar(el: React.ReactElement) {
  container = document.createElement("div"); document.body.append(container);
  raiz = createRoot(container);
  await act(async () => { raiz?.render(el); });
  await act(async () => { await Promise.resolve(); });
}
const botao = (re: RegExp) => Array.from(container.querySelectorAll("button")).find((b) => re.test(b.textContent || ""));
const chamadas = (nome: string) => mocks.rpc.mock.calls.filter((c) => c[0] === nome);
const sairOk = async (nome: string, a?: Record<string, unknown>) => {
  if (nome === "rpc_coletor_sair_etapa") {
    return { data: a?.p_simular
      ? { sucesso: true, codigo: "SIMULACAO", resumo: { total: 2, nao_iniciadas: 2, em_execucao: 0, com_progresso: 0, produto_em_maos: 0 } }
      : { sucesso: true, codigo: "ETAPA_DEVOLVIDA", mensagem: "2 tarefa(s) devolvida(s) para a fila.", tarefas_devolvidas: 2, tarefas_mantidas: 0 }, error: null };
  }
  return null;
};

describe("Inventário e embarque no padrão da separação", () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem("core_tenant_id", "t1"); localStorage.setItem("core_usuario_id", "u1");
    localStorage.setItem("core_empresa_id", "e1"); localStorage.setItem("core_usuario_nome", "Izaias");
    mocks.inventarios = [{ id: "i1", numero_inventario: 42, tipo_inventario: "GERAL", origem: "MANUAL", status: "EM_CONTAGEM" }];
    mocks.cargas = [{ id: "c1", numero_carga: 7, status: "LIBERADA", prioridade: "NORMAL", box: "B1", motorista: null,
      unidades_total: 4, unidades_embarcadas: 0, documentos: 1, unidade_embarque: null, reserva_carga: false,
      convocado: true, responsaveis: ["Izaias"], operadores: [] }];
    mocks.sucesso.mockReset();
    mocks.rpc.mockReset().mockImplementation(async (nome: string, a?: Record<string, unknown>) => {
      if (nome === "rpc_coletor_inventario_atribuicoes") {
        return { data: [{ inventario_id: "i1", atribuido_ao_usuario: true, operador_nome: "Izaias", qtd_operadores: 1, minhas_tarefas: 2 }], error: null };
      }
      return (await sairOk(nome, a)) ?? { data: [], error: null };
    });
  });
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); });

  it("inventário: 'Com você', continuar e Sair com um toque", async () => {
    await montar(<InventarioListPage onNavigate={mocks.navegar} />);
    expect(chamadas("rpc_coletor_inventario_atribuicoes")[0][1]).toEqual(expect.objectContaining({ p_inventario_ids: ["i1"] }));
    expect(container.textContent).toMatch(/Com você: Izaias/);
    await act(async () => { botao(/Inventário #42/)?.click(); });
    expect(botao(/Continuar contagem/)).toBeTruthy();
    await act(async () => { botao(/Sair da etapa/)?.click(); });
    const sair = chamadas("rpc_coletor_sair_etapa");
    expect(sair).toHaveLength(2);
    expect(sair[0][1]).toEqual(expect.objectContaining({ p_contexto_tipo: "INVENTARIO", p_contexto_id: "i1", p_simular: true }));
    expect(mocks.sucesso).toHaveBeenCalledWith("2 tarefa(s) devolvida(s) para a fila.");
  });

  it("inventário de outro operador: sem Sair, ação de iniciar", async () => {
    mocks.rpc.mockImplementation(async (nome: string) => nome === "rpc_coletor_inventario_atribuicoes"
      ? { data: [{ inventario_id: "i1", atribuido_ao_usuario: false, operador_nome: "Ana", qtd_operadores: 1, minhas_tarefas: 0 }], error: null }
      : { data: [], error: null });
    await montar(<InventarioListPage onNavigate={mocks.navegar} />);
    expect(container.textContent).toMatch(/Com: Ana/);
    await act(async () => { botao(/Inventário #42/)?.click(); });
    expect(botao(/Sair da etapa/)).toBeFalsy();
    expect(botao(/Início de Contagem/)).toBeTruthy();
  });

  it("embarque: 'Com você: nome', continuar e Sair com um toque", async () => {
    await montar(<EmbarqueCargasPage onNavigate={mocks.navegar} />);
    expect(container.textContent).toMatch(/Com você: Izaias/);
    await act(async () => { botao(/Carga #7/)?.click(); });
    expect(botao(/Continuar embarque/)).toBeTruthy();
    await act(async () => { botao(/Sair da etapa/)?.click(); });
    const sair = chamadas("rpc_coletor_sair_etapa");
    expect(sair).toHaveLength(2);
    expect(sair[0][1]).toEqual(expect.objectContaining({ p_contexto_tipo: "CARGA", p_contexto_id: "c1", p_etapa: "EMB" }));
  });
});
