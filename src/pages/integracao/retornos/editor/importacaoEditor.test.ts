import { describe, expect, it } from "vitest";
import type { Catalogo } from "../retornos.types";
import type { FluxoNode } from "./definicaoRf";
import { agruparEventos, termoRegistro } from "./eventosCatalogo";
import { contextoVazio } from "./contextoVazio";
import { configInicial, fluxoDeImportacao, motivoNoIndisponivel } from "./novoNo";
import { geraSaida } from "./saidasAnteriores";

const no = (id: string, tipo: string, config: Record<string, unknown> = {}): FluxoNode =>
  ({ id, type: "fluxo", position: { x: 0, y: 0 }, data: { tipo, nome: id, config, extra: {} } }) as unknown as FluxoNode;

const eventos: Catalogo["eventos"] = [
  { codigo: "saida.pedido_expedido", entidade: "documento_saida", nome: "Pedido expedido", descricao: null, manual: false },
  { codigo: "manual.documento_saida", entidade: "documento_saida", nome: "Manual", descricao: null, manual: true },
  { codigo: "entrada.recebida", entidade: "documento_entrada", nome: "Recebida", descricao: null, manual: false },
  { codigo: "estoque.estrutura_alterada", entidade: "movimentacao_interna", nome: "Estrutura alterada", descricao: null, manual: false },
  { codigo: "importar.produto", entidade: "cadastro_importacao", nome: "Importar produto", descricao: null, manual: false },
];

describe("agruparEventos", () => {
  it("agrupa na ordem Entrada, Saída, Estoque, Importar do ERP e tira os manuais", () => {
    const g = agruparEventos(eventos);
    expect(g.map((x) => x.rotulo)).toEqual(["Entrada", "Saída", "Estoque", "Importar do ERP"]);
    expect(g.flatMap((x) => x.eventos.map((e) => e.codigo))).not.toContain("manual.documento_saida");
  });
  it("omite grupos vazios", () => {
    expect(agruparEventos(eventos.slice(0, 2)).map((x) => x.rotulo)).toEqual(["Saída"]);
    expect(agruparEventos(undefined)).toEqual([]);
  });
});

describe("nós do Importar do ERP", () => {
  const importacao = [no("gatilho", "gatilho.evento", { evento: "importar.produto" })];
  const documento = [no("gatilho", "gatilho.evento", { evento: "saida.pedido_expedido" })];

  it("reconhece o fluxo pelo evento importar.*", () => {
    expect(fluxoDeImportacao(importacao)).toBe(true);
    expect(fluxoDeImportacao(documento)).toBe(false);
    expect(fluxoDeImportacao([no("g", "gatilho.manual", { entidade: "documento_saida" })])).toBe(false);
  });

  it("Confirmar e Gravar só em fluxo de importação; Aguardar fora dele", () => {
    expect(motivoNoIndisponivel("acao.gravar_logitrack", false, [])).toMatch(/Importar do ERP/);
    expect(motivoNoIndisponivel("logica.confirmar_usuario", false, [])).toMatch(/Importar do ERP/);
    expect(motivoNoIndisponivel("acao.gravar_logitrack", true, [])).toBeNull();
    expect(motivoNoIndisponivel("logica.aguardar", true, [])).toMatch(/não espera/);
    expect(motivoNoIndisponivel("logica.aguardar", false, [])).toBeNull();
    expect(motivoNoIndisponivel("acao.http", true, [])).toBeNull();
  });

  it("um de cada por fluxo", () => {
    expect(motivoNoIndisponivel("acao.gravar_logitrack", true, ["acao.gravar_logitrack"])).toMatch(/já tem/);
    expect(motivoNoIndisponivel("logica.confirmar_usuario", true, ["acao.gravar_logitrack"])).toBeNull();
  });

  it("config inicial e saída do Gravar", () => {
    expect(configInicial("logica.confirmar_usuario", [])).toMatchObject({ expira_minutos: 15 });
    expect(configInicial("acao.gravar_logitrack", [])).toEqual({});
    expect(geraSaida("acao.gravar_logitrack")).toBe(true);
    expect(geraSaida("logica.confirmar_usuario")).toBe(false);
  });
});

describe("contexto vazio e textos por entidade", () => {
  it("cada entidade tem o seu esqueleto", () => {
    expect(contextoVazio("cadastro_importacao")).toHaveProperty("importacao.valor", null);
    expect(contextoVazio("movimentacao_interna")).toHaveProperty("origem.setor.codigo_erp", null);
    expect(contextoVazio("documento_saida")).toHaveProperty("documento.numero", null);
    expect(contextoVazio(null)).toHaveProperty("documento.numero", null);
  });
  it("termos", () => {
    expect(termoRegistro("movimentacao_interna").todos).toBe("todas as movimentações");
    expect(termoRegistro("documento_entrada").todos).toBe("todos os documentos");
  });
});
