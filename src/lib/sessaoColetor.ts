/**
 * Sessão do operador no coletor (LMS, Fase 3.1) — base do tempo disponível.
 * Abrir, manter (heartbeat) e encerrar passam pelo servidor:
 *  - abrir encerra as sessões anteriores do operador (uma ativa por vez);
 *  - o servidor encerra a sessão sem heartbeat há 15 min no último sinal;
 *  - heartbeat de sessão já encerrada abre outra e devolve o novo id.
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

export async function encerrarSessaoColetor(sessaoId: string | null): Promise<void> {
  if (!sessaoId) return;
  try {
    await supabase.rpc("rpc_sessao_encerrar" as any, { p_sessao_id: sessaoId } as any);
  } catch {
    /* o servidor encerra por falta de heartbeat */
  }
  localStorage.removeItem(CHAVE_SESSAO);
}
