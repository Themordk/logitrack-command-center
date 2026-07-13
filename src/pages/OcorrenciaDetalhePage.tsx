import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import {
  ArrowLeft, Package, FileText, User, Clock, MessageSquare,
  CheckCircle2, XCircle, Search, AlertTriangle, ShieldAlert, Loader2, Plus,
  MapPin, ClipboardList, UserX, Hash, Calendar, Tag, Wrench,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";

interface Props {
  onNavigate: (path: string) => void;
  ocorrenciaId: string;
}

const STATUS_BADGE: Record<string, string> = {
  ABERTA: "bg-red-500/15 text-red-400 border-red-500/30",
  EM_INVESTIGACAO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  EM_TRATAMENTO: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  RESOLVIDA: "bg-green-500/15 text-green-400 border-green-500/30",
  CANCELADA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};
const STATUS_LABEL: Record<string, string> = {
  ABERTA: "Aberta",
  EM_INVESTIGACAO: "Em investigação",
  EM_TRATAMENTO: "Em tratamento",
  RESOLVIDA: "Resolvida",
  CANCELADA: "Cancelada",
};
const STATUS_DOT: Record<string, string> = {
  ABERTA: "bg-red-500 text-red-50",
  EM_INVESTIGACAO: "bg-yellow-500 text-yellow-50",
  EM_TRATAMENTO: "bg-purple-500 text-purple-50",
  RESOLVIDA: "bg-green-500 text-green-50",
  CANCELADA: "bg-gray-500 text-gray-50",
};
const PRIORIDADE_BADGE: Record<string, string> = {
  BAIXA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  NORMAL: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  ALTA: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  CRITICA: "bg-red-500/15 text-red-400 border-red-500/30",
};
const ETAPA_LABEL: Record<string, string> = {
  RECEBIMENTO: "Recebimento", ARMAZENAGEM: "Armazenagem", ABASTECIMENTO: "Abastecimento",
  MOVIMENTACAO: "Movimentação", SEPARACAO: "Separação", EXPEDICAO: "Expedição",
  INVENTARIO: "Inventário", AUDITORIA: "Auditoria",
};
const TIPO_LABEL: Record<string, string> = {
  FALTA: "Falta", SOBRA: "Sobra", AVARIA: "Avaria",
  DIVERGENCIA_INVENTARIO: "Divergência de inventário", EXTRAVIO: "Extravio",
  PRODUTO_INCORRETO: "Produto incorreto", VALIDADE_INCORRETA: "Validade incorreta",
  LOTE_INCORRETO: "Lote incorreto", OUTROS: "Outros",
};

type DialogAction = "EM_INVESTIGACAO" | "EM_TRATAMENTO" | "RESOLVIDA" | "CANCELADA";

export function OcorrenciaDetalhePage({ onNavigate, ocorrenciaId }: Props) {
  const { tenantId, usuarioId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [ocorrencia, setOcorrencia] = useState<any>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [dialogAction, setDialogAction] = useState<DialogAction | null>(null);
  const [dialogText, setDialogText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [histStatus, setHistStatus] = useState<string>("");
  const [histObs, setHistObs] = useState("");
  const [histConcluir, setHistConcluir] = useState(false);
  const [histSaving, setHistSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !ocorrenciaId) return;
    setLoading(true);
    try {
      const [ocoRes, histRes] = await Promise.all([
        (supabase as any)
          .from("ocorrencia_operacional")
          .select(`*,
            produto:produto_id(sku, descricao),
            motivo_ocorrencia:motivo_ocorrencia_id(descricao),
            endereco:endereco_id(descricao),
            usuario_criador:usuario!ocorrencia_operacional_criado_por_fkey(nome),
            usuario_resolvedor:usuario!ocorrencia_operacional_resolvido_por_fkey(nome),
            usuario_causador:usuario!ocorrencia_operacional_usuario_causador_id_fkey(nome)`)
          .eq("id", ocorrenciaId)
          .eq("tenant_id", tenantId)
          .single(),
        (supabase as any)
          .from("ocorrencia_historico")
          .select(`*, usuario:usuario!ocorrencia_historico_usuario_id_fkey(nome)`)
          .eq("ocorrencia_id", ocorrenciaId)
          .eq("tenant_id", tenantId)
          .order("criado_em", { ascending: true }),
      ]);
      if (ocoRes.error) throw ocoRes.error;
      if (histRes.error) throw histRes.error;
      setOcorrencia(ocoRes.data);
      setHistorico(histRes.data || []);
    } catch (err: any) {
      toast.error(err.message || "Falha ao carregar ocorrência.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, ocorrenciaId]);

  useEffect(() => { load(); }, [load]);

  const openDialog = (action: DialogAction) => {
    setDialogAction(action);
    setDialogText("");
  };

  const confirmDialog = async () => {
    if (!dialogAction || !tenantId || !usuarioId || !ocorrencia) return;
    if (dialogAction === "RESOLVIDA" && !dialogText.trim()) {
      toast.error("Descreva como a ocorrência foi resolvida.");
      return;
    }
    setSubmitting(true);
    try {
      const patch: any = { status: dialogAction, updated_by: usuarioId };
      if (dialogAction === "RESOLVIDA") {
        patch.resolvido_por = usuarioId;
        patch.resolvido_em = new Date().toISOString();
        patch.resolucao = dialogText.trim();
      } else if (dialogText.trim()) {
        patch.observacao = dialogText.trim();
      }
      const { error } = await (supabase as any)
        .from("ocorrencia_operacional")
        .update(patch)
        .eq("id", ocorrenciaId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      toast.success("Ocorrência atualizada.");
      setDialogAction(null);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Falha ao atualizar.");
    } finally {
      setSubmitting(false);
    }
  };

  const openHist = () => {
    setHistStatus(ocorrencia?.status ?? "ABERTA");
    setHistObs("");
    setHistConcluir(false);
    setHistOpen(true);
  };

  const submitHist = async () => {
    if (!tenantId || !usuarioId || !ocorrencia) return;
    const concluir = histConcluir;
    const statusNovo = concluir ? "RESOLVIDA" : histStatus;
    if (!statusNovo) {
      toast.error("Selecione o novo status.");
      return;
    }
    if ((concluir || statusNovo === "RESOLVIDA") && !histObs.trim()) {
      toast.error("Informe uma observação para concluir a ocorrência.");
      return;
    }
    setHistSaving(true);
    try {
      const { error: histErr } = await (supabase as any)
        .from("ocorrencia_historico")
        .insert({
          tenant_id: tenantId,
          ocorrencia_id: ocorrenciaId,
          status_anterior: ocorrencia.status,
          status_novo: statusNovo,
          observacao: histObs.trim() || null,
          usuario_id: usuarioId,
        });
      if (histErr) throw histErr;

      if (statusNovo !== ocorrencia.status) {
        const patch: any = { status: statusNovo, updated_by: usuarioId };
        if (statusNovo === "RESOLVIDA") {
          patch.resolvido_por = usuarioId;
          patch.resolvido_em = new Date().toISOString();
          patch.resolucao = histObs.trim();
        } else if (histObs.trim()) {
          patch.observacao = histObs.trim();
        }
        const { error: ocoErr } = await (supabase as any)
          .from("ocorrencia_operacional")
          .update(patch)
          .eq("id", ocorrenciaId)
          .eq("tenant_id", tenantId);
        if (ocoErr) throw ocoErr;
      }

      toast.success("Histórico registrado.");
      setHistOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Falha ao registrar histórico.");
    } finally {
      setHistSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ocorrencia) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <p className="text-sm text-muted-foreground">Ocorrência não encontrada.</p>
        <button onClick={() => onNavigate("/atividades/ocorrencias")} className="text-xs text-primary">Voltar</button>
      </div>
    );
  }

  const podeAgir = ocorrencia.status !== "RESOLVIDA" && ocorrencia.status !== "CANCELADA";
  const divQty = Number(ocorrencia.quantidade_divergente) || 0;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate("/atividades/ocorrencias")}
          className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold text-foreground">
              Ocorrência #{ocorrencia.numero_ocorrencia}
            </h1>
            <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] border", STATUS_BADGE[ocorrencia.status])}>
              {STATUS_LABEL[ocorrencia.status] ?? ocorrencia.status}
            </span>
            <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] border", PRIORIDADE_BADGE[ocorrencia.prioridade])}>
              {ocorrencia.prioridade}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ETAPA_LABEL[ocorrencia.etapa_ocorrencia] ?? ocorrencia.etapa_ocorrencia} · {TIPO_LABEL[ocorrencia.tipo_ocorrencia] ?? ocorrencia.tipo_ocorrencia}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Informações</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <InfoItem icon={<Package size={14} />} label="Produto">
                <span className="font-mono text-foreground">{ocorrencia.produto?.sku ?? "—"}</span>
                <span className="block text-muted-foreground truncate">{ocorrencia.produto?.descricao ?? "—"}</span>
              </InfoItem>
              <InfoItem icon={<FileText size={14} />} label="Motivo">
                <span className="text-foreground">{ocorrencia.motivo_ocorrencia?.descricao ?? "—"}</span>
              </InfoItem>
              <InfoItem icon={<User size={14} />} label="Registrada por">
                <span className="text-foreground">{ocorrencia.usuario_criador?.nome ?? "—"}</span>
              </InfoItem>
              <InfoItem icon={<Clock size={14} />} label="Data de criação">
                <span className="text-foreground">{formatDateTime(ocorrencia.criado_em)}</span>
              </InfoItem>
              {ocorrencia.endereco?.descricao && (
                <InfoItem icon={<MapPin size={14} />} label="Endereço">
                  <span className="font-mono">{ocorrencia.endereco.descricao}</span>
                </InfoItem>
              )}
              {ocorrencia.tarefa_id && (
                <InfoItem icon={<ClipboardList size={14} />} label="Tarefa">
                  <span className="font-mono text-[10px]">{ocorrencia.tarefa_id}</span>
                </InfoItem>
              )}
              {ocorrencia.usuario_causador?.nome && (
                <InfoItem icon={<UserX size={14} />} label="Causador">
                  {ocorrencia.usuario_causador.nome}
                </InfoItem>
              )}
              {ocorrencia.lote && (
                <InfoItem icon={<Hash size={14} />} label="Lote">
                  <span className="font-mono">{ocorrencia.lote}</span>
                </InfoItem>
              )}
              {ocorrencia.validade && (
                <InfoItem icon={<Calendar size={14} />} label="Validade">
                  {new Date(ocorrencia.validade).toLocaleDateString("pt-BR")}
                </InfoItem>
              )}
              {ocorrencia.categoria && (
                <InfoItem icon={<Tag size={14} />} label="Categoria">
                  <span className={cn(
                    "inline-block px-2 py-0.5 rounded-full text-[10px] border",
                    ocorrencia.categoria === "PREVENTIVA"
                      ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                      : "bg-orange-500/15 text-orange-400 border-orange-500/30"
                  )}>
                    {ocorrencia.categoria === "PREVENTIVA" ? "Preventiva" : "Corretiva"}
                  </span>
                </InfoItem>
              )}
            </div>


            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
              <Stat label="Esperada" value={ocorrencia.quantidade_esperada} />
              <Stat label="Real" value={ocorrencia.quantidade_real} />
              <Stat label="Divergência" value={divQty} valueClass={divQty > 0 ? "text-red-400" : "text-green-400"} />
            </div>

            {ocorrencia.observacao && (
              <div className="mt-4 p-3 rounded-md bg-muted/30 text-xs text-foreground whitespace-pre-wrap">
                <p className="text-[10px] uppercase text-muted-foreground mb-1">Observação</p>
                {ocorrencia.observacao}
              </div>
            )}

            {ocorrencia.resolucao && (
              <div className="mt-4 p-3 rounded-md bg-green-500/5 border border-green-500/30 text-xs">
                <p className="text-[10px] uppercase text-green-400 mb-1">Resolução</p>
                <p className="text-foreground whitespace-pre-wrap">{ocorrencia.resolucao}</p>
                <p className="text-muted-foreground mt-2 text-[11px]">
                  Por {ocorrencia.usuario_resolvedor?.nome ?? "—"} em {formatDateTime(ocorrencia.resolvido_em)}
                </p>
              </div>
            )}
          </div>

          {podeAgir && (
            <div className="card-surface p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Ações</h3>
              <div className="flex flex-wrap gap-2">
                {ocorrencia.status === "ABERTA" && (
                  <ActionBtn icon={<Search size={14} />} onClick={() => openDialog("EM_INVESTIGACAO")} color="yellow">
                    Iniciar investigação
                  </ActionBtn>
                )}
                {ocorrencia.status === "EM_INVESTIGACAO" && (
                  <ActionBtn icon={<Wrench size={14} />} onClick={() => openDialog("EM_TRATAMENTO")} color="purple">
                    Iniciar tratamento
                  </ActionBtn>
                )}
                <ActionBtn icon={<CheckCircle2 size={14} />} onClick={() => openDialog("RESOLVIDA")} color="green">
                  Resolver
                </ActionBtn>
                <ActionBtn icon={<XCircle size={14} />} onClick={() => openDialog("CANCELADA")} color="gray">
                  Cancelar
                </ActionBtn>
              </div>
            </div>
          )}
        </div>

        {/* Histórico */}
        <div className="card-surface p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageSquare size={14} /> Histórico
            </h3>
            <button
              onClick={openHist}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] text-foreground hover:bg-secondary transition-colors"
            >
              <Plus size={12} /> Registrar
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {historico.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Sem registros.</p>
            ) : (
              <div className="relative pl-7">
                <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
                <div className="space-y-4">
                  {historico.map((h) => {
                    const Icon = h.status_novo === "RESOLVIDA" ? CheckCircle2
                      : h.status_novo === "CANCELADA" ? XCircle
                      : h.status_novo === "EM_INVESTIGACAO" ? ShieldAlert
                      : AlertTriangle;
                    return (
                      <div key={h.id} className="relative">
                        <div className={cn(
                          "absolute -left-7 top-0.5 w-6 h-6 rounded-full flex items-center justify-center",
                          STATUS_DOT[h.status_novo] ?? "bg-gray-500",
                        )}>
                          <Icon size={12} />
                        </div>
                        <p className="text-xs text-foreground">
                          {h.status_anterior ? `${STATUS_LABEL[h.status_anterior] ?? h.status_anterior} → ` : ""}
                          <span className="font-semibold">{STATUS_LABEL[h.status_novo] ?? h.status_novo}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDateTime(h.criado_em)} · por {h.usuario?.nome ?? "—"}
                        </p>
                        {h.observacao && (
                          <p className="text-[11px] text-foreground mt-1 p-2 rounded-md bg-muted/30 whitespace-pre-wrap">
                            {h.observacao}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialog de ação */}
      <Dialog open={!!dialogAction} onOpenChange={(v) => { if (!v) setDialogAction(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogAction === "RESOLVIDA" ? "Resolver ocorrência"
                : dialogAction === "EM_INVESTIGACAO" ? "Iniciar investigação"
                : dialogAction === "EM_TRATAMENTO" ? "Iniciar tratamento"
                : "Cancelar ocorrência"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="block text-[10px] uppercase font-medium text-muted-foreground">
              {dialogAction === "RESOLVIDA"
                ? "Descreva como a ocorrência foi resolvida *"
                : "Observação (opcional)"}
            </label>
            <textarea
              value={dialogText}
              onChange={(e) => setDialogText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary resize-none"
            />
          </div>
          <DialogFooter>
            <button
              onClick={() => setDialogAction(null)}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              Voltar
            </button>
            <button
              onClick={confirmDialog}
              disabled={submitting || (dialogAction === "RESOLVIDA" && !dialogText.trim())}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Confirmar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Registrar Histórico */}
      <Dialog open={histOpen} onOpenChange={(v) => { if (!v && !histSaving) setHistOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar histórico</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="block text-[10px] uppercase font-medium text-muted-foreground mb-1">
                Status anterior
              </label>
              <div className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] border", STATUS_BADGE[ocorrencia.status])}>
                {STATUS_LABEL[ocorrencia.status] ?? ocorrencia.status}
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-medium text-muted-foreground mb-1">
                Novo status <span className="text-destructive">*</span>
              </label>
              <select
                value={histConcluir ? "RESOLVIDA" : histStatus}
                disabled={histConcluir}
                onChange={(e) => setHistStatus(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">Selecionar...</option>
                <option value="ABERTA">Aberta</option>
                <option value="EM_INVESTIGACAO">Em investigação</option>
                <option value="RESOLVIDA">Resolvida</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-medium text-muted-foreground mb-1">
                Observação {(histConcluir || histStatus === "RESOLVIDA") && <span className="text-destructive">*</span>}
              </label>
              <textarea
                value={histObs}
                onChange={(e) => setHistObs(e.target.value)}
                rows={4}
                placeholder="Descreva a atualização..."
                className="w-full px-3 py-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary resize-none"
              />
            </div>

            {podeAgir && (
              <div className="flex items-start gap-3 p-3 rounded-md border border-border bg-secondary/30">
                <Switch checked={histConcluir} onCheckedChange={setHistConcluir} />
                <div className="flex-1">
                  <p className="text-xs text-foreground font-medium">Concluir ocorrência</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Marca a ocorrência operacional como <strong>Resolvida</strong> usando a observação acima.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setHistOpen(false)}
              disabled={histSaving}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={submitHist}
              disabled={histSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {histSaving && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
        <div className="text-xs">{children}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: number | string; valueClass?: string }) {
  return (
    <div className="rounded-md border border-border bg-secondary/30 p-3 text-center">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold font-mono mt-1 text-foreground", valueClass)}>{value}</p>
    </div>
  );
}

function ActionBtn({ icon, children, onClick, color }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; color: "yellow" | "green" | "gray" | "purple" }) {
  const colors: Record<string, string> = {
    yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/25",
    green: "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25",
    gray: "bg-gray-500/15 text-gray-300 border-gray-500/30 hover:bg-gray-500/25",
    purple: "bg-purple-500/15 text-purple-400 border-purple-500/30 hover:bg-purple-500/25",
  };
  return (
    <button onClick={onClick} className={cn("flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors", colors[color])}>
      {icon} {children}
    </button>
  );
}
