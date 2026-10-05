import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, History, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { parseError } from "@/lib/errorMapper";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";
import { retornosKeys } from "../retornosKeys";
import { versoesFluxo } from "../retornosService";
import type { VersaoFluxo } from "../retornos.types";

interface Props {
  aberto: boolean;
  fluxoId: string;
  selecionada: number | null;
  onFechar: () => void;
  onVisualizar: (v: VersaoFluxo) => void;
}

export function VersoesSheet({ aberto, fluxoId, selecionada, onFechar, onVisualizar }: Props) {
  const q = useQuery({ queryKey: retornosKeys.versoes(fluxoId), queryFn: () => versoesFluxo(fluxoId), enabled: aberto });
  return (
    <Sheet open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="text-sm">Versões</SheetTitle>
          <SheetDescription className="text-xs">Clique numa versão para ver como ela era.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="p-3">
            {q.isLoading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Carregando…</p>}
            {q.error && (
              <div className="card-surface border-destructive/40 flex flex-col items-start gap-2 p-3 text-xs">
                <span className="flex items-center gap-1.5 text-rose-400"><AlertTriangle size={13} /> {parseError(q.error, "Carregar versões").title}</span>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void q.refetch()}><RotateCcw size={13} /> Tentar novamente</Button>
              </div>
            )}
            {q.data && !q.data.length && (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
                <History size={15} aria-hidden /> Nenhuma versão ainda. Ao publicar, cada versão aparece aqui.
              </div>
            )}
            <ul className="space-y-1">
              {q.data?.map((v) => (
                <li key={v.versao}>
                  <button
                    type="button"
                    onClick={() => onVisualizar(v)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-lg border border-border px-3 py-2 text-left hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selecionada === v.versao && "border-primary bg-secondary/40",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">v{v.versao}</span>
                      {v.atual && <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">Em produção</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(v.publicado_em)}{v.publicado_por ? ` · ${v.publicado_por}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
