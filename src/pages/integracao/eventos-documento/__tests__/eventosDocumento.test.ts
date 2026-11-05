import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventoDocumento } from "../eventosDocumento.types";
import { agruparEventos, lerOrdemSalva, salvarOrdem, situacaoUi, ultimoRetornoComErroId } from "../eventosDocumentoUi";

function ev(p: Partial<EventoDocumento> & Pick<EventoDocumento, "id" | "seq">): EventoDocumento {
  return {
    fonte: "documento_alteracao", direcao: "ERP_WMS", categoria: "importacao", titulo: p.id,
    codigo: null, situacao: null, problema: false, mensagem: null, origem: null, ator_nome: null,
    ocorrido_em: null, request_id: null, id_alteracao: null, pai_id: null, vinculo: "documento",
    sintetico: false, extra: {}, tem_detalhe: true, ...p,
  };
}

describe("agruparEventos", () => {
  it("coloca o filho logo após o pai presente na página", () => {
    const lista = [
      ev({ id: "pai", seq: 1, fonte: "retorno_evento" }),
      ev({ id: "outro", seq: 2 }),
      ev({ id: "filho", seq: 3, fonte: "retorno_execucao", pai_id: "pai" }),
    ];
    expect(agruparEventos(lista).map((l) => [l.evento.id, l.filho])).toEqual([["pai", false], ["filho", true], ["outro", false]]);
  });

  it("mantém na posição original o filho cujo pai não está na página", () => {
    const lista = [ev({ id: "a", seq: 1 }), ev({ id: "orfao", seq: 2, fonte: "retorno_execucao", pai_id: "ausente" }), ev({ id: "b", seq: 3 })];
    expect(agruparEventos(lista).map((l) => [l.evento.id, l.filho])).toEqual([["a", false], ["orfao", false], ["b", false]]);
  });

  it("preserva a ordem desc das raízes e ordena filhos por seq", () => {
    const lista = [
      ev({ id: "f2", seq: 5, fonte: "retorno_execucao", pai_id: "pai" }),
      ev({ id: "f1", seq: 4, fonte: "retorno_execucao", pai_id: "pai" }),
      ev({ id: "pai", seq: 3, fonte: "retorno_evento" }),
      ev({ id: "x", seq: 1 }),
    ];
    expect(agruparEventos(lista).map((l) => l.evento.id)).toEqual(["pai", "f1", "f2", "x"]);
  });
});

describe("situacaoUi", () => {
  it("mapeia valores conhecidos", () => {
    expect(situacaoUi("aplicada")).toMatchObject({ rotulo: "Aplicada", tom: "sucesso" });
    expect(situacaoUi("recusada")?.classe).toContain("rose");
    expect(situacaoUi("filtrado")).toMatchObject({ rotulo: "Filtrado", tom: "neutro" });
    expect(situacaoUi("pendente")?.classe).toContain("amber");
  });
  it("valor desconhecido cai no fallback", () => {
    expect(situacaoUi("qualquer_coisa")).toBeNull();
  });
});

describe("ultimoRetornoComErroId", () => {
  it("pega o retorno_execucao mais recente com erro", () => {
    const lista = [
      ev({ id: "e1", seq: 2, fonte: "retorno_execucao", situacao: "erro" }),
      ev({ id: "e2", seq: 7, fonte: "retorno_execucao", situacao: "erro" }),
      ev({ id: "ok", seq: 9, fonte: "retorno_execucao", situacao: "sucesso" }),
      ev({ id: "naoRetorno", seq: 10, situacao: "erro" }),
    ];
    expect(ultimoRetornoComErroId(lista)).toBe("e2");
    expect(ultimoRetornoComErroId([ev({ id: "s", seq: 1, fonte: "retorno_execucao", situacao: "sucesso" })])).toBeNull();
  });
});

describe("ordem persistida", () => {
  afterEach(() => vi.restoreAllMocks());
  it("localStorage que lança exceção não quebra", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(lerOrdemSalva()).toBe("asc");
    expect(() => salvarOrdem("desc")).not.toThrow();
  });
});
