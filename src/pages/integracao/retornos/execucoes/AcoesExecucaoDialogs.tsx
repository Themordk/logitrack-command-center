import { useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseError } from "@/lib/errorMapper";
import type { Catalogo, ExecucaoDetalhe, ExecucaoResumo } from "../retornos.types";
import { descartar, invokeDispatcher, reprocessar } from "../retornosService";
import { nomeTipo } from "../editor/resumoNo";

/** Reprocessa e pede execução imediata; se o dispatcher falhar, o agendador assume em ~10 s. */
export async function reprocessarEExecutar(execucaoId: string, aPartirNo: string | null): Promise<ExecucaoResumo> {
  const r = await reprocessar(execucaoId, aPartirNo);
  try { await invokeDispatcher({ acao: "executar", execucao_id: r.id ?? execucaoId }); } catch { /* agendador processa */ }
  return r;
}

const FALHA = "__falha";

export function ReprocessarDialog({ detalhe, catalogo, aberto, onFechar, onConcluido }: {
  detalhe: ExecucaoDetalhe; catalogo?: Catalogo; aberto: boolean; onFechar: () => void; onConcluido: (r: ExecucaoResumo) => void;
}) {
  const exigeNo = detalhe.status === "sucesso" || detalhe.status === "filtrado";
  const [no, setNo] = useState<string>(exigeNo ? "" : FALHA);
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    setSalvando(true);
    try {
      const r = await reprocessarEExecutar(detalhe.id, no === FALHA ? null : no);
      toast.success("Reprocessamento iniciado.");
      onConcluido(r);
    } catch (e) {
      toast.error(parseError(e, "reprocessar execução").title);
    } finally { setSalvando(false); }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v && !salvando) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><RotateCcw size={15} /> Reprocessar execução</DialogTitle>
          <DialogDescription className="text-xs">Execuções seguintes deste documento no mesmo fluxo estão aguardando esta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="reproc-no" className="text-xs uppercase tracking-wide text-muted-foreground">Recomeçar a partir de</label>
          <Select value={no} onValueChange={setNo}>
            <SelectTrigger id="reproc-no" className="h-10 rounded-lg bg-secondary/40"><SelectValue placeholder="Escolha o nó" /></SelectTrigger>
            <SelectContent>
              {!exigeNo && <SelectItem value={FALHA}>Nó que falhou</SelectItem>}
              {detalhe.definicao.nos.map((n) => (
                <SelectItem key={n.id} value={n.id}>{n.nome || nomeTipo(n.tipo, catalogo)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {exigeNo && <p className="text-xs text-muted-foreground">Para execuções concluídas, escolha o nó de onde recomeçar.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => void confirmar()} disabled={salvando || !no} className="gap-1.5">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reprocessar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DescartarDialog({ execucaoIds, aberto, onFechar, onConcluido }: {
  execucaoIds: string[]; aberto: boolean; onFechar: () => void; onConcluido: (ok: number, falhas: number) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const varias = execucaoIds.length > 1;

  const confirmar = async () => {
    setSalvando(true); setProgresso(0);
    let ok = 0; let falhas = 0; let ultimoErro: unknown = null;
    for (const id of execucaoIds) {
      try { await descartar(id, motivo.trim()); ok++; } catch (e) { falhas++; ultimoErro = e; }
      setProgresso((p) => p + 1);
    }
    setSalvando(false);
    if (!varias && falhas) { toast.error(parseError(ultimoErro, "descartar execução").title); return; }
    if (varias) toast[falhas ? "warning" : "success"](`${ok} descartada(s)${falhas ? `, ${falhas} falhou(aram)` : ""}.`);
    else toast.success("Execução descartada.");
    setMotivo("");
    onConcluido(ok, falhas);
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v && !salvando) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><Trash2 size={15} className="text-rose-400" />
            {varias ? `Descartar ${execucaoIds.length} execuções` : "Descartar execução"}
          </DialogTitle>
          <DialogDescription className="text-xs">Descartar libera as execuções seguintes deste documento. O ERP não receberá este envio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="desc-motivo" className="text-xs uppercase tracking-wide text-muted-foreground">Motivo</label>
          <Textarea id="desc-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
            className="rounded-lg bg-secondary/40 text-sm" placeholder="Explique por que este envio não deve ir ao ERP" />
        </div>
        {salvando && varias && <p className="text-xs text-muted-foreground">Descartando {progresso} de {execucaoIds.length}…</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button variant="destructive" onClick={() => void confirmar()} disabled={salvando || !motivo.trim()} className="gap-1.5">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
