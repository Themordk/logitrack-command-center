import { describe, expect, it } from "vitest";
import {
  CONFIG_VAZIA, alternarCriterio, configDeDados, configIgual, dicasNivel, fraseNivel, moverCriterio, payloadSalvar,
} from "@/lib/fluxoExpedicao";

describe("fluxo de expedição", () => {
  it("lê o limite de SKUs do formato do backend", () => {
    const c = configDeDados({ movimento: ["DOCUMENTO"], separacao: ["ZONA_ATIVIDADE"], conferencia: [], embarque: [],
      limites: { "separacao.MAX_SKU": 40 }, criterios_permitidos: { movimento: [], separacao: [], conferencia: [], embarque: [] } });
    expect(c.maxSku).toBe(40);
    expect(payloadSalvar(c).limites).toEqual({ separacao: { MAX_SKU: 40 } });
    expect(payloadSalvar({ ...c, maxSku: null }).limites).toEqual({ separacao: {} });
  });
  it("marca, desmarca e reordena critérios", () => {
    const l = alternarCriterio(alternarCriterio([], "ROTA"), "PARCEIRO");
    expect(l).toEqual(["ROTA", "PARCEIRO"]);
    expect(moverCriterio(l, 1, -1)).toEqual(["PARCEIRO", "ROTA"]);
    expect(moverCriterio(l, 0, -1)).toEqual(l);
    expect(alternarCriterio(l, "ROTA")).toEqual(["PARCEIRO"]);
  });
  it("traduz a escolha em frase, com herança e limite", () => {
    const c = { ...CONFIG_VAZIA, movimento: ["ROTA" as const], separacao: ["ZONA_ATIVIDADE" as const], maxSku: 40 };
    expect(fraseNivel("movimento", c)).toBe("Cada rota vira um movimento de saída (dentro de empresa e tipo de saída).");
    expect(fraseNivel("separacao", c)).toBe("Dentro do movimento, um grupo de separação por armazém e zona, com no máximo 40 SKUs por grupo. Já separado por rota (herdado do movimento).");
    expect(fraseNivel("conferencia", CONFIG_VAZIA)).toContain("conferido inteiro");
  });
  it("avisa conferência por grupo sem divisão na separação", () => {
    expect(dicasNivel("conferencia", { ...CONFIG_VAZIA, conferencia: ["GRUPO_SEPARACAO"] })).toHaveLength(1);
    expect(dicasNivel("conferencia", { ...CONFIG_VAZIA, conferencia: ["GRUPO_SEPARACAO"], maxSku: 30 })).toHaveLength(0);
    expect(configIgual(CONFIG_VAZIA, { ...CONFIG_VAZIA })).toBe(true);
  });
});

import { descreverAmostra } from "@/lib/fluxoExpedicao";
describe("simulação", () => {
  const base = { dias: 7, itens: 1, skus: 1, movimentos: 1, grupos_separacao: 1, unidades_conferencia: 1, movimentos_conferidos: 1,
    conferencia_por_hu: false, movimentos_com_embarque: 0, cargas_sugeridas: null, por_tipo: [] };
  it("descreve a amostra usada", () => {
    expect(descreverAmostra({ ...base, origem: "PENDENTES", pedidos: 74 })).toBe("74 pedido(s) pendente(s) de movimento");
    expect(descreverAmostra({ ...base, origem: "PERIODO", pedidos: 12, dias: 15 })).toBe("12 pedido(s) dos últimos 15 dias (não há pendentes)");
  });
});

import { textoCobertura } from "@/lib/fluxoExpedicao";
describe("critérios de produto no N3", () => {
  it("mostra a cobertura do cadastro e alerta abaixo de 80%", () => {
    expect(textoCobertura("GRUPO_PRODUTO", 49)).toEqual({ texto: '49% dos produtos têm a informação; os demais vão para "Sem grupo".', alerta: true });
    expect(textoCobertura("MARCA", 100)?.alerta).toBe(false);
    expect(textoCobertura("ZONA_ATIVIDADE", 10)).toBeNull();
  });
  it("frase e dica com marca e grupo", () => {
    const c = { ...CONFIG_VAZIA, separacao: ["MARCA" as const, "GRUPO_PRODUTO" as const] };
    expect(fraseNivel("separacao", c)).toBe("Dentro do movimento, um grupo de separação por armazém, marca e grupo de produto.");
    expect(dicasNivel("separacao", { ...c, separacao: ["GRUPO_PRODUTO", "SUBGRUPO_PRODUTO"] })).toHaveLength(1);
  });
});
