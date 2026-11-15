import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchValidadeLotePage, fetchValidadeLoteAll, type ValidadeLoteFilter } from "../validadeLote.service";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const filtroBase: ValidadeLoteFilter = {
  tenant_id: "t1",
  empresa_id: "e1",
  dias_critico: 30,
  dias_atencao: 60,
};

const linhaBackend = (id: string) => ({
  id,
  produto_id: `p-${id}`,
  sku: `SKU-${id}`,
  descricao: "Produto",
  marca: "",
  grupo_id: null,
  grupo_descricao: null,
  subgrupo_id: null,
  subgrupo_descricao: null,
  lote: "L1",
  data_fabricacao: "2026-01-10",
  data_validade: "2026-11-12",
  dias_para_vencer: 0,
  saldo: "12.5",
  saldo_disponivel: "10.5",
  saldo_bloqueado: "2",
  hu_id: "hu-1",
  codigo_hu: "",
  endereco_id: "end-1",
  codigo_endereco: "01-001-01-01",
  tipo_endereco: "PICKING",
  armazem_id: "a1",
  setor_id: "s1",
  criticidade: "CRITICO",
  total_registros: "2500",
  total_saldo: "999.5",
  qtd_vencido: "3",
  qtd_critico: "10",
  qtd_atencao: "20",
  qtd_ok: "2467",
  saldo_vencido: "7",
  saldo_critico: "15.25",
  saldo_atencao: "30",
});

describe("validadeLote.service", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("envia os filtros como parâmetros da RPC, com nulos para os opcionais", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await fetchValidadeLotePage({ ...filtroBase, sku: "  123 ", marca: "   ", ordem: "FIFO" }, 2);
    expect(rpcMock).toHaveBeenCalledWith("rpc_relatorio_validade_lote", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_armazem_id: null,
      p_setor_id: null,
      p_tipo_endereco: null,
      p_sku: "123",
      p_marca: null,
      p_grupo_id: null,
      p_subgrupo_id: null,
      p_criticidade: null,
      p_validade_ate: null,
      p_ordem: "FIFO",
      p_dias_critico: 30,
      p_dias_atencao: 60,
      p_limit: 100,
      p_offset: 200,
    });
  });

  it("usa FEFO como ordem padrão", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await fetchValidadeLotePage(filtroBase, 0);
    expect(rpcMock.mock.calls[0][1].p_ordem).toBe("FEFO");
  });

  it("converte numéricos e lê o resumo da primeira linha", async () => {
    rpcMock.mockResolvedValue({ data: [linhaBackend("1")], error: null });
    const { rows, resumo } = await fetchValidadeLotePage(filtroBase, 0);
    expect(rows[0]).toMatchObject({
      saldo: 12.5, saldo_disponivel: 10.5, saldo_bloqueado: 2,
      dias_para_vencer: 0, codigo_hu: "", criticidade: "CRITICO",
    });
    expect(resumo).toEqual({
      total_registros: 2500, total_saldo: 999.5,
      qtd_vencido: 3, qtd_critico: 10, qtd_atencao: 20, qtd_ok: 2467,
      saldo_vencido: 7, saldo_critico: 15.25, saldo_atencao: 30,
    });
  });

  it("devolve resumo zerado quando não há linhas", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { rows, resumo } = await fetchValidadeLotePage(filtroBase, 0);
    expect(rows).toEqual([]);
    expect(resumo.total_registros).toBe(0);
  });

  it("propaga erro da RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Faixas inválidas" } });
    await expect(fetchValidadeLotePage(filtroBase, 0)).rejects.toMatchObject({ message: "Faixas inválidas" });
  });

  it("exportação busca todas as páginas de 1000 e mantém a ordem", async () => {
    rpcMock.mockImplementation((_n: string, p: any) =>
      Promise.resolve({
        data: Array.from({ length: Math.min(1000, 2500 - p.p_offset) }, (_, i) => linhaBackend(String(p.p_offset + i))),
        error: null,
      }),
    );
    const rows = await fetchValidadeLoteAll(filtroBase, 2500);
    expect(rpcMock).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(2500);
    expect(rows[0].id).toBe("0");
    expect(rows[1000].id).toBe("1000");
    expect(rows[2499].id).toBe("2499");
  });
});
