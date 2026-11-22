import { describe, expect, it } from "vitest";
import { MENU_GRUPOS, filtrarMenu, localizarItem, menuGrupoDoModulo, secoesDoGrupo } from "@/lib/menuRegistry";
import { getModuleForChildRoute } from "@/hooks/useRoutePermission";

describe("menuRegistry", () => {
  it("cada item fica no grupo que o banco grava em modulo.menu_grupo", () => {
    for (const grupo of MENU_GRUPOS) {
      for (const item of grupo.itens) {
        const modulo = getModuleForChildRoute(item.path);
        expect(modulo, item.path).toBeTruthy();
        expect(menuGrupoDoModulo(modulo as string), `${item.path} → ${modulo}`).toBe(grupo.id);
      }
    }
  });

  it("não repete rota nem id de grupo", () => {
    const paths = MENU_GRUPOS.flatMap((g) => g.itens.map((i) => i.path));
    expect(new Set(paths).size).toBe(paths.length);
    const ids = MENU_GRUPOS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filtrarMenu tira itens sem READ e grupos que ficam vazios", () => {
    const permitidos = new Set(["web.dashboard", "web.armazem.box"]);
    const menu = filtrarMenu((modulo, acao) => acao === "READ" && permitidos.has(modulo));
    expect(menu.map((g) => g.id)).toEqual(["torre", "armazem"]);
    expect(menu[1].itens.map((i) => i.path)).toEqual(["/armazem/box"]);
  });

  it("localizarItem devolve o grupo do item", () => {
    expect(localizarItem("/config/perfis")?.grupo.id).toBe("configuracoes");
    expect(localizarItem("/nao-existe")).toBeUndefined();
  });

  it("secoesDoGrupo mantém a ordem das seções", () => {
    const operacao = MENU_GRUPOS.find((g) => g.id === "operacao")!;
    expect(secoesDoGrupo(operacao).map((s) => s.titulo)).toEqual(["Entrada", "Saída", "Estoque"]);
  });
});
