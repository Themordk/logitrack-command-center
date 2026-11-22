import { describe, expect, it } from "vitest";
import {
  agruparColetor,
  agruparWeb,
  alternarPermissao,
  contarAlteracoes,
  ehAcaoSensivel,
  fluxoColetor,
  rotuloModulo,
} from "@/lib/perfisAcesso";
import type { Modulo, Permissao } from "@/lib/perfisAcessoService";

const mod = (codigo: string, ambiente: Modulo["ambiente"], menu_grupo: string | null = null): Modulo => ({
  id: codigo,
  codigo,
  descricao: codigo,
  ambiente,
  menu_grupo,
});

const perms: Permissao[] = [
  { id: "r", modulo_id: "m", acao: "READ" },
  { id: "c", modulo_id: "m", acao: "CREATE" },
  { id: "u", modulo_id: "m", acao: "UPDATE" },
];

describe("perfisAcesso", () => {
  it("ligar Editar liga Visualizar junto", () => {
    expect([...alternarPermissao(new Set(), perms, perms[2])].sort()).toEqual(["r", "u"]);
  });

  it("desligar Visualizar limpa o módulo inteiro", () => {
    expect(alternarPermissao(new Set(["r", "c", "u"]), perms, perms[0]).size).toBe(0);
  });

  it("desligar outra ação mantém Visualizar", () => {
    expect([...alternarPermissao(new Set(["r", "c"]), perms, perms[1])]).toEqual(["r"]);
  });

  it("módulo sem READ (só EXECUTE) liga e desliga sozinho", () => {
    const exec: Permissao[] = [{ id: "x", modulo_id: "c", acao: "EXECUTE" }];
    expect([...alternarPermissao(new Set(), exec, exec[0])]).toEqual(["x"]);
  });

  it("agruparWeb segue a ordem do menu e ignora o coletor", () => {
    const grupos = agruparWeb([
      mod("web.relatorios.estoque", "WEB", "relatorios"),
      mod("web.dashboard", "WEB", "torre"),
      mod("coletor.separacao", "COLETOR"),
      mod("web.novo", "WEB", null),
    ]);
    expect(grupos.map((g) => g.grupo.id)).toEqual(["torre", "relatorios", "__outros"]);
  });

  it("fluxoColetor divide como a home do coletor", () => {
    expect(fluxoColetor("coletor.conferencia")).toBe("Entrada");
    expect(fluxoColetor("coletor.separacao.cortar")).toBe("Saída");
    expect(fluxoColetor("coletor.consulta")).toBe("Estoque");
    expect(fluxoColetor("coletor.lms.metas")).toBe("Produtividade");
    expect(agruparColetor([mod("coletor.embarque", "COLETOR"), mod("web.dashboard", "WEB")])).toHaveLength(1);
  });

  it("rotuloModulo tira o sufixo (coletor)", () => {
    expect(rotuloModulo({ descricao: "LMS - Minhas metas (coletor)", ambiente: "COLETOR" })).toBe("LMS - Minhas metas");
    expect(rotuloModulo({ descricao: "Box", ambiente: "WEB" })).toBe("Box");
  });

  it("ações sensíveis: excluir, cortar e remover documento", () => {
    expect(ehAcaoSensivel({ codigo: "web.armazem.box" }, "DELETE")).toBe(true);
    expect(ehAcaoSensivel({ codigo: "coletor.separacao.cortar" }, "EXECUTE")).toBe(true);
    expect(ehAcaoSensivel({ codigo: "coletor.separacao" }, "EXECUTE")).toBe(false);
  });

  it("contarAlteracoes soma permissões e menus diferentes", () => {
    const original = { permissoes: new Set(["a", "b"]), menus: { relatorios: false } };
    const atual = { permissoes: new Set(["b", "c"]), menus: { relatorios: true, armazem: true } };
    expect(contarAlteracoes(original, atual)).toBe(3);
  });
});
