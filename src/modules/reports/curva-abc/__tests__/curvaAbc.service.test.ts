import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchCurvaAbcReport, mapCurvaAbcError } from "../curvaAbc.service";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const filtroBase = {
  tenant_id: "t1",
  empresa_id: "e1",
  data_inicio: "2026-01-01",
  data_fim: "2026-01-31",
  criterio: "QUANTIDADE" as const,
  limite_a: 0.8,
  limite_b: 0.95,
};

const resumoBackend = {
  criterio: "QUANTIDADE",
  limite_a: "0.8",
  limite_b: "0.95",
  data_inicio: "2026-01-01",
  data_fim: "2026-01-31",
  fuso: "America/Fortaleza",
  armazem_id: null,
  total_skus: "2",
  total_metrica: "150",
  total_qtd_saida: "150",
  total_qtd_estornada: "10",
  skus_100_estornados: "1",
  total_valor_saida: "3000.5",
  total_acessos: "12",
  skus_sem_custo: "0",
  skus_exibidos: "2",
  classes: {
    A: { skus: "1", metrica: "100", participacao: "0.6667" },
    B: { skus: "1", metrica: "50", participacao: "0.3333" },
    C: { skus: "0", metrica: "0", participacao: "0" },
  },
};

const itensBackend = [
  {
    posicao: "1",
    produto_id: "p1",
    sku: "SKU1",
    descricao: "Produto 1",
    marca: "Marca",
    grupo_id: null,
    subgrupo_id: null,
    preco_custo: "20.5",
    qtd_saida: "100",
    qtd_estornada: "0",
    acessos: "8",
    valor_saida: "2050",
    participacao: "0.6667",
    acumulado: "0.6667",
    saldo_atual: "5",
    classe: "A",
  },
];

describe("fetchCurvaAbcReport", () => {
  beforeEach(() => rpcMock.mockReset());

  it("faz uma única chamada à RPC com null para filtros vazios e limites em fração", async () => {
    rpcMock.mockResolvedValueOnce({ data: { resumo: resumoBackend, itens: [] }, error: null });

    await fetchCurvaAbcReport({
      ...filtroBase,
      armazem_id: "",
      grupo_id: undefined,
      marca: "  ",
      sku: undefined,
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("rpc_relatorio_curva_abc", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_data_inicio: "2026-01-01",
      p_data_fim: "2026-01-31",
      p_criterio: "QUANTIDADE",
      p_armazem_id: null,
      p_limite_a: 0.8,
      p_limite_b: 0.95,
      p_grupo_id: null,
      p_subgrupo_id: null,
      p_marca: null,
      p_sku: null,
      p_classe: null,
    });
  });

  it("envia os filtros preenchidos e a classe selecionada", async () => {
    rpcMock.mockResolvedValueOnce({ data: { resumo: resumoBackend, itens: [] }, error: null });

    await fetchCurvaAbcReport({
      ...filtroBase,
      armazem_id: "a1",
      grupo_id: "g1",
      subgrupo_id: "s1",
      marca: "ACME",
      sku: "123",
      classe: "B",
    });

    expect(rpcMock).toHaveBeenCalledWith("rpc_relatorio_curva_abc", expect.objectContaining({
      p_armazem_id: "a1",
      p_grupo_id: "g1",
      p_subgrupo_id: "s1",
      p_marca: "ACME",
      p_sku: "123",
      p_classe: "B",
    }));
  });

  it("normaliza números que chegam como string no resumo e nos itens", async () => {
    rpcMock.mockResolvedValueOnce({ data: { resumo: resumoBackend, itens: itensBackend }, error: null });

    const result = await fetchCurvaAbcReport(filtroBase);

    expect(result.resumo.total_skus).toBe(2);
    expect(result.resumo.total_qtd_saida).toBe(150);
    expect(result.resumo.total_valor_saida).toBe(3000.5);
    expect(result.resumo.classes.A.skus).toBe(1);
    expect(result.resumo.classes.A.participacao).toBeCloseTo(0.6667);
    expect(result.itens).toHaveLength(1);
    expect(result.itens[0].posicao).toBe(1);
    expect(result.itens[0].qtd_saida).toBe(100);
    expect(result.itens[0].valor_saida).toBe(2050);
    expect(result.itens[0].saldo_atual).toBe(5);
  });

  it("lança o erro retornado pela RPC", async () => {
    const erro = { hint: "CURVA_ABC_PERIODO_EXCEDIDO", message: "periodo" };
    rpcMock.mockResolvedValueOnce({ data: null, error: erro });

    await expect(fetchCurvaAbcReport(filtroBase)).rejects.toEqual(erro);
  });
});

describe("mapCurvaAbcError", () => {
  it("mapeia cada código de hint para a mensagem em português", () => {
    expect(mapCurvaAbcError({ hint: "CURVA_ABC_EMPRESA_OBRIGATORIA" })).toBe("Selecione uma empresa para gerar o relatório.");
    expect(mapCurvaAbcError({ hint: "CURVA_ABC_PERIODO_OBRIGATORIO" })).toBe("Informe a data inicial e a final.");
    expect(mapCurvaAbcError({ hint: "CURVA_ABC_PERIODO_INVALIDO" })).toBe("A data final deve ser maior ou igual à inicial.");
    expect(mapCurvaAbcError({ hint: "CURVA_ABC_PERIODO_EXCEDIDO" })).toBe("O período máximo é de 366 dias.");
    expect(mapCurvaAbcError({ hint: "CURVA_ABC_CRITERIO_INVALIDO" })).toBe("Critério de classificação inválido.");
    expect(mapCurvaAbcError({ hint: "CURVA_ABC_LIMITES_INVALIDOS" })).toBe("Os limites devem obedecer 0 < A < B < 100%.");
    expect(mapCurvaAbcError({ hint: "CURVA_ABC_CLASSE_INVALIDA" })).toBe("Classe inválida.");
  });

  it("usa a mensagem genérica para erros desconhecidos", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(mapCurvaAbcError({ hint: "OUTRO_ERRO" })).toBe("Erro ao gerar a Curva ABC.");
    expect(mapCurvaAbcError(new Error("falha"))).toBe("Erro ao gerar a Curva ABC.");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
