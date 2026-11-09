import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchBaixoGiroPage, fetchBaixoGiroAll, type BaixoGiroFilter } from "../baixoGiro.service";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const filtroBase: BaixoGiroFilter = {
  tenant_id: "t1",
  empresa_id: "e1",
  dias_baixo_giro: 90,
  dias_obsoleto: 180,
};

const linhaBackend = (id: string) => ({
  produto_id: id,
  sku: `SKU-${id}`,
  descricao: "Produto",
  marca: null,
  grupo_id: null,
  grupo_descricao: null,
  subgrupo_id: null,
  subgrupo_descricao: null,
  saldo: "10.5",
  saldo_bloqueado: "0",
  qtd_posicoes: 2,
  preco_custo: null,
  custo_total: "0",
  ultima_saida: null,
  entrada_mais_antiga: "2026-05-01T12:00:00Z",
  dias_parado: 192,
  nunca_saiu: true,
  classificacao: "SEM_MOVIMENTO",
  total_registros: "2500",
  total_saldo: "1234.5",
  total_custo: "999.9",
  qtd_baixo_giro: "1000",
  qtd_obsoleto: "1000",
  qtd_sem_movimento: "500",
  qtd_sem_custo: "3",
});

describe("baixoGiro.service", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("envia os filtros como parâmetros da RPC, com nulos para os opcionais", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await fetchBaixoGiroPage({ ...filtroBase, sku: "  123 ", marca: "   " }, 2);
    expect(rpcMock).toHaveBeenCalledWith("rpc_relatorio_baixo_giro", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_armazem_id: null,
      p_dias_baixo_giro: 90,
      p_dias_obsoleto: 180,
      p_classificacao: null,
      p_grupo_id: null,
      p_subgrupo_id: null,
      p_marca: null,
      p_sku: "123",
      p_saldo_minimo: null,
      p_ordenacao: "DIAS_DESC",
      p_limit: 100,
      p_offset: 200,
    });
  });

  it("converte numéricos e extrai o resumo da primeira linha", async () => {
    rpcMock.mockResolvedValue({ data: [linhaBackend("a")], error: null });
    const { rows, resumo } = await fetchBaixoGiroPage(filtroBase, 0);
    expect(rows[0]).toMatchObject({ saldo: 10.5, preco_custo: 0, marca: "", nunca_saiu: true, dias_parado: 192 });
    expect(resumo).toEqual({
      total_registros: 2500, total_saldo: 1234.5, total_custo: 999.9,
      qtd_baixo_giro: 1000, qtd_obsoleto: 1000, qtd_sem_movimento: 500, qtd_sem_custo: 3,
    });
  });

  it("retorna resumo zerado quando não há linhas", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { rows, resumo } = await fetchBaixoGiroPage(filtroBase, 0);
    expect(rows).toEqual([]);
    expect(resumo.total_registros).toBe(0);
  });

  it("propaga o erro da RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Dias de obsoleto deve ser maior que os dias de baixo giro" } });
    await expect(fetchBaixoGiroPage(filtroBase, 0)).rejects.toMatchObject({
      message: "Dias de obsoleto deve ser maior que os dias de baixo giro",
    });
  });

  it("exportação busca todas as páginas de 1000 e mantém a ordem", async () => {
    rpcMock.mockImplementation((_name: string, params: { p_offset: number; p_limit: number }) => {
      const restantes = Math.max(0, Math.min(params.p_limit, 2500 - params.p_offset));
      const data = Array.from({ length: restantes }, (_, i) => linhaBackend(String(params.p_offset + i)));
      return Promise.resolve({ data, error: null });
    });
    const rows = await fetchBaixoGiroAll(filtroBase, 2500);
    expect(rpcMock).toHaveBeenCalledTimes(3);
    const offsets = rpcMock.mock.calls.map((c) => c[1].p_offset).sort((a: number, b: number) => a - b);
    expect(offsets).toEqual([0, 1000, 2000]);
    expect(rows).toHaveLength(2500);
    expect(rows[0].produto_id).toBe("0");
    expect(rows[2499].produto_id).toBe("2499");
  });
});
