/**
 * Regras de exibição da tela de Perfis de Acesso (sem acesso ao banco).
 * O que vale como permissão efetiva é decidido no banco (fn_usuario_permissoes);
 * aqui só se organiza a tela e se aplica a dependência Visualizar ↔ demais ações.
 */
import { MENU_GRUPOS, type MenuGrupo } from "@/lib/menuRegistry";
import type { Acao, ConfiguracaoPerfil, Modulo, Permissao } from "@/lib/perfisAcessoService";

export const ORDEM_ACOES: Acao[] = ["READ", "CREATE", "UPDATE", "DELETE", "EXECUTE"];

export const ROTULO_ACAO_WEB: Record<Acao, string> = {
  READ: "Visualizar",
  CREATE: "Criar",
  UPDATE: "Editar",
  DELETE: "Excluir",
  EXECUTE: "Executar",
};

export const ROTULO_ACAO_COLETOR: Record<Acao, string> = {
  READ: "Acessar",
  CREATE: "Registrar",
  UPDATE: "Editar",
  DELETE: "Excluir",
  EXECUTE: "Executar",
};

/** Ações que merecem atenção ao conceder: exclusões, cortes e remoções. */
export function ehAcaoSensivel(modulo: Pick<Modulo, "codigo">, acao: Acao): boolean {
  if (acao === "DELETE") return true;
  return acao === "EXECUTE" && /\.(cortar|remover-documento)$/.test(modulo.codigo);
}

export function ehColetor(modulo: Pick<Modulo, "ambiente">): boolean {
  return modulo.ambiente === "COLETOR";
}

export interface GrupoWeb {
  grupo: MenuGrupo;
  modulos: Modulo[];
}

/** Módulos web na ordem e nos grupos do TopNav. Sem menu_grupo vai para "Outros". */
export function agruparWeb(modulos: Modulo[]): GrupoWeb[] {
  const web = modulos.filter((m) => !ehColetor(m));
  const grupos: GrupoWeb[] = MENU_GRUPOS.map((grupo) => ({
    grupo,
    modulos: web.filter((m) => m.menu_grupo === grupo.id),
  }));
  const conhecidos = new Set(MENU_GRUPOS.map((g) => g.id));
  const outros = web.filter((m) => !m.menu_grupo || !conhecidos.has(m.menu_grupo));
  if (outros.length) {
    grupos.push({
      grupo: { id: "__outros", label: "Outros", labelCurto: "Outros", icon: MENU_GRUPOS[0].icon, itens: [] },
      modulos: outros,
    });
  }
  return grupos.filter((g) => g.modulos.length > 0);
}

export const FLUXOS_COLETOR = ["Entrada", "Saída", "Estoque", "Produtividade", "Outros"] as const;
export type FluxoColetor = (typeof FLUXOS_COLETOR)[number];

/** Fluxo operacional do módulo do coletor, na mesma divisão da home do coletor. */
export function fluxoColetor(codigo: string): FluxoColetor {
  const area = codigo.split(".")[1] ?? "";
  if (["recebimento", "conferencia", "armazenagem"].includes(area)) return "Entrada";
  if (["separacao", "embarque"].includes(area)) return "Saída";
  if (["movimentos", "inventario", "consulta"].includes(area)) return "Estoque";
  if (area === "lms") return "Produtividade";
  return "Outros";
}

export function agruparColetor(modulos: Modulo[]): { fluxo: FluxoColetor; modulos: Modulo[] }[] {
  const coletor = modulos.filter(ehColetor);
  return FLUXOS_COLETOR.map((fluxo) => ({
    fluxo,
    modulos: coletor.filter((m) => fluxoColetor(m.codigo) === fluxo),
  })).filter((g) => g.modulos.length > 0);
}

/** "LMS - Minhas metas (coletor)" → "LMS - Minhas metas": a aba já diz que é do coletor. */
export function rotuloModulo(modulo: Pick<Modulo, "descricao" | "ambiente">): string {
  return ehColetor(modulo) ? modulo.descricao.replace(/\s*\(coletor\)\s*$/i, "") : modulo.descricao;
}

export function permissoesDoModulo(permissoes: Permissao[], moduloId: string): Permissao[] {
  return permissoes
    .filter((p) => p.modulo_id === moduloId)
    .sort((a, b) => ORDEM_ACOES.indexOf(a.acao) - ORDEM_ACOES.indexOf(b.acao));
}

/**
 * Marca/desmarca uma permissão respeitando a dependência:
 * qualquer outra ação liga Visualizar; desligar Visualizar limpa o módulo.
 */
export function alternarPermissao(selecionadas: Set<string>, doModulo: Permissao[], perm: Permissao): Set<string> {
  const next = new Set(selecionadas);
  const ligar = !next.has(perm.id);
  const read = doModulo.find((p) => p.acao === "READ");
  if (ligar) {
    next.add(perm.id);
    if (read && perm.acao !== "READ") next.add(read.id);
  } else if (perm.acao === "READ") {
    for (const p of doModulo) next.delete(p.id);
  } else {
    next.delete(perm.id);
  }
  return next;
}

/** Liga/desliga um conjunto inteiro (grupo, coluna). */
export function definirPermissoes(selecionadas: Set<string>, ids: string[], ligar: boolean): Set<string> {
  const next = new Set(selecionadas);
  for (const id of ids) {
    if (ligar) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function menuVisivel(config: ConfiguracaoPerfil, grupoId: string): boolean {
  return config.menus[grupoId] !== false;
}

/** Quantas mudanças separam a configuração atual da gravada. */
export function contarAlteracoes(original: ConfiguracaoPerfil, atual: ConfiguracaoPerfil): number {
  let n = 0;
  for (const id of atual.permissoes) if (!original.permissoes.has(id)) n++;
  for (const id of original.permissoes) if (!atual.permissoes.has(id)) n++;
  const grupos = new Set([...Object.keys(original.menus), ...Object.keys(atual.menus)]);
  for (const g of grupos) if (menuVisivel(original, g) !== menuVisivel(atual, g)) n++;
  return n;
}
