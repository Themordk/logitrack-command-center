/**
 * HU (handling unit) — fases H0/H1 do plano da HU.
 * Toda regra (permissão, código pela sequência, ciclo de vida Aberta → Fechada → …, motivo, eventos)
 * vive nas RPCs rpc_hu_* do banco. A tela não grava direto nas tabelas hu/hu_item (a API não permite mais).
 * Este serviço só chama e tipa o retorno.
 */
import { supabase } from "@/integrations/supabase/client";

export type StatusHU =
  | "ABERTA" | "FECHADA" | "EM_TRANSITO" | "ARMAZENADA" | "EXPEDIDA" | "DESCARTADA" | "DESMONTADA";

export interface EventoHU {
  id: string;
  evento: string;
  status_anterior: string | null;
  status_novo: string | null;
  usuario: string | null;
  observacao: string | null;
  dados: Record<string, unknown>;
  created_at: string;
}

export class HuRpcError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
    this.name = "HuRpcError";
  }
}

type Retorno = { sucesso?: boolean; codigo?: string; mensagem?: string } & Record<string, unknown>;

async function chamar<T extends Retorno>(fn: string, args: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs novas ainda fora de types.ts
  const { data, error } = await (supabase.rpc as any).call(supabase, fn, args);
  if (error) throw error;
  const r = (typeof data === "string" ? JSON.parse(data) : data) as T;
  if (!r?.sucesso) throw new HuRpcError(r?.codigo || "ERRO", r?.mensagem || "Não foi possível concluir a ação na HU.");
  return r;
}

const num = (v: unknown): number | null => (v === "" || v === null || v === undefined ? null : Number(v));

/** Status em que a HU já terminou o ciclo (não edita, não fecha, não reabre). */
export const STATUS_HU_ENCERRADOS: StatusHU[] = ["EXPEDIDA", "DESCARTADA", "DESMONTADA"];

export const huService = {
  gerar(p: { quantidade: number; tipo_hu: string; tamanho: string; empresa_id: string; armazem_id?: string | null;
             peso_bruto?: unknown; m3?: unknown; altura?: unknown }) {
    return chamar<Retorno & { hus: { hu_id: string; codigo_hu: string }[] }>("rpc_hu_gerar", {
      p_quantidade: p.quantidade, p_tipo_hu: p.tipo_hu, p_tamanho: p.tamanho, p_empresa_id: p.empresa_id,
      p_armazem_id: p.armazem_id || null, p_peso_bruto: num(p.peso_bruto), p_m3: num(p.m3), p_altura: num(p.altura),
    });
  },
  editar(huId: string, p: { tipo_hu: string; tamanho: string; peso_bruto?: unknown; m3?: unknown; altura?: unknown }) {
    return chamar("rpc_hu_editar", {
      p_hu_id: huId, p_tipo_hu: p.tipo_hu, p_tamanho: p.tamanho,
      p_peso_bruto: num(p.peso_bruto), p_m3: num(p.m3), p_altura: num(p.altura),
    });
  },
  fechar(huId: string) {
    return chamar("rpc_hu_fechar", { p_hu_id: huId });
  },
  reabrir(huId: string, motivo: string) {
    return chamar("rpc_hu_reabrir", { p_hu_id: huId, p_observacao: motivo.trim() });
  },
  descartar(huId: string, motivo: string) {
    return chamar("rpc_hu_descartar", { p_hu_id: huId, p_observacao: motivo.trim() });
  },
  async eventos(huId: string): Promise<EventoHU[]> {
    const r = await chamar<Retorno & { eventos: EventoHU[] }>("rpc_hu_eventos", { p_hu_id: huId });
    return r.eventos ?? [];
  },
};

/** Ações permitidas pelo status (a decisão final é sempre do banco; isto só esconde botões que dariam erro). */
export function acoesHU(status: string | null | undefined) {
  const s = (status || "ABERTA") as StatusHU;
  return {
    editar: !STATUS_HU_ENCERRADOS.includes(s),
    fechar: s === "ABERTA",
    reabrir: s === "FECHADA",
    descartar: s === "ABERTA",
  };
}
