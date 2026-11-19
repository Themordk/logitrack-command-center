import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/dateTime";
import { FaixaMetaBadge } from "@/modules/lms/metas/ResultadosMetaDialog";
import {
  ROTULO_PERIODICIDADE, formatarValorMeta, resultadosMeta, type Periodicidade, type PeriodoResultado,
} from "@/modules/lms/metas/metas.service";
import {
  ICONE_TENDENCIA, decompor, obterAtingimento, type FiltrosAtingimento, type MetaAtingimento,
} from "./acompanhamento.service";

/** Cor do quadradinho de cada período, pela faixa do resultado coletivo. */
const COR_FAIXA: Record<string, string> = {
  EXCELENTE: "bg-green-500/80 text-white", NA_META: "bg-blue-500/80 text-white", ACEITAVEL: "bg-amber-500/80 text-white",
  ABAIXO: "bg-red-500/80 text-white", SEM_DADOS: "bg-muted text-muted-foreground", ESTIMADO: "bg-muted text-muted-foreground",
};

interface Props {
  tenantId: string;
  empresaId: string;
  armazens: Array<{ id: string; nome: string }>;
  dataIni: string;
  dataFim: string;
  onNavigate: (path: string) => void;
}

/** Atingimento das metas por período, com a decomposição por operador. */
export function AtingimentoView({ tenantId, empresaId, armazens, dataIni, dataFim, onNavigate }: Props) {
  const [filtros, setFiltros] = useState<FiltrosAtingimento>({});
  const [metas, setMetas] = useState<MetaAtingimento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aberta, setAberta] = useState<MetaAtingimento | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setMetas(await obterAtingimento(tenantId, empresaId, dataIni, dataFim, filtros));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o atingimento.");
    } finally {
      setCarregando(false);
    }
  }, [tenantId, empresaId, dataIni, dataFim, filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-3" data-testid="atingimento">
      <div className="flex flex-wrap items-end gap-3">
        <Filtro rotulo="Armazém" valor={filtros.armazem_id ?? ""} onChange={(v) => setFiltros((f) => ({ ...f, armazem_id: v || null }))}
          opcoes={[{ id: "", nome: "Todos" }, ...armazens]} />
        <Filtro rotulo="Periodicidade" valor={filtros.periodicidade ?? ""}
          onChange={(v) => setFiltros((f) => ({ ...f, periodicidade: (v || null) as Periodicidade | null }))}
          opcoes={[{ id: "", nome: "Todas" }, ...(Object.keys(ROTULO_PERIODICIDADE) as Periodicidade[]).map((p) => ({ id: p, nome: ROTULO_PERIODICIDADE[p] }))]} />
        <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
          <RefreshCw size={14} className={cn("mr-1", carregando && "animate-spin")} /> Atualizar
        </Button>
        <p className="text-xs text-muted-foreground">Resultado coletivo de cada período que começa entre {formatDate(dataIni)} e {formatDate(dataFim)}. Clique na meta para ver quem puxou para cima e para baixo.</p>
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
      {!metas ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Carregando...</div>
      ) : metas.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">Nenhuma meta valeu no período com esses filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Meta</th>
              <th className="px-3 py-2 text-center font-medium">Média</th>
              <th className="px-3 py-2 text-center font-medium">Na meta</th>
              <th className="px-3 py-2 text-center font-medium">Tendência</th>
              <th className="px-3 py-2 text-left font-medium">Períodos</th>
            </tr></thead>
            <tbody>
              {metas.map((m) => {
                const t = ICONE_TENDENCIA[m.tendencia];
                return (
                  <tr key={m.meta_id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => setAberta(m)}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{m.nome}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {[m.rotulo_metrica, ROTULO_PERIODICIDADE[m.periodicidade], m.armazem_nome ?? "Empresa toda", `alvo ${formatarValorMeta(m.alvo, m.unidade)}`,
                          m.status === "ENCERRADA" ? "encerrada" : null].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono">{m.atingimento_medio_pct != null ? `${Number(m.atingimento_medio_pct).toLocaleString("pt-BR")}%` : "—"}</td>
                    <td className="px-3 py-2 text-center font-mono">{m.periodos_na_meta}/{m.qtd_periodos}</td>
                    <td className={cn("px-3 py-2 text-center", t.classe)} title={t.texto}>{t.icone}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {m.periodos.map((p) => (
                          <span key={p.periodo_ref} className={cn("rounded px-1.5 py-0.5 text-[10px] font-mono", COR_FAIXA[p.faixa] ?? COR_FAIXA.SEM_DADOS)}
                            title={`${formatDate(p.periodo_ini)}${p.periodo_fim !== p.periodo_ini ? ` a ${formatDate(p.periodo_fim)}` : ""}: ${formatarValorMeta(p.realizado, m.unidade)} de ${formatarValorMeta(p.alvo, m.unidade)}${p.parcial ? " (parcial)" : ""}`}>
                            {p.periodo_ref.slice(8, 10)}/{p.periodo_ref.slice(5, 7)} {p.atingimento_pct != null ? `${Math.round(Number(p.atingimento_pct))}%` : "—"}
                          </span>
                        ))}
                        {m.periodos.length === 0 && <span className="text-xs text-muted-foreground">sem resultados</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <DecomposicaoDialog tenantId={tenantId} meta={aberta} dataIni={dataIni} dataFim={dataFim} onFechar={() => setAberta(null)} onNavigate={onNavigate} />
    </div>
  );
}

function Filtro({ rotulo, valor, onChange, opcoes }: { rotulo: string; valor: string; onChange: (v: string) => void; opcoes: Array<{ id: string; nome: string }> }) {
  const id = `ating-${rotulo.toLowerCase()}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">{rotulo}</label>
      <select id={id} className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={valor} onChange={(e) => onChange(e.target.value)}>
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </div>
  );
}

function DecomposicaoDialog({ tenantId, meta, dataIni, dataFim, onFechar, onNavigate }: {
  tenantId: string; meta: MetaAtingimento | null; dataIni: string; dataFim: string; onFechar: () => void; onNavigate: (p: string) => void;
}) {
  const [periodos, setPeriodos] = useState<PeriodoResultado[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!meta) return;
    setPeriodos(null); setErro(null);
    resultadosMeta(tenantId, meta.meta_id)
      .then((p) => {
        const doRecorte = p.filter((x) => x.periodo_ini >= dataIni && x.periodo_ini <= dataFim);
        setPeriodos(doRecorte);
        setSel(doRecorte[0]?.periodo_ref ?? null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar a decomposição."));
  }, [meta, tenantId, dataIni, dataFim]);

  const periodo = periodos?.find((p) => p.periodo_ref === sel) ?? null;
  const d = periodo ? decompor(periodo.individuais) : null;

  return (
    <Dialog open={Boolean(meta)} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{meta?.nome}</DialogTitle>
          <DialogDescription>Quem puxou o resultado para cima e para baixo em cada período.</DialogDescription>
        </DialogHeader>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        {!periodos ? <Loader2 size={16} className="animate-spin" /> : periodos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem resultados no período.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {periodos.map((p) => (
                <button key={p.periodo_ref} type="button" onClick={() => setSel(p.periodo_ref)}
                  className={cn("rounded border px-2 py-0.5 text-xs", sel === p.periodo_ref ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>
                  {formatDate(p.periodo_ini)}
                </button>
              ))}
            </div>
            {periodo && d && (
              <>
                <p className="text-sm">
                  Coletivo: <b>{formatarValorMeta(periodo.coletivo.realizado, meta?.unidade)}</b> de {formatarValorMeta(periodo.coletivo.alvo, meta?.unidade)}{" "}
                  <FaixaMetaBadge faixa={periodo.coletivo.faixa} /> · {periodo.coletivo.participantes} operador(es)
                </p>
                <Lista titulo="Puxaram para cima (100% ou mais)" itens={d.acima} unidade={meta?.unidade} onNavigate={onNavigate} />
                <Lista titulo="Puxaram para baixo" itens={d.abaixo} unidade={meta?.unidade} onNavigate={onNavigate} />
                {d.sem_dados.length > 0 && <p className="text-xs text-muted-foreground">Sem dados suficientes: {d.sem_dados.map((i) => i.nome).join(", ")}</p>}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Lista({ titulo, itens, unidade, onNavigate }: {
  titulo: string; itens: PeriodoResultado["individuais"]; unidade: MetaAtingimento["unidade"] | undefined; onNavigate: (p: string) => void;
}) {
  if (itens.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{titulo}</p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {itens.map((i) => (
          <li key={i.usuario_id}>
            <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-muted/40"
              onClick={() => onNavigate(`/atividades/scorecard/${i.usuario_id}`)}>
              <span>{i.nome}{i.oficial ? "" : <span className="ml-1 text-[10px] text-muted-foreground">(outra meta vale para ele)</span>}</span>
              <span className="font-mono text-xs">{formatarValorMeta(i.realizado, unidade)} · {Number(i.atingimento_pct).toLocaleString("pt-BR")}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
