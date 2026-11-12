import { supabase } from "@/integrations/supabase/client";

/**
 * Relatório Inteligente de Ocupação — toda a regra roda no banco
 * (migration 20261112200121_rpc_relatorio_ocupacao):
 *  - rpc_relatorio_ocupacao_resumo: KPIs + setores (não dependem do filtro de status);
 *  - rpc_relatorio_ocupacao_enderecos: lista paginada (status, divergência, setor).
 *
 * Regras (fn_ocupacao_base):
 *  - saldo físico do endereço = Σ estoque_geral.quantidade_total > 0 de qualquer empresa do tenant;
 *  - BLOQUEADO = situação BLOQUEADO ou BLOQUEADO_INVENTARIO; PARCIAL = saldo abaixo da
 *    capacidade_unidades cadastrada; OCUPADO = com saldo; LIVRE = sem saldo;
 *  - % do endereço só existe quando há capacidade cadastrada (senão nulo);
 *  - divergente = situação LIVRE com saldo ou OCUPADO sem saldo.
 */

export type StatusOcupacao = "LIVRE" | "PARCIAL" | "OCUPADO" | "BLOQUEADO";

export interface OcupacaoFilter {
  tenant_id: string;
  armazem_id: string;
  setor_id?: string;
  tipo_endereco?: string;
}

export interface OcupacaoListaFilter extends OcupacaoFilter {
  status_ocupacao?: StatusOcupacao;
  apenas_divergentes?: boolean;
}

export interface EnderecoOcupacao {
  id: string;
  descricao: string;
  setor_id: string | null;
  setor_descricao: string;
  tipo_endereco: string;
  situacao: string;
  rua: number | null;
  predio: number | null;
  nivel: number | null;
  apto: number | null;
  capacidade: number | null;
  quantidade_total: number;
  skus_count: number;
  ultima_atualizacao: string | null;
  status_ocupacao: StatusOcupacao;
  percentual_ocupacao: number | null;
  divergente: boolean;
}

export interface SetorResumo {
  setor_id: string | null;
  setor_descricao: string;
  total_enderecos: number;
  enderecos_ocupados: number;
  enderecos_parciais: number;
  enderecos_livres: number;
  enderecos_bloqueados: number;
  divergencias: number;
  percentual_ocupacao: number;
  ocupacao_capacidade: number | null;
}

export interface OcupacaoKPIs {
  total_enderecos: number;
  enderecos_ocupados: number;
  enderecos_parciais: number;
  enderecos_livres: number;
  enderecos_bloqueados: number;
  bloqueados_com_saldo: number;
  percentual_ocupados: number;
  percentual_livres: number;
  percentual_bloqueados: number;
  divergencias: number;
  livre_com_saldo: number;
  ocupado_sem_saldo: number;
  enderecos_com_capacidade: number;
  ocupacao_capacidade: number | null;
  acima_capacidade: number;
  setor_mais_saturado: string | null;
  setor_mais_ocioso: string | null;
}

export interface OcupacaoResumo {
  kpis: OcupacaoKPIs;
  setores: SetorResumo[];
  statusDistribution: { name: string; value: number; fill: string }[];
}

export interface OcupacaoPagina {
  rows: EnderecoOcupacao[];
  total: number;
}

export const OCUPACAO_PAGE_SIZE = 100;
const EXPORT_PAGE_SIZE = 1000; // máximo aceito pela RPC
const EXPORT_CONCORRENCIA = 4;

export const STATUS_CORES: Record<"Ocupado" | "Parcial" | "Livre" | "Bloqueado", string> = {
  Ocupado: "hsl(0 84% 60%)",
  Parcial: "hsl(25 95% 53%)",
  Livre: "hsl(142 76% 36%)",
  Bloqueado: "hsl(45 93% 47%)",
};

const n = (v: unknown) => Number(v ?? 0) || 0;
const nOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const txt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export function mapResumo(raw: any): OcupacaoResumo {
  const k = raw?.kpis ?? {};
  const ocupados = n(k.enderecos_ocupados);
  const parciais = n(k.enderecos_parciais);
  const kpis: OcupacaoKPIs = {
    total_enderecos: n(k.total_enderecos),
    enderecos_ocupados: ocupados,
    enderecos_parciais: parciais,
    enderecos_livres: n(k.enderecos_livres),
    enderecos_bloqueados: n(k.enderecos_bloqueados),
    bloqueados_com_saldo: n(k.bloqueados_com_saldo),
    percentual_ocupados: n(k.percentual_ocupados),
    percentual_livres: n(k.percentual_livres),
    percentual_bloqueados: n(k.percentual_bloqueados),
    divergencias: n(k.divergencias),
    livre_com_saldo: n(k.livre_com_saldo),
    ocupado_sem_saldo: n(k.ocupado_sem_saldo),
    enderecos_com_capacidade: n(k.enderecos_com_capacidade),
    ocupacao_capacidade: nOrNull(k.ocupacao_capacidade),
    acima_capacidade: n(k.acima_capacidade),
    setor_mais_saturado: txt(k.setor_mais_saturado),
    setor_mais_ocioso: txt(k.setor_mais_ocioso),
  };
  const setores: SetorResumo[] = (Array.isArray(raw?.setores) ? raw.setores : []).map((s: any) => ({
    setor_id: s.setor_id ?? null,
    setor_descricao: s.setor_descricao ?? "—",
    total_enderecos: n(s.total_enderecos),
    enderecos_ocupados: n(s.enderecos_ocupados),
    enderecos_parciais: n(s.enderecos_parciais),
    enderecos_livres: n(s.enderecos_livres),
    enderecos_bloqueados: n(s.enderecos_bloqueados),
    divergencias: n(s.divergencias),
    percentual_ocupacao: n(s.percentual_ocupacao),
    ocupacao_capacidade: nOrNull(s.ocupacao_capacidade),
  }));
  // Ocupado aqui = ocupado cheio (sem os parciais), para as fatias somarem o total.
  const statusDistribution = [
    { name: "Ocupado", value: ocupados - parciais, fill: STATUS_CORES.Ocupado },
    { name: "Parcial", value: parciais, fill: STATUS_CORES.Parcial },
    { name: "Livre", value: kpis.enderecos_livres, fill: STATUS_CORES.Livre },
    { name: "Bloqueado", value: kpis.enderecos_bloqueados, fill: STATUS_CORES.Bloqueado },
  ].filter((s) => s.value > 0);
  return { kpis, setores, statusDistribution };
}

function mapRow(r: any): EnderecoOcupacao {
  return {
    id: r.endereco_id,
    descricao: r.descricao ?? "—",
    setor_id: r.setor_id ?? null,
    setor_descricao: r.setor_descricao ?? "—",
    tipo_endereco: r.tipo_endereco ?? "",
    situacao: r.situacao ?? "",
    rua: nOrNull(r.rua),
    predio: nOrNull(r.predio),
    nivel: nOrNull(r.nivel),
    apto: nOrNull(r.apto),
    capacidade: nOrNull(r.capacidade),
    quantidade_total: n(r.quantidade_total),
    skus_count: n(r.skus_count),
    ultima_atualizacao: r.ultima_atualizacao ?? null,
    status_ocupacao: r.status_ocupacao as StatusOcupacao,
    percentual_ocupacao: nOrNull(r.percentual_ocupacao),
    divergente: !!r.divergente,
  };
}

const baseParams = (f: OcupacaoFilter) => ({
  p_tenant_id: f.tenant_id,
  p_armazem_id: f.armazem_id,
  p_setor_id: f.setor_id || null,
  p_tipo_endereco: f.tipo_endereco || null,
});

export async function fetchOcupacaoResumo(filters: OcupacaoFilter): Promise<OcupacaoResumo> {
  const { data, error } = await (supabase as any).rpc("rpc_relatorio_ocupacao_resumo", baseParams(filters));
  if (error) throw error;
  return mapResumo(data);
}

async function callLista(f: OcupacaoListaFilter, limit: number, offset: number): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("rpc_relatorio_ocupacao_enderecos", {
    ...baseParams(f),
    p_status: f.status_ocupacao || null,
    p_apenas_divergentes: !!f.apenas_divergentes,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data as any[]) || [];
}

/** Uma página da lista de endereços (divergentes primeiro, depois maior saldo). */
export async function fetchOcupacaoPage(
  filters: OcupacaoListaFilter,
  page: number,
  pageSize = OCUPACAO_PAGE_SIZE,
): Promise<OcupacaoPagina> {
  const data = await callLista(filters, pageSize, page * pageSize);
  return { rows: data.map(mapRow), total: data.length ? n(data[0].total_registros) : 0 };
}

/** Todas as linhas (exportação). Páginas de 1000, até 4 em paralelo. */
export async function fetchOcupacaoAll(filters: OcupacaoListaFilter, total: number): Promise<EnderecoOcupacao[]> {
  const paginas = Math.ceil(total / EXPORT_PAGE_SIZE);
  const resultado: EnderecoOcupacao[][] = new Array(paginas);
  let proxima = 0;
  const worker = async () => {
    while (proxima < paginas) {
      const p = proxima++;
      const data = await callLista(filters, EXPORT_PAGE_SIZE, p * EXPORT_PAGE_SIZE);
      resultado[p] = data.map(mapRow);
    }
  };
  await Promise.all(Array.from({ length: Math.min(EXPORT_CONCORRENCIA, paginas) }, worker));
  return resultado.flat();
}

export function getOcupacaoColor(percentual: number): string {
  if (percentual > 85) return "text-[hsl(var(--status-blocked))]";
  if (percentual >= 70) return "text-[hsl(var(--status-busy))]";
  return "text-[hsl(var(--status-free))]";
}

export function getOcupacaoBgColor(percentual: number): string {
  if (percentual > 85) return "bg-[hsl(var(--status-blocked))]";
  if (percentual >= 70) return "bg-[hsl(var(--status-busy))]";
  return "bg-[hsl(var(--status-free))]";
}

export function getOcupacaoProgressColor(percentual: number): string {
  if (percentual > 85) return "hsl(0 84% 60%)";
  if (percentual >= 70) return "hsl(45 93% 47%)";
  return "hsl(142 76% 36%)";
}
