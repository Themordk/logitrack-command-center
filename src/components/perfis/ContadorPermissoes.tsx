import { cn } from "@/lib/utils";

/** "12/25 · Parcial": número + texto, para não depender só da cor. */
export function ContadorPermissoes({ marcadas, total }: { marcadas: number; total: number }) {
  const estado = total > 0 && marcadas === total ? "completo" : marcadas === 0 ? "nenhuma" : "parcial";
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-full border",
        estado === "completo" && "bg-green-500/15 text-green-400 border-green-500/30",
        estado === "parcial" && "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
        estado === "nenhuma" && "bg-gray-500/15 text-gray-400 border-gray-500/30",
      )}
      aria-label={`${marcadas} de ${total} permissões concedidas`}
    >
      <span className="font-mono">{marcadas}/{total}</span>
      {" · "}
      {estado === "completo" ? "Completo" : estado === "parcial" ? "Parcial" : "Nenhuma"}
    </span>
  );
}
