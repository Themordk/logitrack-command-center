import { AlertTriangle } from "lucide-react";
import { formatarNumero, nivelCapacidade } from "@/lib/cargaExibicao";

interface Medida {
  rotulo: string;
  usado: number;
  limite: number | null | undefined;
  unidade: string;
  casas?: number;
}

const COR_BARRA = {
  "sem-limite": "bg-muted-foreground/40",
  ok: "bg-green-500",
  alerta: "bg-yellow-500",
  excedido: "bg-red-500",
} as const;

/** Barras de ocupação do veículo (peso, m³, paletes). O limite vem do cadastro de veículos. */
export function CapacidadeVeiculo({ medidas }: { medidas: Medida[] }) {
  return (
    <div className="space-y-2.5">
      {medidas.map((m) => {
        const pct = m.limite && m.limite > 0 ? (m.usado / m.limite) * 100 : null;
        const nivel = nivelCapacidade(pct);
        return (
          <div key={m.rotulo}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">{m.rotulo}</span>
              <span className={`font-mono ${nivel === "excedido" ? "text-red-400 font-semibold" : "text-foreground"}`}>
                {nivel === "excedido" && <AlertTriangle size={11} className="inline mr-1 -mt-0.5" aria-hidden="true" />}
                {formatarNumero(m.usado, m.casas ?? 0)}
                {m.limite ? ` / ${formatarNumero(m.limite, m.casas ?? 0)} ${m.unidade}` : ` ${m.unidade} · sem limite cadastrado`}
                {pct !== null && ` (${formatarNumero(pct)}%)`}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full bg-secondary overflow-hidden"
              role="progressbar"
              aria-label={`Ocupação de ${m.rotulo.toLowerCase()}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct === null ? undefined : Math.round(Math.min(pct, 100))}
            >
              <div className={`h-full ${COR_BARRA[nivel]} transition-all`} style={{ width: `${pct === null ? 0 : Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
