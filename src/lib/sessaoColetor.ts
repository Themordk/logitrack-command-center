/**
 * Sessão do operador no coletor (LMS, Fase 3.1) — base do tempo disponível.
 * Abrir, manter (heartbeat) e encerrar passam pelo servidor:
 *  - abrir encerra as sessões anteriores do operador (uma ativa por vez);
 *  - o servidor encerra a sessão sem heartbeat há 15 min no último sinal;
 *  - heartbeat de sessão já encerrada abre outra e devolve o novo id;
 *  - sem sessão guardada neste navegador (outro endereço, dados limpos) ou com uma
 *    sessão que não existe mais no servidor, manterSessaoColetor abre uma nova
 *    (Fase 10.25: sem isso o tempo no coletor ficava sem sessão e a utilização em 100%).
 */
import { supabase } from "@/integrations/supabase/client";

export const CHAVE_SESSAO = "coletor_session_id";

interface RetornoSessao {
  sucesso?: boolean;
  codigo?: string;
  dados?: { sessao_id?: string };
}

export async function abrirSessaoColetor(tenantId: string, usuarioId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("rpc_sessao_abrir" as any, { p_tenant_id: tenantId, p_usuario_id: usuarioId } as any);
    if (error) return null;
    const id = (data as RetornoSessao | null)?.dados?.sessao_id ?? null;
    if (id) localStorage.setItem(CHAVE_SESSAO, id);
    return id;
  } catch {
    return null;
  }
}

/** Mantém a sessão viva; devolve o id em uso (pode ser novo se o servidor tiver encerrado a anterior). */
export async function heartbeatSessaoColetor(sessaoId: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("rpc_sessao_heartbeat" as any, { p_sessao_id: sessaoId } as any);
    if (error) return sessaoId;
    const novo = (data as RetornoSessao | null)?.dados?.sessao_id;
    if (novo && novo !== sessaoId) {
      localStorage.setItem(CHAVE_SESSAO, novo);
      return novo;
    }
  } catch {
    /* sem rede: tenta no próximo ciclo */
  }
  return sessaoId;
}

/**
 * Garante uma sessão viva para o operador logado: heartbeat na sessão guardada ou,
 * se não houver uma válida, abre outra. Devolve o id em uso (null sem rede ou sem login).
 */
export async function manterSessaoColetor(
  sessaoId: string | null, tenantId: string | null, usuarioId: string | null,
): Promise<string | null> {
  if (!tenantId || !usuarioId) return sessaoId;
  if (!sessaoId) return abrirSessaoColetor(tenantId, usuarioId);
  try {
    const { data, error } = await supabase.rpc("rpc_sessao_heartbeat" as any, { p_sessao_id: sessaoId } as any);
    if (error) return sessaoId;
    const r = data as RetornoSessao | null;
    if (r?.codigo === "SESSAO_INEXISTENTE") return abrirSessaoColetor(tenantId, usuarioId);
    const novo = r?.dados?.sessao_id;
    if (novo && novo !== sessaoId) {
      localStorage.setItem(CHAVE_SESSAO, novo);
      return novo;
    }
  } catch {
    /* sem rede: tenta no próximo ciclo */
  }
  return sessaoId;
}

export async function encerrarSessaoColetor(sessaoId: string | null): Promise<void> {
  if (!sessaoId) return;
  try {
    await supabase.rpc("rpc_sessao_encerrar" as any, { p_sessao_id: sessaoId } as any);
  } catch {
    /* o servidor encerra por falta de heartbeat */
  }
  localStorage.removeItem(CHAVE_SESSAO);
}
