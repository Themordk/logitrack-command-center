import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FaixaMetaBadge } from "@/modules/lms/metas/ResultadosMetaDialog";
import { formatarValorMeta } from "@/modules/lms/metas/metas.service";
import { ScoreBadge } from "@/modules/lms/score/ScoreDetalhe";
import { formatarScore, textoSemScore } from "@/modules/lms/score/score.service";
import {
  ROTULO_STATUS_OPERADOR, obterPainelTurno, semaforo, tempoDesde, type PainelTurno,
} from "./acompanhamento.service";
import { TermoAjuda } from "@/modules/lms/glossario";

const ATUALIZAR_MS = 60_000;
const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

interface Props {
  tenantId: string;
  armazemId: string;
  onNavigate: (path: string) => void;
}

/** Painel do turno: metas do dia com projeção e operadores com status ao vivo. Atualiza a cada minuto. */
export function PainelTurnoView({ tenantId, armazemId, onNavigate }: Props) {
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [painel, setPainel] = useState<PainelTurno | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setPainel(await obterPainelTurno(tenantId, armazemId, turnoId));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, [tenantId, armazemId, turnoId]);

  useEffect(() => {
    carregar();
    const id = window.setInterval(carregar, ATUALIZAR_MS);
    return () => window.clearInterval(id);
  }, [carregar]);

  if (!painel) {
    return erro ? <p className="text-sm text-red-400">{erro}</p>
      : <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Carregando o painel...</div>;
  }
  const r = painel.resumo;
  const frac = Math.round((painel.turno.fracao_decorrida ?? 0) * 100);

  return (
    <div className="space-y-4" data-testid="painel-turno">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="painel-turno" className="text-xs text-muted-foreground">Turno</label>
          <select id="painel-turno" className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={turnoId ?? ""} onChange={(e) => setTurnoId(e.target.value || null)}>
            <option value="">Turno atual</option>
            {painel.turnos.map((t) => <option key={t.id} value={t.id}>{t.descricao} ({t.hora_inicio.slice(0, 5)}–{t.hora_fim.slice(0, 5)})</option>)}
          </select>
        </div>
        <div className="min-w-[240px] flex-1 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span><Clock size={12} className="mr-1 inline" />{painel.turno.descricao} · {hora(painel.turno.inicio)} às {hora(painel.turno.fim)}</span>
            <span>{frac}% do turno</span>
          </div>
          <div className="h-2 rounded-full bg-muted/60 overflow-hidden" role="progressbar" aria-valuenow={frac} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary" style={{ width: `${frac}%` }} />
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Números de {hora(painel.atualizado_em)} · atualiza a cada minuto
        </div>
        <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
          <RefreshCw size={14} className={cn("mr-1", carregando && "animate-spin")} /> Atualizar
        </Button>
      </div>
      {erro && <p className="text-xs text-red-400">{erro}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi rotulo="Operadores" valor={String(r.operadores)} sub={`${r.em_tarefa} em tarefa${r.tarefa_parada ? ` · ${r.tarefa_parada} parada` : ""} · ${r.sem_tarefa} sem tarefa`} />
        <Kpi rotulo="Atividade indireta" valor={String(r.indireta)} sub={`${r.sem_sessao} sem sessão`} />
        <Kpi rotulo="Tarefas no dia" valor={r.tarefas.toLocaleString("pt-BR")} sub={`${Number(r.quantidade).toLocaleString("pt-BR")} unidades`} />
        <Kpi rotulo="Utilização" valor={pct(r.utilizacao_pct)} sub={`performance ${pct(r.performance_pct)}`} />
        <Kpi rotulo="Score das metas · média do dia" valor={r.score_medio != null ? formatarScore(r.score_medio) : "—"} sub={`esperado ${pct(painel.score_esperado)}`} />
        <Kpi rotulo="Metas do dia" valor={`${r.metas_no_caminho}/${r.metas}`} sub={r.metas_em_risco ? `${r.metas_em_risco} em risco` : "no caminho"} />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Metas do dia e projeção para o fim do turno</h3>
        {painel.metas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhuma meta diária vale hoje neste armazém. Cadastre em LMS › Metas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Meta</th>
                <th className="px-3 py-2 text-right font-medium">Realizado</th>
                <th className="px-3 py-2 text-right font-medium" title="Volume: ritmo atual até o fim do turno. Taxas: valor atual mantido.">Projeção</th>
                <th className="px-3 py-2 text-right font-medium">Alvo</th>
                <th className="px-3 py-2 text-center font-medium">Agora</th>
                <th className="px-3 py-2 text-center font-medium">Fim do turno</th>
              </tr></thead>
              <tbody>
                {painel.metas.map((m) => {
                  const s = semaforo(m.faixa_projetada);
                  return (
                    <tr key={m.meta_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{m.nome}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {[m.rotulo_metrica, m.escopo, `${m.participantes} operador(es)`].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatarValorMeta(m.realizado, m.unidade)}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {m.projecao != null ? formatarValorMeta(m.projecao, m.unidade) : <span className="text-xs text-muted-foreground">cedo para projetar</span>}
                        {m.atingimento_projetado_pct != null && <div className="text-[10px] text-muted-foreground">{pct(m.atingimento_projetado_pct)} do alvo</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatarValorMeta(m.alvo, m.unidade)}</td>
                      <td className="px-3 py-2 text-center"><FaixaMetaBadge faixa={m.faixa_atual} /></td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center gap-1.5 text-xs" title={s.texto}>
                          <span className={cn("h-2.5 w-2.5 rounded-full", s.cor)} aria-hidden />{s.texto}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card">
        <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-foreground"><Users size={16} /> Operadores</h3>
        {painel.operadores.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum operador com sessão ou atividade hoje neste turno.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Operador</th>
                <th className="px-3 py-2 text-left font-medium">Agora</th>
                <th className="px-3 py-2 text-right font-medium">Tarefas</th>
                <th className="px-3 py-2 text-right font-medium">Unidades</th>
                <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Utilização <TermoAjuda termo="utilizacao" /></span></th>
                <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Performance <TermoAjuda termo="performance" /></span></th>
                <th className="px-3 py-2 text-center font-medium"><span className="inline-flex items-center gap-1">Score das metas (dia) <TermoAjuda termo="score" /></span></th>
              </tr></thead>
              <tbody>
                {painel.operadores.map((o) => {
                  const st = ROTULO_STATUS_OPERADOR[o.status] ?? ROTULO_STATUS_OPERADOR.SEM_SESSAO;
                  const detalhe = o.status === "INDIRETA" && o.indireta ? o.indireta.atividade
                    : o.tarefa ? (o.status === "TAREFA_PARADA" ? `${o.tarefa.tipo ?? "tarefa"} sem atividade` : o.tarefa.tipo)
                    : null;
                  return (
                    <tr key={o.usuario_id} className="border-t border-border hover:bg-muted/30 cursor-pointer"
                      onClick={() => onNavigate(`/atividades/scorecard/${o.usuario_id}`)} title="Abrir a ficha do operador">
                      <td className="px-3 py-2 font-medium text-foreground">{o.nome}</td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px]", st.classe)}>{st.texto}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">{[detalhe, o.status_desde ? `há ${tempoDesde(o.status_desde)}` : null].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{o.tarefas}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(o.quantidade).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right font-mono">{pct(o.utilizacao_pct)}</td>
                      <td className="px-3 py-2 text-right font-mono">{pct(o.performance_pct)}{o.origem === "ESTIMADO" && <span className="ml-1 text-[10px] text-amber-500">est.</span>}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="mr-2 font-mono">{o.score != null ? formatarScore(o.score) : textoSemScore(o.score_situacao)}</span>
                        {o.score != null && <ScoreBadge classificacao={o.classificacao} situacao={o.score_situacao} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
