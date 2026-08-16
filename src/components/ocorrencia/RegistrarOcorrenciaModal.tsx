import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Package, MapPin, User, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { parseError } from "@/lib/errorMapper";
import { AnexoPicker } from "@/components/ocorrencia/AnexoPicker";
import { uploadAnexoOcorrencia } from "@/lib/ocorrenciaAnexos";


export interface OcorrenciaContexto {
  etapa?: string;
  produto_id?: string;
  produto_descricao?: string;
  endereco_id?: string;
  endereco_descricao?: string;
  tarefa_id?: string;
  tarefa_execucao_id?: string;
  documento_origem_id?: string;
  tipo_documento_origem?: string;
  usuario_causador_id?: string;
  usuario_causador_nome?: string;
  quantidade_esperada?: number;
  quantidade_real?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contexto: OcorrenciaContexto;
  onSuccess?: (resultado: { ocorrencia_id: string; numero_ocorrencia: number }) => void;
}

const TIPOS: Array<[string, string]> = [
  ["FALTA", "Falta"],
  ["SOBRA", "Sobra"],
  ["AVARIA", "Avaria"],
  ["DIVERGENCIA_INVENTARIO", "Divergência de inventário"],
  ["EXTRAVIO", "Extravio"],
  ["PRODUTO_INCORRETO", "Produto incorreto"],
  ["VALIDADE_INCORRETA", "Validade incorreta"],
  ["LOTE_INCORRETO", "Lote incorreto"],
  ["EXCLUSAO_DOCUMENTO", "Exclusão de documento"],
  ["OUTROS", "Outros"],
];

const ETAPAS: Array<[string, string]> = [
  ["RECEBIMENTO", "Recebimento"],
  ["ARMAZENAGEM", "Armazenagem"],
  ["ABASTECIMENTO", "Abastecimento"],
  ["MOVIMENTACAO", "Movimentação"],
  ["SEPARACAO", "Separação"],
  ["CONFERENCIA", "Conferência"],
  ["EXPEDICAO", "Expedição"],
  ["INVENTARIO", "Inventário"],
  ["AUDITORIA", "Auditoria"],
  ["OUTROS", "Outros"],
];


const inputClass = "h-9 px-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";
const labelClass = "block text-[10px] uppercase font-medium text-muted-foreground mb-1";

export function RegistrarOcorrenciaModal({ open, onClose, contexto, onSuccess }: Props) {
  const { tenantId, empresaId, armazemId, usuarioId } = useTenant();

  const etapaLocked = !!contexto.etapa;
  const [etapa, setEtapa] = useState<string>(contexto.etapa || "");
  const [tipoOcorrencia, setTipoOcorrencia] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [prioridade, setPrioridade] = useState("NORMAL");
  const [quantidadeEsperada, setQuantidadeEsperada] = useState<string>("0");
  const [quantidadeReal, setQuantidadeReal] = useState<string>("0");
  const [lote, setLote] = useState("");
  const [validade, setValidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [motivos, setMotivos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEtapa(contexto.etapa || "");
    setTipoOcorrencia("");
    setMotivoId("");
    setCategoria("");
    setPrioridade("NORMAL");
    setQuantidadeEsperada("0");
    setQuantidadeReal("0");
    setLote("");
    setValidade("");
    setObservacao("");
  }, [open, contexto.etapa]);

  useEffect(() => {
    if (!open || !tenantId || !etapa) { setMotivos([]); return; }
    (async () => {
      const { data, error } = await (supabase as any)
        .from("motivo_ocorrencia")
        .select("id, descricao, categoria_padrao, prioridade_padrao, empresa_id")
        .eq("tenant_id", tenantId)
        .eq("etapa_ocorrencia", etapa)
        .eq("ativo", true)
        .order("descricao");
      if (error) { toast.error(parseError(error, "registrar-ocorrencia-modal").title); return; }
      const filtered = (data || []).filter((m: any) => !m.empresa_id || m.empresa_id === empresaId);
      setMotivos(filtered);
    })();
  }, [open, tenantId, empresaId, etapa]);

  const motivoAtual = useMemo(() => motivos.find((m) => m.id === motivoId), [motivos, motivoId]);

  useEffect(() => {
    if (motivoAtual) {
      if (motivoAtual.categoria_padrao && !categoria) setCategoria(motivoAtual.categoria_padrao);
      if (motivoAtual.prioridade_padrao) setPrioridade(motivoAtual.prioridade_padrao);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motivoId]);

  const divergencia = Math.abs(Number(quantidadeEsperada || 0) - Number(quantidadeReal || 0));

  const canSubmit = !!etapa && !!tipoOcorrencia && !!motivoId && !!categoria && !!prioridade && !saving;

  const submit = async () => {
    if (!canSubmit || !tenantId || !usuarioId) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("registrar_ocorrencia_operacional", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_armazem_id: armazemId,
        p_etapa_ocorrencia: etapa,
        p_tipo_ocorrencia: tipoOcorrencia,
        p_motivo_ocorrencia_id: motivoId,
        p_produto_id: contexto.produto_id || null,
        p_endereco_id: contexto.endereco_id || null,
        p_tarefa_id: contexto.tarefa_id || null,
        p_tarefa_execucao_id: contexto.tarefa_execucao_id || null,
        p_documento_origem_id: contexto.documento_origem_id || null,
        p_tipo_documento_origem: contexto.tipo_documento_origem || null,
        p_usuario_criador_id: usuarioId,
        p_usuario_causador_id: contexto.usuario_causador_id || null,
        p_quantidade_esperada: Number(quantidadeEsperada || 0),
        p_quantidade_real: Number(quantidadeReal || 0),
        p_lote: lote || null,
        p_validade: validade || null,
        p_observacao: observacao || null,
        p_prioridade: prioridade,
        p_categoria: categoria,
      });
      if (error) { toast.error(parseError(error, "registrar-ocorrencia-modal").title); return; }
      let result: any = data;
      if (typeof data === "string") {
        try { result = JSON.parse(data); } catch { /* keep */ }
      }
      if (result?.sucesso === false) {
        toast.error(result.mensagem || "Erro ao registrar ocorrência");
        return;
      }

      if (arquivo && result?.ocorrencia_id) {
        setUploading(true);
        const { error: anexoErro } = await uploadAnexoOcorrencia({
          file: arquivo,
          tenantId,
          ocorrenciaId: result.ocorrencia_id,
          usuarioId,
          origem: "ADMIN",
        });
        setUploading(false);
        if (anexoErro) toast.error("Ocorrência registrada, mas falha ao enviar anexo.");
      }

      toast.success(result?.mensagem || "Ocorrência registrada com sucesso");
      onSuccess?.({ ocorrencia_id: result?.ocorrencia_id, numero_ocorrencia: result?.numero_ocorrencia });
      onClose();

    } finally {
      setSaving(false);
    }
  };

  const showContexto = !!(contexto.produto_descricao || contexto.endereco_descricao || contexto.usuario_causador_nome);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Registrar ocorrência operacional</DialogTitle>
          {etapaLocked && (
            <p className="text-xs text-muted-foreground">
              Etapa: {ETAPAS.find(([k]) => k === etapa)?.[1] ?? etapa}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-3 py-2">
          {showContexto && (
            <div className="p-3 rounded-md border border-border bg-secondary/30 text-xs space-y-1.5">
              {contexto.produto_descricao && (
                <div className="flex items-start gap-2 text-foreground">
                  <Package size={12} className="mt-0.5 text-muted-foreground" />
                  <span><span className="text-muted-foreground">Produto:</span> {contexto.produto_descricao}</span>
                </div>
              )}
              {contexto.endereco_descricao && (
                <div className="flex items-start gap-2 text-foreground">
                  <MapPin size={12} className="mt-0.5 text-muted-foreground" />
                  <span><span className="text-muted-foreground">Endereço:</span> <span className="font-mono">{contexto.endereco_descricao}</span></span>
                </div>
              )}
              {contexto.usuario_causador_nome && (
                <div className="flex items-start gap-2 text-foreground">
                  <User size={12} className="mt-0.5 text-muted-foreground" />
                  <span><span className="text-muted-foreground">Causador:</span> {contexto.usuario_causador_nome}</span>
                </div>
              )}
            </div>
          )}

          {!etapaLocked && (
            <div>
              <label className={labelClass}>Etapa *</label>
              <select value={etapa} onChange={(e) => { setEtapa(e.target.value); setMotivoId(""); }} className={cn(inputClass, "w-full")}>
                <option value="">Selecionar...</option>
                {ETAPAS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelClass}>Tipo de ocorrência *</label>
            <select value={tipoOcorrencia} onChange={(e) => setTipoOcorrencia(e.target.value)} className={cn(inputClass, "w-full")}>
              <option value="">Selecionar...</option>
              {TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Motivo *</label>
            <select value={motivoId} onChange={(e) => setMotivoId(e.target.value)} disabled={!etapa} className={cn(inputClass, "w-full disabled:opacity-60")}>
              <option value="">{etapa ? "Selecionar..." : "Selecione a etapa primeiro"}</option>
              {motivos.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Categoria *</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={cn(inputClass, "w-full")}>
                <option value="">Selecionar...</option>
                <option value="PREVENTIVA">Preventiva — risco identificado antes do impacto</option>
                <option value="CORRETIVA">Corretiva — falha já ocorrida</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Prioridade *</label>
              <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={cn(inputClass, "w-full")}>
                <option value="BAIXA">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
                <option value="CRITICA">Crítica</option>
              </select>
            </div>
          </div>

          <div className="rounded-md border border-border">
            <button
              type="button"
              onClick={() => setShowQtd((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-foreground"
            >
              <span>Detalhes de quantidade (opcional)</span>
              {showQtd ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showQtd && (
              <div className="px-3 pb-3 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Qtd. esperada</label>
                    <input type="number" step="any" value={quantidadeEsperada} onChange={(e) => setQuantidadeEsperada(e.target.value)} className={cn(inputClass, "w-full")} />
                  </div>
                  <div>
                    <label className={labelClass}>Qtd. real</label>
                    <input type="number" step="any" value={quantidadeReal} onChange={(e) => setQuantidadeReal(e.target.value)} className={cn(inputClass, "w-full")} />
                  </div>
                  <div>
                    <label className={labelClass}>Divergência</label>
                    <div className={cn(
                      "h-9 px-3 rounded-md border border-border bg-secondary/20 text-xs font-mono flex items-center",
                      divergencia > 0 ? "text-red-400" : "text-green-400",
                    )}>
                      {divergencia}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Lote</label>
                    <input value={lote} onChange={(e) => setLote(e.target.value)} className={cn(inputClass, "w-full")} placeholder="Opcional" />
                  </div>
                  <div>
                    <label className={labelClass}>Validade</label>
                    <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={cn(inputClass, "w-full")} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              placeholder="Descreva detalhes da ocorrência..."
              className="w-full px-3 py-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary resize-none"
            />
          </div>

          <AnexoPicker file={arquivo} onChange={setArquivo} disabled={saving} />

        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
            Registrar ocorrência
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
