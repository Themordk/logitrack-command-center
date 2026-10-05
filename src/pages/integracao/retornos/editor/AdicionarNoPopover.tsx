import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { GRUPO_NO_UI, TIPO_NO_UI } from "../retornosUi";
import type { Catalogo, TipoNo } from "../retornos.types";
import { filtrarNos } from "./novoNo";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  catalogo?: Catalogo;
  limiteAtingido: boolean;
  onEscolher: (tipo: TipoNo) => void;
  children: ReactNode;
}

export function AdicionarNoPopover({ open, onOpenChange, titulo, catalogo, limiteAtingido, onEscolher, children }: Props) {
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const lista = useMemo(() => filtrarNos(catalogo, busca, true).filter((n) => n.disponivel), [catalogo, busca]);

  const escolher = (tipo: TipoNo) => { onEscolher(tipo); onOpenChange(false); setBusca(""); };

  return (
    <Popover open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setBusca(""); setAtivo(0); } }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="nodrag nopan nowheel w-64 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">{titulo}</div>
        {limiteAtingido ? (
          <p className="flex items-center gap-2 p-3 text-xs text-amber-400">
            <AlertTriangle size={13} aria-hidden /> Limite de {catalogo?.limites.max_nos} nós atingido.
          </p>
        ) : (
          <>
            <div className="relative p-2">
              <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                autoFocus
                aria-label="Buscar nó"
                placeholder="Buscar nó…"
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setAtivo(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => Math.min(a + 1, lista.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
                  else if (e.key === "Enter" && lista[ativo]) { e.preventDefault(); escolher(lista[ativo].tipo); }
                }}
                className="h-8 pl-7 text-xs bg-secondary/40"
              />
            </div>
            <ul role="listbox" aria-label="Tipos de nó" className="max-h-64 overflow-y-auto pb-1">
              {lista.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">Nenhum nó encontrado.</li>}
              {lista.map((n, i) => {
                const ui = TIPO_NO_UI[n.tipo];
                const Icone = ui?.icone ?? AlertTriangle;
                return (
                  <li key={n.tipo} role="option" aria-selected={i === ativo}>
                    <button
                      type="button"
                      onMouseEnter={() => setAtivo(i)}
                      onClick={() => escolher(n.tipo)}
                      className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm", i === ativo && "bg-secondary")}
                    >
                      <Icone size={14} className={GRUPO_NO_UI[ui?.grupo ?? "acao"].icone} aria-hidden />
                      <span className="truncate">{n.nome}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
