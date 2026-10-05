import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODO_ROTULO } from "./publicarUtils";
import type { FluxoCompleto } from "../retornos.types";

interface Props {
  aberto: boolean;
  fluxo: FluxoCompleto;
  totalNos: number;
  eventoNome: string | null;
  publicando: boolean;
  onFechar: () => void;
  onConfirmar: (ativar: boolean) => void;
}

export function PublicarFluxoDialog({ aberto, fluxo, totalNos, eventoNome, publicando, onFechar, onConfirmar }: Props) {
  const primeira = fluxo.versao_publicada == null;
  const [ativar, setAtivar] = useState(fluxo.ativo || primeira);
  useEffect(() => { if (aberto) setAtivar(fluxo.ativo || primeira); }, [aberto, fluxo.ativo, primeira]);
  const v = fluxo.validacao_rascunho;
  const avisos = v?.avisos ?? [];
  const legado = avisos.filter((a) => a.codigo === "MOTOR_LEGADO_ATIVO");
  const outros = avisos.filter((a) => a.codigo !== "MOTOR_LEGADO_ATIVO");
  const modo = v?.gatilho?.modo ?? fluxo.modo_ativacao;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !publicando) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Publicar v{(fluxo.versao_publicada ?? 0) + 1}</DialogTitle>
          <DialogDescription>O rascunho atual vira a versão em produção.</DialogDescription>
        </DialogHeader>

        {legado.map((a, i) => (
          <div key={i} role="alert" className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2.5 text-sm text-amber-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span>{a.mensagem}</span>
          </div>
        ))}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
          <dt className="text-muted-foreground">Evento</dt><dd className="text-foreground">{eventoNome ?? v?.gatilho?.evento ?? "—"}</dd>
          <dt className="text-muted-foreground">Ativação</dt><dd className="text-foreground">{modo ? MODO_ROTULO[modo] ?? modo : "—"}</dd>
          <dt className="text-muted-foreground">Nós</dt><dd className="text-foreground">{totalNos.toLocaleString("pt-BR")}</dd>
          <dt className="text-muted-foreground">Versão criada</dt><dd className="text-foreground">v{(fluxo.versao_publicada ?? 0) + 1}</dd>
        </dl>

        {outros.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            {outros.map((a, i) => (
              <li key={i} className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />{a.mensagem}</li>
            ))}
          </ul>
        )}

        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox checked={ativar} onCheckedChange={(c) => setAtivar(c === true)} aria-label="Ativar ao publicar" />
          Ativar ao publicar
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={publicando}>Cancelar</Button>
          <Button onClick={() => onConfirmar(ativar)} disabled={publicando}>
            {publicando && <Loader2 size={14} className="mr-1.5 animate-spin" />} Publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
