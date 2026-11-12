import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchInventarioPage, fetchInventarioAll, fmtEnd, type InventarioFilter } from "../inventario.service";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const filtroBase: InventarioFilter = { tenant_id: "t1", empresa_id: "e1" };

const linhaBackend = (id: string) => ({
  id,
  inventario_id: "inv-1",
  numero_inventario: "76",
  inventario_status: "EM_CONTAGEM",
  inventario_finalizado_em: null,
  produto_id: `p-${id}`,
  sku: `SKU-${id}`,
  descricao: "Produto",
  rua: 1, predio: 2, nivel: 3, apto: 4,
  qtd_sistemica: "10",
  qtd_contada: "8",
  diferenca: "-2",
  diferenca_pct: "-20.0000",
  acuracidade_item: "80.0000",
  preco_custo: "5.5",
  impacto_financeiro: "11",
  status_calc: "FALTA",
  severidade: "MEDIA",
  status_tarefa: "CONCLUIDA",
  numero_contagens: 2,
  data_contagem: "2026-11-12T14:44:54Z",
  total_itens: "2095",
  itens_conformes: "937",
  itens_divergentes: "1158",
  itens_pendentes: "0",
  acuracidade_por_item: "44.7255",
  acuracidade_ponderada_qtd: "0.0000",
  acuracidade_ponderada_valor: "0.0000",
  total_sobra: "100",
  total_falta: "200",
  impacto_total: "1214737.73",
});

describe("inventario.service", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("envia filtros (inclusive intervalo de contagem) como parâmetros da RPC", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await fetchInventarioPage({
      ...filtroBase,
      inventario_id: "inv-1",
      data_contagem_inicio: "2026-11-01",
      data_contagem_fim: "2026-11-12",
      sku: "  ABC ",
      rua: 0,
      status: "FALTA",
      apenas_divergentes: true,
    }, 1);
    expect(rpcMock).toHaveBeenCalledWith("rpc_relatorio_inventario", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_inventario_id: "inv-1",
      p_armazem_id: null,
      p_data_contagem_inicio: "2026-11-01",
      p_data_contagem_fim: "2026-11-12",
      p_sku: "ABC",
      p_rua: 0, // zero é filtro válido, não pode virar null
      p_predio: null,
      p_nivel: null,
      p_apto: null,
      p_status: "FALTA",
      p_severidade: null,
      p_apenas_divergentes: true,
      p_limit: 100,
      p_offset: 100,
    });
  });

  it("converte numéricos, monta o endereço e lê os KPIs da primeira linha", async () => {
    rpcMock.mockResolvedValue({ data: [linhaBackend("1")], error: null });
    const { rows, kpis } = await fetchInventarioPage(filtroBase, 0);
    expect(rows[0]).toMatchObject({
      numero_inventario: 76,
      endereco: "R01-P02-N03-A04",
      qtd_sistemica: 10, qtd_contada: 8, diferenca: -2,
      diferenca_pct: -20, acuracidade_item: 80,
      preco_custo: 5.5, impacto_financeiro: 11,
      status_calc: "FALTA", severidade: "MEDIA",
      numero_contagens: 2, data_contagem: "2026-11-12T14:44:54Z",
    });
    expect(kpis).toEqual({
      total_itens: 2095, itens_conformes: 937, itens_divergentes: 1158, itens_pendentes: 0,
      acuracidade_por_item: 44.7255, acuracidade_ponderada_qtd: 0, acuracidade_ponderada_valor: 0,
      total_sobra: 100, total_falta: 200, impacto_total: 1214737.73,
    });
  });

  it("devolve KPIs zerados sem linhas", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { rows, kpis } = await fetchInventarioPage(filtroBase, 0);
    expect(rows).toEqual([]);
    expect(kpis.total_itens).toBe(0);
  });

  it("propaga erro da RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Data final da contagem não pode ser anterior à data inicial" } });
    await expect(fetchInventarioPage(filtroBase, 0)).rejects.toMatchObject({
      message: "Data final da contagem não pode ser anterior à data inicial",
    });
  });

  it("exportação busca todas as páginas de 1000 e mantém a ordem", async () => {
    rpcMock.mockImplementation((_n: string, p: { p_offset: number }) =>
      Promise.resolve({
        data: Array.from({ length: Math.min(1000, 2095 - p.p_offset) }, (_, i) => linhaBackend(String(p.p_offset + i))),
        error: null,
      }),
    );
    const rows = await fetchInventarioAll(filtroBase, 2095);
    expect(rpcMock).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(2095);
    expect(rows[1000].id).toBe("1000");
    expect(rows[2094].id).toBe("2094");
  });

  it("fmtEnd mostra traço quando não há endereço", () => {
    expect(fmtEnd(null, null, null, null)).toBe("—");
  });
});
