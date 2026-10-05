import { describe, expect, it } from "vitest";
import { avaliarFiltros, avaliarRegra, obterCaminho, renderTemplate } from "./avaliacao";

const ctx = {
  documento: { numero: "10000", codigo_erp: "ABC", vazio: "", tipo: { codigo_erp: "VENDA" }, valor: 150.5 },
  tem_corte: true,
  itens: [{ produto: { sku: "SKU1" } }],
};

describe("obterCaminho / renderTemplate", () => {
  it("navega objetos e arrays", () => {
    expect(obterCaminho(ctx, "documento.tipo.codigo_erp")).toBe("VENDA");
    expect(obterCaminho(ctx, "itens.0.produto.sku")).toBe("SKU1");
    expect(obterCaminho(ctx, "documento.nada.x")).toBeUndefined();
  });
  it("renderiza templates", () => {
    expect(renderTemplate("/pedidos/{{documento.numero}}?x={{ nada }}", ctx)).toBe("/pedidos/10000?x=");
  });
});

describe("avaliarRegra", () => {
  const r = (campo: string, operador: Parameters<typeof avaliarRegra>[0]["operador"], valor?: Parameters<typeof avaliarRegra>[0]["valor"]) =>
    avaliarRegra({ campo, operador, valor }, ctx);
  it("igual / diferente comparam como texto", () => {
    expect(r("tem_corte", "igual", true)).toBe(true);
    expect(r("tem_corte", "igual", "true")).toBe(true);
    expect(r("documento.numero", "igual", 10000)).toBe(true);
    expect(r("documento.numero", "diferente", "1")).toBe(true);
    expect(r("documento.numero", "diferente", "10000")).toBe(false);
  });
  it("contem", () => {
    expect(r("documento.codigo_erp", "contem", "B")).toBe(true);
    expect(r("documento.codigo_erp", "contem", "Z")).toBe(false);
  });
  it("em / nao_em com array ou lista por vírgula", () => {
    expect(r("documento.tipo.codigo_erp", "em", ["X", "VENDA"])).toBe(true);
    expect(r("documento.tipo.codigo_erp", "em", "X, VENDA")).toBe(true);
    expect(r("documento.tipo.codigo_erp", "nao_em", "X,Y")).toBe(true);
    expect(r("documento.tipo.codigo_erp", "nao_em", ["VENDA"])).toBe(false);
  });
  it("maior / maior_igual / menor / menor_igual numéricos", () => {
    expect(r("documento.valor", "maior", 100)).toBe(true);
    expect(r("documento.valor", "maior_igual", "150.5")).toBe(true);
    expect(r("documento.valor", "menor", 100)).toBe(false);
    expect(r("documento.valor", "menor_igual", 150.5)).toBe(true);
    expect(r("documento.codigo_erp", "maior", 1)).toBe(false);
  });
  it("existe / nao_existe = não vazio", () => {
    expect(r("documento.codigo_erp", "existe")).toBe(true);
    expect(r("documento.vazio", "existe")).toBe(false);
    expect(r("documento.nada", "nao_existe")).toBe(true);
    expect(r("documento.codigo_erp", "nao_existe")).toBe(false);
  });
});

describe("avaliarFiltros", () => {
  const ok = { campo: "documento.codigo_erp", operador: "existe" as const };
  const falha = { campo: "documento.vazio", operador: "existe" as const };
  it("sem regras passa", () => expect(avaliarFiltros([], "e", ctx)).toBe(true));
  it("combinador e", () => expect(avaliarFiltros([ok, falha], "e", ctx)).toBe(false));
  it("combinador ou", () => expect(avaliarFiltros([ok, falha], "ou", ctx)).toBe(true));
});
