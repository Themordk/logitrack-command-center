import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, History, Info, Loader2, Lock, Pencil, RefreshCw, ShieldCheck, Timer, X } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/utils/dateTime";
import { EditarRegraDialog, type RegraEmEdicao } from "./EditarRegraDialog";
import { EditarFaixasDialog } from "./EditarFaixasDialog";
import { EditarPadraoDialog, type PartesEntrada } from "./EditarPadraoDialog";
import { AtividadesIndiretasSection } from "./AtividadesIndiretasSection";
import { PALETA, intervalos, type FaixaLms } from "../faixas";
import {
  LmsConfigErro, ROTULO_GRUPO, descreverOrigem, descreverPadrao, excluirRegraAgendada, formatarValor, listarArmazens, listarEmpresas, obterConfigLms,
  reprocessarLms, salvarFaixasLms, salvarPadraoLms, salvarRegraLms, type ConfigLms, type FaixaEntrada, type GrupoParametro, type NivelRegra,
  type PadraoTempoConfig,
} from "./lmsConfig.service";

interface Opcao { id: string; nome: string }

const GRUPOS: GrupoParametro[] = ["JORNADA", "QUALIDADE", "CALIBRACAO", "METAS"];

function ChipsFaixas({ lista }: { lista: FaixaLms[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {[...lista].sort((a, b) => b.a_partir_de_pct - a.a_partir_de_pct).map((f) => (
        <span key={f.codigo} className={cn("rounded-full border px-1.5 text-[10px]", PALETA[f.cor]?.fundo, PALETA[f.cor]?.texto, PALETA[f.cor]?.borda)}>
          {f.nome} ≥ {f.a_partir_de_pct}%
        </span>
      ))}
    </span>
  );
}

function OrigemBadge({ nivel, nivelTela }: { nivel: NivelRegra; nivelTela: "EMPRESA" | "ARMAZEM" }) {
  const proprio = nivel === nivelTela;
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
      proprio ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground",
    )}>
      {descreverOrigem(nivel, nivelTela)}
    </span>
  );
}

function Agendados({ itens, unidade, podeEditar, onExcluir }: {
  itens: Array<{ id: string; valor: number | null; texto?: string; vigente_desde: string }>;
  unidade: Parameters<typeof formatarValor>[1];
  podeEditar: boolean;
  onExcluir: (id: string) => void;
}) {
  if (itens.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {itens.map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
          <CalendarClock size={11} />
          {a.valor === null ? "volta a herdar" : a.texto ?? formatarValor(a.valor, unidade)} em {formatDate(a.vigente_desde)}
          {podeEditar && (
            <button type="button" aria-label="Cancelar agendamento" onClick={() => onExcluir(a.id)} className="hover:text-destructive">
              <X size={11} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

export function LmsConfiguracaoPage() {
  const { tenantId, empresaId: empresaSessao } = useTenant();
  const [empresas, setEmpresas] = useState<Opcao[]>([]);
  const [armazens, setArmazens] = useState<Opcao[]>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(empresaSessao);
  const [armazemId, setArmazemId] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigLms | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<RegraEmEdicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [reprocessarDe, setReprocessarDe] = useState<string | null>(null);
  const [editandoFaixas, setEditandoFaixas] = useState(false);
  const [editandoPadrao, setEditandoPadrao] = useState<PadraoTempoConfig | null>(null);
  const [reprocessando, setReprocessando] = useState(false);

  useEffect(() => { if (!empresaId && empresaSessao) setEmpresaId(empresaSessao); }, [empresaSessao, empresaId]);

  useEffect(() => {
    if (!tenantId) return;
    listarEmpresas(tenantId).then(setEmpresas);
  }, [tenantId]);

  useEffect(() => {
    setArmazemId(null);
    if (!tenantId || !empresaId) { setArmazens([]); return; }
    listarArmazens(tenantId, empresaId).then(setArmazens);
  }, [tenantId, empresaId]);

  const carregar = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setCarregando(true);
    setErro(null);
    try {
      setConfig(await obterConfigLms(tenantId, empresaId, armazemId));
    } catch (e) {
      setConfig(null);
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as regras.");
    } finally {
      setCarregando(false);
    }
  }, [tenantId, empresaId, armazemId]);

  useEffect(() => { carregar(); }, [carregar]);

  const nivelTela = config?.nivel ?? (armazemId ? "ARMAZEM" : "EMPRESA");
  const nomeNivel = armazemId ? armazens.find((a) => a.id === armazemId)?.nome ?? "armazém" : empresas.find((e) => e.id === empresaId)?.nome ?? "empresa";

  const parametrosPorGrupo = useMemo(() => {
    const m = new Map<GrupoParametro, ConfigLms["parametros"]>();
    for (const g of GRUPOS) m.set(g, []);
    for (const p of config?.parametros ?? []) m.get(p.grupo)?.push(p);
    return m;
  }, [config]);

  async function salvar(valor: number | null, vigenteDesde: string, motivo: string) {
    if (!edicao || !tenantId || !empresaId || !config) return;
    setSalvando(true);
    try {
      const r = await salvarRegraLms({
        tenantId, empresaId, armazemId, tipo: edicao.tipo, chave: edicao.chave, valor, vigenteDesde, motivo,
      });
      toast.success(r.mensagem);
      setEdicao(null);
      if (r.requer_reprocessamento && config.pode_reprocessar) setReprocessarDe(r.vigente_desde);
      await carregar();
    } catch (e) {
      toast.error(e instanceof LmsConfigErro ? e.message : "Não foi possível salvar a regra.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarPadrao(partes: PartesEntrada | null, origem: "MANUAL" | "CALIBRADO", vigenteDesde: string, motivo: string) {
    if (!editandoPadrao || !tenantId || !empresaId || !config) return;
    setSalvando(true);
    try {
      const r = await salvarPadraoLms({
        tenantId, empresaId, armazemId, tipoTarefaId: editandoPadrao.tipo_tarefa_id, partes, origem, vigenteDesde, motivo,
      });
      toast.success(r.mensagem);
      setEditandoPadrao(null);
      if (r.requer_reprocessamento && config.pode_reprocessar) setReprocessarDe(r.vigente_desde);
      await carregar();
    } catch (e) {
      toast.error(e instanceof LmsConfigErro ? e.message : "Não foi possível salvar o padrão.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarFaixas(faixas: FaixaEntrada[] | null, vigenteDesde: string, motivo: string) {
    if (!tenantId || !empresaId) return;
    setSalvando(true);
    try {
      const r = await salvarFaixasLms({ tenantId, empresaId, armazemId, faixas, vigenteDesde, motivo });
      toast.success(r.mensagem);
      setEditandoFaixas(false);
      await carregar();
    } catch (e) {
      toast.error(e instanceof LmsConfigErro ? e.message : "Não foi possível salvar as faixas.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirAgendada(tipo: "PARAMETRO" | "PADRAO_TEMPO" | "FAIXAS", id: string) {
    if (!tenantId) return;
    try {
      await excluirRegraAgendada(tenantId, tipo, id);
      toast.success("Agendamento cancelado.");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar.");
    }
  }

  async function reprocessar() {
    if (!tenantId || !reprocessarDe) return;
    setReprocessando(true);
    try {
      const r = await reprocessarLms(tenantId, reprocessarDe);
      toast.success(`Reprocessado: ${r.dias} dia(s).`);
      setReprocessarDe(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reprocessar.");
    } finally {
      setReprocessando(false);
    }
  }

  const podeEditar = !!config?.pode_editar;
  const unidadeDe = useMemo(() => new Map((config?.parametros ?? []).map((p) => [p.codigo, p.unidade])), [config]);

  return (
    <div className="space-y-5" data-testid="lms-configuracao">
      {/* Nível da cascata */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Empresa</span>
            <select
              className="h-9 min-w-[220px] rounded-md border border-border bg-background px-2 text-sm"
              value={empresaId ?? ""}
              onChange={(e) => setEmpresaId(e.target.value || null)}
            >
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Regras de</span>
            <select
              aria-label="Nível das regras"
              className="h-9 min-w-[220px] rounded-md border border-border bg-background px-2 text-sm"
              value={armazemId ?? ""}
              onChange={(e) => setArmazemId(e.target.value || null)}
            >
              <option value="">Toda a empresa</option>
              {armazens.map((a) => <option key={a.id} value={a.id}>Armazém · {a.nome}</option>)}
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
            <RefreshCw size={14} className={cn("mr-1", carregando && "animate-spin")} /> Atualizar
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info size={14} className="mt-0.5 shrink-0" />
          {nivelTela === "EMPRESA"
            ? "As regras da empresa valem para todos os armazéns que não tiverem regra própria. O que não for definido aqui usa o padrão do sistema."
            : "Este armazém herda as regras da empresa. Defina aqui só o que for diferente."}
        </p>
        {config && !podeEditar && (
          <p className="flex items-center gap-1.5 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Lock size={13} /> Somente leitura: só o gerente altera as regras do LMS.
          </p>
        )}
      </section>

      {reprocessarDe && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span>A regra vale desde {formatDate(reprocessarDe)}. Reprocessar os dias a partir dessa data para os números refletirem a mudança?</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setReprocessarDe(null)} disabled={reprocessando}>Agora não</Button>
            <Button size="sm" onClick={reprocessar} disabled={reprocessando}>
              {reprocessando && <Loader2 size={14} className="mr-1 animate-spin" />} Reprocessar
            </Button>
          </div>
        </section>
      )}

      {carregando && !config && (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="animate-spin" /></div>
      )}
      {erro && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}

      {config && (
        <>
          {/* Tempos padrão */}
          <section className="rounded-lg border border-border bg-card">
            <header className="flex items-start gap-2 border-b border-border p-4">
              <Timer size={18} className="mt-0.5 text-primary" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Tempo padrão por tipo de tarefa</h2>
                <p className="text-xs text-muted-foreground">Quanto uma tarefa deve levar: um tempo por tarefa, mais um tempo por unidade (opcional), mais a folga (PFD). É a base da performance e da eficiência.</p>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-medium">Tipo de tarefa</th>
                    <th className="px-4 py-2 text-left font-medium">Unidade</th>
                    <th className="px-4 py-2 text-right font-medium">Tempo padrão</th>
                    <th className="px-4 py-2 text-left font-medium">Origem</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {config.padroes_tempo.map((p) => (
                    <tr key={p.tipo_tarefa_id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs text-muted-foreground">{p.codigo}</span>{" "}
                        <span className="text-foreground">{p.descricao}</span>
                        <Agendados
                          itens={p.agendados.map((a) => ({ id: a.id, valor: a.tempo_fixo_seg, texto: a.tempo_fixo_seg === null ? undefined : descreverPadrao({ ...a, tempo_fixo_seg: a.tempo_fixo_seg }, p.unidade_medida), vigente_desde: a.vigente_desde }))}
                          unidade="TEMPO" podeEditar={podeEditar} onExcluir={(id) => excluirAgendada("PADRAO_TEMPO", id)}
                        />
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{p.unidade_medida ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-foreground">
                        {p.efetivo.tempo_fixo_seg > 0 || Number(p.efetivo.tempo_unidade_seg ?? 0) > 0
                          ? descreverPadrao(p.efetivo, p.unidade_medida) : <span className="text-muted-foreground">sem padrão</span>}
                        {p.efetivo.origem === "CALIBRADO" && <span className="block text-[10px] font-normal text-muted-foreground">calibrado pelo histórico</span>}
                      </td>
                      <td className="px-4 py-2"><OrigemBadge nivel={p.efetivo.nivel} nivelTela={nivelTela} /></td>
                      <td className="px-4 py-2 text-right">
                        {podeEditar && (
                          <Button size="sm" variant="ghost" aria-label={`Alterar tempo padrão de ${p.codigo}`}
                            onClick={() => setEditandoPadrao(p)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Atividades indiretas e paradas (catálogo da empresa) */}
          {tenantId && empresaId && (
            <AtividadesIndiretasSection tenantId={tenantId} empresaId={empresaId} nivelTela={nivelTela}
              nomeEmpresa={empresas.find((e) => e.id === empresaId)?.nome ?? "empresa"} />
          )}

          {/* Faixas de classificação */}
          <section className="rounded-lg border border-border bg-card" data-testid="lms-faixas">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Classificação</h2>
                <p className="text-xs text-muted-foreground">Faixas de performance usadas no relatório, nos painéis e no coletor. A faixa com estrela é a meta.</p>
              </div>
              <div className="flex items-center gap-2">
                <OrigemBadge nivel={config.faixas.efetivo.nivel} nivelTela={nivelTela} />
                {podeEditar && (
                  <Button size="sm" variant="outline" onClick={() => setEditandoFaixas(true)}>
                    <Pencil size={14} className="mr-1" /> Editar faixas
                  </Button>
                )}
              </div>
            </header>
            <ul>
              {intervalos(config.faixas.efetivo.lista).map(({ faixa, texto }) => (
                <li key={faixa.codigo} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: PALETA[faixa.cor]?.hex }} />
                  <span className={cn("min-w-[140px] text-sm font-medium", PALETA[faixa.cor]?.texto)}>{faixa.nome}</span>
                  <span className="text-sm tabular-nums text-foreground">{texto}</span>
                  {faixa.eh_meta && <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">Meta</span>}
                </li>
              ))}
            </ul>
            {config.faixas.agendados.length > 0 && (
              <div className="border-t border-border px-4 py-2">
                {config.faixas.agendados.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 py-1 text-xs text-amber-600 dark:text-amber-400">
                    <CalendarClock size={12} /> Em {formatDate(a.vigente_desde)}:
                    {a.herdar || !a.lista ? <span>volta a herdar</span> : <ChipsFaixas lista={a.lista} />}
                    {podeEditar && (
                      <button type="button" aria-label="Cancelar agendamento das faixas" onClick={() => excluirAgendada("FAIXAS", a.id)} className="hover:text-destructive">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Parâmetros por grupo */}
          {GRUPOS.map((g) => {
            const itens = parametrosPorGrupo.get(g) ?? [];
            if (itens.length === 0) return null;
            return (
              <section key={g} className="rounded-lg border border-border bg-card">
                <header className="border-b border-border p-4">
                  <h2 className="text-sm font-semibold text-foreground">{ROTULO_GRUPO[g].titulo}</h2>
                  <p className="text-xs text-muted-foreground">{ROTULO_GRUPO[g].descricao}</p>
                </header>
                <ul>
                  {itens.map((p) => (
                    <li key={p.codigo} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                      <div className="min-w-[240px] flex-1">
                        <p className="text-sm text-foreground">{p.rotulo}</p>
                        <p className="text-xs text-muted-foreground">{p.ajuda}</p>
                        <Agendados itens={p.agendados} unidade={p.unidade} podeEditar={podeEditar}
                          onExcluir={(id) => excluirAgendada("PARAMETRO", id)} />
                      </div>
                      <span className="w-28 text-right text-sm font-semibold tabular-nums text-foreground">
                        {formatarValor(p.efetivo.valor, p.unidade)}
                      </span>
                      <span className="w-44"><OrigemBadge nivel={p.efetivo.nivel} nivelTela={nivelTela} /></span>
                      <span className="w-9 text-right">
                        {podeEditar && p.editavel_neste_nivel && (
                          <Button size="sm" variant="ghost" aria-label={`Alterar ${p.rotulo}`}
                            onClick={() => setEdicao({
                              tipo: "PARAMETRO", chave: p.codigo, rotulo: p.rotulo, ajuda: p.ajuda, unidade: p.unidade,
                              minimo: p.minimo, maximo: p.maximo,
                              valorEfetivo: p.efetivo.valor, nivelEfetivo: p.efetivo.nivel,
                              valorHerdado: p.herdado.valor, nivelHerdado: p.herdado.nivel,
                              temProprio: p.efetivo.nivel === nivelTela,
                            })}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        {podeEditar && !p.editavel_neste_nivel && (
                          <span title="Esta regra só é definida no nível da empresa." className="inline-flex text-muted-foreground"><Lock size={13} /></span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {/* Regras do sistema */}
          <details className="rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-foreground">
              <ShieldCheck size={16} className="text-muted-foreground" /> Regras do sistema (captura de tempo, só leitura)
            </summary>
            <div className="border-t border-border p-4 text-xs text-muted-foreground space-y-2">
              <p>A captura dos tempos faz parte do núcleo do WMS e vale para todos os clientes. O teto de ciclo é usado só quando uma execução não tem início registrado.</p>
              <table className="w-full">
                <thead><tr className="text-left"><th className="py-1 font-medium">Tipo</th><th className="py-1 font-medium">Captura</th><th className="py-1 font-medium">Teto de ciclo</th><th className="py-1 font-medium">Como o início é registrado</th></tr></thead>
                <tbody>
                  {config.regras_sistema.map((r) => (
                    <tr key={r.tipo_codigo} className="border-t border-border">
                      <td className="py-1 font-mono">{r.tipo_codigo}</td>
                      <td className="py-1">{r.captura_ativa ? "Ativa" : "Desligada"}</td>
                      <td className="py-1">{formatarValor(r.teto_ciclo_seg, "SEGUNDOS")}</td>
                      <td className="py-1">{r.observacao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {/* Histórico */}
          <details className="rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-foreground">
              <History size={16} className="text-muted-foreground" /> Histórico de alterações · {nomeNivel}
            </summary>
            <div className="border-t border-border">
              {config.historico.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">Nenhuma alteração neste nível.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {config.historico.map((h, i) => (
                    <li key={`${h.chave}-${h.vigente_desde}-${i}`} className="px-4 py-2 text-xs">
                      <span className="font-medium text-foreground">{h.rotulo}</span>{" "}
                      <span className="text-muted-foreground">
                        → {h.tipo === "FAIXAS" ? (h.herdar || !h.faixas ? "volta a herdar" : <ChipsFaixas lista={h.faixas} />) : h.valor === null ? "volta a herdar" : h.tipo === "PADRAO_TEMPO" ? descreverPadrao({ tempo_fixo_seg: h.valor, tempo_unidade_seg: h.tempo_unidade_seg ?? 0, pfd_pct: h.pfd_pct ?? 0 }) : formatarValor(h.valor, unidadeDe.get(h.chave) ?? "MULTIPLO")}
                        {h.origem === "CALIBRADO" ? " (calibrado)" : ""}
                        {" "}a partir de {formatDate(h.vigente_desde)} · {h.criado_por ?? "Sistema"} em {formatDateTime(h.criado_em)}
                        {h.motivo ? ` · ${h.motivo}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </>
      )}

      {config && (
        <EditarFaixasDialog
          aberto={editandoFaixas}
          nivelTela={nivelTela}
          atual={config.faixas.efetivo.lista}
          herdado={config.faixas.herdado}
          temProprio={config.faixas.efetivo.nivel === nivelTela}
          hoje={config.hoje}
          podeRetroativo={config.pode_reprocessar}
          salvando={salvando}
          onCancelar={() => setEditandoFaixas(false)}
          onSalvar={salvarFaixas}
        />
      )}

      {config && tenantId && empresaId && (
        <EditarPadraoDialog
          padrao={editandoPadrao}
          nivelTela={nivelTela}
          hoje={config.hoje}
          podeRetroativo={config.pode_reprocessar}
          salvando={salvando}
          contexto={{ tenantId, empresaId, armazemId }}
          onCancelar={() => setEditandoPadrao(null)}
          onSalvar={salvarPadrao}
        />
      )}

      {config && (
        <EditarRegraDialog
          regra={edicao}
          nivelTela={nivelTela}
          hoje={config.hoje}
          podeRetroativo={config.pode_reprocessar}
          salvando={salvando}
          onCancelar={() => setEdicao(null)}
          onSalvar={salvar}
        />
      )}
    </div>
  );
}
