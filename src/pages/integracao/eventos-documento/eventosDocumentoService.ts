import { supabase } from "@/integrations/supabase/client";
import type {
  DetalheEventoResposta, DirecaoEvento, EntidadeDocumentoEvento, EventosDocumentoResposta, FonteEvento, OrdemEventos,
} from "./eventosDocumento.types";

// As RPCs ainda não estão nos tipos gerados do Supabase: único cast concentrado aqui.
const rpcRaw = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await rpcRaw(fn, args);
  if (error) throw error;
  return data as T;
}

export interface ListarEventosParams {
  tenantId: string;
  empresaId: string;
  entidade: EntidadeDocumentoEvento;
  documentoId: string;
  direcao?: DirecaoEvento | null;
  somenteProblemas?: boolean;
  ordem?: OrdemEventos;
  limite?: number;
  offset?: number;
}

export const listarEventosDocumento = (p: ListarEventosParams) =>
  rpc<EventosDocumentoResposta>("integracao_documento_eventos", {
    p_tenant_id: p.tenantId,
    p_empresa_id: p.empresaId,
    p_entidade: p.entidade,
    p_documento_id: p.documentoId,
    p_direcao: p.direcao ?? null,
    p_somente_problemas: p.somenteProblemas ?? false,
    p_ordem: p.ordem ?? "asc",
    p_limite: p.limite ?? 100,
    p_offset: p.offset ?? 0,
  });

export interface DetalheEventoParams {
  tenantId: string;
  empresaId: string;
  entidade: EntidadeDocumentoEvento;
  documentoId: string;
  fonte: Exclude<FonteEvento, "documento">;
  id: string;
}

export const obterDetalheEventoDocumento = (p: DetalheEventoParams) =>
  rpc<DetalheEventoResposta>("integracao_documento_evento_detalhe", {
    p_tenant_id: p.tenantId,
    p_empresa_id: p.empresaId,
    p_entidade: p.entidade,
    p_documento_id: p.documentoId,
    p_fonte: p.fonte,
    p_id: p.id,
  });
