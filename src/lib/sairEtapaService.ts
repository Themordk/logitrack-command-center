import { supabase } from "@/integrations/supabase/client";

/**
 * Fase 5.3 · "Sair da etapa" no coletor, para todas as atividades.
 * A regra (o que volta para a fila, produto em mãos, designação do gestor,
 * interrupção do tempo) mora só em rpc_coletor_sair_etapa; a tela mostra a
 * prévia que o banco devolve (p_simular) e envia a escolha do operador.
 */

export type ContextoSair = "ONDA" | "MOVIMENTO_ENTRADA" | "INVENTARIO" | "CARGA";
export type ModoSair = "NAO_INICIADAS" | "TODAS";
export type MotivoSair = "FIM_TURNO" | "OUTRA_ATIVIDADE" | "PROBLEMA_ENDERECO" | "PROBLEMA_PRODUTO" | "OUTRO";

export interface ParamsSair {
  tenantId: string;
  empresaId: string;
  usuarioId: string;
  contextoTipo: ContextoSair;
  contextoId: string;
  /** Código do tipo de tarefa (SEP, SEP-CONF, ENTR-CONF, ENTR-ARMZ...). Sem etapa = todas do contexto. */
  etapa?: string | null;
}

export interface ResumoSair {
  total: number;
  nao_iniciadas: number;
  em_execucao: number;
  com_progresso: number;
  produto_em_maos: number;
  devolve_nao_iniciadas?: number;
  devolve_todas?: number;
}

export interface ResultadoSair {
  sucesso: boolean;
  codigo: string;
  mensagem?: string;
  simulado?: boolean;
  pode_pedir_liberacao?: boolean;
  resumo?: ResumoSair;
  tarefas_devolvidas?: number;
  tarefas_mantidas?: number;
  produto_em_maos?: number;
}

export const MOTIVOS_SAIR: { valor: MotivoSair; rotulo: string }[] = [
  { valor: "FIM_TURNO", rotulo: "Fim de turno" },
  { valor: "OUTRA_ATIVIDADE", rotulo: "Chamado para outra atividade" },
  { valor: "PROBLEMA_ENDERECO", rotulo: "Problema no endereço" },
  { valor: "PROBLEMA_PRODUTO", rotulo: "Problema no produto" },
];

function lerJson<T>(data: unknown): T {
  if (typeof data === "string") return JSON.parse(data) as T;
  return data as T;
}

function args(p: ParamsSair) {
  return {
    p_tenant_id: p.tenantId,
    p_empresa_id: p.empresaId,
    p_usuario_id: p.usuarioId,
    p_movimento_saida_id: p.contextoTipo === "ONDA" ? p.contextoId : null,
    p_etapa: p.etapa ?? null,
    p_contexto_tipo: p.contextoTipo,
    p_contexto_id: p.contextoId,
  };
}

export async function simularSairEtapa(p: ParamsSair): Promise<ResultadoSair> {
  const { data, error } = await supabase.rpc("rpc_coletor_sair_etapa" as never, {
    ...args(p), p_modo: "TODAS", p_simular: true,
  } as never);
  if (error) throw error;
  return lerJson<ResultadoSair>(data);
}

export async function sairEtapa(p: ParamsSair, modo: ModoSair, motivo: MotivoSair | null): Promise<ResultadoSair> {
  const { data, error } = await supabase.rpc("rpc_coletor_sair_etapa" as never, {
    ...args(p), p_modo: modo, p_motivo: motivo, p_simular: false,
  } as never);
  if (error) throw error;
  return lerJson<ResultadoSair>(data);
}

export async function pedirLiberacao(p: ParamsSair, motivo: MotivoSair | null): Promise<ResultadoSair> {
  const { data, error } = await supabase.rpc("rpc_coletor_sair_etapa" as never, {
    ...args(p), p_modo: "TODAS", p_motivo: motivo, p_pedir_liberacao: true,
  } as never);
  if (error) throw error;
  return lerJson<ResultadoSair>(data);
}

/* ===== Helpers puros (apresentação) ===== */

export interface OpcaoSair {
  modo: ModoSair;
  rotulo: string;
  quantidade: number;
  detalhe: string;
  disponivel: boolean;
}

/** As duas opções da tela, com quantas tarefas cada uma devolve. */
export function opcoesSair(r: ResumoSair | undefined): OpcaoSair[] {
  if (!r) return [];
  const naoIni = r.devolve_nao_iniciadas ?? r.nao_iniciadas;
  const todas = r.devolve_todas ?? Math.max(r.total - r.produto_em_maos, 0);
  const iniciadas = todas - naoIni;
  return [
    {
      modo: "NAO_INICIADAS",
      rotulo: "Sair só das não iniciadas",
      quantidade: naoIni,
      detalhe: iniciadas > 0 ? `${iniciadas} já começada(s) continua(m) com você` : "Nenhuma começada",
      disponivel: naoIni > 0,
    },
    {
      modo: "TODAS",
      rotulo: "Sair de todas",
      quantidade: todas,
      detalhe: r.em_execucao > 0
        ? `${r.em_execucao} em execução será(ão) interrompida(s)`
        : r.com_progresso > 0 ? `${r.com_progresso} com progresso volta(m) parcial para a fila` : "Todas voltam para a fila",
      disponivel: todas > 0,
    },
  ];
}

/** Modo sugerido: o menos destrutivo que devolve alguma coisa. */
export function modoPadrao(r: ResumoSair | undefined): ModoSair {
  const [nao, todas] = opcoesSair(r);
  if (nao?.disponivel) return "NAO_INICIADAS";
  if (todas?.disponivel) return "TODAS";
  return "NAO_INICIADAS";
}

/**
 * Coletor · padrão de "Sair da etapa" nas listas (separação, conferência, recebimento,
 * armazenagem): sai direto, com um toque, quando não há escolha a fazer. Só pede a
 * folha de opções quando há tarefa em execução ou com progresso, produto em mãos ou
 * designação do gestor (aí é preciso pedir liberação).
 */
export function precisaEscolherAoSair(r: ResultadoSair): boolean {
  if (r.codigo === "ATRIBUICAO_DO_GESTOR") return true;
  const s = r.resumo;
  if (!s) return false;
  return s.em_execucao > 0 || s.com_progresso > 0 || s.produto_em_maos > 0;
}
