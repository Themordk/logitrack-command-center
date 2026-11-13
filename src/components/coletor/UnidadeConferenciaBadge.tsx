import { Boxes } from "lucide-react";
import { rotuloUnidade, type UnidadeConferencia } from "@/lib/unidadeConferencia";

/** Faixa do coletor com a unidade de conferência que o operador está conferindo. */
export function UnidadeConferenciaBadge({ unidade }: { unidade: UnidadeConferencia | null }) {
  if (!unidade) return null;
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 text-xs font-medium"
      role="status" aria-label={rotuloUnidade(unidade)}>
      <Boxes size={14} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{rotuloUnidade(unidade)}</span>
    </div>
  );
}
