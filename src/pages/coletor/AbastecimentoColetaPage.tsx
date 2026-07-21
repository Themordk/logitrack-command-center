import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay } from "@/components/coletor/StatusOverlay";
import { Archive, CheckCircle2 } from "lucide-react";
import { RegistrarOcorrenciaColetorButton } from "@/components/ocorrencia/RegistrarOcorrenciaColetorButton";

interface Props { onNavigate: (path: string) => void; }

type OverlayType = "success" | "error" | "warning" | null;

export function AbastecimentoColetaPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const empresaId = localStorage.getItem("core_empresa_id") || "";
  const usuarioId = localStorage.getItem("core_usuario_id") || "";

  const tarefaId = sessionStorage.getItem("abast_tarefa_id") || "";
  const produtoId = sessionStorage.getItem("abast_produto_id") || "";
  const produtoSku = sessionStorage.getItem("abast_produto_sku") || "";
  const produtoDesc = sessionStorage.getItem("abast_produto_desc") || "";
  const qtdRestante = Number(sessionStorage.getItem("abast_qtd_restante") || "0");
  const enderecoOrigemIdEsperado = sessionStorage.getItem("abast_endereco_origem_id") || "";
  const enderecoOrigemDesc = sessionStorage.getItem("abast_endereco_origem_desc") || "";
  const saldoOrigem = Number(sessionStorage.getItem("abast_saldo_origem") || "0");
  const huCodigo = sessionStorage.getItem("abast_hu_codigo") || "";

  const [enderecoConfirmado, setEnderecoConfirmado] = useState(false);
  const [enderecoScannedDesc, setEnderecoScannedDesc] = useState("");
  const [produtoConfirmado, setProdutoConfirmado] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  const handleScanEndereco = async (code: string) => {
    const { data } = await (supabase as any)
      .from("endereco")
      .select("id, descricao, situacao")
      .eq("codigo_endereco", Number(code))
      .eq("tenant_id", tenantId)
      .limit(1);

    if (!data || data.length === 0) {
      setOverlay("error"); setOverlayMsg("Endereço não encontrado"); return;
    }
    if (!["LIVRE", "OCUPADO"].includes(data[0].situacao)) {
      setOverlay("error"); setOverlayMsg(`Endereço ${data[0].descricao} está ${data[0].situacao}`); return;
    }
    if (data[0].id !== enderecoOrigemIdEsperado) {
      setOverlay("error"); setOverlayMsg("Endereço não corresponde à origem esperada"); return;
    }

    setEnderecoConfirmado(true);
    setEnderecoScannedDesc(data[0].descricao);
    setOverlay("success"); setOverlayMsg(`Endereço: ${data[0].descricao}`);
  };

  const handleScanProduto = async (code: string) => {
    const { data: emb } = await (supabase as any)
      .from("produto_embalagem")
      .select("produto_id")
      .eq("tenant_id", tenantId)
      .eq("ean", code)
      .limit(1)
      .maybeSingle();

    let foundProdutoId = emb?.produto_id;

    if (!foundProdutoId) {
      const { data: prod } = await (supabase as any)
        .from("produto")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("sku", code)
        .limit(1)
        .maybeSingle();
      foundProdutoId = prod?.id;
    }

    if (!foundProdutoId) {
      setOverlay("error"); setOverlayMsg("Produto não encontrado"); return;
    }
    if (foundProdutoId !== produtoId) {
      setOverlay("error"); setOverlayMsg("Produto não corresponde à tarefa"); return;
    }

    setProdutoConfirmado(true);
    setQuantidade(String(qtdRestante));
    setOverlay("success"); setOverlayMsg(`Produto: ${produtoSku}`);
  };

  const handleConfirmarColeta = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("rpc_coletor_abastecimento_confirmar_coleta" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_tarefa_id: tarefaId,
        p_endereco_origem_id: enderecoOrigemIdEsperado,
        p_quantidade: Number(quantidade),
        p_usuario_id: usuarioId,
      });
      if (error) throw error;
      setOverlay("success"); setOverlayMsg("Coleta confirmada!");
      setTimeout(() => onNavigate("/coletor/movimentos/abastecimento"), 1200);
    } catch (err: any) {
      setOverlay("error"); setOverlayMsg(err.message || "Erro ao confirmar coleta");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ColetorLayout title="Coleta Abastecimento" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/abastecimento">
      <StatusOverlay type={overlay} message={overlayMsg} />

      <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 space-y-1">
        <div className="flex items-center gap-2">
          <Archive size={16} className="text-[hsl(217,91%,60%)] shrink-0" />
          <span className="text-lg font-bold text-white">{enderecoOrigemDesc}</span>
        </div>
        <div className="text-[11px] text-[hsl(213,31%,55%)]">
          Saldo disponível: <b className="text-white">{saldoOrigem}</b>
        </div>
        <div className="border-t border-[hsl(222,35%,22%)] pt-1 mt-1" />
        <p className="font-mono text-xs text-[hsl(217,91%,60%)]">{produtoSku}</p>
        <p className="text-sm font-bold text-white">{produtoDesc}</p>
        <p className="text-xs text-[hsl(213,31%,55%)]">
          Qtd restante: <b className="text-[hsl(45,93%,47%)]">{qtdRestante}</b>
        </p>
        {huCodigo && (
          <div className="flex items-center gap-1.5 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30 px-2 py-1 mt-1">
            <Archive size={12} className="text-[hsl(45,93%,47%)] shrink-0" />
            <span className="text-[11px] font-mono font-bold text-[hsl(45,93%,80%)]">HU: {huCodigo}</span>
          </div>
        )}
      </div>

      {!enderecoConfirmado && (
        <div className="mt-3">
          <ScanField label="Escanear Endereço de Origem" onScan={handleScanEndereco} placeholder="Leia o código do endereço" />
        </div>
      )}

      {enderecoConfirmado && !produtoConfirmado && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-[hsl(213,31%,55%)]">
            <CheckCircle2 size={14} className="text-[#22C55E]" />
            <span>Endereço: <b className="text-white">{enderecoScannedDesc}</b></span>
          </div>
          <ScanField label="Escanear Produto" onScan={handleScanProduto} placeholder="Leia o EAN ou SKU" />
        </div>
      )}

      {enderecoConfirmado && produtoConfirmado && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-[hsl(213,31%,55%)]">
            <CheckCircle2 size={14} className="text-[#22C55E]" />
            <span>Endereço: <b className="text-white">{enderecoScannedDesc}</b></span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[hsl(213,31%,55%)]">
            <CheckCircle2 size={14} className="text-[#22C55E]" />
            <span>Produto: <b className="text-white">{produtoSku}</b></span>
          </div>

          <div>
            <label className="block text-sm font-semibold text-[hsl(213,31%,65%)] mb-1 uppercase">
              Quantidade a Coletar
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="0"
              className="w-full h-16 px-4 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-3xl font-bold text-white text-center outline-none focus:border-[hsl(217,91%,50%)] transition-colors"
            />
          </div>

          <ActionButton
            onClick={handleConfirmarColeta}
            disabled={!quantidade || Number(quantidade) <= 0 || saving}
            loading={saving}
          >
            CONFIRMAR COLETA
          </ActionButton>

          <RegistrarOcorrenciaColetorButton
            contexto={{
              etapa: "ABASTECIMENTO",
              produto_id: produtoId || undefined,
              produto_descricao: produtoDesc,
              tarefa_id: tarefaId,
              endereco_id: enderecoOrigemIdEsperado || undefined,
              endereco_descricao: enderecoOrigemDesc,
              quantidade_esperada: Number(qtdRestante || 0),
            }}
          />
        </div>
      )}
    </ColetorLayout>
  );
}
