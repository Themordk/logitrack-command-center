// Paridade da prévia do editor com o motor do servidor.
// esperado.json foi gerado rodando o motor.ts real (Edge Function retorno-dispatcher v2) sobre os mesmos casos.
// Se este teste falhar, a prévia está mostrando ao usuário algo diferente do que o servidor vai enviar.
import { describe, expect, it } from "vitest";
import { avaliarRegra, contextoLote, criarMapa, mapeamentoParaJsonata, montarPayload, renderTemplate } from "./avaliacao";
import ctx from "./__paridade__/ctx.json";
import esperado from "./__paridade__/esperado.json";
import { casosPayload, casosRegra, casosTemplate, mapaItens } from "./__paridade__/casos";
import type { MapaItem } from "../retornos.types";

const mapa = criarMapa(mapaItens as unknown as MapaItem[]);
const lote = contextoLote(ctx as Record<string, unknown>);

describe("prévia do payload = motor do servidor", () => {
  for (const c of casosPayload) {
    it(c.nome, async () => {
      const r = await montarPayload(c.cfg, c.lote ? lote : ctx, mapa);
      expect(r).toEqual((esperado.payload as Record<string, unknown>)[c.nome]);
    });
  }
});

describe("regras de condição/filtro = motor do servidor", () => {
  for (const c of casosRegra) {
    it(c.nome, () => {
      expect(avaliarRegra(c.regra as never, ctx)).toBe((esperado.regras as Record<string, boolean>)[c.nome]);
    });
  }
});

describe("templates {{...}} = motor do servidor", () => {
  casosTemplate.forEach((t, i) => it(t, () => expect(renderTemplate(t, ctx)).toBe(esperado.templates[i])));
});

// "Converter para JSONata" precisa dar exatamente o mesmo corpo que o mapeamento visual.
describe("conversão mapeamento → JSONata dá o mesmo resultado", () => {
  const ctx1 = { ...ctx, itens: [ctx.itens[0]], volumes: [] };
  const casos: [string, unknown[]][] = [
    ["número com vírgula", [{ campo: "x", tipo: "fixo", valor: "1,5", formato: "numero" }]],
    ["número vazio", [{ campo: "x", tipo: "fixo", valor: "", formato: "numero" }]],
    ["booleano 'não'", [{ campo: "x", tipo: "fixo", valor: "não", formato: "booleano" }]],
    ["campo ausente vira null", [{ campo: "x", valor: "documento.inexistente" }]],
    ["de-para + texto", [{ campo: "s", tipo: "expressao", valor: "evento", dominio: "status", formato: "texto" }]],
    ["lista de 1 item + $raiz", [{ campo: "l", tipo: "lista", valor: "itens", campos: [{ campo: "p", valor: "$raiz.documento.numero" }, { campo: "q", valor: "qtd_atendida", formato: "inteiro" }] }]],
    ["lista vazia", [{ campo: "l", tipo: "lista", valor: "volumes", campos: [{ campo: "a", valor: "id" }] }]],
    ["objeto", [{ campo: "o", tipo: "objeto", campos: [{ campo: "n", valor: "documento.numero" }] }]],
  ];
  for (const [nome, campos] of casos) {
    it(nome, async () => {
      const visual = await montarPayload({ modo: "mapeamento", campos }, ctx1, mapa);
      const convertido = await montarPayload({ modo: "jsonata", expressao: mapeamentoParaJsonata(campos as never) }, ctx1, mapa);
      expect(convertido).toEqual(visual);
    });
  }
});
