import { useEffect, useMemo } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ArrowRight, CheckCircle } from "lucide-react";
import {
  lerResultado,
  limparSessaoMudanca,
} from "@/modules/coletor/mudanca-picking/mudancaPicking.service";

interface Props { onNavigate: (path: string) => void; }

export function MudancaPickingConcluidoPage({ onNavigate }: Props) {
  const resultado = useMemo(() => lerResultado(), []);

  useEffect(() => {
    if (!resultado) onNavigate("/coletor/movimentos");
  }, [resultado, onNavigate]);

  if (!resultado) return null;

  const { resumo, mapeamentos } = resultado;

  const handleNew = () => {
    limparSessaoMudanca();
    onNavigate("/coletor/movimentos/mudanca-picking/origem");
  };

  const handleMenu = () => {
    limparSessaoMudanca();
    onNavigate("/coletor/movimentos");
  };

  return (
    <ColetorLayout title="Mudança Concluída" onNavigate={onNavigate} showBack={false}>
      <div className="flex flex-col items-center justify-center py-8 gap-4">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle size={48} className="text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Mudança Realizada!</h2>
      </div>

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-white">{resumo.origem}</span>
          <ArrowRight size={14} className="text-[hsl(213,31%,55%)]" />
          <span className="text-xs font-mono text-white">{resumo.destino}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Itens transferidos</span><p className="text-lg font-bold text-green-400">{resumo.itens_movidos}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Quantidade total</span><p className="text-lg font-bold text-green-400">{resumo.quantidade_total}</p></div>
          {resumo.quantidade_bloqueada > 0 && (
            <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Bloqueado transferido</span><p className="text-lg font-bold text-amber-400">{resumo.quantidade_bloqueada}</p></div>
          )}
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Pickings transferidos</span><p className="text-lg font-bold text-green-400">{resumo.mapeamentos_transferidos}</p></div>
          {resumo.mapeamentos_criados > 0 && (
            <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Pickings criados</span><p className="text-lg font-bold text-green-400">{resumo.mapeamentos_criados}</p></div>
          )}
          {resumo.produtos_somente_estoque > 0 && (
            <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Produtos só estoque</span><p className="text-lg font-bold text-[hsl(213,31%,75%)]">{resumo.produtos_somente_estoque}</p></div>
          )}
        </div>
      </div>

      {mapeamentos.length > 0 && (
        <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-4 mt-2 flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold text-[hsl(213,31%,55%)] uppercase tracking-wide">Picking</p>
          {mapeamentos.map((m, i) => (
            <p key={i} className="text-xs text-[hsl(213,31%,75%)]">
              <span className="font-mono text-[hsl(217,91%,60%)]">{m.sku}</span> · {m.tipo_picking}:{" "}
              {m.acao === "CRIAR_PICKING" ? (
                <>novo em <span className="text-white font-mono">{m.endereco_novo}</span></>
              ) : (
                <>
                  <span className="font-mono">{m.endereco_anterior}</span> →{" "}
                  <span className="text-white font-mono">{m.endereco_novo}</span>
                </>
              )}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-4">
        <ActionButton onClick={handleNew}>Nova Mudança</ActionButton>
        <button onClick={handleMenu} className="h-[52px] rounded-xl border border-[hsl(222,35%,22%)] text-[hsl(213,31%,75%)] font-semibold text-base active:bg-[hsl(222,35%,16%)]">
          Voltar ao Menu
        </button>
      </div>
    </ColetorLayout>
  );
}
