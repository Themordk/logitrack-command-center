import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/dateTime";
import {
  ROTULO_FAIXA, formatarValorMeta, resultadosMeta, type FaixaMeta, type Meta, type PeriodoResultado, type UnidadeMetrica,
} from "./metas.service";

export function FaixaMetaBadge({ faixa }: { faixa: FaixaMeta }) {
  const f = ROTULO_FAIXA[faixa];
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", f.classe)}>{f.texto}</span>;
}

interface Props {
  meta: Meta | null;
  unidade: UnidadeMetrica | undefined;
  tenantId: string;
  onFechar: () => void;
}

export function ResultadosMetaDialog({ meta, unidade, tenantId, onFechar }: Props) {
  const [periodos, setPeriodos] = useState<PeriodoResultado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    if (!meta) return;
    setPeriodos(null);
    setErro(null);
    resultadosMeta(tenantId, meta.id)
      .then((p) => { setPeriodos(p); setAberto(p[0]?.periodo_ref ?? null); })
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar os resultados."));
  }, [meta, tenantId]);

  if (!meta) return null;
  const fmt = (v: number | null | undefined) => formatarValorMeta(v, unidade);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{meta.nome}</DialogTitle>
          <DialogDescription>
            Resultado por período. A estrela marca a meta que vale para o operador quando ele está em mais de uma da mesma métrica.
          </DialogDescription>
        </DialogHeader>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {!periodos && !erro && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>}
        {periodos?.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há resultado: a meta começa a ser apurada no primeiro dia de vigência.</p>}
        <ul className="divide-y divide-border rounded-md border border-border" data-testid="meta-resultados">
          {periodos?.map((p) => (
            <li key={p.periodo_ref}>
              <button type="button" onClick={() => setAberto(aberto === p.periodo_ref ? null : p.periodo_ref)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/30">
                {aberto === p.periodo_ref ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="w-44 text-foreground">
                  {p.periodo_ini === p.periodo_fim ? formatDate(p.periodo_ini) : `${formatDate(p.periodo_ini)} a ${formatDate(p.periodo_fim)}`}
                  {p.parcial && <span className="ml-1 text-[11px] text-muted-foreground">(em andamento)</span>}
                </span>
                <span className="w-24 text-right font-semibold tabular-nums">{fmt(p.coletivo.realizado)}</span>
                <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">alvo {fmt(p.coletivo.alvo)}</span>
                <span className="w-16 text-right text-xs tabular-nums">{p.coletivo.atingimento_pct != null ? `${p.coletivo.atingimento_pct}%` : "—"}</span>
                <FaixaMetaBadge faixa={p.coletivo.faixa} />
                <span className="ml-auto text-xs text-muted-foreground">{p.coletivo.participantes} operador(es)</span>
              </button>
              {aberto === p.periodo_ref && (
                <table className="w-full border-t border-border text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Operador</th>
                      <th className="px-3 py-1.5 text-right font-medium">Realizado</th>
                      <th className="px-3 py-1.5 text-right font-medium">Alvo</th>
                      <th className="px-3 py-1.5 text-right font-medium">Atingimento</th>
                      <th className="px-3 py-1.5 text-left font-medium">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.individuais.map((r) => (
                      <tr key={r.usuario_id} className={cn("border-t border-border", !r.oficial && "opacity-60")}>
                        <td className="px-3 py-1.5">
                          {r.oficial && <Star size={11} className="mr-1 inline text-amber-500" aria-label="Meta que vale para o operador" />}
                          {r.nome}
                          {r.semana_rampa != null && <span className="ml-1 text-[10px] text-muted-foreground">rampa · semana {r.semana_rampa}</span>}
                          {!r.oficial && <span className="ml-1 text-[10px] text-muted-foreground">(vale outra meta mais específica)</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.realizado)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.alvo)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.atingimento_pct != null ? `${r.atingimento_pct}%` : "—"}</td>
                        <td className="px-3 py-1.5"><FaixaMetaBadge faixa={r.faixa} /></td>
                      </tr>
                    ))}
                    {p.individuais.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-2 text-muted-foreground">Nenhum operador com atividade no período.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
