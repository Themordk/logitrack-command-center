import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import {
  embalagensDoProduto,
  lerEanConfirmado,
  limparEanConfirmado,
  montarEanMap,
  registrarEanConfirmado,
  resolverLeituraArmazenagem,
} from "../armazenagemService";

const itens = [
  { tarefa_id: "t1", produto_id: "tinta" },
  { tarefa_id: "t2", produto_id: "pincel" },
  { tarefa_id: "t3", produto_id: "pincel" },
];
const eanMap = montarEanMap([
  { produto_id: "tinta", ean: "7891234567890", fator: 1, ativo: true },
  { produto_id: "tinta", ean: " 17891234567897 ", fator: 12, ativo: true },
  { produto_id: "pincel", ean: "7890000000001", fator: 1 },
  { produto_id: "rolo", ean: "7895555555555", fator: 1 },
  { produto_id: "tinta", ean: "7899999999999", fator: 1, ativo: false },
  { produto_id: "tinta", ean: "", fator: 1 },
]);
const huMap = { t1: { codigo_hu: "HU-000123" } };

describe("montarEanMap", () => {
  it("normaliza EAN, ignora inativos e vazios e mantém o fator", () => {
    expect(Object.keys(eanMap).sort()).toEqual(["17891234567897", "7890000000001", "7891234567890", "7895555555555"]);
    expect(eanMap["17891234567897"]).toEqual([{ produto_id: "tinta", fator: 12 }]);
  });
  it("fator ausente ou inválido vira 1", () => {
    expect(montarEanMap([{ produto_id: "p", ean: "1", fator: null }, { produto_id: "q", ean: "2", fator: 0 }]))
      .toEqual({ "1": [{ produto_id: "p", fator: 1 }], "2": [{ produto_id: "q", fator: 1 }] });
  });
  it("EAN duplicado em produtos diferentes guarda os dois", () => {
    const m = montarEanMap([{ produto_id: "a", ean: "9", fator: 1 }, { produto_id: "b", ean: "9", fator: 6 }, { produto_id: "a", ean: "9", fator: 1 }]);
    expect(m["9"]).toEqual([{ produto_id: "a", fator: 1 }, { produto_id: "b", fator: 6 }]);
  });
  it("embalagensDoProduto gera o formato do cache da conferência", () => {
    expect(embalagensDoProduto(eanMap, "tinta").sort((a, b) => a.fator - b.fator))
      .toEqual([{ ean: "7891234567890", fator: 1 }, { ean: "17891234567897", fator: 12 }]);
  });
});

describe("resolverLeituraArmazenagem", () => {
  it("EAN de unidade encontra a única tarefa do produto", () => {
    expect(resolverLeituraArmazenagem("7891234567890", itens, eanMap, huMap))
      .toEqual({ tipo: "EAN", codigo: "7891234567890", tarefaIds: ["t1"], fatorPorProduto: { tinta: 1 } });
  });
  it("EAN de caixa devolve o fator da embalagem lida", () => {
    const r = resolverLeituraArmazenagem("  17891234567897\n", itens, eanMap, huMap);
    expect(r).toMatchObject({ tipo: "EAN", tarefaIds: ["t1"], fatorPorProduto: { tinta: 12 } });
  });
  it("mesmo produto em várias tarefas devolve todas", () => {
    expect(resolverLeituraArmazenagem("7890000000001", itens, eanMap, huMap)).toMatchObject({ tipo: "EAN", tarefaIds: ["t2", "t3"] });
  });
  it("EAN de produto fora do movimento", () => {
    expect(resolverLeituraArmazenagem("7895555555555", itens, eanMap, huMap)).toEqual({ tipo: "FORA_DO_MOVIMENTO", codigo: "7895555555555" });
  });
  it("EAN desconhecido ou inativo não é encontrado", () => {
    expect(resolverLeituraArmazenagem("0000", itens, eanMap, huMap).tipo).toBe("NAO_ENCONTRADO");
    expect(resolverLeituraArmazenagem("7899999999999", itens, eanMap, huMap).tipo).toBe("NAO_ENCONTRADO");
    expect(resolverLeituraArmazenagem("   ", itens, eanMap, huMap).tipo).toBe("NAO_ENCONTRADO");
  });
  it("SKU e referência não são aceitos", () => {
    const comSku = [{ tarefa_id: "t9", produto_id: "x", sku: "9037130", referencia: "0680095" }];
    expect(resolverLeituraArmazenagem("9037130", comSku, eanMap, {}).tipo).toBe("NAO_ENCONTRADO");
    expect(resolverLeituraArmazenagem("0680095", comSku, eanMap, {}).tipo).toBe("NAO_ENCONTRADO");
  });
  it("HU localiza a tarefa sem confirmar o EAN (sem diferenciar maiúsculas)", () => {
    expect(resolverLeituraArmazenagem("hu-000123", itens, eanMap, huMap)).toEqual({ tipo: "HU", codigo: "HU-000123", tarefaIds: ["t1"] });
  });
  it("HU de tarefa que não está mais pendente é ignorada", () => {
    expect(resolverLeituraArmazenagem("HU-000123", itens.slice(1), eanMap, huMap).tipo).toBe("NAO_ENCONTRADO");
  });
});

describe("passagem da conferência para /iniciar", () => {
  beforeEach(() => sessionStorage.clear());
  it("vale apenas para a mesma tarefa", () => {
    registrarEanConfirmado("t1", "789");
    expect(lerEanConfirmado("t1")).toEqual({ codigo: "789" });
    expect(lerEanConfirmado("t2")).toBeNull();
    expect(lerEanConfirmado(null)).toBeNull();
  });
  it("limpar remove a conferência", () => {
    registrarEanConfirmado("t1", "789");
    limparEanConfirmado();
    expect(lerEanConfirmado("t1")).toBeNull();
  });
  it("valor corrompido é ignorado", () => {
    sessionStorage.setItem("coletor_armazenagem_ean_confirmado", "{quebrado");
    expect(lerEanConfirmado("t1")).toBeNull();
  });
});
