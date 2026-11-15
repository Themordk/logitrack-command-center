import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { fetchOcupacaoResumo, fetchOcupacaoPage, fetchOcupacaoAll, mapResumo } from "../ocupacao.service";

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  endereco_id: id,
  descricao: `R01-P01-N01-${id}`,
  setor_id: "s1",
  setor_descricao: "SECOS",
  tipo_endereco: "PULMAO",
  situacao: "LIVRE",
  rua: 1, predio: 1, nivel: 1, apto: 1,
  capacidade: null,
  quantidade_total: "29",
  skus_count: 10,
  ultima_atualizacao: "2026-11-10T13:00:00Z",
  status_ocupacao: "OCUPADO",
  percentual_ocupacao: null,
  divergente: true,
  total_registros: 2501,
  ...extra,
});

describe("ocupacao.service", () => {
  beforeEach(() => rpc.mockReset());

  it("resumo: envia armazém/setor/tipo e não manda status (KPIs independem do filtro de status)", async () => {
    rpc.mockResolvedValue({ data: { kpis: {}, setores: [] }, error: null });
    await fetchOcupacaoResumo({ tenant_id: "t1", armazem_id: "a1", tipo_endereco: "PICKING" });
    expect(rpc).toHaveBeenCalledWith("rpc_relatorio_ocupacao_resumo", {
      p_tenant_id: "t1",
      p_armazem_id: "a1",
      p_setor_id: null,
      p_tipo_endereco: "PICKING",
    });
  });

  it("lista: status, divergência e paginação vão para a RPC", async () => {
    rpc.mockResolvedValue({ data: [linha("1"), linha("2")], error: null });
    const res = await fetchOcupacaoPage(
      { tenant_id: "t1", armazem_id: "a1", setor_id: "s1", status_ocupacao: "LIVRE", apenas_divergentes: true },
      2,
    );
    expect(rpc).toHaveBeenCalledWith("rpc_relatorio_ocupacao_enderecos", {
      p_tenant_id: "t1",
      p_armazem_id: "a1",
      p_setor_id: "s1",
      p_tipo_endereco: null,
      p_status: "LIVRE",
      p_apenas_divergentes: true,
      p_limit: 100,
      p_offset: 200,
    });
    expect(res.total).toBe(2501);
    expect(res.rows[0]).toMatchObject({ id: "1", quantidade_total: 29, percentual_ocupacao: null, divergente: true });
  });

  it("lista vazia tem total 0", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect((await fetchOcupacaoPage({ tenant_id: "t1", armazem_id: "a1" }, 0)).total).toBe(0);
  });

  it("propaga erro da RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("Selecione o armazém") });
    await expect(fetchOcupacaoResumo({ tenant_id: "t1", armazem_id: "" })).rejects.toThrow("Selecione o armazém");
  });

  it("exportação busca todas as páginas de 1000 na ordem", async () => {
    rpc.mockImplementation((_fn?: string, p?: any) =>
      Promise.resolve({ data: [linha(`off${p?.p_offset}`)], error: null }),
    );
    const rows = await fetchOcupacaoAll({ tenant_id: "t1", armazem_id: "a1" }, 2501);
    expect(rpc.mock.calls.filter((c) => c[0] === "rpc_relatorio_ocupacao_enderecos")).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual(["off0", "off1000", "off2000"]);
  });

  it("mapResumo: % de capacidade nula sem cadastro e pizza sem contar parcial duas vezes", () => {
    const r = mapResumo({
      kpis: {
        total_enderecos: 206, enderecos_ocupados: 155, enderecos_parciais: 154,
        enderecos_livres: 48, enderecos_bloqueados: 3, ocupacao_capacidade: null,
        setor_mais_saturado: "FRUTAS", setor_mais_ocioso: null,
      },
      setores: [{ setor_id: "s1", setor_descricao: "FRUTAS", total_enderecos: 10, percentual_ocupacao: 80, ocupacao_capacidade: "3.5" }],
    });
    expect(r.kpis.ocupacao_capacidade).toBeNull();
    expect(r.kpis.setor_mais_ocioso).toBeNull();
    expect(r.setores[0].ocupacao_capacidade).toBe(3.5);
    const soma = r.statusDistribution.reduce((s, x) => s + x.value, 0);
    expect(soma).toBe(206);
    expect(r.statusDistribution.find((x) => x.name === "Ocupado")?.value).toBe(1);
  });
});
