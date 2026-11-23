/**
 * Módulo de Entregas · RN17 — faixa fixa "Nova carga para aceitar" em qualquer tela do coletor.
 * O som e a vibração vêm de useEntregaPendenteAlerta; a faixa só mostra e leva à lista.
 */
import { BellRing } from "lucide-react";
import { useEntregaPendenteAlerta } from "@/hooks/useEntregaPendenteAlerta";
import { textoAlertaEntrega } from "@/lib/entregaExibicao";

interface Props { onNavigate: (path: string) => void }

export const ROTA_ENTREGAS = "/coletor/entregas";

export function EntregaPendenteFaixa({ onNavigate }: Props) {
  const { pendentes } = useEntregaPendenteAlerta();
  if (pendentes.length === 0) return null;
  const naLista = typeof window !== "undefined" && window.location.hash.replace("#", "").split("?")[0] === ROTA_ENTREGAS;
  if (naLista) return null;
  return (
    <div role="alert" className="shrink-0 bg-amber-500 text-[#1a1200] px-3 py-2 flex items-center gap-2">
      <BellRing size={18} className="shrink-0 animate-pulse" aria-hidden="true" />
      <span className="text-sm font-bold flex-1 min-w-0 truncate">
        {textoAlertaEntrega(pendentes.map((p) => p.numero_carga))}
      </span>
      <button
        type="button"
        onClick={() => onNavigate(ROTA_ENTREGAS)}
        className="shrink-0 h-9 px-4 rounded-lg bg-[#1a1200] text-amber-300 text-sm font-bold active:scale-95 transition-transform"
      >
        Ver
      </button>
    </div>
  );
}
