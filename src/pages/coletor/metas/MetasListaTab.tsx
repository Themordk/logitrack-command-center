import { Target } from "lucide-react";
import { formatarValorMeta, ROTULO_FAIXA, ROTULO_PERIODICIDADE, type FaixaMeta } from "@/modules/lms/metas/metas.service";
import { explicacaoSemScore, formatarScore, type FichaScore } from "@/modules/lms/score/score.service";

/** Cores da faixa da meta no tema escuro do coletor. */
const COR_FAIXA: Record<FaixaMeta, string> = {
  EXCELENTE: "border-green-500/40 bg-green-500/15 text-green-300",
  NA_META: "border-blue-500/40 bg-blue-500/15 text-blue-300",
  ACEITAVEL: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  ABAIXO: "border-red-500/40 bg-red-500/15 text-red-300",
  SEM_DADOS: "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] text-[hsl(213,31%,55%)]",
  ESTIMADO: "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] text-[hsl(213,31%,55%)]",
};

/** Fase 10 · "Minhas metas": cada meta oficial do operador com alvo, realizado, atingimento e faixa. */
export function MetasListaTab({ ficha }: { ficha: FichaScore | null | undefined }) {
  if (!ficha || ficha.metricas.length === 0) {
    return (
      <div className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] px-4 py-10 text-center">
        <Target size={24} className="mx-auto mb-2 text-[hsl(213,31%,55%)]" />
        <p className="text-sm text-[hsl(213,31%,55%)]">Você ainda não tem metas para este período.</p>
      </div>
    );
  }
  const temScore = ficha.score !== null && ficha.score !== undefined;
  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] text-[hsl(213,31%,55%)]">
        {temScore
          ? `${ficha.metas_contadas} de ${ficha.metas_total} meta(s) contam no score · esperado ${formatarScore(ficha.score_esperado)}`
          : explicacaoSemScore(ficha.situacao)}
      </p>
      {ficha.metricas.map((m) => (
        <section key={m.meta_id} className={`rounded-2xl border p-3 ${m.conta ? "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)]" : "border-[hsl(222,35%,18%)] bg-[hsl(222,40%,10%)] opacity-80"}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{m.nome}</p>
              <p className="truncate text-[10px] text-[hsl(213,31%,55%)]">
                {[m.rotulo_metrica, ROTULO_PERIODICIDADE[m.periodicidade], Number(m.peso) !== 1 ? `peso ${Number(m.peso).toLocaleString("pt-BR")}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className="text-xl font-bold tabular-nums text-white">{m.atingimento_pct !== null ? formatarScore(m.atingimento_pct) : "—"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase ${COR_FAIXA[m.faixa]}`}>{ROTULO_FAIXA[m.faixa].texto}</span>
            <span className="text-[11px] tabular-nums text-[hsl(213,31%,75%)]">
              {formatarValorMeta(m.ultimo?.realizado, m.unidade ?? undefined)} de {formatarValorMeta(m.ultimo?.alvo, m.unidade ?? undefined)}
              {m.ultimo?.parcial ? " · parcial" : ""}
            </span>
          </div>
          {m.limitado && <p className="mt-1 text-[10px] text-[hsl(213,31%,55%)]">Conta no máximo {m.teto}% no score (real {formatarScore(m.atingimento_bruto_pct)}).</p>}
          {m.motivo && <p className="mt-1 text-[10px] text-amber-300/80">{m.motivo}</p>}
        </section>
      ))}
    </div>
  );
}
