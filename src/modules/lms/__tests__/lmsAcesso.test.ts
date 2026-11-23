import { describe, expect, it } from "vitest";
import { areaDaRota, criarAcessoLms, ehErroAcessoLms, LMS_MODULOS } from "../lmsAcesso";
import { abasDisponiveis } from "@/pages/coletor/metas/metasAbas";

const perfil = (perms: Record<string, string[]>) => (m: string, a: string) => perms[m]?.includes(a) ?? false;

describe("Fase 6 · acesso ao módulo LMS", () => {
  it("gerente vê as três áreas, começando pelo acompanhamento", () => {
    const a = criarAcessoLms(perfil({
      [LMS_MODULOS.acompanhamento]: ["READ", "UPDATE", "EXECUTE"],
      [LMS_MODULOS.metas]: ["READ", "CREATE", "UPDATE", "DELETE", "EXECUTE"],
      [LMS_MODULOS.configuracao]: ["READ", "UPDATE", "EXECUTE"],
    }));
    expect(a.temModuloWeb).toBe(true);
    expect(a.rotasVisiveis.map((r) => r.area)).toEqual(["acompanhamento", "metas", "configuracao"]);
    expect(a.rotaInicial).toBe("/lms/acompanhamento");
    expect(a.pode("configuracao", "UPDATE")).toBe(true);
  });

  it("supervisor não vê configuração nem aprova metas", () => {
    const a = criarAcessoLms(perfil({
      [LMS_MODULOS.acompanhamento]: ["READ", "UPDATE"],
      [LMS_MODULOS.metas]: ["READ", "CREATE", "UPDATE", "DELETE"],
    }));
    expect(a.rotasVisiveis.map((r) => r.area)).toEqual(["acompanhamento", "metas"]);
    expect(a.pode("configuracao")).toBe(false);
    expect(a.pode("metas", "EXECUTE")).toBe(false);
    expect(a.pode("acompanhamento", "EXECUTE")).toBe(false);
  });

  it("operador não tem menu web, só o coletor", () => {
    const a = criarAcessoLms(perfil({ [LMS_MODULOS.coletor]: ["READ"] }));
    expect(a.temModuloWeb).toBe(false);
    expect(a.rotaInicial).toBeNull();
    expect(a.pode("coletor")).toBe(true);
  });

  it("relatório de produtividade não abre o módulo LMS (ficam separados)", () => {
    const a = criarAcessoLms(perfil({ "web.relatorios.produtividade": ["READ"] }));
    expect(a.temModuloWeb).toBe(false);
  });

  it("reconhece rotas e códigos de erro do módulo", () => {
    expect(areaDaRota("/lms/metas")).toBe("metas");
    expect(areaDaRota("/lms/configuracao/tipos")).toBe("configuracao");
    expect(areaDaRota("/relatorios/produtividade")).toBeNull();
    expect(ehErroAcessoLms("SEM_PERMISSAO_MODULO")).toBe(true);
    expect(ehErroAcessoLms("SOMENTE_PROPRIOS_DADOS")).toBe(true);
    expect(ehErroAcessoLms("PERIODO_INVALIDO")).toBe(false);
  });

  it("coletor esconde a aba Ranking quando o banco não manda ranking", () => {
    expect(abasDisponiveis(false)).toEqual(["metas", "resumo", "evolucao"]);
    expect(abasDisponiveis(true)).toEqual(["metas", "resumo", "ranking", "evolucao"]);
  });
});
