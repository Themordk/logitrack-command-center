import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, SlidersHorizontal, History, Info, Loader2, Lock, Pencil, RefreshCw, X } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/utils/dateTime";
import { EditarRegraDialog, type RegraEmEdicao } from "./EditarRegraDialog";
import { EditarFaixasDialog } from "./EditarFaixasDialog";
import { AtividadesIndiretasSection } from "./AtividadesIndiretasSection";
import { TiposTarefaSection } from "./TiposTarefaSection";
import { PrimeirosPassosPanel } from "./PrimeirosPassosPanel";
import { PALETA, intervalos, type FaixaLms } from "../faixas";
import {
  LmsConfigErro, ROTULO_GRUPO, descreverOrigem, descreverPadrao, excluirRegraAgendada, formatarValor, listarArmazens, listarEmpresas, obterConfigLms,
  reprocessarLms, salvarFaixasLms, salvarRegraLms, type ConfigLms, type FaixaEntrada, type GrupoParametro, type NivelRegra,
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

export function LmsConfiguracaoPage({ onNavigate }: { onNavigate?: (path: string) => void } = {}) {
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
  const [reprocessando, setReprocessando] = useState(false);
  // Fase 10.20 (P14): reprocessar fica sempre à mão, não só logo após salvar
  const [reprocessoAberto, setReprocessoAberto] = useState(false);
  const [reprocessoData, setReprocessoData] = useState("");
  const [versaoSaude, setVersaoSaude] = useState(0);

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
      setVersaoSaude((v) => v + 1);
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

  // Fase 10.20 (P11): os parâmetros marcados como avançados no banco ficam num grupo recolhido
  const { basicosPorGrupo, avancadosPorGrupo, totalAvancados } = useMemo(() => {
    const b = new Map<GrupoParametro, ConfigLms["parametros"]>();
    const a = new Map<GrupoParametro, ConfigLms["parametros"]>();
    for (const g of GRUPOS) { b.set(g, []); a.set(g, []); }
    for (const p of config?.parametros ?? []) (p.avancado ? a : b).get(p.grupo)?.push(p);
    return { basicosPorGrupo: b, avancadosPorGrupo: a, totalAvancados: (config?.parametros ?? []).filter((p) => p.avancado).length };
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

  async function reprocessar(desde: string | null = reprocessarDe) {
    if (!tenantId || !desde) return;
    setReprocessando(true);
    try {
      const r = await reprocessarLms(tenantId, desde);
      toast.success(`Reprocessado: ${r.dias} dia(s).`);
      setReprocessarDe(null);
      setReprocessoAberto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reprocessar.");
    } finally {
      setReprocessando(false);
    }
  }

  const podeEditar = !!config?.pode_editar;
  // tempo padrão tem histórico próprio em cada tipo de tarefa (Fase 10.11)
  const historicoGeral = useMemo(() => (config?.historico ?? []).filter((h) => h.tipo !== "PADRAO_TEMPO"), [config]);
  const unidadeDe = useMemo(() => new Map((config?.parametros ?? []).map((p) => [p.codigo, p.unidade])), [config]);

  const linhaParametro = (p: ConfigLms["parametros"][number]) => (
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
  );

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
          {config?.pode_reprocessar && (
            <Button variant="outline" size="sm" onClick={() => { setReprocessoData(reprocessarDe ?? config.hoje); setReprocessoAberto((v) => !v); }}>
              <History size={14} className="mr-1" /> Reprocessar período
            </Button>
          )}
        </div>
        {reprocessoAberto && config?.pode_reprocessar && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/30 p-3" data-testid="lms-reprocessar-periodo">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">Recalcular a partir de</span>
              <input type="date" aria-label="Recalcular a partir de" value={reprocessoData} max={config.hoje}
                onChange={(e) => setReprocessoData(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
            </label>
            <p className="flex-1 min-w-[220px] text-xs text-muted-foreground">
              Recalcula os números de todos os operadores de cada dia, da data escolhida até hoje, com as regras em vigor em cada dia.
              Use depois de mudar uma regra com data no passado.
            </p>
            <Button size="sm" onClick={() => reprocessar(reprocessoData)} disabled={reprocessando || !reprocessoData}>
              {reprocessando && <Loader2 size={14} className="mr-1 animate-spin" />} Reprocessar
            </Button>
          </div>
        )}
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

      {tenantId && empresaId && config && (
        <PrimeirosPassosPanel tenantId={tenantId} empresaId={empresaId} armazemId={armazemId} versao={versaoSaude} onNavigate={onNavigate} />
      )}

      {reprocessarDe && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span>A regra vale desde {formatDate(reprocessarDe)}. Reprocessar os dias a partir dessa data para os números refletirem a mudança?</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setReprocessarDe(null)} disabled={reprocessando}>Agora não</Button>
            <Button size="sm" onClick={() => reprocessar()} disabled={reprocessando}>
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
          {/* Fase 10.11: tipo de tarefa e tempo padrão numa seção só (cadastro + tempo do nível + sem atividade) */}
          {tenantId && empresaId && (
            <TiposTarefaSection tenantId={tenantId} empresaId={empresaId} armazemId={armazemId} nivelTela={nivelTela}
              nomeNivel={nomeNivel} hoje={config.hoje} padroes={config.padroes_tempo} regrasSistema={config.regras_sistema}
              podeRetroativo={config.pode_reprocessar}
              onSalvo={async ({ requerReprocessamento, vigenteDesde }) => {
                if (requerReprocessamento && vigenteDesde && config.pode_reprocessar) setReprocessarDe(vigenteDesde);
                await carregar();
              }}
              onExcluirAgendado={(id) => excluirAgendada("PADRAO_TEMPO", id)} />
          )}

          {/* Atividades indiretas e paradas (catálogo da empresa) */}
          {tenantId && empresaId && (
            <AtividadesIndiretasSection tenantId={tenantId} empresaId={empresaId} nivelTela={nivelTela}
              nomeEmpresa={empresas.find((e) => e.id === empresaId)?.nome ?? "empresa"} />
          )}

          {/* Faixas de classificação */}
          <section id="lms-faixas" className="scroll-mt-20 rounded-lg border border-border bg-card" data-testid="lms-faixas">
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

          {/* Parâmetros por grupo (dia a dia) */}
          {GRUPOS.map((g) => {
            const itens = basicosPorGrupo.get(g) ?? [];
            if (itens.length === 0) return null;
            return (
              <section key={g} className="rounded-lg border border-border bg-card">
                <header className="border-b border-border p-4">
                  <h2 className="text-sm font-semibold text-foreground">{ROTULO_GRUPO[g].titulo}</h2>
                  <p className="text-xs text-muted-foreground">{ROTULO_GRUPO[g].descricao}</p>
                </header>
                <ul>{itens.map(linhaParametro)}</ul>
              </section>
            );
          })}

          {/* Fase 10.20 (P11): parâmetros avançados, recolhidos */}
          {totalAvancados > 0 && (
            <details className="rounded-lg border border-border bg-card" data-testid="lms-parametros-avancados">
              <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-foreground">
                <SlidersHorizontal size={16} className="text-muted-foreground" /> Avançado · {totalAvancados} parâmetro(s)
              </summary>
              <p className="mx-4 mb-3 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                Estes valores mudam como o sistema calcula os números e decide se o dado é confiável. O padrão do sistema serve para
                a maioria das operações: só altere com orientação do suporte.
              </p>
              {GRUPOS.map((g) => {
                const itens = avancadosPorGrupo.get(g) ?? [];
                if (itens.length === 0) return null;
                return (
                  <div key={g} className="border-t border-border">
                    <p className="px-4 pt-3 text-xs font-semibold text-muted-foreground">{ROTULO_GRUPO[g].titulo}</p>
                    <ul>{itens.map(linhaParametro)}</ul>
                  </div>
                );
              })}
            </details>
          )}

          {/* Histórico */}
          <details className="rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-foreground">
              <History size={16} className="text-muted-foreground" /> Histórico de alterações · {nomeNivel}
            </summary>
            <div className="border-t border-border">
              {historicoGeral.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">Nenhuma alteração neste nível.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {historicoGeral.map((h, i) => (
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
