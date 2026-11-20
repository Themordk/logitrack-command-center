/**
 * Fase 10 · Score global do operador (decisão 7).
 * A conta (média ponderada do atingimento das metas oficiais, teto por meta,
 * metas sem amostra/estimadas fora) e a classificação vêm só do banco
 * (fn_lms_score_base / rpc_lms_score_operador). Aqui ficam tipos, chamada e textos.
 */
import { supabase } from "@/integrations/supabase/client";
import { estiloFaixa, type FaixaLms } from "@/modules/lms/faixas";
import { formatarValorMeta, type FaixaMeta, type Metrica, type Periodicidade, type UnidadeMetrica } from "@/modules/lms/metas/metas.service";

const sb = supabase as any;

export type SituacaoScore = "OK" | "SEM_DADOS" | "SEM_METAS";

export interface ClassificacaoScore {
  codigo: string;
  nome: string;
  cor: string;
  ordem?: number;
  eh_meta?: boolean;
}

export interface UltimoPeriodoMeta {
  periodo_ref: string;
  periodo_ini: string;
  periodo_fim: string;
  realizado: number | null;
  alvo: number | null;
  minimo: number | null;
  excelencia: number | null;
  atingimento_pct: number | null;
  faixa: FaixaMeta;
  parcial: boolean;
  semana_rampa: number | null;
}

export interface MetricaScore {
  meta_id: string;
  nome: string;
  metrica: Metrica;
  rotulo_metrica: string | null;
  unidade: UnidadeMetrica | null;
  direcao: "MAIOR" | "MENOR" | null;
  atividade: string;
  tipo_codigo: string | null;
  categoria: string | null;
  periodicidade: Periodicidade;
  peso: number;
  teto: number;
  periodos: number;
  periodos_contados: number;
  conta: boolean;
  atingimento_pct: number | null;
  atingimento_bruto_pct: number | null;
  limitado: boolean | null;
  faixa: FaixaMeta;
  motivo: string | null;
  ultimo: UltimoPeriodoMeta;
}

export interface PontoScore {
  data: string;
  score: number | null;
  situacao: SituacaoScore;
  metas_contadas: number;
  classificacao: string;
  cor: string;
}

export interface FichaScore {
  score: number | null;
  situacao: SituacaoScore;
  classificacao: ClassificacaoScore;
  score_esperado: number | null;
  teto_pct: number;
  metas_total: number;
  metas_contadas: number;
  peso_total: number;
  metricas: MetricaScore[];
  evolucao: PontoScore[];
  faixas_lista: FaixaLms[];
  periodo: { inicio: string; fim: string };
}

export interface ScoreOperador extends FichaScore {
  usuario_id: string;
  nome: string;
}

export async function obterScoreOperador(tenantId: string, usuarioId: string, dataIni: string, dataFim: string): Promise<ScoreOperador> {
  const { data, error } = await sb.rpc("rpc_lms_score_operador", {
    p_tenant_id: tenantId, p_usuario_id: usuarioId, p_data_ini: dataIni, p_data_fim: dataFim,
  });
  if (error) throw new Error(error.message);
  if (!data?.sucesso) throw new Error(data?.mensagem || "Não foi possível calcular o score.");
  return data as ScoreOperador;
}

export function formatarScore(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Texto curto para quem não tem score. */
export function textoSemScore(situacao: SituacaoScore | string | null | undefined): string {
  if (situacao === "SEM_DADOS") return "Sem dados";
  return "Sem metas";
}

export function explicacaoSemScore(situacao: SituacaoScore | string | null | undefined): string {
  if (situacao === "SEM_DADOS") {
    return "Há metas para este operador, mas nenhuma teve amostra suficiente ou resultado real no período.";
  }
  return "Nenhuma meta ativa vale para este operador no período. Cadastre metas em LMS › Metas.";
}

/** Estilo (cores Tailwind) da classificação vinda do banco. SEM_METAS e SEM_DADOS ficam em cinza. */
export function estiloClassificacao(c: Pick<ClassificacaoScore, "codigo" | "cor" | "nome"> | null | undefined) {
  if (!c || c.codigo === "SEM_METAS" || c.codigo === "SEM_DADOS") {
    return { ...estiloFaixa("SEM_DADOS", "cinza", c?.nome ?? "Sem metas"), nome: c?.nome ?? "Sem metas" };
  }
  return estiloFaixa(c.codigo, c.cor, c.nome);
}

/** Quanto cada meta contribui para o score (fração do peso contado). */
export function participacaoPeso(m: Pick<MetricaScore, "conta" | "peso">, pesoTotal: number): number | null {
  if (!m.conta || !pesoTotal) return null;
  return Math.round((Number(m.peso) / pesoTotal) * 100);
}

export function descreverRegraScore(teto: number): string {
  return `Média ponderada pelo peso do atingimento de cada meta; cada meta conta no máximo ${teto}%. `
    + "Metas sem amostra ou com resultado estimado ficam fora da conta.";
}

/**
 * Fase 10.7 · mensagem curta do coletor para uma meta (último período).
 * Volume: quanto falta. Taxas: ritmo atual contra o alvo. "Menor é melhor": dentro ou acima do limite.
 */
export function mensagemMeta(m: Pick<MetricaScore, "metrica" | "unidade" | "direcao" | "ultimo"> & Partial<Pick<MetricaScore, "conta" | "motivo">>): string {
  // Fase 10.21 (P15): meta fora do score mostra o motivo do banco (o que falta para valer)
  if (m.conta === false && m.motivo) return m.motivo;
  const r = m.ultimo?.realizado;
  const alvo = m.ultimo?.alvo;
  const u = m.unidade ?? undefined;
  if (r === null || r === undefined || alvo === null || alvo === undefined) return "Ainda sem dados neste período.";
  if (m.metrica === "VOLUME_UNIDADES" || m.metrica === "VOLUME_TAREFAS") {
    const falta = Number(alvo) - Number(r);
    return falta <= 0 ? "Meta batida!" : `Faltam ${formatarValorMeta(falta, u)} para a meta.`;
  }
  if (m.direcao === "MENOR") {
    return Number(r) <= Number(alvo) ? "Dentro da meta." : `Acima do limite: ${formatarValorMeta(r, u)} (meta até ${formatarValorMeta(alvo, u)}).`;
  }
  return Number(r) >= Number(alvo) ? "Ritmo na meta." : `Ritmo ${formatarValorMeta(r, u)} · meta ${formatarValorMeta(alvo, u)}.`;
}
