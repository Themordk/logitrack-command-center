import { describe, it, expect } from "vitest";
import { CARDS_RESUMO_HU, motivoDivergencia, textoConteudo, textoEtiquetaHU, textoIdade } from "../huExibicao";
import { limparFiltrosHU } from "../huService";

describe("huExibicao (H5)", () => {
  it("texto do conteúdo", () => {
    expect(textoConteudo({ qtd_skus: 0, qtd_total: 0 })).toBe("Vazia");
    expect(textoConteudo({ qtd_skus: 1, qtd_total: 150 })).toBe("1 SKU · 150 un.");
    expect(textoConteudo({ qtd_skus: 3, qtd_total: 1420.5 })).toBe("3 SKUs · 1.420,5 un.");
  });

  it("idade curta", () => {
    expect(textoIdade(0.5)).toBe("30 min");
    expect(textoIdade(5.9)).toBe("5 h");
    expect(textoIdade(50)).toBe("2 d 2 h");
  });

  it("etiqueta: nunca impressa, impressa e erro no último envio", () => {
    expect(textoEtiquetaHU({ etiqueta_impressoes: 0, etiqueta_ultimo_status: null }).texto).toBe("Nunca impressa");
    expect(textoEtiquetaHU({ etiqueta_impressoes: 2, etiqueta_ultimo_status: "IMPRESSO" }).texto).toBe("2x");
    expect(textoEtiquetaHU({ etiqueta_impressoes: 1, etiqueta_ultimo_status: "ERRO" }).cls).toContain("red");
  });

  it("motivo da divergência espelha a regra do banco", () => {
    expect(motivoDivergencia({ status: "ARMAZENADA", estoque_enderecos: 0, estoque_total: 0 })).toMatch(/sem saldo/);
    expect(motivoDivergencia({ status: "ARMAZENADA", estoque_enderecos: 2, estoque_total: 5 })).toMatch(/2 endereços/);
    expect(motivoDivergencia({ status: "FECHADA", estoque_enderecos: 1, estoque_total: 5 })).toMatch(/sem ter sido armazenada/);
    expect(motivoDivergencia({ status: "ARMAZENADA", estoque_enderecos: 1, estoque_total: 5 })).toBeNull();
  });

  it("cards cobrem todas as chaves do resumo", () => {
    expect(CARDS_RESUMO_HU.map((c) => c.chave).sort()).toEqual(
      ["abertas", "aguardando_armazenagem", "armazenadas", "divergentes", "encerradas", "nunca_impressas", "paradas", "vazias"]);
  });

  it("filtros vazios não vão para o servidor", () => {
    expect(limparFiltrosHU({ status: "", busca: " HU-1 ", sku: "" })).toEqual({ busca: "HU-1" });
  });
});
