import { formatDate } from "@/utils/dateTime";

interface EvolucaoEntry {
  data: string;
  score: number;
  tarefas: number;
  taxa_ocupacao: number;
}

interface Props {
  evolucao: EvolucaoEntry[];
  faixas: { excelente: number; bom: number; atencao: number };
}

function faixaCor(score: number, faixas: Props["faixas"]): { bar: string; text: string } {
  if (score >= faixas.excelente) return { bar: "bg-green-500/70", text: "text-green-400" };
  if (score >= faixas.bom) return { bar: "bg-blue-500/70", text: "text-blue-400" };
  if (score >= faixas.atencao) return { bar: "bg-yellow-500/70", text: "text-yellow-400" };
  if (score > 0) return { bar: "bg-red-500/70", text: "text-red-400" };
  return { bar: "bg-[hsl(222,35%,22%)]", text: "text-[hsl(213,31%,55%)]" };
}

function fmtData(value: string) {
  const formatted = formatDate(`${value.slice(0, 10)}T12:00:00-03:00`);
  return formatted === "—" ? value : formatted.slice(0, 5);
}

export function MetasEvolucaoTab({ evolucao, faixas }: Props) {
  if (evolucao.length === 0) {
    return <div className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] px-4 py-10 text-center text-sm text-[hsl(213,31%,55%)]">Sem registros de evolução no período.</div>;
  }

  const maxScore = Math.max(1, ...evolucao.map((entry) => entry.score || 0));

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
        <h3 className="mb-4 text-xs font-bold uppercase text-[hsl(213,31%,75%)]">Score diário</h3>
        <div className="flex h-40 items-end gap-1.5 overflow-x-auto pb-1">
          {evolucao.map((entry, index) => {
            const cor = faixaCor(entry.score, faixas);
            const height = Math.max(5, Math.round((entry.score / maxScore) * 112));
            return (
              <div key={`${entry.data}-${index}`} className="flex min-w-8 flex-1 flex-col items-center justify-end gap-1">
                <span className={`text-[9px] font-bold tabular-nums ${cor.text}`}>{entry.score.toFixed(0)}</span>
                <div className={`w-full max-w-10 rounded-t-md transition-[height] duration-500 motion-reduce:transition-none ${cor.bar}`} style={{ height }} />
                <span className="text-[8px] tabular-nums text-[hsl(213,31%,55%)]">{fmtData(entry.data)}</span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
        <h3 className="mb-3 text-xs font-bold uppercase text-[hsl(213,31%,75%)]">Detalhamento diário</h3>
        <div className="space-y-2">
          {[...evolucao].reverse().map((entry, index) => {
            const cor = faixaCor(entry.score, faixas);
            return (
              <div key={`${entry.data}-${index}`} className="flex items-center justify-between rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] p-3">
                <div>
                  <p className="text-sm font-semibold tabular-nums text-white">{fmtData(entry.data)}</p>
                  <p className="text-[10px] text-[hsl(213,31%,55%)]">{entry.tarefas} tarefas · {entry.taxa_ocupacao.toFixed(0)}% ocup.</p>
                </div>
                <span className={`text-base font-bold tabular-nums ${cor.text}`}>{entry.score.toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}