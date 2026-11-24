import { supabase } from "@/integrations/supabase/client";

/**
 * Relatórios de Entregas — toda a regra roda no banco (migration 20261123160000):
 *  - rpc_relatorio_entregas_tentativas: uma linha por tentativa (entrega_tentativa,
 *    imutável) e por parada sem tentativa válida (PENDENTE = saída ativa,
 *    NAO_VISITADA = saída cancelada/encerrada sem passar no cliente). Filtros,
 *    período no fuso America/Fortaleza, ordenação, paginação e resumo (cards) na RPC.
 *  - rpc_relatorio_entregas_motivos: resumo, motivos (FALHA/RESSALVA), por
 *    entregador, por cliente e por dia. Tentativas estornadas ficam fora.
 * Nunca recalcular a partir do status atual da parada.
 */

export type ResultadoEntregaRelatorio = "ENTREGUE" | "NAO_ENTREGUE" | "PENDENTE" | "NAO_VISITADA";

export interface EntregasFiltro {
  tenant_id: string;
  empresa_id: string;
  data_inicio?: string; // AAAA-MM-DD (data local)
  data_fim?: string;    // AAAA-MM-DD (inclusive)
  usuario_id?: string;
  veiculo_id?: string;
  parceiro_id?: string;
}

export interface EntregasTentativasFiltro extends EntregasFiltro {
  resultado?: ResultadoEntregaRelatorio;
  motivo_id?: string;
  incluir_estornadas?: boolean;
}

export interface EntregaTentativaRow {
  linha_id: string;
  tipo_linha: "TENTATIVA" | "SEM_TENTATIVA";
  data_evento: string;
  resultado: ResultadoEntregaRelatorio;
  numero_tentativa: number | null;
  carga_id: string;
  numero_carga: string;
  entrega_id: string;
  numero_saida: number;
  status_saida: string;
  atribuida_em: string | null;
  aceita_em: string | null;
  sequencia_parada: number;
  documento_saida_id: string;
  numero_pedido: string | null;
  numero_nf: string | null;
  parceiro_id: string | null;
  cliente: string | null;
  bairro: string | null;
  cidade: string | null;
  entregador: string | null;
  veiculo: string | null;
  motivo_id: string | null;
  motivo: string | null;
  ocorrencia_numero: string | null;
  ressalvas: string | null;
  recebedor_nome: string | null;
  tem_foto: boolean;
  fora_de_ordem: boolean;
  estornada: boolean;
  estornada_em: string | null;
  estornada_por: string | null;
  motivo_estorno: string | null;
  origem: string | null;
}

export interface EntregasTentativasResumo {
  total: number;
  tentativas: number;
  entregues: number;
  nao_entregues: number;
  pendentes: number;
  nao_visitadas: number;
  estornadas: number;
  pedidos: number;
  pedidos_entregues: number;
  entregues_primeira: number;
  com_ressalva: number;
  fora_de_ordem: number;
}

export interface EntregasTentativasPage {
  rows: EntregaTentativaRow[];
  resumo: EntregasTentativasResumo;
}

export const ENTREGAS_PAGE_SIZE = 100;
const EXPORT_PAGE_SIZE = 1000;
const EXPORT_CONCORRENCIA = 4;

const num = (v: unknown) => Number(v) || 0;

export function resumoTentativasVazio(): EntregasTentativasResumo {
  return {
    total: 0, tentativas: 0, entregues: 0, nao_entregues: 0, pendentes: 0, nao_visitadas: 0,
    estornadas: 0, pedidos: 0, pedidos_entregues: 0, entregues_primeira: 0, com_ressalva: 0, fora_de_ordem: 0,
  };
}

export function mapResumoTentativas(r: any | undefined): EntregasTentativasResumo {
  if (!r) return resumoTentativasVazio();
  return {
    total: num(r.total_registros),
    tentativas: num(r.qtd_tentativas),
    entregues: num(r.qtd_entregues),
    nao_entregues: num(r.qtd_nao_entregues),
    pendentes: num(r.qtd_pendentes),
    nao_visitadas: num(r.qtd_nao_visitadas),
    estornadas: num(r.qtd_estornadas),
    pedidos: num(r.qtd_pedidos),
    pedidos_entregues: num(r.qtd_pedidos_entregues),
    entregues_primeira: num(r.qtd_entregues_primeira),
    com_ressalva: num(r.qtd_com_ressalva),
    fora_de_ordem: num(r.qtd_fora_ordem),
  };
}

function baseParams(f: EntregasFiltro) {
  return {
    p_tenant_id: f.tenant_id,
    p_empresa_id: f.empresa_id,
    p_data_inicio: f.data_inicio || null,
    p_data_fim: f.data_fim || null,
    p_usuario_id: f.usuario_id || null,
    p_veiculo_id: f.veiculo_id || null,
    p_parceiro_id: f.parceiro_id || null,
  };
}

export function toTentativasParams(f: EntregasTentativasFiltro, limit: number, offset: number) {
  return {
    ...baseParams(f),
    p_resultado: f.resultado || null,
    p_motivo_id: f.motivo_id || null,
    p_incluir_estornadas: !!f.incluir_estornadas,
    p_limit: limit,
    p_offset: offset,
  };
}

function mapRow(r: any): EntregaTentativaRow {
  const { total_registros: _t, ...resto } = r ?? {};
  return {
    ...resto,
    numero_tentativa: r.numero_tentativa == null ? null : Number(r.numero_tentativa),
    numero_saida: num(r.numero_saida),
    sequencia_parada: num(r.sequencia_parada),
    tem_foto: !!r.tem_foto,
    fora_de_ordem: !!r.fora_de_ordem,
    estornada: !!r.estornada,
  } as EntregaTentativaRow;
}

async function callTentativas(f: EntregasTentativasFiltro, limit: number, offset: number): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("rpc_relatorio_entregas_tentativas", toTentativasParams(f, limit, offset));
  if (error) throw error;
  return (data as any[]) || [];
}

export async function fetchEntregasTentativasPage(
  filtro: EntregasTentativasFiltro,
  page: number,
  pageSize = ENTREGAS_PAGE_SIZE,
): Promise<EntregasTentativasPage> {
  const data = await callTentativas(filtro, pageSize, page * pageSize);
  return { rows: data.map(mapRow), resumo: mapResumoTentativas(data[0]) };
}

/** Todas as linhas (Excel/PDF): páginas de 1000, até 4 em paralelo. */
export async function fetchEntregasTentativasAll(filtro: EntregasTentativasFiltro, total: number): Promise<EntregaTentativaRow[]> {
  const paginas = Math.ceil(total / EXPORT_PAGE_SIZE);
  const resultado: EntregaTentativaRow[][] = new Array(paginas);
  let proxima = 0;
  const worker = async () => {
    while (proxima < paginas) {
      const p = proxima++;
      resultado[p] = (await callTentativas(filtro, EXPORT_PAGE_SIZE, p * EXPORT_PAGE_SIZE)).map(mapRow);
    }
  };
  await Promise.all(Array.from({ length: Math.min(EXPORT_CONCORRENCIA, paginas) }, worker));
  return resultado.flat();
}

// ---------- resultado por motivo ----------
export interface EntregasMotivosResumo {
  tentativas: number;
  entregues: number;
  nao_entregues: number;
  pedidos: number;
  pedidos_entregues: number;
  entregues_primeira: number;
  com_ressalva: number;
  fora_de_ordem: number;
  entregadores: number;
  clientes: number;
  nao_visitadas: number;
}

export interface EntregaMotivoLinha {
  tipo: "FALHA" | "RESSALVA";
  motivo_id: string | null;
  motivo: string;
  impede_entrega: boolean | null;
  quantidade: number;
  pct: number | null; // % das falhas (só FALHA)
  pedidos: number;
  clientes: number;
  entregadores: number;
}

export interface EntregaGrupoLinha {
  id: string | null;
  nome: string;
  tentativas: number;
  entregues: number;
  nao_entregues: number;
  entregues_primeira?: number;
  com_ressalva?: number;
  pedidos?: number;
  principal_motivo: string | null;
}

export interface EntregaDiaLinha {
  dia: string;
  tentativas: number;
  entregues: number;
  nao_entregues: number;
}

export interface EntregasMotivosRelatorio {
  resumo: EntregasMotivosResumo;
  motivos: EntregaMotivoLinha[];
  por_entregador: EntregaGrupoLinha[];
  por_cliente: EntregaGrupoLinha[];
  por_dia: EntregaDiaLinha[];
}

export function mapMotivosRelatorio(d: any): EntregasMotivosRelatorio {
  const r = d?.resumo ?? {};
  const grupo = (g: any, id: string): EntregaGrupoLinha => ({
    id: g[id] ?? null,
    nome: g.nome ?? "—",
    tentativas: num(g.tentativas),
    entregues: num(g.entregues),
    nao_entregues: num(g.nao_entregues),
    entregues_primeira: g.entregues_primeira == null ? undefined : num(g.entregues_primeira),
    com_ressalva: g.com_ressalva == null ? undefined : num(g.com_ressalva),
    pedidos: g.pedidos == null ? undefined : num(g.pedidos),
    principal_motivo: g.principal_motivo ?? null,
  });
  return {
    resumo: {
      tentativas: num(r.tentativas), entregues: num(r.entregues), nao_entregues: num(r.nao_entregues),
      pedidos: num(r.pedidos), pedidos_entregues: num(r.pedidos_entregues), entregues_primeira: num(r.entregues_primeira),
      com_ressalva: num(r.com_ressalva), fora_de_ordem: num(r.fora_de_ordem), entregadores: num(r.entregadores),
      clientes: num(r.clientes), nao_visitadas: num(r.nao_visitadas),
    },
    motivos: (d?.motivos ?? []).map((m: any) => ({
      tipo: m.tipo, motivo_id: m.motivo_id ?? null, motivo: m.motivo ?? "Sem motivo",
      impede_entrega: m.impede_entrega ?? null, quantidade: num(m.quantidade),
      pct: m.pct == null ? null : Number(m.pct), pedidos: num(m.pedidos), clientes: num(m.clientes), entregadores: num(m.entregadores),
    })),
    por_entregador: (d?.por_entregador ?? []).map((g: any) => grupo(g, "usuario_id")),
    por_cliente: (d?.por_cliente ?? []).map((g: any) => grupo(g, "parceiro_id")),
    por_dia: (d?.por_dia ?? []).map((x: any) => ({
      dia: x.dia, tentativas: num(x.tentativas), entregues: num(x.entregues), nao_entregues: num(x.nao_entregues),
    })),
  };
}

export async function fetchEntregasMotivos(filtro: EntregasFiltro): Promise<EntregasMotivosRelatorio> {
  const { data, error } = await (supabase as any).rpc("rpc_relatorio_entregas_motivos", baseParams(filtro));
  if (error) throw error;
  return mapMotivosRelatorio(data);
}

// ---------- opções dos filtros ----------
export interface OpcaoFiltro { value: string; label: string }

export interface OpcoesFiltroEntregas {
  entregadores: OpcaoFiltro[];
  veiculos: OpcaoFiltro[];
  motivos: OpcaoFiltro[];
}

/** Entregadores que já tiveram saída, veículos com entregador e motivos da etapa ENTREGA. */
export async function fetchOpcoesFiltroEntregas(tenantId: string, empresaId: string): Promise<OpcoesFiltroEntregas> {
  const sb = supabase as any;
  const [ent, vei, mot] = await Promise.all([
    sb.from("entrega").select("usuario_id, usuario:usuario_id(nome)").eq("tenant_id", tenantId).eq("empresa_id", empresaId).limit(5000),
    sb.from("veiculos").select("id, placa, descricao, usuario_id").eq("tenant_id", tenantId).eq("empresa_id", empresaId).order("placa"),
    sb.from("motivo_ocorrencia").select("id, descricao").eq("tenant_id", tenantId).eq("etapa_ocorrencia", "ENTREGA").order("descricao"),
  ]);
  for (const r of [ent, vei, mot]) if (r.error) throw r.error;
  const mapa = new Map<string, string>();
  for (const e of ent.data ?? []) if (e.usuario_id) mapa.set(e.usuario_id, e.usuario?.nome ?? "—");
  return {
    entregadores: [...mapa].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    veiculos: (vei.data ?? []).map((v: any) => ({ value: v.id, label: [v.placa, v.descricao].filter(Boolean).join(" · ") || "—" })),
    motivos: (mot.data ?? []).map((m: any) => ({ value: m.id, label: m.descricao })),
  };
}

// ---------- exibição ----------
export const ROTULO_RESULTADO: Record<ResultadoEntregaRelatorio, string> = {
  ENTREGUE: "Entregue",
  NAO_ENTREGUE: "Não entregue",
  PENDENTE: "Pendente (em rota)",
  NAO_VISITADA: "Não visitada",
};

export function pctTexto(v: number, base: number): string {
  return base > 0 ? `${((v / base) * 100).toFixed(1).replace(".", ",")}%` : "—";
}

export function textoResultado(r: Pick<EntregaTentativaRow, "resultado" | "estornada">): string {
  return `${ROTULO_RESULTADO[r.resultado] ?? r.resultado}${r.estornada ? " (estornada)" : ""}`;
}
