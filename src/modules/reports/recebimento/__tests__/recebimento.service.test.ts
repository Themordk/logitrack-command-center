import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchRecebimentoReport } from "../recebimento.service";
import { fetchAllRpcRows } from "../../utils/fetchAllRpcRows";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("../../utils/fetchAllRpcRows", () => ({ fetchAllRpcRows: vi.fn() }));

const rpcMock = fetchAllRpcRows as unknown as ReturnType<typeof vi.fn>;

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  movimento_entrada_id: id,
  numero_movimento: 100,
  status_movimento: "ARMAZENADO",
  total_volume: 10,
  documento: "123, 456",
  fornecedor: "ALFA LTDA, BETA SA",
  parceiro_id: "par-alfa",
  t0_dock: "2026-11-10T10:00:00Z",
  t1_autorizado: null, t2_conf_inicio: null, t3_conf_fim: null, t4_armz_inicio: null,
  t5_stock: "2026-11-10T20:00:00Z",
  tempo_total_min: 600,
  tempo_liberacao_min: 60,
  tempo_conferencia_min: 120,
  tempo_armazenagem_min: 300,
  tempo_ocioso_min: 120,
  perc_sla: 41.7,
  status_sla: "DENTRO",
  sla_horas: 24,
  ...extra,
});

describe("recebimento.service", () => {
  beforeEach(() => rpcMock.mockReset());

  it("envia fornecedor, movimento e NF para a RPC (filtro no servidor)", async () => {
    rpcMock.mockResolvedValue([]);
    await fetchRecebimentoReport({
      tenant_id: "t1",
      empresa_id: "e1",
      parceiro_id: "par-beta",
      numero_movimento: 42,
      numero_nota: "  4567 ",
      data_inicio: "2026-11-01",
      data_fim: "2026-11-12",
      sla_horas: 12,
    });
    expect(rpcMock).toHaveBeenCalledWith("rpc_relatorio_dock_to_stock", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_armazem_id: null,
      p_data_inicio: "2026-11-01",
      p_data_fim: "2026-11-12",
      p_sla_horas: 12,
      p_parceiro_id: "par-beta",
      p_numero_movimento: 42,
      p_numero_nota: "4567",
    });
  });

  it("não refiltra fornecedor no navegador (o 2º fornecedor do movimento também vale)", async () => {
    // RPC já devolveu o movimento porque "par-beta" está numa das NFs,
    // embora parceiro_id (1º fornecedor) seja "par-alfa".
    rpcMock.mockResolvedValue([linha("m1")]);
    const { rows } = await fetchRecebimentoReport({ tenant_id: "t1", parceiro_id: "par-beta" });
    expect(rows).toHaveLength(1);
  });

  it("calcula % dentro do SLA, mediana, volumes, NFs e fornecedores", async () => {
    rpcMock.mockResolvedValue([
      linha("m1"),
      linha("m2", { tempo_total_min: 1200, status_sla: "ALERTA", documento: "456, 789", fornecedor: "BETA SA", total_volume: 5 }),
      linha("m3", { tempo_total_min: 2000, status_sla: "FORA", documento: "—", fornecedor: "—", total_volume: null }),
      linha("m4", { tempo_total_min: null, status_sla: "EM_ANDAMENTO", documento: "999", fornecedor: "GAMA ME", total_volume: 1 }),
    ]);
    const { kpis } = await fetchRecebimentoReport({ tenant_id: "t1" });
    expect(kpis.total_recebimentos).toBe(4);
    expect(kpis.concluidos).toBe(3);
    expect(kpis.perc_dentro_sla).toBeCloseTo(33.333, 2);   // 1 de 3 concluídos
    expect(kpis.tempo_mediano_total_min).toBe(1200);       // 600, 1200, 2000
    expect(kpis.total_volumes).toBe(16);
    expect(kpis.total_nfs).toBe(4);                        // 123, 456, 789, 999
    expect(kpis.total_fornecedores).toBe(3);               // ALFA, BETA, GAMA
  });

  it("sem concluídos o % dentro do SLA fica nulo", async () => {
    rpcMock.mockResolvedValue([linha("m1", { status_sla: "EM_ANDAMENTO", tempo_total_min: null })]);
    const { kpis } = await fetchRecebimentoReport({ tenant_id: "t1" });
    expect(kpis.perc_dentro_sla).toBeNull();
    expect(kpis.tempo_mediano_total_min).toBe(0);
  });
});
