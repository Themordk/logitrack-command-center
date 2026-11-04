import { beforeEach, describe, expect, it } from "vitest";
import {
  MUDPICK_KEYS,
  lerDecisoes,
  lerPreview,
  lerResultado,
  limparSessaoMudanca,
  salvarDecisoes,
  type PreviewResponse,
} from "../mudancaPicking.service";

const previewValido = {
  sucesso: true,
  origem: { id: "e1", descricao: "R01-P01-N01-A01", armazem_id: "a1" },
  itens: [],
  produtos: [],
  pendencias: [],
  bloqueios: [],
  pode_prosseguir: true,
  totais: { qtd_itens: 0, qtd_produtos: 0, qtd_total: 0, qtd_bloqueada: 0, qtd_mapeamentos: 0 },
} as PreviewResponse;

describe("mudancaPicking.service — sessão", () => {
  beforeEach(() => sessionStorage.clear());

  it("lerPreview retorna null sem dados ou com JSON inválido", () => {
    expect(lerPreview()).toBeNull();
    sessionStorage.setItem(MUDPICK_KEYS.preview, "{invalido");
    expect(lerPreview()).toBeNull();
    sessionStorage.setItem(MUDPICK_KEYS.preview, JSON.stringify({ sucesso: false }));
    expect(lerPreview()).toBeNull();
  });

  it("lerPreview retorna o preview válido", () => {
    sessionStorage.setItem(MUDPICK_KEYS.preview, JSON.stringify(previewValido));
    expect(lerPreview()?.origem.descricao).toBe("R01-P01-N01-A01");
  });

  it("decisões persistem e voltam por produto", () => {
    salvarDecisoes({
      p1: { produto_id: "p1", acao: "SOMENTE_ESTOQUE" },
      p2: { produto_id: "p2", acao: "CRIAR_PICKING", tipo_picking: "FRACIONADO", est_minimo: 1, est_maximo: 10 },
    });
    const d = lerDecisoes();
    expect(d.p1.acao).toBe("SOMENTE_ESTOQUE");
    expect(d.p2.acao).toBe("CRIAR_PICKING");
  });

  it("lerDecisoes tolera JSON corrompido", () => {
    sessionStorage.setItem(MUDPICK_KEYS.decisoes, "nao-json");
    expect(lerDecisoes()).toEqual({});
  });

  it("limparSessaoMudanca remove todas as chaves", () => {
    sessionStorage.setItem(MUDPICK_KEYS.origemId, "e1");
    sessionStorage.setItem(MUDPICK_KEYS.origemDesc, "R01");
    sessionStorage.setItem(MUDPICK_KEYS.preview, JSON.stringify(previewValido));
    sessionStorage.setItem(MUDPICK_KEYS.decisoes, "{}");
    sessionStorage.setItem(MUDPICK_KEYS.resultado, JSON.stringify({ sucesso: true }));
    limparSessaoMudanca();
    Object.values(MUDPICK_KEYS).forEach((k) => expect(sessionStorage.getItem(k)).toBeNull());
  });

  it("lerResultado exige sucesso true", () => {
    expect(lerResultado()).toBeNull();
    sessionStorage.setItem(MUDPICK_KEYS.resultado, JSON.stringify({ sucesso: false }));
    expect(lerResultado()).toBeNull();
  });
});
