interface Props {
  tipoEntrada: string | null;
  prioridade: string | null;
  devolucao: boolean;
  crossdocking: boolean;
}

export function MovimentoEntradaChips({ tipoEntrada, prioridade, devolucao, crossdocking }: Props) {
  if (!(tipoEntrada || prioridade === "URGENTE" || prioridade === "ALTA" || devolucao || crossdocking)) return null;
  return (
    <div className="flex items-center gap-1.5 mb-1 min-w-0">
      {tipoEntrada && (
        <span className="text-xs text-[hsl(213,31%,70%)] truncate min-w-0">{tipoEntrada}</span>
      )}
      {prioridade === "URGENTE" && (
        <span className="shrink-0 text-[10px] uppercase rounded-full px-2 py-0.5 bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30">Urgente</span>
      )}
      {prioridade === "ALTA" && (
        <span className="shrink-0 text-[10px] uppercase rounded-full px-2 py-0.5 bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30">Alta</span>
      )}
      {devolucao && (
        <span className="shrink-0 text-[10px] uppercase rounded-full px-2 py-0.5 bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/30">Devolução</span>
      )}
      {crossdocking && (
        <span className="shrink-0 text-[10px] uppercase rounded-full px-2 py-0.5 bg-[#22D3EE]/15 text-[#22D3EE] border border-[#22D3EE]/30">Crossdocking</span>
      )}
    </div>
  );
}
