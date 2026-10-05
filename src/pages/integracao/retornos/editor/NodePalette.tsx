import { useMemo, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GRUPO_NO_UI, TIPO_NO_UI } from "../retornosUi";
import type { Catalogo, GrupoNo, TipoNo } from "../retornos.types";
import { ehGatilho, filtrarNos } from "./novoNo";

export const MIME_NO = "application/x-retorno-no";
const ORDEM: GrupoNo[] = ["gatilho", "logica", "dados", "acao"];

interface Props {
  catalogo?: Catalogo;
  totalNos: number;
  temGatilho: boolean;
  onAdicionar: (tipo: TipoNo) => void;
}

export function NodePalette({ catalogo, totalNos, temGatilho, onAdicionar }: Props) {
  const [busca, setBusca] = useState("");
  const max = catalogo?.limites.max_nos ?? 0;
  const limite = max > 0 && totalNos >= max;
  const lista = useMemo(() => filtrarNos(catalogo, busca, false), [catalogo, busca]);

  return (
    <aside aria-label="Paleta de nós" className="card-surface flex w-[220px] shrink-0 flex-col min-h-0 overflow-hidden">
      <div className="relative border-b border-border p-2">
        <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Buscar nó" placeholder="Buscar nó…" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-8 pl-7 text-xs bg-secondary/40" />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {ORDEM.map((g) => {
          const itens = lista.filter((n) => (TIPO_NO_UI[n.tipo]?.grupo ?? n.grupo) === g);
          if (!itens.length) return null;
          return (
            <div key={g}>
              <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{GRUPO_NO_UI[g].rotulo}</p>
              <ul className="space-y-0.5">
                {itens.map((n) => {
                  const Icone = TIPO_NO_UI[n.tipo]?.icone ?? AlertTriangle;
                  const bloqueioGatilho = ehGatilho(n.tipo) && temGatilho;
                  const desabilitado = !n.disponivel || limite || bloqueioGatilho;
                  const dica = limite ? `Limite de ${max} nós atingido` : bloqueioGatilho ? "O fluxo só pode ter um gatilho" : n.descricao;
                  return (
                    <li key={n.tipo}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-disabled={desabilitado}
                            draggable={!desabilitado}
                            onDragStart={(e) => { e.dataTransfer.setData(MIME_NO, n.tipo); e.dataTransfer.effectAllowed = "move"; }}
                            onClick={() => { if (!desabilitado) onAdicionar(n.tipo); }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              desabilitado ? "cursor-not-allowed opacity-50" : "cursor-grab hover:bg-secondary/60",
                            )}
                          >
                            <Icone size={14} className={GRUPO_NO_UI[g].icone} aria-hidden />
                            <span className="flex-1 truncate">{n.nome}</span>
                            {!n.disponivel && <Badge variant="outline" className="px-1 py-0 text-[10px]">Em breve</Badge>}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-xs">{dica}</TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className={cn("border-t border-border px-3 py-2 text-xs", limite ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground")}>
        {totalNos} nós de {max}
      </div>
    </aside>
  );
}
