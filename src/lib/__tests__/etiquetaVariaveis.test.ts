import { describe, it, expect } from "vitest";
import { mesclarCamposComCatalogo, VARIAVEIS_ENDERECO } from "../etiquetaVariaveis";

describe("mesclarCamposComCatalogo", () => {
  it("template vazio recebe todo o catálogo inativo", () => {
    const r = mesclarCamposComCatalogo("ENDERECO", []);
    expect(r).toHaveLength(VARIAVEIS_ENDERECO.length);
    expect(r.every((c) => !c.ativo)).toBe(true);
    expect(r.map((c) => c.ordem)).toEqual(r.map((_, i) => i + 1));
  });

  it("preserva 2 campos salvos e acrescenta inativos", () => {
    const salvos = [
      { chave: "descricao", label: "Minha Desc", ativo: true, ordem: 1 },
      { chave: "codigo_endereco", label: "Cód", ativo: true, ordem: 2 },
    ];
    const r = mesclarCamposComCatalogo("ENDERECO", salvos);
    expect(r.slice(0, 2)).toEqual(salvos);
    expect(r).toHaveLength(VARIAVEIS_ENDERECO.length);
    expect(r.slice(2).every((c) => !c.ativo && c.ordem > 2)).toBe(true);
  });

  it("preserva campo fora do catálogo", () => {
    const salvos = [{ chave: "custom_x", label: "X", ativo: true, ordem: 5 }];
    const r = mesclarCamposComCatalogo("ENDERECO", salvos);
    expect(r[0]).toEqual(salvos[0]);
    expect(r).toHaveLength(VARIAVEIS_ENDERECO.length + 1);
    expect(r[1].ordem).toBe(6);
  });

  it("tipo sem catálogo retorna igual", () => {
    const salvos = [{ chave: "sku", label: "SKU", ativo: true, ordem: 1 }];
    expect(mesclarCamposComCatalogo("PRODUTO", salvos)).toBe(salvos);
  });
});
