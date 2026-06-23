import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle, Clock, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  movimentoEntradaId: string;
  statusMovimento: string;
  onSuccess?: () => void;
}

interface Item {
  id: string;
  produto_id: string;
  qtd_esperada: number;
  qtd_conferida: number;
  qtd_armazenada: number | null;
  status_item_movimento: string;
  produto?: { sku: string; descricao: string } | null;
}

interface Motivo {
  id: string;
  descricao: string;
}

interface DivergenteForm {
  motivo_ocorrencia_id: string;
  observacao: string;
}

type Step = "resumo" | "ocorrencias" | "vazio";

export function LiberarArmazenagemModal({ open, onClose, movimentoEntradaId, onSuccess }: Props) {
  const { tenantId, usuarioId } = useTenant();
  const [loading, setLoading] = useState(false);
  const [liberandoConferidos, setLiberandoConferidos] = useState(false);
  const [submittingOcorrencias, setSubmittingOcorrencias] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [divergentesForm, setDivergentesForm] = useState<Record<string, DivergenteForm>>({});
  const [step, setStep] = useState<Step>("resumo");
  const [etapa1Mensagem, setEtapa1Mensagem] = useState<string | null>(null);
  const [conferidosLiberadosCount, setConferidosLiberadosCount] = useState(0);
  const [liberadosIds, setLiberadosIds] = useState<Set<string>>(new Set());
  const [loadingItemIds, setLoadingItemIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !tenantId || !movimentoEntradaId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setEtapa1Mensagem(null);
      setConferidosLiberadosCount(0);
      setLiberadosIds(new Set());
      setLoadingItemIds({});
      try {
        const [itensRes, motivosRes] = await Promise.all([
          (supabase as any)
            .from("movimento_entrada_item")
            .select("*, produto:produto_id(sku, descricao)")
            .eq("movimento_entrada_id", movimentoEntradaId)
            .eq("tenant_id", tenantId),
          (supabase as any)
            .from("motivo_ocorrencia")
            .select("id, descricao")
            .eq("tenant_id", tenantId)
            .eq("ativo", true)
            .order("descricao"),
        ]);
        if (!active) return;
        if (itensRes.error) throw itensRes.error;
        if (motivosRes.error) throw motivosRes.error;
        const data = (itensRes.data || []) as Item[];
        setItens(data);
        setMotivos(motivosRes.data || []);

        const initialForm: Record<string, DivergenteForm> = {};
        data.forEach((it) => {
          if (it.status_item_movimento === "DIVERGENTE") {
            initialForm[it.id] = { motivo_ocorrencia_id: "", observacao: "" };
          }
        });
        setDivergentesForm(initialForm);

        const conf = data.filter((i) => i.status_item_movimento === "CONFERIDO").length;
        const div = data.filter((i) => i.status_item_movimento === "DIVERGENTE").length;
        if (conf === 0 && div === 0) setStep("vazio");
        else if (conf === 0 && div > 0) setStep("ocorrencias");
        else setStep("resumo");
      } catch (err: any) {
        toast.error(err.message || "Falha ao carregar itens");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, tenantId, movimentoEntradaId]);

  const grupos = useMemo(() => {
    const conferidos = itens.filter((i) => i.status_item_movimento === "CONFERIDO");
    const divergentes = itens.filter((i) => i.status_item_movimento === "DIVERGENTE");
    const pendentes = itens.filter((i) => ["PENDENTE", "EM_ANDAMENTO"].includes(i.status_item_movimento));
    const armazenados = itens.filter((i) => i.status_item_movimento === "ARMAZENADO");
    return { conferidos, divergentes, pendentes, armazenados };
  }, [itens]);

  const divergentesPendentes = useMemo(
    () => grupos.divergentes.filter((d) => !liberadosIds.has(d.id)),
    [grupos.divergentes, liberadosIds],
  );

  const divergentesElegiveis = useMemo(
    () => divergentesPendentes.filter((d) => !!divergentesForm[d.id]?.motivo_ocorrencia_id),
    [divergentesPendentes, divergentesForm],
  );

  const handleLiberarConferidos = async () => {
    if (!tenantId || !usuarioId) {
      toast.error("Sessão inválida.");
      return;
    }
    if (grupos.conferidos.length === 0) return;
    setLiberandoConferidos(true);
    try {
      const idsConferidos = grupos.conferidos.map((i) => i.id);
      const { data, error } = await supabase.rpc("liberar_armazenagem" as any, {
        p_movimento_entrada_id: movimentoEntradaId,
        p_tenant_id: tenantId,
        p_usuario_id: usuarioId,
        p_modo: "CONFERIDOS",
        p_itens_divergentes: [],
        p_item_ids: idsConferidos,
      });
      if (error) throw error;
      const resultado: any = data || {};
      if (resultado.sucesso === false) {
        toast.error(resultado.mensagem || "Falha ao liberar armazenagem.");
        return;
      }
      if (grupos.divergentes.length > 0) {
        setEtapa1Mensagem(resultado.mensagem || null);
        setConferidosLiberadosCount(grupos.conferidos.length);
        setStep("ocorrencias");
        toast.success(resultado.mensagem || "Itens conferidos liberados.");
      } else {
        toast.success(resultado.mensagem || "Armazenagem liberada.");
        onSuccess?.();
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao liberar armazenagem.");
    } finally {
      setLiberandoConferidos(false);
    }
  };

  const handleLiberarItemDivergente = async (itemId: string) => {
    if (!tenantId || !usuarioId) {
      toast.error("Sessão inválida.");
      return;
    }
    const form = divergentesForm[itemId];
    if (!form?.motivo_ocorrencia_id) {
      toast.error("Selecione um motivo para registrar a ocorrência.");
      return;
    }
    setLoadingItemIds((m) => ({ ...m, [itemId]: true }));
    try {
      const { data, error } = await supabase.rpc("liberar_armazenagem" as any, {
        p_movimento_entrada_id: movimentoEntradaId,
        p_tenant_id: tenantId,
        p_usuario_id: usuarioId,
        p_modo: "CONFERIDOS",
        p_itens_divergentes: [{
          item_id: itemId,
          motivo_ocorrencia_id: form.motivo_ocorrencia_id,
          observacao: form.observacao || null,
        }],
        p_item_ids: [itemId],
      });
      if (error) throw error;
      const r: any = data || {};
      if (r.sucesso === false) {
        toast.error(r.mensagem || "Falha ao registrar ocorrência.");
        return;
      }
      const next = new Set(liberadosIds);
      next.add(itemId);
      setLiberadosIds(next);
      toast.success("Ocorrência registrada e item liberado.");
      // Se foram todos tratados, fecha automaticamente
      if (next.size === grupos.divergentes.length) {
        onSuccess?.();
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar ocorrência.");
    } finally {
      setLoadingItemIds((m) => {
        const { [itemId]: _omit, ...rest } = m;
        return rest;
      });
    }
  };

  const handleRegistrarOcorrencias = async () => {
    if (!tenantId || !usuarioId) {
      toast.error("Sessão inválida.");
      return;
    }
    if (divergentesElegiveis.length === 0) return;
    setSubmittingOcorrencias(true);
    try {
      const ids = divergentesElegiveis.map((d) => d.id);
      const ocorrencias = divergentesElegiveis.map((d) => ({
        item_id: d.id,
        motivo_ocorrencia_id: divergentesForm[d.id].motivo_ocorrencia_id,
        observacao: divergentesForm[d.id]?.observacao || null,
      }));
      const { data, error } = await supabase.rpc("liberar_armazenagem" as any, {
        p_movimento_entrada_id: movimentoEntradaId,
        p_tenant_id: tenantId,
        p_usuario_id: usuarioId,
        p_modo: "CONFERIDOS",
        p_itens_divergentes: ocorrencias,
        p_item_ids: ids,
      });
      if (error) throw error;
      const resultado: any = data || {};
      if (resultado.sucesso === false) {
        toast.error(resultado.mensagem || "Falha ao registrar ocorrências.");
        return;
      }
      toast.success(resultado.mensagem || "Ocorrências registradas e itens liberados.");
      const next = new Set(liberadosIds);
      ids.forEach((id) => next.add(id));
      setLiberadosIds(next);
      if (next.size === grupos.divergentes.length) {
        onSuccess?.();
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar ocorrências.");
    } finally {
      setSubmittingOcorrencias(false);
    }
  };

  const handleClose = () => {
    if (liberadosIds.size > 0) onSuccess?.();
    onClose();
  };

  const updateDivergente = (id: string, patch: Partial<DivergenteForm>) => {
    setDivergentesForm((prev) => ({
      ...prev,
      [id]: { motivo_ocorrencia_id: "", observacao: "", ...prev[id], ...patch },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package size={18} className="text-primary" />
            {step === "ocorrencias" ? "Registrar ocorrências operacionais" : "Liberar armazenagem"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : step === "vazio" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 gap-3">
            <Clock size={48} className="text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">Nenhum item conferido para liberação</h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Aguarde a conferência dos itens para liberar a armazenagem.
            </p>
          </div>
        ) : step === "resumo" ? (
          <div className="flex-1 overflow-auto space-y-4 pr-1">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Total itens" value={itens.length} tone="neutral" />
              <KpiCard label="Conferidos" value={grupos.conferidos.length} tone="green" />
              <KpiCard label="Divergentes" value={grupos.divergentes.length} tone="red" />
              <KpiCard label="Pendentes" value={grupos.pendentes.length} tone="gray" />
            </div>

            {grupos.conferidos.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                  <CheckCircle2 size={16} className="text-green-400" />
                  Itens conferidos — serão liberados imediatamente
                </h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/40 text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">SKU</th>
                        <th className="text-left px-3 py-2 font-medium">Produto</th>
                        <th className="text-right px-3 py-2 font-medium">Esperada</th>
                        <th className="text-right px-3 py-2 font-medium">Conferida</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.conferidos.map((it) => (
                        <tr key={it.id} className="border-t border-border/60">
                          <td className="px-3 py-2 font-mono text-foreground">{it.produto?.sku ?? "—"}</td>
                          <td className="px-3 py-2 text-foreground truncate max-w-[260px]">{it.produto?.descricao ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">{it.qtd_esperada}</td>
                          <td className="px-3 py-2 text-right font-mono text-green-400">{it.qtd_conferida}</td>
                          <td className="px-3 py-2">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] border bg-green-500/15 text-green-400 border-green-500/30">
                              Conferido
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {grupos.divergentes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-red-400" />
                  Itens divergentes — precisam de registro de ocorrência
                </h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/40 text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">SKU</th>
                        <th className="text-left px-3 py-2 font-medium">Produto</th>
                        <th className="text-right px-3 py-2 font-medium">Esperada</th>
                        <th className="text-right px-3 py-2 font-medium">Conferida</th>
                        <th className="text-right px-3 py-2 font-medium">Diferença</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.divergentes.map((it) => {
                        const diff = Number(it.qtd_conferida) - Number(it.qtd_esperada);
                        return (
                          <tr key={it.id} className="border-t border-border/60">
                            <td className="px-3 py-2 font-mono text-foreground">{it.produto?.sku ?? "—"}</td>
                            <td className="px-3 py-2 text-foreground truncate max-w-[240px]">{it.produto?.descricao ?? "—"}</td>
                            <td className="px-3 py-2 text-right font-mono">{it.qtd_esperada}</td>
                            <td className="px-3 py-2 text-right font-mono">{it.qtd_conferida}</td>
                            <td className="px-3 py-2 text-right font-mono text-red-400">{diff}</td>
                            <td className="px-3 py-2">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] border bg-red-500/15 text-red-400 border-red-500/30">
                                Divergente
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {grupos.pendentes.length > 0 && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 flex items-start gap-2">
                <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-200">
                  {grupos.pendentes.length} item(ns) ainda pendente(s). Não serão liberados.
                </p>
              </div>
            )}
          </div>
        ) : (
          // step === "ocorrencias"
          <div className="flex-1 overflow-auto space-y-3 pr-1">
            <p className="text-xs text-muted-foreground">
              {conferidosLiberadosCount > 0
                ? `${conferidosLiberadosCount} item(ns) conferido(s) liberado(s). Registre as ocorrências dos itens abaixo para liberá-los.`
                : "Registre as ocorrências dos itens abaixo para liberá-los."}
            </p>
            {etapa1Mensagem && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 flex items-start gap-2">
                <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" />
                <p className="text-xs text-green-200">{etapa1Mensagem}</p>
              </div>
            )}
            {grupos.divergentes.map((it) => {
              const diff = Number(it.qtd_conferida) - Number(it.qtd_esperada);
              const isFalta = diff < 0;
              const liberado = liberadosIds.has(it.id);
              const itemLoading = !!loadingItemIds[it.id];
              const motivoSelecionado = !!divergentesForm[it.id]?.motivo_ocorrencia_id;
              return (
                <div
                  key={it.id}
                  className={cn(
                    "rounded-lg border p-3 space-y-3",
                    liberado
                      ? "border-green-500/30 bg-green-500/5 opacity-80"
                      : "border-red-500/30 bg-red-500/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-foreground">{it.produto?.sku ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{it.produto?.descricao ?? "—"}</p>
                    </div>
                    {liberado ? (
                      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border bg-green-500/15 text-green-400 border-green-500/30 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Liberado
                      </span>
                    ) : (
                      <span className={cn(
                        "shrink-0 text-[10px] px-2 py-0.5 rounded-full border",
                        isFalta
                          ? "bg-red-500/15 text-red-400 border-red-500/30"
                          : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                      )}>
                        {isFalta ? `Falta: ${Math.abs(diff)} un.` : `Sobra: ${diff} un.`}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <Field label="Esperada" value={it.qtd_esperada} />
                    <Field label="Conferida" value={it.qtd_conferida} />
                    <Field
                      label="Diferença"
                      value={diff}
                      valueClass={diff < 0 ? "text-red-400" : diff > 0 ? "text-yellow-400" : ""}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">
                      Motivo da ocorrência *
                    </label>
                    <select
                      value={divergentesForm[it.id]?.motivo_ocorrencia_id || ""}
                      onChange={(e) => updateDivergente(it.id, { motivo_ocorrencia_id: e.target.value })}
                      disabled={liberado || itemLoading}
                      className="w-full h-9 px-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
                    >
                      <option value="">Selecione o motivo...</option>
                      {motivos.map((m) => (
                        <option key={m.id} value={m.id}>{m.descricao}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">
                      Observação (opcional)
                    </label>
                    <textarea
                      value={divergentesForm[it.id]?.observacao || ""}
                      onChange={(e) => updateDivergente(it.id, { observacao: e.target.value })}
                      disabled={liberado || itemLoading}
                      rows={2}
                      className="w-full px-3 py-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary resize-none disabled:opacity-60"
                    />
                  </div>
                  {!liberado && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleLiberarItemDivergente(it.id)}
                        disabled={itemLoading || submittingOcorrencias || !motivoSelecionado}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {itemLoading && <Loader2 size={12} className="animate-spin" />}
                        Registrar ocorrência e liberar item
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="shrink-0">
          {step === "vazio" ? (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Fechar
            </button>
          ) : step === "resumo" ? (
            <>
              <button
                onClick={onClose}
                disabled={liberandoConferidos}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleLiberarConferidos}
                disabled={liberandoConferidos || loading || grupos.conferidos.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {liberandoConferidos && <Loader2 size={14} className="animate-spin" />}
                Liberar {grupos.conferidos.length} item(ns) conferido(s)
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleClose}
                disabled={submittingOcorrencias}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {divergentesPendentes.length === 0 ? "Fechar" : "Cancelar"}
              </button>
              {divergentesPendentes.length > 0 && (
                <button
                  onClick={handleRegistrarOcorrencias}
                  disabled={submittingOcorrencias || loading || divergentesElegiveis.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  title={divergentesElegiveis.length === 0 ? "Selecione ao menos um motivo" : undefined}
                >
                  {submittingOcorrencias && <Loader2 size={14} className="animate-spin" />}
                  Registrar todos pendentes ({divergentesElegiveis.length})
                </button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone: "neutral" | "green" | "red" | "gray" }) {
  const toneClass: Record<string, string> = {
    neutral: "border-border bg-secondary/40",
    green: "border-green-500/30 bg-green-500/5",
    red: "border-red-500/30 bg-red-500/5",
    gray: "border-border bg-secondary/30",
  };
  const valueClass: Record<string, string> = {
    neutral: "text-foreground",
    green: "text-green-400",
    red: "text-red-400",
    gray: "text-muted-foreground",
  };
  return (
    <div className={cn("rounded-lg border p-3", toneClass[tone])}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", valueClass[tone])}>{value}</p>
    </div>
  );
}

function Field({ label, value, valueClass }: { label: string; value: number | string; valueClass?: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className={cn("font-mono text-base font-semibold mt-0.5", valueClass)}>{value}</p>
    </div>
  );
}
