/**
 * Módulo LMS · ponto único de acesso no frontend (Fase 6).
 *
 * Hoje a regra é só o RBAC (módulo ativo no tenant + permissão do perfil).
 * Quando o licenciamento vier, ele entra aqui e em fn_lms_acesso no banco,
 * sem mudar telas nem RPCs. O banco é quem trava de verdade: estas checagens
 * só escondem menu, abas e botões.
 */
import { useCallback, useMemo } from "react";
import { usePermissions } from "@/contexts/PermissionsContext";

export type LmsArea = "configuracao" | "metas" | "acompanhamento" | "coletor" | "atividades";
type AreaColetor = "coletor" | "atividades";
export type LmsAcao = "READ" | "CREATE" | "UPDATE" | "DELETE" | "EXECUTE";

export const LMS_MODULOS: Record<LmsArea, string> = {
  configuracao: "web.lms.configuracao",
  metas: "web.lms.metas",
  acompanhamento: "web.lms.acompanhamento",
  coletor: "coletor.lms.metas",
  /** Fase 8: apontar atividade indireta / parada no coletor */
  atividades: "coletor.lms.atividades",
};

/** Rotas web do módulo, na ordem das abas. */
export const LMS_ROTAS: Array<{ area: Exclude<LmsArea, AreaColetor>; path: string; label: string }> = [
  { area: "acompanhamento", path: "/lms/acompanhamento", label: "Acompanhamento" },
  { area: "metas", path: "/lms/metas", label: "Metas" },
  { area: "configuracao", path: "/lms/configuracao", label: "Configurações" },
];

export function areaDaRota(path: string): Exclude<LmsArea, AreaColetor> | null {
  return LMS_ROTAS.find((r) => path === r.path || path.startsWith(`${r.path}/`))?.area ?? null;
}

/** Códigos de erro que o banco devolve quando o perfil não tem o módulo. */
export const LMS_ERROS_ACESSO = ["SEM_PERMISSAO_MODULO", "SOMENTE_PROPRIOS_DADOS"] as const;

export function ehErroAcessoLms(codigo: unknown): boolean {
  return typeof codigo === "string" && (LMS_ERROS_ACESSO as readonly string[]).includes(codigo);
}

type Can = (modulo: string, acao: string) => boolean;

/** Regra pura (testável sem React). */
export function criarAcessoLms(can: Can) {
  const pode = (area: LmsArea, acao: LmsAcao = "READ") => can(LMS_MODULOS[area], acao);
  const rotasVisiveis = LMS_ROTAS.filter((r) => pode(r.area, "READ"));
  return {
    pode,
    rotasVisiveis,
    /** Algum acesso web ao módulo (mostra o menu "Produtividade (LMS)"). */
    temModuloWeb: rotasVisiveis.length > 0,
    /** Primeira aba que o usuário pode abrir. */
    rotaInicial: rotasVisiveis[0]?.path ?? null,
  };
}

export function useLmsAcesso() {
  const { can, loading } = usePermissions();
  const canEstavel = useCallback((m: string, a: string) => can(m, a), [can]);
  const acesso = useMemo(() => criarAcessoLms(canEstavel), [canEstavel]);
  return { ...acesso, carregando: loading };
}
