interface InfoCardProps {
  sku?: string;
  descricao?: string;
  qtdEsperada?: number;
  qtdConferida?: number;
  lastro?: number;
  camada?: number;
  fatorCaixa?: number;
  lote?: string;
  validade?: string;
  children?: React.ReactNode;
}

export function InfoCard({ sku, descricao, qtdEsperada, qtdConferida, lastro, camada, fatorCaixa, lote, validade, children }: InfoCardProps) {
  return (
    <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-2.5 space-y-1.5">
      {sku && (
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-base font-bold text-[hsl(213,31%,91%)]">{sku}</span>
          {qtdEsperada !== undefined && (
            <span className="text-sm text-[hsl(213,31%,55%)]">
              <span className="font-bold text-[hsl(213,31%,91%)]">{qtdConferida ?? 0}</span> / {qtdEsperada}
            </span>
          )}
        </div>
      )}
      {descricao && <p className="text-sm text-[hsl(213,31%,70%)] leading-snug">{descricao}</p>}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {lastro != null && (
          <span className="text-[hsl(213,31%,65%)]">Lastro: <b className="text-white">{lastro}</b></span>
        )}
        {camada != null && (
          <span className="text-[hsl(213,31%,65%)]">Camada: <b className="text-white">{camada}</b></span>
        )}
        {fatorCaixa != null && (
          <span className={Number(fatorCaixa) > 1
            ? "px-1.5 py-0.5 rounded bg-[hsl(217,91%,50%)]/15 border border-[hsl(217,91%,50%)]/40 text-[hsl(217,91%,70%)]"
            : "text-[hsl(213,31%,65%)]"
          }>
            Fator Cx: <b className={Number(fatorCaixa) > 1 ? "text-[hsl(217,91%,80%)]" : "text-white"}>{fatorCaixa}</b>
          </span>
        )}
        {lote && (
          <span className="text-[hsl(213,31%,65%)]">Lote: <b className="text-white">{lote}</b></span>
        )}
        {validade && (
          <span className="text-[hsl(213,31%,65%)]">Val: <b className="text-white">{validade}</b></span>
        )}
      </div>

      {children}
    </div>
  );
}
