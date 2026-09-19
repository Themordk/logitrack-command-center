interface Indicadores {
  tempo_produtivo: number;
  tempo_transito: number;
  tempo_ocioso: number;
  dias_trabalhados: number;
}

interface DetalheTipo {
  tipo: string;
  codigo: string;
  tarefas: number;
  quantidade_total: number;
  tempo_medio_seg: number;
  performance_pct: number | null;
}

interface Props {
  indicadores: Indicadores;
  detalhamento: DetalheTipo[];
  faixas: { excelente: number; bom: number; atencao: number };
}

function formatTempo(seg: number): string {
  if (seg <= 0) return "0min";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function perfColor(pct: number | null, faixas: Props["faixas"]): string {
  if (pct === null || pct === undefined) return "bg-[hsl(222,35%,18%)] text-[hsl(213,31%,55%)]";
  if (pct >= faixas.excelente) return "bg-green-500/15 text-green-400";
  if (pct >= faixas.bom) return "bg-blue-500/15 text-blue-400";
  if (pct >= faixas.atencao) return "bg-yellow-500/15 text-yellow-400";
  return "bg-red-500/15 text-red-400";
}

export function MetasResumoTab({ indicadores, detalhamento, faixas }: Props) {
  const total = indicadores.tempo_produtivo + indicadores.tempo_transito + indicadores.tempo_ocioso;
  const pct = (value: number) => (total > 0 ? (value / total) * 100 : 0);
  const tempos = [
    { label: "Produtivo", value: indicadores.tempo_produtivo, dot: "bg-green-500", text: "text-green-400" },
    { label: "Trânsito", value: indicadores.tempo_transito, dot: "bg-blue-500", text: "text-blue-400" },
    { label: "Ocioso", value: indicadores.tempo_ocioso, dot: "bg-yellow-500", text: "text-yellow-400" },
  ];

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
        <h3 className="mb-3 text-xs font-bold uppercase text-[hsl(213,31%,75%)]">Distribuição de tempos</h3>
        <div className="flex h-3 overflow-hidden rounded-full bg-[hsl(222,35%,18%)]">
          <div className="bg-green-500 transition-all" style={{ width: `${pct(indicadores.tempo_produtivo)}%` }} />
          <div className="bg-blue-500 transition-all" style={{ width: `${pct(indicadores.tempo_transito)}%` }} />
          <div className="bg-yellow-500 transition-all" style={{ width: `${pct(indicadores.tempo_ocioso)}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1">
          {tempos.map((tempo) => (
            <div key={tempo.label} className="text-center">
              <div className="flex items-center justify-center gap-1 text-[9px] text-[hsl(213,31%,55%)]">
                <span className={`h-1.5 w-1.5 rounded-full ${tempo.dot}`} />{tempo.label}
              </div>
              <p className={`mt-1 text-xs font-bold tabular-nums ${tempo.text}`}>{formatTempo(tempo.value)}</p>
              <p className="text-[9px] tabular-nums text-[hsl(213,31%,55%)]">{pct(tempo.value).toFixed(0)}%</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
        <h3 className="mb-3 text-xs font-bold uppercase text-[hsl(213,31%,75%)]">Por tipo de tarefa</h3>
        {detalhamento.length === 0 ? (
          <p className="py-6 text-center text-xs text-[hsl(213,31%,55%)]">Nenhuma tarefa concluída no período.</p>
        ) : (
          <div className="space-y-2">
            {detalhamento.map((item, index) => (
              <div key={`${item.codigo}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{item.tipo}</p>
                  <p className="mt-0.5 text-[10px] text-[hsl(213,31%,55%)]">
                    {item.tarefas} tarefas · {item.quantidade_total} un · {formatTempo(item.tempo_medio_seg)} médio
                  </p>
                </div>
                <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold tabular-nums ${perfColor(item.performance_pct, faixas)}`}>
                  {item.performance_pct === null ? "—" : `${item.performance_pct.toFixed(0)}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="text-center text-[10px] text-[hsl(213,31%,55%)]">
        {indicadores.dias_trabalhados} dias com tarefas avaliadas no período
      </p>
    </div>
  );
}