import { supabase } from "@/integrations/supabase/client";

export interface DashboardFilters {
  tenantId: string;
  empresaId?: string | null;
  armazemId: string | null;
  dataIni: string; // ISO date
  dataFim: string; // ISO date
  turnoId?: string | null;
}

const sb = supabase as any;

function previousRange(dataIni: string, dataFim: string) {
  const ini = new Date(dataIni);
  const fim = new Date(dataFim);
  const days = Math.max(1, Math.ceil((fim.getTime() - ini.getTime()) / 86400000) + 1);
  const prevFim = new Date(ini);
  prevFim.setDate(prevFim.getDate() - 1);
  const prevIni = new Date(prevFim);
  prevIni.setDate(prevIni.getDate() - (days - 1));
  return {
    prevIni: prevIni.toISOString().slice(0, 10),
    prevFim: prevFim.toISOString().slice(0, 10),
  };
}

function trend(curr: number, prev: number): { dir: "up" | "down" | "flat"; pct: number } {
  if (!prev) return { dir: curr > 0 ? "up" : "flat", pct: 0 };
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return { dir: "flat", pct: 0 };
  return { dir: pct > 0 ? "up" : "down", pct: Math.abs(Math.round(pct * 10) / 10) };
}

// ---------- OTIF (proxy via status + data_emissao) ----------
export async function fetchOtif(f: DashboardFilters) {
  const dIni = `${f.dataIni}T00:00:00`;
  const dFim = `${f.dataFim}T23:59:59`;

  let q = sb.from("movimento_saida").select("status,data_emissao").eq("tenant_id", f.tenantId)
    .gte("data_emissao", dIni).lte("data_emissao", dFim);
  if (f.empresaId) q = q.eq("empresa_id", f.empresaId);
  const { data } = await q;
  const rows = data || [];
  const total = rows.length;
  const concluidas = rows.filter((r: any) => r.status === "CONCLUIDA" || r.status === "FINALIZADA").length;
  const otif = total > 0 ? Math.round((concluidas / total) * 1000) / 10 : 0;

  const { prevIni, prevFim } = previousRange(f.dataIni, f.dataFim);
  let qPrev = sb.from("movimento_saida").select("status").eq("tenant_id", f.tenantId)
    .gte("data_emissao", `${prevIni}T00:00:00`).lte("data_emissao", `${prevFim}T23:59:59`);
  if (f.empresaId) qPrev = qPrev.eq("empresa_id", f.empresaId);
  const { data: prevData } = await qPrev;
  const prevRows = prevData || [];
  const prevTotal = prevRows.length;
  const prevConc = prevRows.filter((r: any) => r.status === "CONCLUIDA" || r.status === "FINALIZADA").length;
  const prevOtif = prevTotal > 0 ? (prevConc / prevTotal) * 100 : 0;

  return { value: otif, total, concluidas, trend: trend(otif, prevOtif) };
}

// ---------- Ocupação ----------
export async function fetchOcupacao(f: DashboardFilters) {
  // endereco não tem empresa_id direto, mas armazem_id já é filtrado pelo armazém da empresa.
  let q = sb.from("endereco").select("situacao", { count: "exact" }).eq("tenant_id", f.tenantId).eq("ativo", true);
  if (f.armazemId) q = q.eq("armazem_id", f.armazemId);
  const { data, count } = await q;
  const rows = data || [];
  const total = count || 0;
  const ocupados = rows.filter((r: any) => r.situacao === "OCUPADO").length;
  const livres = rows.filter((r: any) => r.situacao === "LIVRE").length;
  const bloqueados = rows.filter((r: any) => r.situacao === "BLOQUEADO").length;
  const pct = total > 0 ? Math.round((ocupados / total) * 1000) / 10 : 0;
  return { value: pct, total, ocupados, livres, bloqueados };
}

// ---------- Produtividade ----------
export async function fetchProdutividade(f: DashboardFilters) {
  let q = sb.from("lms_metrica_diaria").select("tarefas_concluidas,tempo_produtivo")
    .eq("tenant_id", f.tenantId)
    .gte("data_referencia", f.dataIni).lte("data_referencia", f.dataFim);
  if (f.empresaId) q = q.eq("empresa_id", f.empresaId);
  if (f.armazemId) q = q.eq("armazem_id", f.armazemId);
  if (f.turnoId) q = q.eq("turno_id", f.turnoId);
  const { data } = await q;
  const rows = data || [];
  const tarefas = rows.reduce((s: number, r: any) => s + (Number(r.tarefas_concluidas) || 0), 0);
  const segs = rows.reduce((s: number, r: any) => s + (Number(r.tempo_produtivo) || 0), 0);
  const horas = segs / 3600;
  const value = horas > 0 ? Math.round((tarefas / horas) * 10) / 10 : 0;

  const { prevIni, prevFim } = previousRange(f.dataIni, f.dataFim);
  let q2 = sb.from("lms_metrica_diaria").select("tarefas_concluidas,tempo_produtivo")
    .eq("tenant_id", f.tenantId).gte("data_referencia", prevIni).lte("data_referencia", prevFim);
  if (f.empresaId) q2 = q2.eq("empresa_id", f.empresaId);
  if (f.armazemId) q2 = q2.eq("armazem_id", f.armazemId);
  if (f.turnoId) q2 = q2.eq("turno_id", f.turnoId);
  const { data: prev } = await q2;
  const pTar = (prev || []).reduce((s: number, r: any) => s + (Number(r.tarefas_concluidas) || 0), 0);
  const pSeg = (prev || []).reduce((s: number, r: any) => s + (Number(r.tempo_produtivo) || 0), 0);
  const pVal = pSeg > 0 ? (pTar / (pSeg / 3600)) : 0;

  return { value, tarefas, horas: Math.round(horas * 10) / 10, trend: trend(value, pVal) };
}

// ---------- Backlog ----------
export async function fetchBacklog(f: DashboardFilters) {
  let q = sb.from("tarefa").select("criado_em,status").eq("tenant_id", f.tenantId)
    .in("status", ["CRIADA", "ATRIBUIDA"]);
  if (f.armazemId) q = q.eq("armazem_id", f.armazemId);
  // tarefa não tem empresa_id direto; herda via armazem (já filtrado).
  const { data } = await q;
  const rows = data || [];
  const total = rows.length;
  const now = Date.now();
  const espMs = rows.reduce((s: number, r: any) => s + (now - new Date(r.criado_em).getTime()), 0);
  const tempoMedioMin = total > 0 ? Math.round(espMs / total / 60000) : 0;
  return { value: total, tempoMedioMin };
}

// ---------- Top Operadores (fonte: tarefa_execucao) ----------
export async function fetchTopOperadores(f: DashboardFilters, limit = 8) {
  const dIni = `${f.dataIni}T00:00:00`;
  const dFim = `${f.dataFim}T23:59:59`;
  let q = sb.from("tarefa_execucao")
    .select("usuario_id,iniciado_em,concluido_em,usuario:usuario_id(nome),tarefa:tarefa_id(armazem_id)")
    .eq("tenant_id", f.tenantId)
    .eq("status", "CONCLUIDA")
    .not("usuario_id", "is", null)
    .gte("concluido_em", dIni).lte("concluido_em", dFim);
  const { data } = await q;
  const rows = (data || []).filter((r: any) =>
    !f.armazemId || r.tarefa?.armazem_id === f.armazemId
  );
  const map = new Map<string, { nome: string; tarefas: number; segs: number }>();
  for (const r of rows) {
    const id = r.usuario_id;
    const cur = map.get(id) || { nome: r.usuario?.nome || "—", tarefas: 0, segs: 0 };
    cur.tarefas += 1;
    if (r.iniciado_em && r.concluido_em) {
      const dt = (new Date(r.concluido_em).getTime() - new Date(r.iniciado_em).getTime()) / 1000;
      if (dt > 0) cur.segs += dt;
    }
    map.set(id, cur);
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({
      id,
      nome: v.nome,
      tarefas: v.tarefas,
      produtividade: v.segs > 0 ? Math.round((v.tarefas / (v.segs / 3600)) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.tarefas - a.tarefas)
    .slice(0, limit);
}

// ---------- Ocorrências ----------
export async function fetchOcorrencias(f: DashboardFilters, limit = 8) {
  const dIni = `${f.dataIni}T00:00:00`;
  const dFim = `${f.dataFim}T23:59:59`;
  let q = sb.from("tarefa_execucao")
    .select("motivo_ocorrencia,concluido_em,motivo:motivo_ocorrencia(descricao)")
    .eq("tenant_id", f.tenantId)
    .not("motivo_ocorrencia", "is", null)
    .gte("concluido_em", dIni).lte("concluido_em", dFim);
  // tarefa_execucao herda empresa via tarefa/armazem; mantemos sem filtro direto.
  const { data } = await q;
  const map = new Map<string, { descricao: string; qtd: number }>();
  for (const r of data || []) {
    const id = r.motivo_ocorrencia;
    const cur = map.get(id) || { descricao: r.motivo?.descricao || "—", qtd: 0 };
    cur.qtd += 1;
    map.set(id, cur);
  }
  return Array.from(map.values())
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, limit);
}
