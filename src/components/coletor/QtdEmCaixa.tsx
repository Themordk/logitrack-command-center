interface Props {
  qtd: number;
  fatorCaixa?: number | null;
  size?: "sm" | "md" | "lg";
  align?: "left" | "right" | "center";
  showZero?: boolean;
}

const sizeMap = {
  sm: { main: "text-sm", sub: "text-[10px]" },
  md: { main: "text-base", sub: "text-[11px]" },
  lg: { main: "text-lg", sub: "text-xs" },
};

export function QtdEmCaixa({ qtd, fatorCaixa, size = "md", align = "right", showZero = true }: Props) {
  const s = sizeMap[size];
  const alignClass = align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";
  const fc = Number(fatorCaixa || 0);
  const showCx = fc > 1;
  const cx = showCx ? Math.floor(qtd / fc) : 0;
  const resto = showCx ? qtd % fc : 0;

  if (!showZero && qtd === 0) return null;

  return (
    <div className={alignClass}>
      <p className={`${s.main} font-bold text-white leading-tight`}>{qtd} UN</p>
      {showCx && (
        <p className={`${s.sub} text-[hsl(217,91%,70%)] leading-tight`}>
          = {cx} CX{resto > 0 ? ` + ${resto} UN` : ""}
        </p>
      )}
    </div>
  );
}
