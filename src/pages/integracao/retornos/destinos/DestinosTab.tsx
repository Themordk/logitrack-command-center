import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, PauseCircle, Pencil, Play, Plus, Power, Send, Zap, CheckCircle2, CircleOff, AlertTriangle } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseError } from "@/lib/errorMapper";
import { relativeTime } from "../../StatusBar";
import { retornosKeys } from "../retornosKeys";
import { listarDestinos, salvarDestino } from "../retornosService";
import type { AuthTipo, Destino, DestinoEntrada } from "../retornos.types";
import { usePermissaoRetorno } from "../useRetornos";
import { DestinoSheet } from "./DestinoSheet";
import { TestarDestinoDialog } from "./TestarDestinoDialog";

export const AUTH_ROTULO: Record<AuthTipo, string> = {
  nenhuma: "Nenhuma", api_key: "API key", bearer: "Bearer token", basic: "Basic", hmac: "Assinatura HMAC",
};

export function destinoParaEntrada(d: Destino): DestinoEntrada {
  return {
    id: d.id, nome: d.nome, modo: d.modo, metodo: d.metodo, url_base: d.url_base, auth_tipo: d.auth_tipo,
    auth_config: d.auth_config ?? {}, headers: d.headers ?? {}, timeout_ms: d.timeout_ms,
    max_tentativas: d.max_tentativas, limite_falhas: d.limite_falhas, ativo: d.ativo,
    erp_provedor_id: d.erp_provedor_id,
  };
}

function Situacao({ d }: { d: Destino }) {
  if (!d.ativo) return <Badge variant="outline" className="bg-zinc-500/15 text-zinc-400 border-zinc-500/30 gap-1"><CircleOff size={12} /> Inativo</Badge>;
  if (d.pausado_em) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" tabIndex={0} className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1 cursor-help"><PauseCircle size={12} /> Pausado</Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <p>{d.pausado_motivo || "Envios pausados após falhas seguidas."}</p>
          <p className="text-muted-foreground mt-1">{d.falhas_consecutivas.toLocaleString("pt-BR")} falhas seguidas · desde {relativeTime(d.pausado_em)}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 size={12} /> Ativo</Badge>;
}

function Acao({ label, icon: Icon, onClick, disabled }: { label: string; icon: typeof Pencil; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={label} onClick={onClick} disabled={disabled}>
            <Icon size={14} />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

type Confirmacao = { tipo: "retomar" | "ativar" | "desativar"; destino: Destino } | null;

export function DestinosTab() {
  const { tenantId, empresaId } = useTenant();
  const { podeEditar } = usePermissaoRetorno();
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<{ aberto: boolean; destino: Destino | null }>({ aberto: false, destino: null });
  const [testando, setTestando] = useState<Destino | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null);
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: retornosKeys.destinos(tenantId, empresaId),
    queryFn: () => listarDestinos(tenantId as string, empresaId as string),
    enabled: !!tenantId && !!empresaId,
  });

  const destinos = useMemo(() => [...(data ?? [])].sort((a, b) =>
    a.ativo === b.ativo ? a.nome.localeCompare(b.nome, "pt-BR") : a.ativo ? -1 : 1), [data]);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["retorno-destinos"] });
    qc.invalidateQueries({ queryKey: ["retorno-config"] });
  };

  const confirmar = async () => {
    if (!confirmacao || !tenantId || !empresaId) return;
    const { tipo, destino } = confirmacao;
    setSalvando(true);
    try {
      const entrada = destinoParaEntrada(destino);
      if (tipo === "retomar") entrada.reativar = true;
      else { entrada.ativo = tipo === "ativar"; entrada.reativar = false; }
      await salvarDestino(tenantId, empresaId, entrada, null, false);
      toast.success(tipo === "retomar" ? "Envios retomados." : tipo === "ativar" ? "Destino ativado." : "Destino desativado.");
      invalidar();
      setConfirmacao(null);
    } catch (e) {
      toast.error(parseError(e, "Salvar destino").title);
    } finally {
      setSalvando(false);
    }
  };

  const novo = () => setSheet({ aberto: true, destino: null });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="card-surface flex flex-col min-h-0">
        <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Destinos</h3>
          <Button size="sm" onClick={novo} disabled={!podeEditar} className="gap-1.5"><Plus size={14} /> Novo destino</Button>
        </div>

        {isLoading ? (
          <div className="p-4 flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : isError ? (
          <div className="m-4 rounded-lg border border-destructive/40 px-4 py-3 flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-destructive"><AlertTriangle size={13} /> Não foi possível carregar os destinos.</span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
          </div>
        ) : destinos.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-3 py-14 px-6">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center"><Send size={15} className="text-muted-foreground" aria-hidden /></div>
            <p className="text-sm text-muted-foreground max-w-md">Nenhum destino cadastrado. Um destino é o endereço do ERP que recebe os retornos.</p>
            <Button size="sm" onClick={novo} disabled={!podeEditar} className="gap-1.5"><Plus size={14} /> Novo destino</Button>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-secondary/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">URL base</th>
                  <th className="px-3 py-2 font-medium">Autenticação</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Último sucesso / erro</th>
                  <th className="px-3 py-2 font-medium text-right">Fluxos</th>
                  <th className="px-3 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {destinos.map((d) => (
                  <tr key={d.id} className={`border-t border-border/40 hover:bg-secondary/30 ${d.ativo ? "" : "opacity-60"}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">{d.nome}</span>
                        {d.modo === "webhook" && <Badge variant="outline" className="bg-violet-500/15 text-violet-400 border-violet-500/30 text-[10px] px-1.5 py-0">Webhook</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2 max-w-[260px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="block truncate font-mono text-muted-foreground">{d.url_base}</span>
                        </TooltipTrigger>
                        <TooltipContent className="font-mono text-xs max-w-md break-all">{d.url_base}</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {AUTH_ROTULO[d.auth_tipo] ?? d.auth_tipo}
                        {d.tem_segredo && <KeyRound size={13} className="text-muted-foreground" aria-label="Segredo configurado" />}
                      </span>
                    </td>
                    <td className="px-3 py-2"><Situacao d={d} /></td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div><span className="text-emerald-400">✓</span> {d.ultimo_sucesso_em ? relativeTime(d.ultimo_sucesso_em) : "—"}</div>
                      <div><span className="text-rose-400">✕</span> {d.ultimo_erro_em ? relativeTime(d.ultimo_erro_em) : "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.fluxos_usando.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <Acao label={podeEditar ? "Editar" : "Ver detalhes"} icon={Pencil} onClick={() => setSheet({ aberto: true, destino: d })} />
                        <Acao label="Testar conexão" icon={Zap} onClick={() => setTestando(d)} disabled={!podeEditar} />
                        {d.pausado_em && d.ativo && (
                          <Acao label="Retomar envios" icon={Play} onClick={() => setConfirmacao({ tipo: "retomar", destino: d })} disabled={!podeEditar} />
                        )}
                        <Acao label={d.ativo ? "Desativar" : "Ativar"} icon={Power}
                          onClick={() => setConfirmacao({ tipo: d.ativo ? "desativar" : "ativar", destino: d })} disabled={!podeEditar} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DestinoSheet
        aberto={sheet.aberto}
        destino={sheet.destino}
        podeEditar={podeEditar}
        onFechar={() => setSheet({ aberto: false, destino: null })}
        onSalvo={invalidar}
      />
      <TestarDestinoDialog destino={testando} onFechar={() => setTestando(null)} />

      <AlertDialog open={!!confirmacao} onOpenChange={(o) => !o && !salvando && setConfirmacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmacao?.tipo === "retomar" ? "Retomar envios" : confirmacao?.tipo === "ativar" ? "Ativar destino" : "Desativar destino"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacao?.tipo === "retomar"
                ? `Retomar envios para ${confirmacao.destino.nome}? As execuções em espera serão enviadas de novo.`
                : confirmacao?.tipo === "ativar"
                  ? `Ativar ${confirmacao.destino.nome}? Os fluxos que usam este destino voltam a enviar.`
                  : `Desativar ${confirmacao?.destino.nome}? Os fluxos que usam este destino deixam de enviar.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmar(); }} disabled={salvando}>
              {salvando && <Loader2 size={14} className="animate-spin mr-1.5" />} Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
