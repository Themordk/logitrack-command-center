import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), navegar: vi.fn(), toastErro: vi.fn(), elegiveis: 3, falha: "" }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({
  tenantId: "t1", empresaId: "e1", armazemId: "a1", usuarioId: "u1", armazemNome: "Armazém",
  armazemLoading: false, armazemErro: null,
}) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.toastErro } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: (tabela: string) => {
    const consulta = {
      select: () => consulta, eq: () => consulta,
      maybeSingle: async () => ({ data: tabela === "empresa" ? { razaosocial: "Empresa" } : { tipo_tarefa_id: "tt1" }, error: null }),
    };
    return consulta;
  },
} }));

import { NovoInventarioPage } from "@/pages/NovoInventarioPage";

async function aguardarPrevia() {
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}
async function montarRotativo(criterio: string) {
  render(<NovoInventarioPage onNavigate={mocks.navegar} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Tipo Inventário" }), { target: { value: "ROTATIVO" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Tipo de Execução" }), { target: { value: "AUDITORIA" } });
  const radio = document.querySelector<HTMLInputElement>(`input[value="${criterio}"]`);
  if (!radio) throw new Error("Critério não disponível");
  fireEvent.click(radio);
  await aguardarPrevia();
}

describe("Inventário rotativo por período", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T19:12:00Z"));
    mocks.elegiveis = 3; mocks.falha = "";
    mocks.navegar.mockReset(); mocks.toastErro.mockReset(); mocks.rpc.mockReset();
    mocks.rpc.mockImplementation(async (nome: string) => {
      if (nome === "fn_preview_inventario") return { data: {
        sucesso: mocks.elegiveis !== 0, codigo: mocks.elegiveis === 0 ? "SEM_ESTOQUE" : "OK",
        enderecos_elegiveis: mocks.elegiveis, skus_elegiveis: 2,
      }, error: null };
      if (nome === "fn_criar_inventario_v2") return { data: mocks.falha
        ? { sucesso: false, codigo: mocks.falha }
        : { sucesso: true, inventario_id: "i1", proximo_passo: "GERAR" }, error: null };
      return { data: { sucesso: true, tarefas_geradas: 3, finalizado: true }, error: null };
    });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each(["SAIDAS", "CORTES", "ESTORNOS", "DEVOLUCOES"])("envia período e curva nula na prévia e criação de %s", async criterio => {
    await montarRotativo(criterio);
    const parametros = { p_criterio_selecao: criterio, p_curva: null, p_data_inicio_analise: "2026-10-05", p_data_fim_analise: "2026-11-03" };
    expect(mocks.rpc).toHaveBeenCalledWith("fn_preview_inventario", expect.objectContaining(parametros));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Criar Inventário" })); });
    expect(mocks.rpc).toHaveBeenCalledWith("fn_criar_inventario_v2", expect.objectContaining(parametros));
    expect(mocks.rpc).toHaveBeenCalledWith("fn_gerar_tarefas_inventario", expect.objectContaining({ p_inventario_id: "i1", p_chunk_size: 200 }));
    expect(mocks.navegar).toHaveBeenCalledWith("/atividades/inventario");
  });

  it("recalcula a prévia ao alterar período e critério", async () => {
    await montarRotativo("SAIDAS");
    mocks.rpc.mockClear();
    fireEvent.change(screen.getByRole("combobox", { name: "Período de Análise *" }), { target: { value: "7D" } });
    await aguardarPrevia();
    expect(mocks.rpc).toHaveBeenCalledWith("fn_preview_inventario", expect.objectContaining({ p_data_inicio_analise: "2026-10-28", p_data_fim_analise: "2026-11-03" }));
    mocks.rpc.mockClear();
    const radio = document.querySelector<HTMLInputElement>('input[value="DEVOLUCOES"]');
    if (!radio) throw new Error("Critério ausente");
    fireEvent.click(radio); await aguardarPrevia();
    expect(mocks.rpc).toHaveBeenCalledWith("fn_preview_inventario", expect.objectContaining({ p_criterio_selecao: "DEVOLUCOES", p_data_inicio_analise: "2026-10-28" }));
  });

  it("bloqueia criação com zero elegíveis, inclusive SEM_ESTOQUE", async () => {
    mocks.elegiveis = 0;
    await montarRotativo("CORTES");
    const criar = screen.getByRole("button", { name: "Criar Inventário" });
    expect(criar).toBeDisabled();
    fireEvent.click(criar);
    expect(mocks.rpc.mock.calls.some(([nome]) => nome === "fn_criar_inventario_v2")).toBe(false);
  });

  it.each(["SEM_ITENS_ELEGIVEIS", "CRITERIO_DESCONTINUADO", "PERIODO_INVALIDO"])("mantém campos e não gera tarefas após %s", async codigo => {
    mocks.falha = codigo;
    await montarRotativo("ESTORNOS");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Criar Inventário" })); });
    expect(mocks.navegar).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.some(([nome]) => nome === "fn_gerar_tarefas_inventario")).toBe(false);
    expect(document.querySelector<HTMLInputElement>('input[value="ESTORNOS"]')?.checked).toBe(true);
    expect((screen.getByRole("combobox", { name: "Período de Análise *" }) as HTMLSelectElement).value).toBe("30D");
  });

  it("mantém Geral como contagem livre com período e curva nulos", async () => {
    render(<NovoInventarioPage onNavigate={mocks.navegar} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo Inventário" }), { target: { value: "GERAL" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo de Execução" }), { target: { value: "AUDITORIA" } });
    await aguardarPrevia();
    mocks.rpc.mockImplementationOnce(async () => ({ data: { sucesso: true, inventario_id: "i2", proximo_passo: "PRONTO" }, error: null }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Criar Inventário" })); });
    expect(mocks.rpc).toHaveBeenCalledWith("fn_criar_inventario_v2", expect.objectContaining({ p_curva: null, p_criterio_selecao: null, p_data_inicio_analise: null, p_data_fim_analise: null }));
    expect(mocks.rpc.mock.calls.some(([nome]) => nome === "fn_gerar_tarefas_inventario")).toBe(false);
  });
});