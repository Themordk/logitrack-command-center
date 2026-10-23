import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { quantidadeNaEmbalagem } from "@/lib/transferenciaService";
import type { PickingTransferencia } from "@/types/transferencia";

function PickingResumo({ picking, fator, embalagem }: { picking: PickingTransferencia; fator: number; embalagem: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-mono font-bold text-base text-foreground break-all">{picking.endereco}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Saldo atual: {quantidadeNaEmbalagem(picking.saldo, fator, embalagem)}</span>
        <span>{picking.est_maximo === null ? "Sem limite" : `Cabe: ${picking.cabe === null ? "—" : quantidadeNaEmbalagem(picking.cabe, fator, embalagem)}`}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {picking.e_origem && <Badge variant="outline" className="badge-moving text-[11px]">Você está no picking</Badge>}
        {!picking.utilizavel && <Badge variant="outline" className="badge-blocked text-[11px] whitespace-normal break-all">BLOQUEADO · {picking.situacao}</Badge>}
      </div>
    </div>
  );
}

export function TransferenciaPickingCard({ pickings, fator, embalagem }: { pickings: PickingTransferencia[]; fator: number; embalagem: string }) {
  const [expandido, setExpandido] = useState(false);
  const principal = pickings[0];
  if (!principal) return null;
  return (
    <section aria-label="Endereço de Picking" className="rounded-lg bg-secondary border border-[hsl(var(--status-free)/0.4)] p-3 mb-3 min-w-0">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2">
        <MapPin size={15} className="shrink-0 text-[hsl(var(--status-free))]" /> Endereço de Picking
      </h3>
      <PickingResumo picking={principal} fator={fator} embalagem={embalagem} />
      {pickings.length > 1 && <>
        <Button variant="ghost" type="button" aria-expanded={expandido} aria-controls="transferencia-pickings" onClick={() => setExpandido(v => !v)} className="h-8 px-0 text-xs text-primary">
          {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Ver {pickings.length} pickings
        </Button>
        {expandido && <div id="transferencia-pickings" className="space-y-2">
          {pickings.map(picking => <div key={picking.endereco_id} className="border-t border-border pt-2">
            <PickingResumo picking={picking} fator={fator} embalagem={embalagem} />
          </div>)}
        </div>}
      </>}
    </section>
  );
}