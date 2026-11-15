import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCicloPedidoReport } from "../cicloPedido.service";
import { fetchAllRpcRows } from "../../utils/fetchAllRpcRows";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("../../utils/fetchAllRpcRows", () => ({ fetchAllRpcRows: vi.fn() }));

const rpcMock = fetchAllRpcRows as unknown as ReturnType<typeof vi.fn>;

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  movimento_saida_id: id,
  numero_onda: 792,
  status_onda: "CONCLUIDA",
  prioridade: "NORMAL",
  pedidos: "1001, 1002",
  notas: "00003102",
  cliente: "ALFA LTDA",
  parceiro_id: "cli-alfa",
  box_id: null,
  t0_criacao: "2026-11-10T10:00:00Z",
  t1_liberado: null, t2_inicio_sep: null, t3_fim_sep: null,
  t4_inicio_conf: null, t4_fim_conf: null,
  t5_expedicao: "2026-11-10T14:00:00Z",
  tempo_total_min: 240,
  tempo_fila_min: 30,
  tempo_picking_min: 120,
  tempo_conferencia_min: 60,
  tempo_pos_conf_min: 30,
  tempo_ocioso_min: 20,
  perc_sla: 16.7,
  status_sla: "DENTRO",
  sla_horas: 24,
  ...extra,
});

describe("cicloPedido.service", () => {
  beforeEach(() => rpcMock.mockReset());

  it("envia cliente, onda, pedido e NF para a RPC (filtro no servidor)", async () => {
    rpcMock.mockResolvedValue([]);
    await fetchCicloPedidoReport({
      tenant_id: "t1",
      empresa_id: "e1",
      parceiro_id: "cli-beta",
      numero_onda: 792,
      numero_pedido: " 1001 ",
      numero_nf: " 3102 ",
      data_inicio: "2026-11-01",
      data_fim: "2026-11-12",
      sla_horas: 8,
    });
    expect(rpcMock).toHaveBeenCalledWith("rpc_relatorio_ciclo_pedido", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_armazem_id: null,
      p_data_inicio: "2026-11-01",
      p_data_fim: "2026-11-12",
      p_status_onda: null,
      p_prioridade: null,
      p_sla_horas: 8,
      p_parceiro_id: "cli-beta",
      p_numero_onda: 792,
      p_numero_pedido: "1001",
      p_numero_nf: "3102",
    });
  });

  it("não refiltra cliente no navegador e expõe as NFs da onda", async () => {
    rpcMock.mockResolvedValue([linha("o1")]);
    const { rows } = await fetchCicloPedidoReport({ tenant_id: "t1", parceiro_id: "cli-beta" });
    expect(rows).toHaveLength(1);
    expect(rows[0].notas).toBe("00003102");
  });

  it("calcula % dentro do SLA, mediana, pedidos, NFs e clientes", async () => {
    rpcMock.mockResolvedValue([
      linha("o1"),
      linha("o2", { tempo_total_min: 600, status_sla: "ALERTA", pedidos: "1002, 1003", notas: "—", cliente: "BETA SA" }),
      linha("o3", { tempo_total_min: 2000, status_sla: "FORA", pedidos: "1004", notas: "00003103, 00003104", cliente: "ALFA LTDA" }),
      linha("o4", { tempo_total_min: null, status_sla: "EM_ANDAMENTO", pedidos: "—", notas: "—", cliente: "—" }),
    ]);
    const { kpis } = await fetchCicloPedidoReport({ tenant_id: "t1" });
    expect(kpis.total_ondas).toBe(4);
    expect(kpis.concluidas).toBe(3);
    expect(kpis.perc_dentro_sla).toBeCloseTo(33.333, 2);
    expect(kpis.tempo_mediano_total_min).toBe(600);   // 240, 600, 2000
    expect(kpis.total_pedidos).toBe(4);               // 1001..1004
    expect(kpis.total_nfs).toBe(3);
    expect(kpis.total_clientes).toBe(2);
  });

  it("sem concluídas o % dentro do SLA fica nulo", async () => {
    rpcMock.mockResolvedValue([linha("o1", { status_sla: "EM_ANDAMENTO", tempo_total_min: null })]);
    const { kpis } = await fetchCicloPedidoReport({ tenant_id: "t1" });
    expect(kpis.perc_dentro_sla).toBeNull();
  });
});
