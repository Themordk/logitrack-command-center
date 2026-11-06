import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, cleanup, screen, act } from "@testing-library/react";
const m = vi.hoisted(() => ({ rpc: vi.fn(), navegar: vi.fn(), aviso: vi.fn(), erro: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc, from: () => {
  const q: Record<string, unknown> = {}; for (const k of ["select", "or", "limit"]) q[k] = () => q;
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "origem", descricao: "CANCELAMENTO", situacao: "LIVRE" }], error: null }).then(resolve); return q;
} } }));
vi.mock("@/components/coletor/OnlineOnlyNotice", () => ({ OnlineOnlyNotice: () => null, useOnlineOnlyBlocked: () => false }));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/coletor/ScanField", () => ({ ScanField: ({ onScan }: { onScan: (v: string) => void }) => <button onClick={() => onScan("101")}>Bipar</button> }));
vi.mock("@/components/feedback/ResultDialog", () => ({ ResultDialog: () => null }));
vi.mock("@/hooks/useResultDialog", () => ({ useResultDialog: () => ({ showWarning: m.aviso, showError: m.erro, dialogProps: {} }) }));
import { TransferenciaOrigemPage } from "../TransferenciaOrigemPage";
describe("transferência na origem de cancelamento", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); localStorage.setItem("core_tenant_id", "tenant"); });
  afterEach(cleanup);
  it("tarefas ativas bloqueiam avanço e oferecem armazenagem", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null }); render(<TransferenciaOrigemPage onNavigate={m.navegar} />);
    await act(async () => fireEvent.click(screen.getByText("Bipar")));
    await waitFor(() => expect(m.aviso).toHaveBeenCalled()); expect(m.rpc).toHaveBeenCalledWith("fn_endereco_cancelamento_com_tarefa", { p_tenant_id: "tenant", p_endereco_id: "origem" }); expect(m.navegar).not.toHaveBeenCalled(); expect(sessionStorage.getItem("transf_origem_id")).toBeNull();
    m.aviso.mock.calls[0][1].onSecondary(); expect(m.navegar).toHaveBeenCalledWith("/coletor/armazenagem/cancelamentos/itens"); expect(sessionStorage.getItem("coletor_armazenagem_origem")).toBe("CANCELAMENTO");
  });
  it("sem tarefas ativas preserva transferência manual", async () => {
    m.rpc.mockResolvedValue({ data: false, error: null }); render(<TransferenciaOrigemPage onNavigate={m.navegar} />); await act(async () => fireEvent.click(screen.getByText("Bipar"))); await waitFor(() => expect(m.navegar).toHaveBeenCalledWith("/coletor/movimentos/transferencia/produto")); expect(sessionStorage.getItem("transf_origem_id")).toBe("origem");
  });
  it("falha da pré-checagem não autoriza avanço", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } }); render(<TransferenciaOrigemPage onNavigate={m.navegar} />); await act(async () => fireEvent.click(screen.getByText("Bipar"))); await waitFor(() => expect(m.erro).toHaveBeenCalled()); expect(m.navegar).not.toHaveBeenCalled();
  });
});