import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { FaixaMetaBadge } from "@/modules/lms/metas/ResultadosMetaDialog";
import { ROTULO_PERIODICIDADE, formatarValorMeta } from "@/modules/lms/metas/metas.service";
import {
  descreverRegraScore, estiloClassificacao, explicacaoSemScore, formatarScore, participacaoPeso, textoSemScore,
  type ClassificacaoScore, type FichaScore, type SituacaoScore,
} from "./score.service";

/** Selo da classificação do score (ou "Sem metas" / "Sem dados"). */
export function ScoreBadge({ classificacao, situacao, className }: {
  classificacao?: ClassificacaoScore | null; situacao?: SituacaoScore | string | null; className?: string;
}) {
  const semScore = !classificacao || classificacao.codigo === "SEM_METAS" || classificacao.codigo === "SEM_DADOS";
  const e = estiloClassificacao(classificacao);
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-px text-[10px] shrink-0", e.fundo, e.texto, e.borda, className)}>
      {semScore ? textoSemScore(situacao ?? classificacao?.codigo) : e.nome}
    </span>
  );
}

/** Score do operador com o detalhe por meta (alvo, realizado, atingimento, faixa e peso). */
export function ScoreDetalhe({ ficha, compacto = false }: { ficha: FichaScore; compacto?: boolean }) {
  const temScore = ficha.score !== null && ficha.score !== undefined;
  const e = estiloClassificacao(ficha.classificacao);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Score global</p>
          <p className={cn("text-3xl font-bold tabular-nums", temScore ? e.texto : "text-muted-foreground")}>
            {temScore ? formatarScore(ficha.score) : "—"}
          </p>
        </div>
        <div className="space-y-1 pb-1">
          <ScoreBadge classificacao={ficha.classificacao} situacao={ficha.situacao} className="text-xs px-2 py-0.5" />
          <p className="text-xs text-muted-foreground">
            {temScore
              ? `Esperado ${formatarScore(ficha.score_esperado)} · ${ficha.metas_contadas} de ${ficha.metas_total} meta(s) contam`
              : explicacaoSemScore(ficha.situacao)}
          </p>
        </div>
        <p className="ml-auto max-w-md text-[11px] text-muted-foreground flex gap-1.5">
          <Info size={12} className="mt-0.5 shrink-0" />{descreverRegraScore(ficha.teto_pct)}
        </p>
      </div>

      {ficha.metricas.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                <th className="px-3 py-2 text-left font-medium">Meta</th>
                <th className="px-3 py-2 text-center font-medium" title="Peso da meta e quanto ela representa no score">Peso</th>
                {!compacto && <th className="px-3 py-2 text-right font-medium" title="Alvo do último período (já com a rampa)">Alvo</th>}
                {!compacto && <th className="px-3 py-2 text-right font-medium" title="Realizado do último período">Realizado</th>}
                <th className="px-3 py-2 text-center font-medium" title="Média do atingimento nos períodos, limitada ao teto">Atingimento</th>
                <th className="px-3 py-2 text-center font-medium">Faixa</th>
              </tr>
            </thead>
            <tbody>
              {ficha.metricas.map((m) => {
                const part = participacaoPeso(m, ficha.peso_total);
                return (
                  <tr key={m.meta_id} className={cn("border-t border-border", !m.conta && "text-muted-foreground")}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{m.nome}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {[m.rotulo_metrica, ROTULO_PERIODICIDADE[m.periodicidade], m.periodos > 1 ? `${m.periodos_contados} de ${m.periodos} períodos` : null]
                          .filter(Boolean).join(" · ")}
                        {m.direcao === "MENOR" && " · menor é melhor"}
                      </div>
                      {m.motivo && <div className="text-[11px] text-amber-500">{m.motivo}</div>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono">
                      {Number(m.peso).toLocaleString("pt-BR")}
                      {part !== null && <div className="text-[10px] text-muted-foreground">{part}% do score</div>}
                    </td>
                    {!compacto && <td className="px-3 py-2 text-right font-mono">{formatarValorMeta(m.ultimo?.alvo, m.unidade ?? undefined)}</td>}
                    {!compacto && (
                      <td className="px-3 py-2 text-right font-mono">
                        {formatarValorMeta(m.ultimo?.realizado, m.unidade ?? undefined)}
                        {m.ultimo?.parcial && <div className="text-[10px] text-muted-foreground">parcial</div>}
                      </td>
                    )}
                    <td className="px-3 py-2 text-center font-mono">
                      {m.atingimento_pct !== null ? formatarScore(m.atingimento_pct) : "—"}
                      {m.limitado && (
                        <div className="text-[10px] text-muted-foreground" title={`Atingimento real ${formatarScore(m.atingimento_bruto_pct)}`}>
                          limitado ({formatarScore(m.atingimento_bruto_pct)})
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center"><FaixaMetaBadge faixa={m.faixa} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
