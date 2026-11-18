/**
 * Marcação de início de tarefa (LMS) — Fase 2.
 *
 * O início real é gravado no servidor (rpc_tarefa_iniciar / rpc_contexto_iniciar), que é
 * idempotente: vale o primeiro bipe. As chamadas nunca bloqueiam o operador — não são
 * aguardadas pelas telas, e sem rede vão para a fila offline com o horário do bipe
 * (p_ocorrido_em), que o servidor aceita como DISPOSITIVO dentro da janela de 12 h.
 */
import { supabase } from "@/integrations/supabase/client";
import { enqueueAction } from "@/lib/offlineStore";
import { isNetworkError } from "@/hooks/useOfflineSync";

export type GatilhoInicio =
  | "ABERTURA_TAREFA"
  | "BIPE_ENDERECO"
  | "BIPE_PRODUTO"
  | "BIPE_ORIGEM"
  | "BIPE_HU"
  | "ABERTURA_ENTREGA";

export type ContextoInicio = "TRANSFERENCIA" | "MUDANCA_PICKING" | "CONTAGEM_LIVRE" | "EMBARQUE";

/** Evita repetir a mesma chamada a cada render; o servidor já é idempotente. */
const JANELA_REPETICAO_MS = 60_000;
const recentes = new Map<string, number>();

function jaEnviado(chave: string): boolean {
  const agora = Date.now();
  const antes = recentes.get(chave);
  if (antes && agora - antes < JANELA_REPETICAO_MS) return true;
  recentes.set(chave, agora);
  return false;
}

/** Usado nos testes para começar do zero. */
export function limparInicioRecentes(): void {
  recentes.clear();
}

function sessao() {
  return {
    tenantId: localStorage.getItem("core_tenant_id"),
    usuarioId: localStorage.getItem("core_usuario_id"),
  };
}

async function enviar(rpc: string, params: Record<string, unknown>): Promise<void> {
  const { tenantId, usuarioId } = sessao();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  try {
    if (offline) throw new TypeError("offline");
    const { error } = await supabase.rpc(rpc as any, params as any);
    if (error && isNetworkError(error)) throw error;
    // recusa de regra (tarefa encerrada, outro dono) não interrompe o operador:
    // a confirmação devolve o erro de negócio, como hoje.
  } catch (err) {
    if (offline || isNetworkError(err)) {
      try {
        await enqueueAction(rpc, params, { tenantId, usuarioId });
      } catch {
        /* IndexedDB indisponível: o início vira estimado no servidor (CICLO/ATRIBUICAO) */
      }
    }
  }
}

/** Marca o início de uma ou mais tarefas (mesmo início para todas, ex.: HU mista). */
export async function iniciarTarefas(
  tarefaIds: Array<string | null | undefined>,
  gatilho: GatilhoInicio,
  usuarioId?: string | null,
): Promise<void> {
  const ids = [...new Set(tarefaIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  if (jaEnviado(`t:${ids.slice().sort().join(",")}`)) return;
  await enviar("rpc_tarefa_iniciar", {
    p_tarefa_ids: ids,
    p_usuario_id: usuarioId || sessao().usuarioId || null,
    p_gatilho: gatilho,
    p_ocorrido_em: new Date().toISOString(),
  });
}

/** Pré-início dos fluxos em que a tarefa só nasce na confirmação (transferência, embarque…). */
export async function iniciarContexto(
  contexto: ContextoInicio,
  chave: string | null | undefined,
  usuarioId?: string | null,
): Promise<void> {
  const { tenantId } = sessao();
  if (!chave || !tenantId) return;
  if (jaEnviado(`c:${contexto}:${chave}`)) return;
  await enviar("rpc_contexto_iniciar", {
    p_tenant_id: tenantId,
    p_contexto_tipo: contexto,
    p_contexto_chave: chave,
    p_usuario_id: usuarioId || sessao().usuarioId || null,
    p_ocorrido_em: new Date().toISOString(),
  });
}

/** Armazenagem por HU: o servidor resolve as tarefas da HU (HU mista = mesmo início para todas). */
export async function iniciarHU(huId: string | null | undefined): Promise<void> {
  if (!huId) return;
  if (jaEnviado(`h:${huId}`)) return;
  await enviar("rpc_tarefa_iniciar_hu", { p_hu_id: huId, p_ocorrido_em: new Date().toISOString() });
}

/** Compatibilidade com as telas existentes. */
export async function markTarefaIniciadaByTarefa(
  tarefaId: string | null | undefined,
  usuarioId: string | null | undefined,
  gatilho: GatilhoInicio = "BIPE_PRODUTO",
): Promise<void> {
  await iniciarTarefas([tarefaId], gatilho, usuarioId);
}

/** @deprecated a execução só nasce na confirmação; use iniciarTarefas. */
export async function markTarefaIniciada(_tarefaExecucaoId: string | null | undefined): Promise<void> {
  // sem efeito
}
