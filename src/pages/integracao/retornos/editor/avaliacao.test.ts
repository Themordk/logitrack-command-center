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

import { criarMapa, erroSintaxeJsonata, mapeamentoParaJsonata, montarPayload, presetSoStatus, presetStatusItens, contextoLote } from "./avaliacao";

const doc = {
  evento: "saida.expedido", ocorrido_em: "2026-10-01T14:32:00Z",
  documento: { numero: "10000", codigo_erp: "PV-1" },
  itens: [
    { produto: { sku: "009.516127", codigo_erp: "P1" }, qtd_solicitada: 2, qtd_atendida: 0, qtd_cortada: 2 },
    { produto: { sku: "SKU2", codigo_erp: "P2" }, qtd_solicitada: 5, qtd_atendida: 5, qtd_cortada: 0 },
  ],
};
const mapa = criarMapa([
  { id: "1", fluxo_id: null, dominio: "status", valor_wms: "saida.expedido", valor_erp: "EXPEDIDO" },
  { id: "2", fluxo_id: "f", dominio: "status", valor_wms: "saida.expedido", valor_erp: "EXP_PARCIAL" },
]);

describe("presets de payload (§6)", () => {
  it("só status aplica de-para do fluxo antes do da empresa", async () => {
    const r = await montarPayload({ modo: "mapeamento", campos: presetSoStatus() }, doc, mapa);
    expect(r).toEqual({ pedido: "10000", codigo_erp: "PV-1", status: "EXP_PARCIAL", data: "2026-10-01T14:32:00Z" });
  });
  it("status + itens de saída", async () => {
    const r = (await montarPayload({ modo: "mapeamento", campos: presetStatusItens(false) }, doc, mapa)) as { itens: unknown[] };
    expect(r.itens[0]).toEqual({ sku: "009.516127", codigo_erp: "P1", solicitado: 2, atendido: 0, cortado: 2 });
    expect(r.itens).toHaveLength(2);
  });
  it("sem correspondência no de-para passa o valor original", async () => {
    const r = (await montarPayload({ modo: "mapeamento", campos: presetSoStatus() }, { ...doc, evento: "x" }, mapa)) as { status: string };
    expect(r.status).toBe("x");
  });
  it("$raiz, fixo e formatos", async () => {
    const r = await montarPayload({ modo: "mapeamento", campos: [
      { campo: "origem", tipo: "fixo", valor: "LogiTrack" },
      { campo: "n", valor: "documento.numero", formato: "inteiro" },
      { campo: "l", tipo: "lista", valor: "itens", campos: [{ campo: "pedido", valor: "$raiz.documento.numero" }] },
    ] }, doc, mapa);
    expect(r).toEqual({ origem: "LogiTrack", n: 10000, l: [{ pedido: "10000" }, { pedido: "10000" }] });
  });
  it("conversão para JSONata dá o mesmo resultado", async () => {
    const campos = presetStatusItens(false);
    const a = await montarPayload({ modo: "mapeamento", campos }, doc, mapa);
    const b = await montarPayload({ modo: "jsonata", expressao: mapeamentoParaJsonata(campos) }, doc, mapa);
    expect(b).toEqual(a);
  });
  it("lote", async () => {
    const lote = contextoLote(doc);
    const r = await montarPayload({ modo: "jsonata", expressao: '{"quantidade": quantidade, "origem": "LogiTrack", "pedidos": [documentos.documento.numero]}' }, lote, mapa);
    expect(r).toEqual({ quantidade: 1, origem: "LogiTrack", pedidos: ["10000"] });
  });
  it("erro de sintaxe", () => {
    expect(erroSintaxeJsonata("{ a: ")).toMatch(/posição/);
    expect(erroSintaxeJsonata("documento.numero")).toBeNull();
  });
});
