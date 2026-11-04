import { supabase } from "@/integrations/supabase/client";

// ============= Tipos do contrato (backend pronto) =============

export interface PreviewItem {
  estoque_id: string;
  produto_id: string;
  sku: string;
  descricao: string;
  fator_caixa: number | null;
  lote: string | null;
  data_validade: string | null;
  data_fabricacao: string | null;
  quantidade_disponivel: number;
  quantidade_bloqueada: number;
  quantidade_total: number;
}

export interface MapeamentoOrigem {
  picking_produto_id: string;
  tipo_picking: "MASTER" | "FRACIONADO" | "PDV";
  est_minimo: number;
  est_maximo: number;
}

export interface OutroPicking {
  picking_produto_id: string;
  endereco_id: string;
  endereco_descricao: string;
  tipo_picking: string;
  est_minimo: number;
  est_maximo: number;
}

export type SituacaoProduto =
  | "MAPEADO_ORIGEM"
  | "DECIDIR_MIGRAR_OU_MANTER"
  | "DECIDIR_CRIAR_OU_MANTER"
  | "SEM_MAPEAMENTO_NAO_PERMITIDO";

export type AcaoPermitida = "MIGRAR_PICKING_EXISTENTE" | "CRIAR_PICKING" | "SOMENTE_ESTOQUE";

export interface PreviewProduto {
  produto_id: string;
  sku: string;
  descricao: string;
  varios_pickings: boolean;
  saldo_total: number;
  mapeamentos_origem: MapeamentoOrigem[];
  outros_pickings: OutroPicking[];
  situacao: SituacaoProduto;
  requer_decisao: boolean;
  acoes_permitidas: AcaoPermitida[];
}

export interface Pendencia {
  tarefa_id: string;
  tipo_tarefa: string;
  status: string;
  endereco: string;
}

export interface PreviewResponse {
  sucesso: true;
  origem: { id: string; descricao: string; armazem_id: string };
  itens: PreviewItem[];
  produtos: PreviewProduto[];
  pendencias: Pendencia[];
  bloqueios: string[];
  motivos_bloqueio?: MotivoBloqueio[];
  skus_sem_mapeamento?: string[];
  acao_sugerida?: "TRANSFERENCIA" | null;
  pode_prosseguir: boolean;
  totais: {
    qtd_itens: number;
    qtd_produtos: number;
    qtd_total: number;
    qtd_bloqueada: number;
    qtd_mapeamentos: number;
  };
}

export interface ErroNegocio {
  sucesso: false;
  codigo: string;
  mensagem: string;
  erros?: string[];
  pendencias?: Array<{ tipo_tarefa: string; status: string; endereco: string }>;
  skus_sem_mapeamento?: string[];
  acao_sugerida?: "TRANSFERENCIA" | null;
}

export interface MotivoBloqueio {
  codigo: "SKUS_SEM_MAPEAMENTO" | "PENDENCIAS_ABERTAS" | "OUTRO";
  mensagem: string;
  quantidade: number;
  skus?: string[];
}

export function montarMotivosBloqueio(
  preview: Pick<PreviewResponse, "motivos_bloqueio" | "bloqueios">,
): MotivoBloqueio[] {
  return preview.motivos_bloqueio ?? preview.bloqueios.map((mensagem) => ({
    codigo: "OUTRO",
    mensagem,
    quantidade: 1,
  }));
}

export type Decisao =
  | { produto_id: string; acao: "SOMENTE_ESTOQUE" }
  | { produto_id: string; acao: "MIGRAR_PICKING_EXISTENTE"; picking_produto_id: string }
  | { produto_id: string; acao: "CRIAR_PICKING"; tipo_picking: "MASTER" | "FRACIONADO" | "PDV"; est_minimo: number; est_maximo: number };

export interface MapeamentoResultado {
  sku: string;
  acao: "MOVER_MAPEAMENTO_ORIGEM" | "MIGRAR_PICKING_EXISTENTE" | "CRIAR_PICKING";
  tipo_picking: string;
  endereco_anterior: string | null;
  endereco_novo: string;
}

export interface ExecutarSucesso {
  sucesso: true;
  codigo: "MUDANCA_CONCLUIDA";
  mensagem: string;
  resumo: {
    origem: string;
    destino: string;
    itens_movidos: number;
    quantidade_total: number;
    quantidade_bloqueada: number;
    mapeamentos_transferidos: number;
    mapeamentos_criados: number;
    produtos_somente_estoque: number;
  };
  mapeamentos: MapeamentoResultado[];
}

export type ExecutarErro = ErroNegocio;

// ============= Chaves do sessionStorage =============

export const MUDPICK_KEYS = {
  origemId: "mudpick_origem_id",
  origemDesc: "mudpick_origem_desc",
  preview: "mudpick_preview",
  decisoes: "mudpick_decisoes",
  resultado: "mudpick_resultado",
} as const;

export function limparSessaoMudanca(): void {
  Object.values(MUDPICK_KEYS).forEach((k) => sessionStorage.removeItem(k));
}

export function lerPreview(): PreviewResponse | null {
  try {
    const raw = sessionStorage.getItem(MUDPICK_KEYS.preview);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.sucesso !== true || !parsed.origem) return null;
    return parsed as PreviewResponse;
  } catch {
    return null;
  }
}

export function lerDecisoes(): Record<string, Decisao> {
  try {
    const raw = sessionStorage.getItem(MUDPICK_KEYS.decisoes);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Decisao>) : {};
  } catch {
    return {};
  }
}

export function salvarDecisoes(decisoes: Record<string, Decisao>): void {
  sessionStorage.setItem(MUDPICK_KEYS.decisoes, JSON.stringify(decisoes));
}

export function lerResultado(): ExecutarSucesso | null {
  try {
    const raw = sessionStorage.getItem(MUDPICK_KEYS.resultado);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.sucesso !== true) return null;
    return parsed as ExecutarSucesso;
  } catch {
    return null;
  }
}

// ============= Consultas =============

export async function buscarEnderecoPorCodigo(
  tenantId: string,
  code: string,
): Promise<{ id: string; descricao: string } | null> {
  const { data, error } = await (supabase as any)
    .from("endereco")
    .select("id, descricao")
    .eq("tenant_id", tenantId)
    .or(`descricao.eq.${code},codigo_endereco.eq.${code}`)
    .limit(1);
  if (error) throw error;
  return data && data.length > 0 ? { id: data[0].id, descricao: data[0].descricao } : null;
}

export async function previewMudanca(
  tenantId: string,
  origemId: string,
): Promise<PreviewResponse | ErroNegocio> {
  const { data, error } = await (supabase as any).rpc("rpc_mudanca_picking_preview", {
    p_tenant_id: tenantId,
    p_origem_id: origemId,
  });
  if (error) throw error;
  return data as PreviewResponse | ErroNegocio;
}

export interface ExecutarMudancaParams {
  tenantId: string;
  origemId: string;
  destinoId: string;
  usuarioId: string;
  decisoes: Decisao[];
}

export type ResultadoExecucao =
  | { tipo: "sucesso"; dados: ExecutarSucesso }
  | { tipo: "negocio"; erro: ErroNegocio }
  | { tipo: "tecnico"; mensagemJson: { codigo: string; mensagem: string } | null; erroOriginal: unknown };

export async function executarMudanca(params: ExecutarMudancaParams): Promise<ResultadoExecucao> {
  const { data, error } = await (supabase as any).rpc("rpc_mudanca_picking_executar", {
    p_tenant_id: params.tenantId,
    p_origem_id: params.origemId,
    p_destino_id: params.destinoId,
    p_usuario_id: params.usuarioId,
    p_decisoes: params.decisoes,
  });

  if (error) {
    // error.message pode ser um JSON {"codigo":"...","mensagem":"..."}
    let mensagemJson: { codigo: string; mensagem: string } | null = null;
    try {
      const parsed = JSON.parse(String(error.message || ""));
      if (parsed && typeof parsed.mensagem === "string") {
        mensagemJson = { codigo: String(parsed.codigo || ""), mensagem: parsed.mensagem };
      }
    } catch {
      mensagemJson = null;
    }
    return { tipo: "tecnico", mensagemJson, erroOriginal: error };
  }

  if (data && data.sucesso === true) {
    return { tipo: "sucesso", dados: data as ExecutarSucesso };
  }
  return { tipo: "negocio", erro: data as ErroNegocio };
}
