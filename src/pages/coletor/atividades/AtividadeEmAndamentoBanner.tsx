import { useEffect, useState } from "react";
import { Coffee, Loader2, PauseCircle, Square } from "lucide-react";
import { formatarDecorrido, segundosDesde, type ApontamentoAberto } from "./atividadesIndiretas.service";

interface Props {
  aberto: ApontamentoAberto;
  recebidoEm: number;
  encerrando: boolean;
  onEncerrar: () => void;
  onAbrir?: () => void;
}

/** Faixa fixa que lembra o operador de encerrar a atividade indireta / parada. */
export function AtividadeEmAndamentoBanner({ aberto, recebidoEm, encerrando, onEncerrar, onAbrir }: Props) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(iv);
  }, []);

  const parada = aberto.tipo === "EXCECAO";
  const decorrido = segundosDesde(aberto, recebidoEm, agora);

  return (
    <div
      data-testid="coletor-atividade-aberta"
      className={`flex items-center gap-2 rounded-2xl border p-2.5 ${parada
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-cyan-500/40 bg-cyan-500/10"}`}
    >
      <button type="button" onClick={onAbrir} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {parada ? <PauseCircle size={22} className="shrink-0 text-amber-400" /> : <Coffee size={22} className="shrink-0 text-cyan-400" />}
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{aberto.nome}</span>
          <span className="block text-[11px] text-[hsl(213,31%,70%)]">
            {parada ? "Parada" : "Atividade indireta"} há {formatarDecorrido(decorrido)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onEncerrar}
        disabled={encerrando}
        className="flex h-12 min-w-[96px] items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-bold text-white active:scale-[0.97] disabled:opacity-50"
      >
        {encerrando ? <Loader2 size={16} className="animate-spin" /> : <Square size={14} />} Encerrar
      </button>
    </div>
  );
}
