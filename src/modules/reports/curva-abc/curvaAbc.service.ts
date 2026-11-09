import { supabase } from "@/integrations/supabase/client";

export type CurvaAbcCriterio = "QUANTIDADE" | "VALOR" | "ACESSOS";
export type CurvaAbcClasse = "A" | "B" | "C";

export interface CurvaAbcFilter {
  tenant_id: string;
  empresa_id: string; // obrigatório
  data_inicio: string; // ISO yyyy-mm-dd
  data_fim: string; // ISO yyyy-mm-dd
  criterio: CurvaAbcCriterio;
  limite_a: number; // fração 0..1 (ex.: 0.80)
  limite_b: number; // fração 0..1 (ex.: 0.95)
  armazem_id?: string;
  grupo_id?: string;
  subgrupo_id?: string;
  marca?: string;
  sku?: string;
  classe?: CurvaAbcClasse;
}

export interface CurvaAbcResumoClasse {
  skus: number;
  metrica: number;
  participacao: number; // 0..1
}

export interface CurvaAbcResumo {
  criterio: CurvaAbcCriterio;
  limite_a: number;
  limite_b: number;
  data_inicio: string;
  data_fim: string;
  fuso: string;
  armazem_id: string | null;
  total_skus: number;
  total_metrica: number;
  total_qtd_saida: number;
  total_qtd_estornada: number;
  skus_100_estornados: number;
  total_valor_saida: number;
  total_acessos: number;
  skus_sem_custo: number;
  skus_exibidos: number;
  classes: Record<CurvaAbcClasse, CurvaAbcResumoClasse>;
}

export interface CurvaAbcItem {
  posicao: number;
  produto_id: string;
  sku: string;
  descricao: string;
  marca: string;
  grupo_id: string | null;
  subgrupo_id: string | null;
  preco_custo: number;
  qtd_saida: number;
  qtd_estornada: number;
  acessos: number;
  valor_saida: number;
  participacao: number; // 0..1
  acumulado: number; // 0..1
  saldo_atual: number;
  classe: CurvaAbcClasse;
}

export interface CurvaAbcResult {
  resumo: CurvaAbcResumo;
  itens: CurvaAbcItem[];
}

const num = (v: unknown): number => Number(v) || 0;

function normalizarResumo(r: any): CurvaAbcResumo {
  const classe = (c: any): CurvaAbcResumoClasse => ({
    skus: num(c?.skus),
    metrica: num(c?.metrica),
    participacao: num(c?.participacao),
  });
  return {
    criterio: r?.criterio,
    limite_a: num(r?.limite_a),
    limite_b: num(r?.limite_b),
    data_inicio: r?.data_inicio,
    data_fim: r?.data_fim,
    fuso: r?.fuso,
    armazem_id: r?.armazem_id ?? null,
    total_skus: num(r?.total_skus),
    total_metrica: num(r?.total_metrica),
    total_qtd_saida: num(r?.total_qtd_saida),
    total_qtd_estornada: num(r?.total_qtd_estornada),
    skus_100_estornados: num(r?.skus_100_estornados),
    total_valor_saida: num(r?.total_valor_saida),
    total_acessos: num(r?.total_acessos),
    skus_sem_custo: num(r?.skus_sem_custo),
    skus_exibidos: num(r?.skus_exibidos),
    classes: { A: classe(r?.classes?.A), B: classe(r?.classes?.B), C: classe(r?.classes?.C) },
  };
}

function normalizarItem(i: any): CurvaAbcItem {
  return {
    posicao: num(i?.posicao),
    produto_id: i?.produto_id,
    sku: i?.sku ?? "—",
    descricao: i?.descricao ?? "—",
    marca: i?.marca ?? "",
    grupo_id: i?.grupo_id ?? null,
    subgrupo_id: i?.subgrupo_id ?? null,
    preco_custo: num(i?.preco_custo),
    qtd_saida: num(i?.qtd_saida),
    qtd_estornada: num(i?.qtd_estornada),
    acessos: num(i?.acessos),
    valor_saida: num(i?.valor_saida),
    participacao: num(i?.participacao),
    acumulado: num(i?.acumulado),
    saldo_atual: num(i?.saldo_atual),
    classe: i?.classe,
  };
}

export async function fetchCurvaAbcReport(filters: CurvaAbcFilter): Promise<CurvaAbcResult> {
  const vazio = (v?: string) => (v && v.trim() !== "" ? v : null);

  const { data, error } = await (supabase as any).rpc("rpc_relatorio_curva_abc", {
    p_tenant_id: filters.tenant_id,
    p_empresa_id: filters.empresa_id,
    p_data_inicio: filters.data_inicio,
    p_data_fim: filters.data_fim,
    p_criterio: filters.criterio,
    p_armazem_id: vazio(filters.armazem_id),
    p_limite_a: filters.limite_a,
    p_limite_b: filters.limite_b,
    p_grupo_id: vazio(filters.grupo_id),
    p_subgrupo_id: vazio(filters.subgrupo_id),
    p_marca: vazio(filters.marca),
    p_sku: vazio(filters.sku),
    p_classe: filters.classe ?? null,
  });

  if (error) throw error;

  return {
    resumo: normalizarResumo(data?.resumo),
    itens: (data?.itens || []).map(normalizarItem),
  };
}

const CURVA_ABC_ERROS: Record<string, string> = {
  CURVA_ABC_EMPRESA_OBRIGATORIA: "Selecione uma empresa para gerar o relatório.",
  CURVA_ABC_PERIODO_OBRIGATORIO: "Informe a data inicial e a final.",
  CURVA_ABC_PERIODO_INVALIDO: "A data final deve ser maior ou igual à inicial.",
  CURVA_ABC_PERIODO_EXCEDIDO: "O período máximo é de 366 dias.",
  CURVA_ABC_CRITERIO_INVALIDO: "Critério de classificação inválido.",
  CURVA_ABC_LIMITES_INVALIDOS: "Os limites devem obedecer 0 < A < B < 100%.",
  CURVA_ABC_CLASSE_INVALIDA: "Classe inválida.",
};

export function mapCurvaAbcError(error: any): string {
  const hint = error?.hint || "";
  const codigo = Object.keys(CURVA_ABC_ERROS).find((c) => hint.includes(c));
  if (codigo) return CURVA_ABC_ERROS[codigo];
  console.error(error);
  return "Erro ao gerar a Curva ABC.";
}
