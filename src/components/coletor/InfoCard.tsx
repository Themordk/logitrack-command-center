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
    <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 space-y-2">
      {sku && (
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-lg font-bold text-[hsl(213,31%,91%)]">{sku}</span>
          {qtdEsperada !== undefined && (
            <span className="text-sm text-[hsl(213,31%,55%)]">
              <span className="font-bold text-[hsl(213,31%,91%)]">{qtdConferida ?? 0}</span> / {qtdEsperada}
            </span>
          )}
        </div>
      )}
      {descricao && <p className="text-base text-[hsl(213,31%,70%)] leading-snug">{descricao}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[hsl(213,31%,55%)]">
        {lastro != null && <span>Lastro: <b className="text-[hsl(213,31%,80%)]">{lastro}</b></span>}
        {camada != null && <span>Camada: <b className="text-[hsl(213,31%,80%)]">{camada}</b></span>}
        {fatorCaixa != null && <span>Fator Cx: <b className="text-[hsl(213,31%,80%)]">{fatorCaixa}</b></span>}
        {lote && <span>Lote: <b className="text-[hsl(213,31%,80%)]">{lote}</b></span>}
        {validade && <span>Val: <b className="text-[hsl(213,31%,80%)]">{validade}</b></span>}
      </div>
      {children}
    </div>
  );
}
