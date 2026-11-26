import { describe, expect, it } from "vitest";
import type { Importacao } from "@/pages/integracao/retornos/retornos.types";
import {
  camposPrevia, importacaoParada, linkExecucaoImportacao, mensagemErroImportacao, rotuloRegistroGravado, situacaoImportacao,
} from "./importacaoFluxo";

const imp = (extra: Partial<Importacao> = {}): Importacao => ({
  execucao_id: "e1", importacao_id: "i1", evento: "importar.produto", entidade: "produto", tela: "Produtos",
  modo: "interativo", status: "pendente", finalizado: false, valor: "4400619", parametros: { valor: "4400619" },
  fluxo_id: "f1", fluxo_nome: "Omie — Produto", aguardando_confirmacao: false, confirmacao: null, previa: null,
  registro: null, erro: null, erro_http_status: null, created_at: "2026-11-26T12:00:00Z", finalizado_em: null, passos: [],
  ...extra,
});

describe("situacaoImportacao", () => {
  it("pendente, executando e nova tentativa = executando", () => {
    expect(situacaoImportacao(imp({ status: "pendente" }))).toBe("executando");
    expect(situacaoImportacao(imp({ status: "executando" }))).toBe("executando");
    expect(situacaoImportacao(imp({ status: "aguardando_retry" }))).toBe("executando");
    expect(situacaoImportacao(null)).toBe("executando");
  });
  it("pausa do Confirmar com o usuário = aguardando", () => {
    expect(situacaoImportacao(imp({ status: "aguardando_confirmacao" }))).toBe("aguardando");
    expect(importacaoParada(imp({ status: "aguardando_confirmacao" }))).toBe(true);
  });
  it("estados finais", () => {
    expect(situacaoImportacao(imp({ status: "sucesso" }))).toBe("sucesso");
    expect(situacaoImportacao(imp({ status: "erro" }))).toBe("erro");
    expect(situacaoImportacao(imp({ status: "filtrado" }))).toBe("filtrado");
    expect(situacaoImportacao(imp({ status: "descartado" }))).toBe("descartado");
    expect(importacaoParada(imp({ status: "pendente" }))).toBe(false);
  });
});

describe("mensagemErroImportacao", () => {
  it("usa o erro geral e acrescenta o HTTP", () => {
    expect(mensagemErroImportacao(imp({ status: "erro", erro: "Produto não encontrado", erro_http_status: 404 })))
      .toBe("Produto não encontrado (HTTP 404)");
  });
  it("sem erro geral, usa o primeiro passo com erro", () => {
    const m = mensagemErroImportacao(imp({
      status: "erro",
      passos: [
        { no_id: "http_1", no_tipo: "acao.http", status: "sucesso", saida: "sucesso", erro: null, http_status: 200, duracao_ms: 10 },
        { no_id: "gravar_1", no_tipo: "acao.gravar_logitrack", status: "erro", saida: "erro", erro: "SKU obrigatório", http_status: 422, duracao_ms: 5 },
      ],
    }));
    expect(m).toBe("SKU obrigatório (HTTP 422)");
  });
  it("sem nada, mensagem que diz o que fazer", () => {
    expect(mensagemErroImportacao(imp({ status: "erro" }))).toMatch(/Confira o código/);
    expect(mensagemErroImportacao(null)).toMatch(/Tente de novo/);
  });
});

describe("camposPrevia", () => {
  it("objeto raso vira lista de campos formatados", () => {
    expect(camposPrevia({ sku: "4400619", ativo: true, peso: 1234.5, marca: null })).toEqual([
      { chave: "sku", valor: "4400619" },
      { chave: "ativo", valor: "Sim" },
      { chave: "peso", valor: (1234.5).toLocaleString("pt-BR") },
      { chave: "marca", valor: "—" },
    ]);
  });
  it("aninhado, lista ou vazio vai como JSON (null)", () => {
    expect(camposPrevia({ produto: { sku: "1" } })).toBeNull();
    expect(camposPrevia([{ sku: "1" }])).toBeNull();
    expect(camposPrevia({})).toBeNull();
    expect(camposPrevia("texto")).toBeNull();
  });
});

describe("rótulos e links", () => {
  it("status devolvido pela API", () => {
    expect(rotuloRegistroGravado("inserido")).toBe("Registro criado no LogiTrack.");
    expect(rotuloRegistroGravado("atualizado")).toBe("Registro atualizado no LogiTrack.");
    expect(rotuloRegistroGravado(null)).toBe("Registro gravado no LogiTrack.");
  });
  it("link da execução no Retorno ao ERP", () => {
    expect(linkExecucaoImportacao(imp())).toBe("/config/integracao/retornos?aba=execucoes&fluxo=f1&execucao=e1");
  });
});
