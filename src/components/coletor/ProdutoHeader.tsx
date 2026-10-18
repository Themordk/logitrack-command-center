import type { OcorrenciaContexto } from "@/components/ocorrencia/RegistrarOcorrenciaModal";
import { OcorrenciaIconButton } from "./OcorrenciaIconButton";

interface Props {
  sku?: string;
  descricao: string;
  restante: number;
  fatorCaixa?: number | null;
  linhas?: 1 | 2;
  onOcorrencia?: OcorrenciaContexto;
}

export function ProdutoHeader({ sku, descricao, restante, fatorCaixa, linhas = 2, onOcorrencia }: Props) {
  const fc = Number(fatorCaixa || 0);
  const cx = fc > 1 ? Math.floor(restante / fc) : 0;
  const resto = fc > 1 ? restante % fc : 0;
  return (
    <div className="rounded-[10px] bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] px-2.5 py-2 flex items-center gap-2 shrink-0">
      <div className="flex-1 min-w-0">
        {sku && <p className="font-mono text-[11px] text-[hsl(217,91%,65%)] leading-tight">{sku}</p>}
        <p className={`text-[13px] font-bold text-white leading-snug ${linhas === 1 ? "line-clamp-1" : "line-clamp-2"}`}>{descricao}</p>
      </div>
      <div className="text-right shrink-0">
        <span className="block text-[10px] uppercase text-[hsl(213,31%,55%)] leading-tight">Restante</span>
        <span className="block text-lg font-bold leading-tight text-[hsl(45,93%,50%)]">{restante} UN</span>
        {fc > 1 && (
          <span className="block text-[10px] text-[hsl(217,91%,70%)] leading-tight">= {cx} CX{resto > 0 ? ` + ${resto} UN` : ""}</span>
        )}
      </div>
      {onOcorrencia && <OcorrenciaIconButton contexto={onOcorrencia} />}
    </div>
  );
}
