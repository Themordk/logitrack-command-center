/**
 * Fase 8 · Coletor › Atividade indireta / parada.
 * Quem é o operador, o que está aberto e o fechamento automático são decididos
 * no banco (rpc_coletor_indireto_*); a tela só exibe e envia.
 */
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type TipoAtividadeColetor = "INDIRETA" | "EXCECAO";

export interface AtividadeColetor { id: string; codigo: string; nome: string; tipo: TipoAtividadeColetor; duracao_max_min: number }

export interface ApontamentoAberto {
  id: string;
  atividade_id: string;
  codigo: string;
  nome: string;
  tipo: TipoAtividadeColetor;
  inicio: string;
  duracao_max_min: number;
  encerra_automaticamente_em: string;
  segundos: number;
}

export interface EstadoIndireto {
  sucesso: true;
  aberto: ApontamentoAberto | null;
  atividades: AtividadeColetor[];
  hoje: { indireta_seg: number; excecao_seg: number; apontamentos: number };
}

export class IndiretoErro extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem); }
}

function exigir<T>(data: unknown, error: { message: string } | null): T {
  if (error) throw new IndiretoErro("ERRO_RPC", error.message);
  const r = data as { sucesso?: boolean; codigo?: string; mensagem?: string } | null;
  if (!r || r.sucesso === false) throw new IndiretoErro(r?.codigo ?? "ERRO", r?.mensagem ?? "Não foi possível concluir.");
  return data as T;
}

export async function obterEstadoIndireto(tenantId: string): Promise<EstadoIndireto> {
  const { data, error } = await sb.rpc("rpc_coletor_indireto_estado", { p_tenant_id: tenantId });
  return exigir<EstadoIndireto>(data, error);
}

export async function iniciarIndireto(tenantId: string, atividadeId: string, armazemId: string | null): Promise<{ mensagem: string; encerrou_anterior: string | null }> {
  const { data, error } = await sb.rpc("rpc_coletor_indireto_iniciar", {
    p_tenant_id: tenantId, p_atividade_id: atividadeId, p_armazem_id: armazemId, p_observacao: null,
  });
  return exigir<{ mensagem: string; encerrou_anterior: string | null }>(data, error);
}

export async function encerrarIndireto(tenantId: string): Promise<{ encerrado: boolean; segundos?: number; mensagem: string }> {
  const { data, error } = await sb.rpc("rpc_coletor_indireto_encerrar", { p_tenant_id: tenantId });
  return exigir<{ encerrado: boolean; segundos?: number; mensagem: string }>(data, error);
}

/** "12 min", "1 h 05 min" — para o cronômetro do coletor. */
export function formatarDecorrido(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

/** Segundos desde o início, pelo relógio do aparelho a partir do valor do servidor. */
export function segundosDesde(aberto: Pick<ApontamentoAberto, "segundos">, recebidoEm: number, agora: number): number {
  return aberto.segundos + Math.max(0, (agora - recebidoEm) / 1000);
}
