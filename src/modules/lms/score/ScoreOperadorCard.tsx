import { useEffect, useState } from "react";
import { Loader2, Target } from "lucide-react";
import { ScoreDetalhe } from "./ScoreDetalhe";
import { obterScoreOperador, type FichaScore } from "./score.service";

interface Props {
  tenantId: string | null | undefined;
  usuarioId: string;
  dataIni: string;
  dataFim: string;
  /** Quando a tela já recebeu a ficha (ex.: scorecard), não busca de novo. */
  ficha?: FichaScore | null;
}

/** Cartão do score global com o detalhe por meta. */
export function ScoreOperadorCard({ tenantId, usuarioId, dataIni, dataFim, ficha: fichaPronta }: Props) {
  const [ficha, setFicha] = useState<FichaScore | null>(fichaPronta ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(!fichaPronta);

  useEffect(() => {
    if (fichaPronta) { setFicha(fichaPronta); setCarregando(false); return; }
    if (!tenantId || !usuarioId) return;
    let vivo = true;
    setCarregando(true);
    setErro(null);
    obterScoreOperador(tenantId, usuarioId, dataIni, dataFim)
      .then((f) => { if (vivo) setFicha(f); })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível calcular o score."); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [tenantId, usuarioId, dataIni, dataFim, fichaPronta]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Score das metas</h3>
      </div>
      {carregando ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Calculando o score...</div>
      ) : erro ? (
        <p className="text-sm text-red-400">{erro}</p>
      ) : ficha ? (
        <ScoreDetalhe ficha={ficha} />
      ) : null}
    </div>
  );
}
