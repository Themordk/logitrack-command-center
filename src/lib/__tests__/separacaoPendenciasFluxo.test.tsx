import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { SeparacaoEnderecoPage } from "@/pages/coletor/SeparacaoEnderecoPage";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), navegar: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/coletor/ScanField", () => ({ ScanField: ({ onScan }: { onScan: (s: string) => void }) => <input aria-label="scan" onChange={e => onScan(e.target.value)} /> }));
vi.mock("@/contexts/OfflineContext", () => ({ useOffline: () => ({ isOnline: true }) }));
vi.mock("@/contexts/PermissionsContext", () => ({ usePermissions: () => ({ can: () => true, loading: false }) }));
vi.mock("@/hooks/useCancelamentoRealtime", () => ({ useCancelamentoRealtime: () => ({ notificacoes: [], dismissNotificacao: vi.fn() }) }));
vi.mock("@/hooks/useFeedback", () => ({ useFeedback: () => ({ error: vi.fn() }) }));
vi.mock("@/hooks/useResultDialog", () => ({ useResultDialog: () => ({ showWarning: vi.fn(), showError: vi.fn(), dialogProps: {} }) }));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));

const tarefa = { tarefa_id: "sem-picking", produto_id: "produto", tipo_controle: "SEM_CONTROLE", sku: "SKU", produto: "Produto", endereco_id: null, situacao_saldo: "SEM_PICKING_MAPEADO", ordem_tarefa: 1, quantidade_requerida: 5 };
describe("separação com pendências", () => {
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear(); mocks.rpc.mockReset(); mocks.navegar.mockReset();
    localStorage.setItem("core_tenant_id", "tenant"); localStorage.setItem("core_empresa_id", "empresa"); localStorage.setItem("core_usuario_id", "usuario");
    sessionStorage.setItem("coletor_separacao_movimento_id", "onda");
    sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify([tarefa]));
  });
  afterEach(cleanup);
  it("não confirma endereço inexistente e leva produto preenchido ao mapeamento", async () => {
    const tela = render(<SeparacaoEnderecoPage onNavigate={mocks.navegar} />);
    await waitFor(() => expect(tela.queryByLabelText("scan")).toBeNull());
    fireEvent.click(await tela.findByRole("button", { name: "Mapear picking" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("mapear_from_separacao") || "{}").produtoId).toBe("produto");
    expect(mocks.navegar).toHaveBeenCalledWith("/coletor/consulta/mapear-picking");
  });
  it("pula sem excluir a tarefa pendente", async () => {
    const lista = [tarefa, { ...tarefa, tarefa_id: "outra", ordem_tarefa: 2 }];
    sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify(lista));
    const tela = render(<SeparacaoEnderecoPage onNavigate={mocks.navegar} />);
    fireEvent.click(await tela.findByRole("button", { name: /Pular/ }));
    expect(sessionStorage.getItem("coletor_separacao_tarefa_idx")).toBe("1");
    expect(JSON.parse(sessionStorage.getItem("coletor_separacao_tarefas") || "[]")).toHaveLength(2);
  });
  it("retorno do mapeamento recarrega mantendo o id da tarefa após reordenar", async () => {
    sessionStorage.setItem("coletor_separacao_recarregar", "1");
    const atualizada = { ...tarefa, endereco_id: "picking", endereco: "R01", situacao_saldo: "SEM_SALDO_PICKING" };
    mocks.rpc.mockResolvedValue({ error: null, data: [{ ...atualizada, tarefa_id: "ok", situacao_saldo: "OK" }, atualizada] });
    render(<SeparacaoEnderecoPage onNavigate={mocks.navegar} />);
    await waitFor(() => expect(sessionStorage.getItem("coletor_separacao_tarefa_idx")).toBe("1"));
    expect(mocks.rpc).toHaveBeenCalledWith("separacao_buscar_tarefas", { p_tenant_id: "tenant", p_empresa_id: "empresa", p_movimento_saida_id: "onda", p_usuario_id: "usuario" });
    expect(sessionStorage.getItem("coletor_separacao_recarregar")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("coletor_separacao_tarefas") || "[]")[1].endereco_id).toBe("picking");
  });
});