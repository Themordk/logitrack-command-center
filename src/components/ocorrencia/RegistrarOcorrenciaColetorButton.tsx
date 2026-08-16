import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronUp, Camera, X } from "lucide-react";
import { ActionButton } from "@/components/coletor/ActionButton";
import type { OcorrenciaContexto } from "./RegistrarOcorrenciaModal";
import { parseError } from "@/lib/errorMapper";

interface Props {
  contexto: OcorrenciaContexto;
  onSuccess?: (resultado: { ocorrencia_id: string; numero_ocorrencia: number }) => void;
  label?: string;
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
  ["OUTROS", "Outros"],
];

const inputCls = "w-full bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 text-sm text-white placeholder:text-[hsl(213,31%,35%)] focus:outline-none focus:border-[hsl(217,91%,50%)]";
const labelCls = "text-[10px] uppercase text-[hsl(213,31%,45%)] block mb-1";

export function RegistrarOcorrenciaColetorButton({ contexto, onSuccess, label = "Registrar Ocorrência" }: Props) {
  const { tenantId, empresaId, armazemId, usuarioId } = useTenant();
  const [open, setOpen] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [motivos, setMotivos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState(false);

  // Campos opcionais (detalhes)
  const [tipo, setTipo] = useState("OUTROS");
  const [categoria, setCategoria] = useState("CORRETIVA");
  const [prioridade, setPrioridade] = useState("NORMAL");
  const [qtdEsp, setQtdEsp] = useState("0");
  const [qtdReal, setQtdReal] = useState("0");
  const [lote, setLote] = useState("");
  const [validade, setValidade] = useState("");
  const [obs, setObs] = useState("");

  // Evidência fotográfica
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setMotivoId("");
    setShowDetalhes(false);
    setTipo("OUTROS");
    setCategoria("CORRETIVA");
    setPrioridade("NORMAL");
    setQtdEsp(contexto.quantidade_esperada != null ? String(contexto.quantidade_esperada) : "0");
    setQtdReal(contexto.quantidade_real != null ? String(contexto.quantidade_real) : "0");
    setLote("");
    setValidade("");
    setObs("");
    setFoto(null);
    setFotoPreview(null);
  }, [open]);

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setFotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Carregar motivos filtrados pela etapa do contexto
  useEffect(() => {
    const etapa = contexto.etapa;
    if (!open || !tenantId || !etapa) { setMotivos([]); return; }
    (async () => {
      const { data, error } = await (supabase as any)
        .from("motivo_ocorrencia")
        .select("id, descricao, categoria_padrao, prioridade_padrao, empresa_id")
        .eq("tenant_id", tenantId)
        .eq("etapa_ocorrencia", etapa)
        .eq("ativo", true)
        .order("descricao");
      if (error) { toast.error(parseError(error, "registrar-ocorrencia-coletor-button").title); return; }
      setMotivos((data || []).filter((m: any) => !m.empresa_id || m.empresa_id === empresaId));
    })();
  }, [open, tenantId, empresaId, contexto.etapa]);

  // Ao selecionar motivo, herda defaults
  const motivoAtual = useMemo(() => motivos.find((m) => m.id === motivoId), [motivos, motivoId]);
  useEffect(() => {
    if (motivoAtual) {
      setCategoria(motivoAtual.categoria_padrao || "CORRETIVA");
      setPrioridade(motivoAtual.prioridade_padrao || "NORMAL");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motivoId]);

  const canSubmit = !!motivoId && !saving && !uploading && !!contexto.etapa;
  const divergencia = Math.abs(Number(qtdEsp || 0) - Number(qtdReal || 0));

  const submit = async () => {
    if (!canSubmit || !tenantId || !usuarioId || !contexto.etapa) return;
    setSaving(true);
    try {


      const { data, error } = await (supabase as any).rpc("registrar_ocorrencia_operacional", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_armazem_id: armazemId,
        p_etapa_ocorrencia: contexto.etapa,
        p_tipo_ocorrencia: tipo,
        p_motivo_ocorrencia_id: motivoId,
        p_produto_id: contexto.produto_id || null,
        p_endereco_id: contexto.endereco_id || null,
        p_tarefa_id: contexto.tarefa_id || null,
        p_tarefa_execucao_id: contexto.tarefa_execucao_id || null,
        p_documento_origem_id: contexto.documento_origem_id || null,
        p_tipo_documento_origem: contexto.tipo_documento_origem || null,
        p_usuario_criador_id: usuarioId,
        p_usuario_causador_id: contexto.usuario_causador_id || null,
        p_quantidade_esperada: Number(qtdEsp || 0),
        p_quantidade_real: Number(qtdReal || 0),
        p_lote: lote || null,
        p_validade: validade || null,
        p_observacao: obs || null,
        p_prioridade: prioridade,
        p_categoria: categoria || "CORRETIVA",
      });
      if (error) { toast.error(parseError(error, "registrar-ocorrencia-coletor-button").title); return; }
      let result: any = data;
      if (typeof data === "string") { try { result = JSON.parse(data); } catch { /* keep */ } }
      if (result?.sucesso === false) { toast.error(result.mensagem || "Erro ao registrar ocorrência"); return; }

      if (foto && result?.ocorrencia_id) {
        setUploading(true);
        const { error: anexoErro } = await uploadAnexoOcorrencia({
          file: foto,
          tenantId,
          ocorrenciaId: result.ocorrencia_id,
          usuarioId,
          origem: "COLETOR",
        });
        setUploading(false);
        if (anexoErro) toast.error("Ocorrência registrada, mas falha ao enviar foto.");
      }


      toast.success(result?.mensagem || "Ocorrência registrada!");
      onSuccess?.({ ocorrencia_id: result?.ocorrencia_id, numero_ocorrencia: result?.numero_ocorrencia });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ActionButton onClick={() => setOpen(true)} variant="warning">
        <AlertTriangle size={18} /> {label}
      </ActionButton>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
          <div className="w-full max-w-md bg-[hsl(222,40%,10%)] border-t border-[hsl(222,35%,22%)] rounded-t-3xl p-6 space-y-4 animate-slide-up max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white">Registrar ocorrência</h3>

            {(contexto.produto_descricao || contexto.endereco_descricao) && (
              <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 space-y-1">
                {contexto.produto_descricao && (
                  <p className="text-xs text-white"><span className="text-[hsl(213,31%,45%)]">Produto:</span> {contexto.produto_descricao}</p>
                )}
                {contexto.endereco_descricao && (
                  <p className="text-xs text-white"><span className="text-[hsl(213,31%,45%)]">Endereço:</span> <span className="font-mono">{contexto.endereco_descricao}</span></p>
                )}
              </div>
            )}

            {/* Motivos — único campo obrigatório */}
            <div>
              <label className={labelCls}>Qual o problema? *</label>
              <div className="flex flex-col gap-2 max-h-48 overflow-auto">
                {motivos.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMotivoId(m.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      motivoId === m.id
                        ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                        : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                    }`}
                  >
                    <span className="text-sm text-white">{m.descricao}</span>
                  </button>
                ))}
                {motivos.length === 0 && (
                  <p className="text-xs text-[hsl(213,31%,45%)] text-center py-2">Nenhum motivo cadastrado para esta etapa.</p>
                )}
              </div>
            </div>

            {/* Evidência fotográfica */}
            <div>
              <label className={labelCls}>Evidência (opcional)</label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-[hsl(222,35%,30%)] bg-[hsl(222,40%,12%)] text-sm text-[hsl(213,31%,55%)] cursor-pointer hover:border-[hsl(217,91%,50%)] transition-all flex-1">
                  <Camera size={18} />
                  {fotoPreview ? "Trocar foto" : "Tirar foto / Selecionar imagem"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFotoChange}
                  />
                </label>
                {fotoPreview && (
                  <button
                    onClick={() => { setFoto(null); setFotoPreview(null); }}
                    className="p-2 rounded-lg bg-red-500/20 text-red-400"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              {fotoPreview && (
                <img
                  src={fotoPreview}
                  alt="Evidência"
                  className="mt-2 rounded-xl border border-[hsl(222,35%,22%)] max-h-32 object-cover w-full"
                />
              )}
            </div>

            {/* Toggle de detalhes adicionais */}
            <button
              type="button"
              onClick={() => setShowDetalhes(!showDetalhes)}
              className="flex items-center gap-2 text-xs text-[hsl(217,91%,60%)] hover:text-[hsl(217,91%,70%)] py-1"
            >
              {showDetalhes ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showDetalhes ? "Ocultar detalhes" : "Adicionar detalhes (opcional)"}
            </button>

            {showDetalhes && (
              <div className="space-y-3 border-t border-[hsl(222,35%,22%)] pt-3">
                <div>
                  <label className={labelCls}>Tipo de ocorrência</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
                    {TIPOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Categoria</label>
                    <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls}>
                      <option value="CORRETIVA">Corretiva</option>
                      <option value="PREVENTIVA">Preventiva</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Prioridade</label>
                    <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={inputCls}>
                      <option value="BAIXA">Baixa</option>
                      <option value="NORMAL">Normal</option>
                      <option value="ALTA">Alta</option>
                      <option value="CRITICA">Crítica</option>
                    </select>
                  </div>
                </div>

                {contexto.produto_id && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={labelCls}>Esperada</label>
                        <input type="number" value={qtdEsp} onChange={(e) => setQtdEsp(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Real</label>
                        <input type="number" value={qtdReal} onChange={(e) => setQtdReal(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Divergência</label>
                        <div className={`${inputCls} flex items-center font-mono ${divergencia > 0 ? "text-red-400" : "text-green-400"}`}>{divergencia}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Lote</label>
                        <input value={lote} onChange={(e) => setLote(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Validade</label>
                        <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className={labelCls}>Observação</label>
                  <textarea
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    rows={2}
                    placeholder="Descreva detalhes..."
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <ActionButton onClick={() => setOpen(false)} variant="secondary">Cancelar</ActionButton>
              <ActionButton onClick={submit} disabled={!canSubmit} loading={saving || uploading} variant="primary">
                {uploading ? "Enviando foto..." : "Confirmar"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
