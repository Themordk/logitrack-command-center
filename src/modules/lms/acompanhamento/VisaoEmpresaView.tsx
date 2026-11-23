import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { classificar, estiloCor } from "@/modules/lms/faixas";
import { formatarScore } from "@/modules/lms/score/score.service";
import { obterVisaoEmpresa, type VisaoEmpresa } from "./acompanhamento.service";
import { TermoAjuda } from "@/modules/lms/glossario";

const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const horas = (s: number) => `${(Number(s) / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

interface Props { tenantId: string; empresaId: string; dataIni: string; dataFim: string }

/** Comparativo entre os armazéns da empresa, por performance e score (não por volume bruto, que depende do mix). */
export function VisaoEmpresaView({ tenantId, empresaId, dataIni, dataFim }: Props) {
  const [visao, setVisao] = useState<VisaoEmpresa | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setVisao(null); setErro(null);
    obterVisaoEmpresa(tenantId, empresaId, dataIni, dataFim)
      .then(setVisao)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar a visão da empresa."));
  }, [tenantId, empresaId, dataIni, dataFim]);

  if (erro) return <p className="text-sm text-red-400">{erro}</p>;
  if (!visao) return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Carregando...</div>;

  const cor = (v: number | null) => (v === null ? "text-muted-foreground" : estiloCor(classificar(v, visao.faixas_lista).cor).texto);
  const t = visao.total;
  return (
    <div className="space-y-2" data-testid="visao-empresa">
      <p className="text-xs text-muted-foreground">Ordenado por performance (horas-padrão ÷ tempo em tarefa). O volume aparece só como referência: ele depende do mix de tarefas de cada armazém.</p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Armazém</th>
            <th className="px-3 py-2 text-right font-medium">Operadores</th>
            <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Performance <TermoAjuda termo="performance" /></span></th>
            <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Eficiência <TermoAjuda termo="eficiencia" /></span></th>
            <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Utilização <TermoAjuda termo="utilizacao" /></span></th>
            <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Score das metas <TermoAjuda termo="score" /></span></th>
            <th className="px-3 py-2 text-right font-medium">Metas (média)</th>
            <th className="px-3 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Tempo direto <TermoAjuda termo="tempo_direto" /></span></th>
            <th className="px-3 py-2 text-right font-medium">Tarefas</th>
          </tr></thead>
          <tbody>
            {visao.armazens.map((a) => (
              <tr key={a.armazem_id} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-foreground">
                  {a.armazem}
                  {a.operadores > 0 && a.origem === "ESTIMADO" && <span className="ml-2 text-[10px] text-amber-500" title={`Início real em ${pct(a.pct_inicio_real)} das execuções`}>estimado</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono">{a.operadores}</td>
                <td className={cn("px-3 py-2 text-right font-mono", cor(a.performance_pct))}>{pct(a.performance_pct)}</td>
                <td className={cn("px-3 py-2 text-right font-mono", cor(a.eficiencia_pct))}>{pct(a.eficiencia_pct)}</td>
                <td className="px-3 py-2 text-right font-mono">{pct(a.utilizacao_pct)}</td>
                <td className={cn("px-3 py-2 text-right font-mono", cor(a.score_medio))}>
                  {a.score_medio != null ? formatarScore(a.score_medio) : "—"}
                  {a.operadores_com_score > 0 && <div className="text-[10px] text-muted-foreground">{a.operadores_com_score} com score</div>}
                </td>
                <td className="px-3 py-2 text-right font-mono">{pct(a.atingimento_medio_pct)}{a.metas_com_resultado > 0 && <div className="text-[10px] text-muted-foreground">{a.metas_com_resultado} meta(s)</div>}</td>
                <td className="px-3 py-2 text-right font-mono">{horas(a.tempo_direto)}</td>
                <td className="px-3 py-2 text-right font-mono">{Number(a.tarefas).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30 font-semibold">
              <td className="px-3 py-2">Empresa</td>
              <td className="px-3 py-2 text-right font-mono">{t.operadores}</td>
              <td className={cn("px-3 py-2 text-right font-mono", cor(t.performance_pct))}>{pct(t.performance_pct)}</td>
              <td className={cn("px-3 py-2 text-right font-mono", cor(t.eficiencia_pct))}>{pct(t.eficiencia_pct)}</td>
              <td className="px-3 py-2 text-right font-mono">{pct(t.utilizacao_pct)}</td>
              <td className={cn("px-3 py-2 text-right font-mono", cor(t.score_medio))}>{t.score_medio != null ? formatarScore(t.score_medio) : "—"}</td>
              <td />
              <td className="px-3 py-2 text-right font-mono">{horas(t.tempo_direto)}</td>
              <td className="px-3 py-2 text-right font-mono">{Number(t.tarefas).toLocaleString("pt-BR")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
