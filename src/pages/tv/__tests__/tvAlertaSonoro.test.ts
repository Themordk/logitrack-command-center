import { describe, expect, it } from "vitest";
import { MODELOS_SOM, NIVEL_SOM_PADRAO, modeloSom, nivelSomValido } from "../tvAlertaSonoro";

describe("modelos de som", () => {
  it("tem 5 níveis em ordem, do mais leve ao mais chamativo", () => {
    expect(MODELOS_SOM.map((m) => m.nivel)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < MODELOS_SOM.length; i++) {
      expect(MODELOS_SOM[i].duracao).toBeGreaterThanOrEqual(MODELOS_SOM[i - 1].duracao);
      expect(MODELOS_SOM[i].notas.length).toBeGreaterThanOrEqual(MODELOS_SOM[i - 1].notas.length);
    }
  });
  it("todas as notas ficam na faixa audível em ambiente ruidoso (800–1.600 Hz)", () => {
    for (const m of MODELOS_SOM) for (const n of m.notas) expect(n.freq).toBeGreaterThanOrEqual(800);
    for (const m of MODELOS_SOM) for (const n of m.notas) expect(n.freq).toBeLessThanOrEqual(1600);
  });
  it("nenhum alerta passa de ~3,5 s (não vira alarme contínuo)", () => {
    for (const m of MODELOS_SOM) {
      const fim = Math.max(...m.notas.map((n) => n.t + n.dur));
      expect(fim).toBeLessThanOrEqual(3.5);
    }
  });
  it("valida o nível e cai no padrão quando inválido", () => {
    expect(nivelSomValido("5")).toBe(5);
    expect(nivelSomValido("0")).toBeNull();
    expect(nivelSomValido("abc")).toBeNull();
    expect(nivelSomValido(null)).toBeNull();
    expect(modeloSom(99).nivel).toBe(NIVEL_SOM_PADRAO);
  });
});
