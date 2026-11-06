import { AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateTime } from "@/utils/dateTime";
import { useCatalogoRetorno } from "../useRetornos";
import { MODO_EXECUCAO_UI } from "../retornosUi";
import { StatusRetornoBadge } from "./StatusRetornoBadge";
import type { ConfirmacaoEnvio } from "./useEnviarAoErp";

interface Props {
  confirmacao: ConfirmacaoEnvio | null;
  enviando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Confirmação do envio manual quando há retornos anteriores (pendentes/erro) travando a fila do documento. */
export function ConfirmarEnvioErpDialog({ confirmacao, enviando, onConfirmar, onCancelar }: Props) {
  const { data: catalogo } = useCatalogoRetorno();
  const v = confirmacao?.verificacao;
  const eventoNome = v ? (catalogo?.eventos ?? []).find((e) => e.codigo === v.evento)?.nome ?? v.evento : "";
  const qtd = v?.bloqueios.length ?? 0;

  return (
    <AlertDialog open={!!confirmacao} onOpenChange={(aberto) => { if (!aberto && !enviando) onCancelar(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" aria-hidden />
            {qtd === 1 ? "Existe um retorno anterior não resolvido" : `Existem ${qtd} retornos anteriores não resolvidos`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Enquanto {qtd === 1 ? "ele estiver" : "eles estiverem"} na fila, o novo envio de <strong className="text-foreground">{confirmacao?.fluxoNome}</strong> fica
            parado em <em>Pendente</em>. Ao continuar, {qtd === 1 ? "ele será descartado" : "eles serão descartados"} (fica registrado no histórico) e o
            documento é enviado com a versão publicada <strong className="text-foreground">v{v?.fluxo_versao ?? "?"}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {v && (
          <div className="space-y-3 text-xs">
            <ul className="rounded-md border border-border divide-y divide-border/60">
              {v.bloqueios.map((b) => (
                <li key={b.id} className="p-2.5 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground">{formatDateTime(b.created_at)}</span>
                    <StatusRetornoBadge tipo="execucao" status={b.status} />
                    <span className="text-muted-foreground">{MODO_EXECUCAO_UI[b.modo] ?? b.modo} · v{b.fluxo_versao ?? "?"}</span>
                  </div>
                  {b.erro && <p className="text-rose-400 line-clamp-2 break-all" title={b.erro}>{b.erro}</p>}
                </li>
              ))}
            </ul>

            <div className="flex gap-2 rounded-md bg-secondary/40 p-2.5 text-muted-foreground">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
              <p>
                Gatilho do fluxo: <span className="text-foreground">{eventoNome}</span>. Status atual do movimento:{" "}
                <span className="text-foreground font-mono">{v.movimento_status ?? "sem movimento"}</span>.
                O envio manual não depende do gatilho: o documento será enviado mesmo que o status já tenha avançado.
              </p>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={enviando} onClick={(e) => { e.preventDefault(); onConfirmar(); }}>
            {enviando && <Loader2 size={13} className="animate-spin mr-1" />}
            Descartar e enviar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
