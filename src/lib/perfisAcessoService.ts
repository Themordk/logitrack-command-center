/**
 * Perfis de Acesso: leitura e gravação.
 *
 * Gravação só por RPC (rpc_perfil_salvar / rpc_perfil_excluir): permissões e menus
 * ocultos numa transação, com validação de tenant, perfil de sistema/acesso total
 * e autobloqueio no banco. A tela não apaga/insere perfil_permissao direto.
 */
import { supabase } from "@/integrations/supabase/client";

// perfil.acesso_total, modulo.menu_grupo, perfil_menu_config e rpc_perfil_* vieram da
// migration 20261122160903 e ainda não estão em integrations/supabase/types.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- remover ao regenerar types.ts
const db = supabase as any;

export type Ambiente = "WEB" | "COLETOR" | "AMBOS";
export type Acao = "READ" | "CREATE" | "UPDATE" | "DELETE" | "EXECUTE";

export interface Perfil {
  id: string;
  nome: string;
  descricao: string | null;
  sistema: boolean;
  acesso_total: boolean;
  ativo: boolean;
}

export interface Modulo {
  id: string;
  codigo: string;
  descricao: string;
  ambiente: Ambiente;
  menu_grupo: string | null;
}

export interface Permissao {
  id: string;
  modulo_id: string;
  acao: Acao;
}

export interface CatalogoPerfis {
  perfis: Perfil[];
  modulos: Modulo[];
  permissoes: Permissao[];
  /** perfil_id → quantidade de usuários. */
  usuariosPorPerfil: Record<string, number>;
}

export interface ConfiguracaoPerfil {
  permissoes: Set<string>;
  /** menu_grupo → visível. Grupo ausente = visível. */
  menus: Record<string, boolean>;
}

function falhar(error: unknown): never {
  throw error;
}

export async function carregarCatalogo(tenantId: string): Promise<CatalogoPerfis> {
  const [perfisRes, modulosRes, vinculosRes] = await Promise.all([
    db.from("perfil").select("id, nome, descricao, sistema, acesso_total, ativo").eq("tenant_id", tenantId).order("nome"),
    db.from("modulo").select("id, codigo, descricao, ambiente, menu_grupo").eq("tenant_id", tenantId).eq("ativo", true).order("codigo"),
    db.from("usuario_perfil").select("perfil_id").eq("tenant_id", tenantId),
  ]);
  if (perfisRes.error) falhar(perfisRes.error);
  if (modulosRes.error) falhar(modulosRes.error);
  if (vinculosRes.error) falhar(vinculosRes.error);

  const modulos = (modulosRes.data ?? []) as Modulo[];
  const ids = modulos.map((m) => m.id);
  const permRes = ids.length
    ? await db.from("permissao").select("id, modulo_id, acao").in("modulo_id", ids)
    : { data: [], error: null };
  if (permRes.error) falhar(permRes.error);

  const usuariosPorPerfil: Record<string, number> = {};
  for (const v of (vinculosRes.data ?? []) as { perfil_id: string }[]) {
    usuariosPorPerfil[v.perfil_id] = (usuariosPorPerfil[v.perfil_id] ?? 0) + 1;
  }

  return {
    perfis: (perfisRes.data ?? []) as Perfil[],
    modulos,
    permissoes: (permRes.data ?? []) as Permissao[],
    usuariosPorPerfil,
  };
}

export async function carregarConfiguracao(tenantId: string, perfilId: string): Promise<ConfiguracaoPerfil> {
  const [ppRes, menuRes] = await Promise.all([
    db.from("perfil_permissao").select("permissao_id").eq("tenant_id", tenantId).eq("perfil_id", perfilId),
    db.from("perfil_menu_config").select("menu_grupo, visivel").eq("tenant_id", tenantId).eq("perfil_id", perfilId),
  ]);
  if (ppRes.error) falhar(ppRes.error);
  if (menuRes.error) falhar(menuRes.error);

  const menus: Record<string, boolean> = {};
  for (const m of (menuRes.data ?? []) as { menu_grupo: string; visivel: boolean }[]) menus[m.menu_grupo] = m.visivel;
  return {
    permissoes: new Set(((ppRes.data ?? []) as { permissao_id: string }[]).map((r) => r.permissao_id)),
    menus,
  };
}

export async function salvarPerfil(params: {
  perfilId: string;
  nome: string;
  descricao: string | null;
  config: ConfiguracaoPerfil;
}): Promise<void> {
  const { error } = await db.rpc("rpc_perfil_salvar", {
    p_perfil_id: params.perfilId,
    p_nome: params.nome,
    p_descricao: params.descricao,
    p_permissoes: Array.from(params.config.permissoes),
    p_menus: Object.entries(params.config.menus).map(([menu_grupo, visivel]) => ({ menu_grupo, visivel })),
  });
  if (error) falhar(error);
}

export async function criarPerfil(tenantId: string, nome: string, descricao: string | null): Promise<string> {
  const { data, error } = await db
    .from("perfil")
    .insert({ tenant_id: tenantId, nome: nome.trim(), descricao: descricao?.trim() || null })
    .select("id")
    .single();
  if (error) falhar(error);
  return (data as { id: string }).id;
}

export async function excluirPerfil(perfilId: string): Promise<void> {
  const { error } = await db.rpc("rpc_perfil_excluir", { p_perfil_id: perfilId });
  if (error) falhar(error);
}
