import { useEffect, useState } from "react";
import { Archive, Plus, ScanLine, X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";
import { ActionButton } from "./ActionButton";
import { ScanField } from "./ScanField";
import { useSolicitarImpressao } from "@/hooks/useSolicitarImpressao";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";

interface HUSelectorModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (huId: string, codigoHU: string, tipoHU: string, tamanho: string) => void;
  initialMode?: "scan" | "create";
  movimentoEntradaId?: string | null;
}

type Mode = "scan" | "create";

interface HuBusca {
  encontrada: boolean;
  disponivel: boolean;
  hu_id: string;
  codigo_hu: string;
  tipo_hu: string;
  tamanho: string;
  status: string;
  disponibilidade: string;
  qtd_itens: number;
  mensagem: string;
}

export function HUSelectorModal({
  open,
  onClose,
  onSelect,
  initialMode = "scan",
  movimentoEntradaId,
}: HUSelectorModalProps) {
  const result = useResultDialog({ coletorMode: true });
  const [mode, setMode] = useState<Mode>(initialMode);
  const [scanResult, setScanResult] = useState<HuBusca | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [tipoHu, setTipoHu] = useState<string>("PALLET");
  const [tamanho, setTamanho] = useState<string>("M");
  const [creating, setCreating] = useState(false);
  const { solicitar } = useSolicitarImpressao();

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setScanResult(null);
      setScanError(null);
      setTipoHu("PALLET");
      setTamanho("M");
    }
  }, [open, initialMode]);

  if (!open) return null;

  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const armazemId = localStorage.getItem("core_armazem_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  const handleScan = async (code: string) => {
    if (!tenantId) return;
    setScanning(true);
    setScanResult(null);
    setScanError(null);
    try {
      const { data, error } = await (supabase as any).rpc("buscar_hu_por_codigo", {
        p_tenant_id: tenantId,
        p_codigo_hu: code,
      });
      if (error) throw error;
      const r = (typeof data === "string" ? JSON.parse(data) : data) as HuBusca;
      if (!r?.encontrada) {
        setScanError(r?.mensagem || "HU não encontrada");
        return;
      }
      if (!r.disponivel) {
        setScanError(r.mensagem || "HU não está disponível");
        return;
      }
      setScanResult(r);
    } catch (err: any) {
      const parsed = parseError(err, "hu-selector");
      setScanError(parsed.title);
    } finally {
      setScanning(false);
    }
  };

  const handleUseScanned = () => {
    if (!scanResult) return;
    onSelect(scanResult.hu_id, scanResult.codigo_hu, scanResult.tipo_hu, scanResult.tamanho);
    onClose();
  };

  const handleCreate = async () => {
    if (!tenantId) return;
    setCreating(true);
    try {
      let armId = armazemId;
      if (!armId && movimentoEntradaId) {
        const { data: mov } = await (supabase as any)
          .from("movimento_entrada")
          .select("armazem_id")
          .eq("id", movimentoEntradaId)
          .maybeSingle();
        if (mov?.armazem_id) armId = mov.armazem_id;
      }
      const { data, error } = await (supabase as any).rpc("criar_hu_recebimento", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_armazem_id: armId,
        p_tipo_hu: tipoHu,
        p_tamanho: tamanho,
        p_movimento_entrada_id: movimentoEntradaId || null,
        p_usuario_id: usuarioId,
      });
      if (error) throw error;
      const r = typeof data === "string" ? JSON.parse(data) : data;
      if (!r?.sucesso) {
        result.showError(new Error(r?.mensagem || "Erro ao criar HU"), { context: "hu-selector" });
        return;
      }
      toast.success(`HU ${r.codigo_hu} criada!`);
      // Fire-and-forget: impressão automática da etiqueta HU
      solicitar({
        tipoEtiqueta: "HU",
        dados: {
          codigo_hu: r.codigo_hu,
          tipo_hu: r.tipo_hu || "",
          tamanho: r.tamanho || "",
        },
        origem: "RECEBIMENTO_CRIAR_HU",
        documentoOrigemId: r.hu_id,
        tipoDocumentoOrigem: "hu",
        prioridade: 3,
      });
      onSelect(r.hu_id, r.codigo_hu, r.tipo_hu, r.tamanho);
      onClose();
    } catch (err: any) {
      const parsed = parseError(err, "hu-selector");
      result.showParsedError(parsed);
    } finally {
      setCreating(false);
    }
  };

  const tabBase =
    "flex-1 h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-bold border transition-colors";
  const tabActive =
    "bg-[hsl(217,91%,50%)]/15 border-[hsl(217,91%,50%)] text-white";
  const tabIdle =
    "bg-[hsl(222,40%,14%)] border-[hsl(222,35%,22%)] text-[hsl(213,31%,65%)]";

  const selectClass =
    "h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4">
      <ResultDialog {...result.dialogProps} />
      <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-4 flex flex-col gap-3 animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold">
            <Archive size={16} className="text-[hsl(217,91%,60%)]" />
            Selecionar HU
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[hsl(222,40%,14%)] text-[hsl(213,31%,65%)] flex items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode("scan")}
            className={`${tabBase} ${mode === "scan" ? tabActive : tabIdle}`}
          >
            <ScanLine size={14} /> Scan HU
          </button>
          <button
            onClick={() => setMode("create")}
            className={`${tabBase} ${mode === "create" ? tabActive : tabIdle}`}
          >
            <Plus size={14} /> Criar HU
          </button>
        </div>

        {mode === "scan" && (
          <div className="flex flex-col gap-3">
            <ScanField label="Escanear código da HU" onScan={handleScan} />
            {scanning && (
              <div className="flex items-center justify-center gap-2 text-xs text-[hsl(213,31%,55%)]">
                <Loader2 size={14} className="animate-spin" /> Buscando...
              </div>
            )}
            {scanError && (
              <div className="rounded-xl bg-[#E02424]/10 border border-[#E02424]/40 p-3 flex items-start gap-2">
                <XCircle size={16} className="text-[#E02424] shrink-0 mt-0.5" />
                <span className="text-sm text-[#F87171]">{scanError}</span>
              </div>
            )}
            {scanResult && (
              <div className="rounded-xl bg-[hsl(142,71%,45%)]/10 border border-[hsl(142,71%,45%)]/40 p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[hsl(142,71%,45%)]" />
                  <span className="font-mono font-bold text-white">{scanResult.codigo_hu}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[hsl(213,31%,65%)]">
                  <span>Tipo: <b className="text-white">{scanResult.tipo_hu}</b></span>
                  <span>Tam: <b className="text-white">{scanResult.tamanho}</b></span>
                  <span>Itens: <b className="text-white">{scanResult.qtd_itens}</b></span>
                </div>
                <ActionButton onClick={handleUseScanned} variant="success">
                  USAR ESTA HU
                </ActionButton>
              </div>
            )}
          </div>
        )}

        {mode === "create" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider text-[hsl(213,31%,55%)] font-bold">Tipo</label>
                <select value={tipoHu} onChange={(e) => setTipoHu(e.target.value)} className={selectClass}>
                  {["PALLET", "CAIXA", "VOLUME", "OUTRO"].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider text-[hsl(213,31%,55%)] font-bold">Tamanho</label>
                <select value={tamanho} onChange={(e) => setTamanho(e.target.value)} className={selectClass}>
                  {["P", "M", "G", "GG", "EG"].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <ActionButton onClick={handleCreate} loading={creating} variant="success">
              CRIAR HU
            </ActionButton>
          </div>
        )}

        <ActionButton onClick={onClose} variant="secondary">
          CANCELAR
        </ActionButton>
      </div>
    </div>
  );
}
