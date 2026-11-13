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
