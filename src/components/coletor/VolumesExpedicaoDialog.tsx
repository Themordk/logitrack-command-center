import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { ActionButton } from "./ActionButton";

/** Pedido da onda devolvido pelo servidor quando pede quantidade por pedido. */
export interface PedidoVolume {
  documento_saida_id: string;
  numero_pedido: number | null;
  parceiro_nome: string | null;
}

export interface QuantidadePedido {
  documento_saida_id: string;
  quantidade: number;
}

interface Props {
  open: boolean;
  /** "Separação" ou "Conferência" — só para o texto. */
  etapa: string;
  saving: boolean;
  /** Quantidade única (onda com 1 pedido). */
  quantidade: string;
  onQuantidadeChange: (v: string) => void;
  /** Preenchido quando o servidor responde INFORMAR_VOLUMES_POR_PEDIDO (onda com 2+ pedidos). */
  pedidos: PedidoVolume[] | null;
  onConfirmarUnico: () => void;
  onConfirmarPorPedido: (itens: QuantidadePedido[]) => void;
}

const inputClass =
  "w-full h-14 px-4 rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] text-white text-2xl font-bold text-center outline-none focus:border-[hsl(217,91%,50%)]";

const valido = (v: string) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 999;

/**
 * Diálogo de volumes de expedição do coletor (Separação/Conferência).
 * Onda com 1 pedido: uma quantidade. Onda com 2+ pedidos: uma quantidade por
 * pedido — cada volume pertence a um único pedido (decisão D1).
 */
export function VolumesExpedicaoDialog({
  open, etapa, saving, quantidade, onQuantidadeChange, pedidos, onConfirmarUnico, onConfirmarPorPedido,
}: Props) {
  const [porPedido, setPorPedido] = useState<Record<string, string>>({});

  useEffect(() => {
    if (pedidos) setPorPedido(Object.fromEntries(pedidos.map((p) => [p.documento_saida_id, ""])));
  }, [pedidos]);

  if (!open) return null;

  const multi = !!pedidos && pedidos.length > 1;
  const todosValidos = multi && pedidos!.every((p) => valido(porPedido[p.documento_saida_id] ?? ""));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="volumes-exp-titulo">
      <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-blue-500/15 flex items-center justify-center">
            <Package size={24} className="text-[hsl(217,91%,60%)]" aria-hidden="true" />
          </div>
          <h3 id="volumes-exp-titulo" className="text-base font-bold text-white text-center">Volumes de Expedição</h3>
          <p className="text-sm text-[hsl(213,31%,65%)] text-center">
            {multi
              ? `Esta onda tem ${pedidos!.length} pedidos. Cada volume pertence a um pedido: informe quantos volumes cada pedido gerou.`
              : `${etapa} finalizada! Informe a quantidade de volumes gerados para esta onda.`}
          </p>
        </div>

        {multi ? (
          <div className="space-y-3">
            {pedidos!.map((p) => (
              <div key={p.documento_saida_id}>
                <label htmlFor={`vol-${p.documento_saida_id}`} className="text-sm text-white font-semibold block">
                  Pedido {p.numero_pedido ?? "—"}
                </label>
                {p.parceiro_nome && (
                  <span className="text-xs text-[hsl(213,31%,65%)] block mb-1 truncate">{p.parceiro_nome}</span>
                )}
                <input
                  id={`vol-${p.documento_saida_id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  value={porPedido[p.documento_saida_id] ?? ""}
                  onChange={(e) => setPorPedido((s) => ({ ...s, [p.documento_saida_id]: e.target.value }))}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
            ))}
            <ActionButton
              onClick={() => onConfirmarPorPedido(pedidos!.map((p) => ({
                documento_saida_id: p.documento_saida_id,
                quantidade: Number(porPedido[p.documento_saida_id]),
              })))}
              disabled={!todosValidos}
              loading={saving}
              variant="success"
            >
              Confirmar Volumes
            </ActionButton>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="volumes-exp-qtd" className="text-xs text-[hsl(213,31%,65%)] mb-1 block uppercase font-medium">
                Quantidade de volumes
              </label>
              <input
                id="volumes-exp-qtd"
                type="number"
                inputMode="numeric"
                value={quantidade}
                onChange={(e) => onQuantidadeChange(e.target.value)}
                className={inputClass}
                placeholder="0"
                min={1}
                max={999}
                autoFocus
              />
            </div>
            <ActionButton onClick={onConfirmarUnico} disabled={!valido(quantidade)} loading={saving} variant="success">
              Confirmar Volumes
            </ActionButton>
          </>
        )}
      </div>
    </div>
  );
}
