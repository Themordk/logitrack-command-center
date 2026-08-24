import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { Loader2, CheckCircle } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

type Step = "scan_endereco" | "scan_produto" | "form" | "done";

export function MapearPickingPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const armazemId = localStorage.getItem("core_armazem_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const [step, setStep] = useState<Step>("scan_endereco");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Endereço
  const [enderecoId, setEnderecoId] = useState("");
  const [enderecoDesc, setEnderecoDesc] = useState("");
  const [scannedEndereco, setScannedEndereco] = useState("");

  // Produto
  const [produtoId, setProdutoId] = useState("");
  const [produtoNome, setProdutoNome] = useState("");
  const [scannedEan, setScannedEan] = useState("");

  // Form
  const [estMinimo, setEstMinimo] = useState("");
  const [estMaximo, setEstMaximo] = useState("");
  const [tipoPicking, setTipoPicking] = useState("FRACIONADO");
  const [submitting, setSubmitting] = useState(false);

  // Check if coming from Consulta Produto with pre-loaded product
  useEffect(() => {
    const fromConsulta = sessionStorage.getItem("mapear_from_consulta");
    if (fromConsulta) {
      sessionStorage.removeItem("mapear_from_consulta");
      try {
        const parsed = JSON.parse(fromConsulta);
        if (parsed.produtoId && parsed.produtoNome) {
          setProdutoId(parsed.produtoId);
          setProdutoNome(parsed.produtoNome);
        }
      } catch { /* ignore parse errors */ }
    }
  }, []);


  const handleScanEndereco = async (code: string) => {
    setScannedEndereco(code);
    setError("");
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("endereco")
        .select("id, descricao")
        .or(`descricao.eq.${code},codigo_endereco.eq.${code}`)
        .limit(1);
      if (!data || data.length === 0) {
        setError("Endereço não encontrado.");
        return;
      }
      setEnderecoId(data[0].id);
      setEnderecoDesc(data[0].descricao);
      // If product is already known (from Consulta), skip to form
      if (produtoId) {
        setStep("form");
      } else {
        setStep("scan_produto");
      }
    } catch {
      setError("Erro ao buscar endereço.");
    } finally {
      setLoading(false);
    }
  };

  const handleScanProduto = async (code: string) => {
    setScannedEan(code);
    setError("");
    setLoading(true);
    try {
      const { data: emb } = await (supabase as any)
        .from("produto_embalagem")
        .select("produto_id, produto:produto_id(descricao, sku)")
        .eq("ean", code)
        .limit(1);
      if (!emb || emb.length === 0) {
        setError("Produto não encontrado para este EAN.");
        return;
      }
      setProdutoId(emb[0].produto_id);
      setProdutoNome(`${emb[0].produto?.sku} - ${emb[0].produto?.descricao}`);
      setStep("form");
    } catch {
      setError("Erro ao buscar produto.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!estMinimo || !estMaximo) {
      setError("Preencha estoque mínimo e máximo.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("rpc_mapear_picking", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_armazem_id: armazemId,
        p_produto_id: produtoId,
        p_endereco_id: enderecoId,
        p_tipo_picking: tipoPicking,
        p_est_minimo: Number(estMinimo),
        p_est_maximo: Number(estMaximo),
      });

      if (rpcError) throw rpcError;

      if (data && !data.sucesso) {
        // Produto já mapeado — mostrar mensagem amigável com endereço atual
        setError(data.mensagem);
        return;
      }

      setStep("done");
    } catch (err: any) {
      setError(err.message || "Erro ao salvar.");
    } finally {
      setSubmitting(false);
    }
  };

  const cardClass = "bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3";
  const labelClass = "text-xs text-[hsl(213,31%,55%)]";
  const valueClass = "text-sm font-bold text-white";
  const inputClass = "w-full h-10 px-3 rounded-lg border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]";

  return (
    <ColetorLayout title="Mapear Picking" onNavigate={onNavigate} showBack backPath="/coletor/consulta">
      {step === "scan_endereco" && (
        <>
          {produtoId && produtoNome && (
            <div className={cardClass}>
              <span className={labelClass}>Produto (da consulta)</span>
              <p className={valueClass}>{produtoNome}</p>
            </div>
          )}
          <ScanField label="Escanear Endereço" onScan={handleScanEndereco} lastScanned={scannedEndereco} />
          {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>}
        </>
      )}

      {step === "scan_produto" && (
        <>
          <div className={cardClass}>
            <span className={labelClass}>Endereço</span>
            <p className={valueClass}>{enderecoDesc}</p>
          </div>
          <ScanField label="Escanear EAN do Produto" onScan={handleScanProduto} lastScanned={scannedEan} />
          {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>}
        </>
      )}

      {step === "form" && (
        <>
          <div className={cardClass}>
            <span className={labelClass}>Endereço</span>
            <p className={valueClass}>{enderecoDesc}</p>
          </div>
          <div className={cardClass}>
            <span className={labelClass}>Produto</span>
            <p className={valueClass}>{produtoNome}</p>
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className={`${labelClass} block mb-1`}>Estoque Mínimo *</label>
              <input type="number" value={estMinimo} onChange={(e) => setEstMinimo(e.target.value)} className={inputClass} placeholder="0" />
            </div>
            <div>
              <label className={`${labelClass} block mb-1`}>Estoque Máximo *</label>
              <input type="number" value={estMaximo} onChange={(e) => setEstMaximo(e.target.value)} className={inputClass} placeholder="0" />
            </div>
            <div>
              <label className={`${labelClass} block mb-1`}>Tipo de Picking *</label>
              <select value={tipoPicking} onChange={(e) => setTipoPicking(e.target.value)} className={inputClass}>
                <option value="FRACIONADO">Fracionado</option>
                <option value="FECHADO">Fechado</option>
              </select>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-[hsl(217,91%,50%)] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Confirmar Picking
            </button>
          </div>
        </>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <CheckCircle size={48} className="text-[hsl(142,76%,36%)]" />
          <p className="text-lg font-bold text-white">Picking mapeado!</p>
          <p className="text-sm text-[hsl(213,31%,55%)] text-center">{produtoNome}<br />→ {enderecoDesc}</p>
          <button
            onClick={() => {
              setStep("scan_endereco");
              setEnderecoId(""); setEnderecoDesc(""); setScannedEndereco("");
              setProdutoId(""); setProdutoNome(""); setScannedEan("");
              setEstMinimo(""); setEstMaximo(""); setTipoPicking("FRACIONADO");
            }}
            className="w-full h-12 rounded-xl bg-[hsl(217,91%,50%)] text-white font-bold text-sm active:scale-[0.98] transition-all"
          >
            Mapear outro produto
          </button>
        </div>
      )}

      {error && <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-300 text-sm text-center">{error}</div>}
    </ColetorLayout>
  );
}
