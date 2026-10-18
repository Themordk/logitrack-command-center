interface Props { etapa: 1 | 2 | 3; }

export function EtapaIndicador({ etapa }: Props) {
  return (
    <div className="flex gap-1 -mx-3 -mt-3 shrink-0" role="progressbar" aria-label={`Etapa ${etapa} de 3`} aria-valuemin={1} aria-valuemax={3} aria-valuenow={etapa}>
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="flex-1 h-[3px]"
          style={{ backgroundColor: n < etapa ? "#22C55E" : n === etapa ? "hsl(217,91%,60%)" : "hsl(222,35%,22%)" }}
        />
      ))}
    </div>
  );
}
