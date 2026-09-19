import { Award, Medal, Trophy } from "lucide-react";

interface RankingEntry {
  iniciais: string;
  score: number;
  posicao: number;
  sou_eu: boolean;
}

interface Props {
  ranking: { posicao: number; total_operadores: number; top: RankingEntry[] } | null;
  faixas: { excelente: number; bom: number; atencao: number };
}

function faixaCorScore(score: number, faixas: Props["faixas"]) {
  if (score >= faixas.excelente) return "text-green-400";
  if (score >= faixas.bom) return "text-blue-400";
  if (score >= faixas.atencao) return "text-yellow-400";
  if (score > 0) return "text-red-400";
  return "text-[hsl(213,31%,55%)]";
}

function PosicaoIcon({ posicao }: { posicao: number }) {
  if (posicao === 1) return <Trophy size={18} className="text-amber-400" />;
  if (posicao === 2) return <Medal size={18} className="text-slate-300" />;
  if (posicao === 3) return <Award size={18} className="text-orange-400" />;
  return <span className="w-[18px] text-center text-xs font-bold tabular-nums text-[hsl(213,31%,55%)]">{posicao}º</span>;
}

export function MetasRankingTab({ ranking, faixas }: Props) {
  if (!ranking || ranking.top.length === 0) {
    return <div className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] px-4 py-10 text-center text-sm text-[hsl(213,31%,55%)]">Ranking indisponível para o período selecionado.</div>;
  }

  return (
    <div className="space-y-3">
      <section className="flex items-center justify-between rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
        <div>
          <p className="text-[10px] font-semibold uppercase text-amber-200/70">Sua posição</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-300">{ranking.posicao}º</p>
        </div>
        <div className="text-right">
          <Trophy size={24} className="ml-auto text-amber-400" />
          <p className="mt-1 text-xs text-amber-200/70">de {ranking.total_operadores} operadores</p>
        </div>
      </section>
      <section className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
        <h3 className="mb-3 text-xs font-bold uppercase text-[hsl(213,31%,75%)]">Top operadores</h3>
        <div className="space-y-2">
          {ranking.top.map((operador) => (
            <div key={`${operador.posicao}-${operador.iniciais}`} className={`flex items-center gap-3 rounded-xl border p-3 ${operador.sou_eu ? "border-blue-500/50 bg-blue-500/10" : "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)]"}`}>
              <PosicaoIcon posicao={operador.posicao} />
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${operador.sou_eu ? "bg-blue-500 text-white" : "bg-[hsl(222,35%,22%)] text-[hsl(213,31%,75%)]"}`}>{operador.iniciais}</span>
              <span className="flex-1 text-sm font-semibold text-white">{operador.sou_eu ? "Você" : operador.iniciais}</span>
              <span className={`text-sm font-bold tabular-nums ${faixaCorScore(operador.score, faixas)}`}>{operador.score.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}