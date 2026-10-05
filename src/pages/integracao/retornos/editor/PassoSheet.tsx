import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusRetornoBadge } from "../components/StatusRetornoBadge";
import type { Catalogo, ExecucaoDetalhe, Passo } from "../retornos.types";
import { formatarDuracao, passosDoNo } from "./execucaoVisual";
import { nomeTipo } from "./resumoNo";

interface Props {
  detalhe: ExecucaoDetalhe | null;
  noId: string | null;
  catalogo?: Catalogo;
  onFechar: () => void;
  onVerExecucao: () => void;
}

function formatar(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") {
    try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; }
  }
  return JSON.stringify(v, null, 2);
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto) return null;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); toast.success("Copiado."); } catch { toast.error("Não foi possível copiar."); }
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Copiar ${titulo}`} onClick={() => void copiar()}><Copy size={13} /></Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Copiar</TooltipContent>
        </Tooltip>
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg bg-secondary/40 p-2 font-mono text-xs text-foreground whitespace-pre-wrap break-all">{texto}</pre>
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className="text-xs text-foreground">{valor}</div>
    </div>
  );
}

function PassoBloco({ p }: { p: Passo }) {
  const req = p.request;
  const res = p.response;
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Info rotulo="Status" valor={<StatusRetornoBadge tipo="passo" status={p.status} />} />
        <Info rotulo="Tentativa" valor={p.tentativa} />
        <Info rotulo="Duração" valor={formatarDuracao(p.duracao_ms)} />
        <Info rotulo="HTTP" valor={p.http_status ?? "—"} />
      </div>
      {p.erro && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-400">{p.erro}</p>}
      {req && (
        <>
          <Bloco titulo="Requisição" texto={`${req.metodo} ${req.url}`} />
          <Bloco titulo="Headers" texto={formatar(req.headers)} />
          <Bloco titulo="Corpo enviado" texto={formatar(req.corpo)} />
        </>
      )}
      {res && <Bloco titulo={`Resposta · ${res.status}`} texto={formatar(res.json ?? res.corpo)} />}
      <Bloco titulo="Resultado do nó" texto={formatar(p.resultado)} />
    </div>
  );
}

export function PassoSheet({ detalhe, noId, catalogo, onFechar, onVerExecucao }: Props) {
  const no = detalhe?.definicao.nos.find((n) => n.id === noId);
  const passos = detalhe && noId ? passosDoNo(detalhe, noId) : [];
  return (
    <Sheet open={!!noId && !!detalhe} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="text-sm">Passo · {no?.nome || (no ? nomeTipo(no.tipo, catalogo) : "")}</SheetTitle>
          <SheetDescription className="text-xs">
            {passos.length ? `${passos.length} registro(s) deste nó nesta execução.` : "Sem detalhes registrados para este nó."}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <div className="space-y-3 p-4">
            {passos.map((p) => <PassoBloco key={p.id} p={p} />)}
            <Button variant="link" size="sm" className="gap-1.5 px-0" onClick={onVerExecucao}>
              <ExternalLink size={13} /> Ver em Execuções
            </Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
