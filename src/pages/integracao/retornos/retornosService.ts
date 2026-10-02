import { supabase } from "@/integrations/supabase/client";
import type {
  Catalogo, Combinador, Contexto, Definicao, Destino, DestinoEntrada, DispatcherBody,
  DispatcherExecutarResposta, DispatcherTestarResposta, DocumentoRecente, EntidadeDocumento,
  ExecucaoDetalhe, ExecucaoResumo, FiltrosExecucao, FluxoCompleto, FluxoEntrada, FluxoResumo,
  ListaExecucoes, MapaItem, MotorRetorno, Regra, ResultadoExecutar, RetornoConfig, Validacao, VersaoFluxo,
} from "./retornos.types";

// As RPCs ainda não estão nos tipos gerados do Supabase: único cast concentrado aqui.
const rpcRaw = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await rpcRaw(fn, args);
  if (error) throw error;
  return data as T;
}

// ---- Configuração e catálogo ----
export const obterCatalogo = () => rpc<Catalogo>("integracao_retorno_catalogo");
export const obterConfig = (tenantId: string, empresaId: string) =>
  rpc<RetornoConfig>("integracao_retorno_config", { p_tenant_id: tenantId, p_empresa_id: empresaId });
export const definirMotor = (tenantId: string, empresaId: string, motor: MotorRetorno) =>
  rpc<RetornoConfig>("integracao_retorno_definir_motor", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_motor: motor });
export const podeEditarRetorno = (tenantId: string, empresaId: string) =>
  rpc<boolean>("integracao_retorno_pode_editar", { p_tenant_id: tenantId, p_empresa_id: empresaId });

// ---- Destinos ----
export const listarDestinos = (tenantId: string, empresaId: string) =>
  rpc<Destino[]>("integracao_retorno_listar_destinos", { p_tenant_id: tenantId, p_empresa_id: empresaId });
export const salvarDestino = (
  tenantId: string, empresaId: string, destino: DestinoEntrada, segredo: string | null, removerSegredo = false,
) => rpc<{ id: string; tem_segredo: boolean }>("integracao_retorno_salvar_destino", {
  p_tenant_id: tenantId, p_empresa_id: empresaId, p_destino: destino,
  p_segredo: segredo || null, p_remover_segredo: removerSegredo,
});

// ---- De-para ----
export const listarMapa = (tenantId: string, empresaId: string, fluxoId: string | null) =>
  rpc<MapaItem[]>("integracao_retorno_listar_mapa", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_fluxo_id: fluxoId });
export const salvarMapa = (
  tenantId: string, empresaId: string, fluxoId: string | null, dominio: string,
  itens: { valor_wms: string; valor_erp: string }[],
) => rpc<MapaItem[]>("integracao_retorno_salvar_mapa", {
  p_tenant_id: tenantId, p_empresa_id: empresaId, p_fluxo_id: fluxoId, p_dominio: dominio, p_itens: itens,
});

// ---- Fluxos ----
export const listarFluxos = (tenantId: string, empresaId: string, incluirArquivados = false) =>
  rpc<FluxoResumo[]>("integracao_retorno_listar_fluxos", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_incluir_arquivados: incluirArquivados });
export const obterFluxo = (fluxoId: string) =>
  rpc<FluxoCompleto>("integracao_retorno_obter_fluxo", { p_fluxo_id: fluxoId });
export const salvarFluxo = (tenantId: string, empresaId: string, fluxo: FluxoEntrada) =>
  rpc<FluxoCompleto>("integracao_retorno_salvar_fluxo", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_fluxo: fluxo });
export const validarFluxo = (tenantId: string, empresaId: string, definicao: Definicao) =>
  rpc<Validacao>("integracao_retorno_validar_fluxo", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_definicao: definicao });
export const publicarFluxo = (fluxoId: string, ativar: boolean) =>
  rpc<FluxoCompleto & { validacao: Validacao }>("integracao_retorno_publicar_fluxo", { p_fluxo_id: fluxoId, p_ativar: ativar });
export const ativarFluxo = (fluxoId: string, ativo: boolean) =>
  rpc<FluxoResumo>("integracao_retorno_ativar_fluxo", { p_fluxo_id: fluxoId, p_ativo: ativo });
export const arquivarFluxo = (fluxoId: string, arquivar: boolean) =>
  rpc<FluxoResumo>("integracao_retorno_arquivar_fluxo", { p_fluxo_id: fluxoId, p_arquivar: arquivar });
export const versoesFluxo = (fluxoId: string) =>
  rpc<VersaoFluxo[]>("integracao_retorno_versoes_fluxo", { p_fluxo_id: fluxoId });
export const restaurarVersao = (fluxoId: string, versao: number) =>
  rpc<FluxoCompleto>("integracao_retorno_restaurar_versao", { p_fluxo_id: fluxoId, p_versao: versao });

// ---- Documentos ----
export const documentosRecentes = (params: {
  tenantId: string; empresaId: string; evento: string; filtros: Regra[]; combinador: Combinador;
  limite?: number; busca?: string | null;
}) => rpc<DocumentoRecente[]>("integracao_retorno_documentos_recentes", {
  p_tenant_id: params.tenantId, p_empresa_id: params.empresaId, p_evento: params.evento,
  p_filtros: params.filtros, p_combinador: params.combinador, p_limite: params.limite ?? 20,
  p_busca: params.busca || null,
});
export const contextoDocumento = (
  tenantId: string, empresaId: string, entidade: EntidadeDocumento, documentoId: string, evento: string | null,
) => rpc<Contexto>("integracao_retorno_contexto_documento", {
  p_tenant_id: tenantId, p_empresa_id: empresaId, p_entidade: entidade, p_documento_id: documentoId, p_evento: evento,
});

// ---- Execuções ----
export const listarExecucoes = (
  tenantId: string, empresaId: string, filtros: FiltrosExecucao, limite = 50, offset = 0,
) => rpc<ListaExecucoes>("integracao_retorno_listar_execucoes", {
  p_tenant_id: tenantId, p_empresa_id: empresaId, p_filtros: filtros, p_limite: Math.min(limite, 200), p_offset: offset,
});
export const obterExecucao = (execucaoId: string) =>
  rpc<ExecucaoDetalhe>("integracao_retorno_obter_execucao", { p_execucao_id: execucaoId });
export const execucoesDocumento = (tenantId: string, empresaId: string, entidade: EntidadeDocumento, documentoId: string) =>
  rpc<ExecucaoResumo[]>("integracao_retorno_execucoes_documento", {
    p_tenant_id: tenantId, p_empresa_id: empresaId, p_entidade: entidade, p_documento_id: documentoId,
  });
export const executar = (fluxoId: string, documentoId: string, modo: "manual" | "teste" | "simulacao", usarRascunho = false) =>
  rpc<ResultadoExecutar>("integracao_retorno_executar", {
    p_fluxo_id: fluxoId, p_documento_id: documentoId, p_modo: modo, p_usar_rascunho: usarRascunho,
  });
export const reprocessar = (execucaoId: string, aPartirNo: string | null = null) =>
  rpc<ExecucaoResumo>("integracao_retorno_reprocessar", { p_execucao_id: execucaoId, p_a_partir_no: aPartirNo });
export const descartar = (execucaoId: string, motivo: string) =>
  rpc<ExecucaoResumo>("integracao_retorno_descartar", { p_execucao_id: execucaoId, p_motivo: motivo });

// ---- Edge Function ----
export async function invokeDispatcher(body: { acao: "executar"; execucao_id: string }): Promise<DispatcherExecutarResposta>;
export async function invokeDispatcher(body: { acao: "testar_destino"; destino_id: string }): Promise<DispatcherTestarResposta>;
export async function invokeDispatcher(body: DispatcherBody): Promise<DispatcherExecutarResposta | DispatcherTestarResposta> {
  const { data, error } = await supabase.functions.invoke("retorno-dispatcher", { body });
  if (error) {
    let msg = error.message;
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const corpo = (await ctx.json()) as { erro?: unknown } | null;
        if (corpo && typeof corpo.erro === "string" && corpo.erro) msg = corpo.erro;
      } catch { /* corpo não é JSON */ }
    }
    throw new Error(msg);
  }
  return data as DispatcherExecutarResposta | DispatcherTestarResposta;
}
