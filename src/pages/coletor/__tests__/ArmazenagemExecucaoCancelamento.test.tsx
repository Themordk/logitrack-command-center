import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, screen, waitFor, cleanup, act } from "@testing-library/react";
const m = vi.hoisted(() => ({ rpc: vi.fn(), offline: vi.fn(), navegar: vi.fn(), aviso: vi.fn(), sucesso: vi.fn(), erro: vi.fn(), from: vi.fn(), listener: vi.fn(), documento: vi.fn(), online: true, destinoId: "destino", tipo: "PULMAO" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: m.rpc,
  from: (tabela: string) => {
    m.from(tabela);
    const resultado = () => ({ data: tabela === "endereco" ? [{ id: m.destinoId, descricao: "R01-P01-N01-A01", situacao: "LIVRE", tipo_endereco: m.tipo }] : tabela === "tarefa" ? { id_documento_origem: "mi" } : tabela === "movimento_entrada_item" ? { movimento_entrada_id: "mov" } : null, error: null });
    const q: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "limit", "single", "maybeSingle", "insert"]) q[metodo] = () => q;
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resultado()).then(resolve);
    return q;
  },
} }));
vi.mock("@/hooks/useOfflineAction", () => ({ useOfflineAction: () => ({ execute: m.offline, isOnline: m.online }) }));
vi.mock("@/hooks/useCancelamentoListener", () => ({ useCancelamentoListener: (...args: unknown[]) => { m.listener(...args); return { cancelamento: null }; }, documentoEntradaCancelado: m.documento }));
vi.mock("@/hooks/useResultDialog", () => ({ useResultDialog: () => ({ showWarning: m.aviso, showSuccess: m.sucesso, showError: m.erro, dialogProps: {} }) }));
vi.mock("@/contexts/OcorrenciaColetorContext", () => ({ useOcorrenciaColetorContext: () => ({ setFabVisivel: vi.fn() }) }));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/coletor/ProdutoHeader", () => ({ ProdutoHeader: () => null }));
vi.mock("@/components/coletor/StatusOverlay", () => ({ StatusOverlay: () => null }));
vi.mock("@/components/coletor/CancelamentoOverlay", () => ({ CancelamentoOverlay: () => null }));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));
vi.mock("@/components/coletor/ScanField", () => ({ ScanField: ({ onScan }: { onScan: (v: string) => void }) => <button onClick={() => onScan("101")}>Bipar destino</button> }));
vi.mock("@/lib/lmsTimestamp", () => ({ markTarefaIniciadaByTarefa: vi.fn() }));
vi.mock("@/lib/offlineEnderecoCache", () => ({ getEnderecoFromCache: () => Promise.resolve({ id: m.destinoId, descricao: "DESTINO", situacao: "LIVRE", tipo_endereco: m.tipo }), saveEnderecoToCache: () => Promise.resolve() }));
vi.mock("@/hooks/useFeedback", () => ({ useFeedback: () => ({ error: vi.fn() }) }));
import { ArmazenagemExecucaoPage } from "../ArmazenagemExecucaoPage";
const confirmar = async () => { fireEvent.click(screen.getByText("Bipar destino")); await waitFor(() => expect(screen.getByText("CONFIRMAR ARMAZENAGEM")).not.toBeDisabled()); await act(async () => { fireEvent.click(screen.getByText("CONFIRMAR ARMAZENAGEM")); }); };
const ultimoAviso = () => m.aviso.mock.calls.at(-1)?.[1] as { onClose?: () => void };
describe("execução de armazenagem por origem", () => {
  beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); m.online = true; m.destinoId = "destino"; m.tipo = "PULMAO";
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => m.online);
    Object.entries({ tenant_id: "tenant", usuario_id: "operador", empresa_id: "empresa", armazem_id: "armazem" }).forEach(([k, v]) => localStorage.setItem(`core_${k}`, v));
    Object.entries({ origem: "CANCELAMENTO", tarefa_id: "t1", produto_id: "p1", produto_desc: "Produto", qtd_restante: "24", fator: "12", canc_origem_id: "origem", lote: "L1", validade: "2027-01-01", hu: "hu1" }).forEach(([k, v]) => sessionStorage.setItem(`coletor_armazenagem_${k}`, v));
    m.rpc.mockResolvedValue({ data: { sucesso: true }, error: null }); m.offline.mockResolvedValue({ success: true, offline: false, data: { sucesso: true } });
    render(<ArmazenagemExecucaoPage onNavigate={m.navegar} />);
    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "2" } });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it("cancelamento usa só os parâmetros do contrato e normaliza pela embalagem", async () => {
    await confirmar(); await waitFor(() => expect(m.sucesso).toHaveBeenCalled());
    expect(m.rpc).toHaveBeenCalledWith("finalizar_armazenagem_cancelamento", { p_tenant_id: "tenant", p_tarefa_id: "t1", p_usuario: "operador", p_quantidade: 24, p_endereco_destino_id: "destino" });
    expect(m.offline).not.toHaveBeenCalled(); expect(m.from).not.toHaveBeenCalledWith("tarefa"); expect(m.from).not.toHaveBeenCalledWith("movimento_entrada_documento"); expect(m.documento).not.toHaveBeenCalled(); expect(m.listener).toHaveBeenCalledWith(null, "tenant");
    expect(m.from).toHaveBeenCalledWith("log_sugestao_armazenagem");
  });
  it("cancelamento offline nunca enfileira a operação", async () => {
    m.online = false; await confirmar(); await waitFor(() => expect(m.aviso).toHaveBeenCalled()); expect(m.rpc).not.toHaveBeenCalled(); expect(m.offline).not.toHaveBeenCalled();
  });
  it("saldo insuficiente positivo preenche quantidade na unidade da embalagem", async () => {
    m.rpc.mockResolvedValue({ data: { sucesso: false, codigo: "SALDO_INSUFICIENTE", dados: { restante: 18 } }, error: null });
    await confirmar(); await waitFor(() => expect(screen.getByLabelText("Quantidade")).toHaveValue(1.5));
    fireEvent.click(screen.getByText("CONFIRMAR ARMAZENAGEM")); await waitFor(() => expect(m.rpc).toHaveBeenLastCalledWith("finalizar_armazenagem_cancelamento", expect.objectContaining({ p_quantidade: 18 })));
  });
  it("saldo insuficiente zero retorna para atualizar lista", async () => {
    m.rpc.mockResolvedValue({ data: { sucesso: false, codigo: "SALDO_INSUFICIENTE", dados: { restante: 0 } }, error: null }); await confirmar(); await waitFor(() => expect(m.aviso).toHaveBeenCalled()); ultimoAviso()?.onClose?.(); expect(m.navegar).toHaveBeenCalledWith("/coletor/armazenagem/cancelamentos/itens"); expect(sessionStorage.getItem("coletor_armazenagem_canc_refetch")).toBe("S");
  });
  it("tarefa cancelada retorna à lista ao fechar", async () => {
    m.rpc.mockResolvedValue({ data: { sucesso: false, codigo: "TAREFA_CANCELADA" }, error: null }); await confirmar(); await waitFor(() => expect(m.aviso).toHaveBeenCalled()); ultimoAviso()?.onClose?.(); expect(m.navegar).toHaveBeenCalledWith("/coletor/armazenagem/cancelamentos/itens");
  });
  it("destino igual à origem não habilita nem chama finalização", async () => {
    m.destinoId = "origem"; fireEvent.click(screen.getByText("Bipar destino")); await waitFor(() => expect(m.aviso).toHaveBeenCalled()); expect(screen.getByText("CONFIRMAR ARMAZENAGEM")).toBeDisabled(); expect(m.rpc).not.toHaveBeenCalled();
  });
  it("destino picking continua validado antes da finalização", async () => {
    m.tipo = "PICKING"; m.rpc.mockImplementation((nome: string) => Promise.resolve({ data: nome === "rpc_validar_endereco_picking" ? { valido: true } : { sucesso: true }, error: null })); await confirmar(); await waitFor(() => expect(m.sucesso).toHaveBeenCalled()); expect(m.rpc).toHaveBeenNthCalledWith(1, "rpc_validar_endereco_picking", expect.objectContaining({ p_quantidade: 24 }));
  });
  it("entrada mantém a finalização existente e os parâmetros de lote e movimento", async () => {
    cleanup(); sessionStorage.setItem("coletor_armazenagem_origem", "ENTRADA"); sessionStorage.setItem("coletor_armazenagem_movimento_id", "mov"); render(<ArmazenagemExecucaoPage onNavigate={m.navegar} />); fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "2" } }); await confirmar(); await waitFor(() => expect(m.offline).toHaveBeenCalled()); expect(m.offline).toHaveBeenCalledWith("finalizar_armazenagem", expect.objectContaining({ p_movimento_entrada_id: "mov", p_lote: "L1", p_hu: "hu1", p_quantidade: 24 })); expect(m.rpc).not.toHaveBeenCalledWith("finalizar_armazenagem_cancelamento", expect.anything());
  });
});