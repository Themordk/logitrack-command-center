import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay } from "@/components/coletor/StatusOverlay";
import { MapPin, CheckCircle2 } from "lucide-react";
import { RegistrarOcorrenciaColetorButton } from "@/components/ocorrencia/RegistrarOcorrenciaColetorButton";

interface Props { onNavigate: (path: string) => void; }

type OverlayType = "success" | "error" | "warning" | null;

export function AbastecimentoDestinoPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const empresaId = localStorage.getItem("core_empresa_id") || "";
  const usuarioId = localStorage.getItem("core_usuario_id") || "";

  const tarefaId = sessionStorage.getItem("abast_tarefa_id") || "";
  const execId = sessionStorage.getItem("abast_tarefa_execucao_id") || "";
  const produtoId = sessionStorage.getItem("abast_produto_id") || "";
  const produtoSku = sessionStorage.getItem("abast_produto_sku") || "";
  const produtoDesc = sessionStorage.getItem("abast_produto_desc") || "";
  const qtdColetada = Number(sessionStorage.getItem("abast_qtd_coletada") || "0");
  const enderecoDestinoIdEsperado = sessionStorage.getItem("abast_endereco_destino_id") || "";
  const enderecoDestinoDesc = sessionStorage.getItem("abast_endereco_destino_desc") || "";

  const [enderecoConfirmado, setEnderecoConfirmado] = useState(false);
  const [enderecoScannedDesc, setEnderecoScannedDesc] = useState("");
  const [produtoConfirmado, setProdutoConfirmado] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  const [destinoTipo, setDestinoTipo] = useState<string | null>(null);

  const handleScanEndereco = async (code: string) => {
    const { data } = await (supabase as any)
      .from("endereco")
      .select("id, descricao, situacao, tipo_endereco")
      .eq("codigo_endereco", Number(code))
      .eq("tenant_id", tenantId)
      .limit(1);

    if (!data || data.length === 0) {
      setOverlay("error"); setOverlayMsg("Endereço não encontrado"); return;
    }
    if (!["LIVRE", "OCUPADO"].includes(data[0].situacao)) {
      setOverlay("error"); setOverlayMsg(`Endereço ${data[0].descricao} está ${data[0].situacao}`); return;
    }
    if (data[0].id !== enderecoDestinoIdEsperado) {
      setOverlay("error"); setOverlayMsg("Endereço não corresponde ao destino esperado"); return;
    }

    setEnderecoConfirmado(true);
    setEnderecoScannedDesc(data[0].descricao);
    setDestinoTipo(data[0].tipo_endereco);
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
    setQuantidade(String(qtdColetada));
    setOverlay("success"); setOverlayMsg(`Produto: ${produtoSku}`);
  };

  const handleConfirmarEntrega = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("rpc_coletor_abastecimento_confirmar_entrega" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_tarefa_id: tarefaId,
        p_tarefa_execucao_id: execId,
        p_endereco_destino_id: enderecoDestinoIdEsperado,
        p_quantidade: Number(quantidade),
        p_usuario_id: usuarioId,
      });
      if (error) throw error;
      setOverlay("success"); setOverlayMsg("Abastecimento registrado!");
      setTimeout(() => onNavigate("/coletor/movimentos/abastecimento"), 1200);
    } catch (err: any) {
      setOverlay("error"); setOverlayMsg(err.message || "Erro ao confirmar entrega");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ColetorLayout title="Entrega Abastecimento" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/abastecimento">
      <StatusOverlay type={overlay} message={overlayMsg} />

      <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 space-y-1">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-[hsl(280,70%,55%)] shrink-0" />
          <span className="text-lg font-bold text-white">{enderecoDestinoDesc}</span>
        </div>
        <div className="text-[11px] text-[hsl(213,31%,55%)]">
          Qtd coletada: <b className="text-white">{qtdColetada}</b>
        </div>
        <div className="border-t border-[hsl(222,35%,22%)] pt-1 mt-1" />
        <p className="font-mono text-xs text-[hsl(217,91%,60%)]">{produtoSku}</p>
        <p className="text-sm font-bold text-white">{produtoDesc}</p>
      </div>

      {!enderecoConfirmado && (
        <div className="mt-3">
          <ScanField label="Escanear Endereço de Destino" onScan={handleScanEndereco} placeholder="Leia o código do endereço" />
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
              Quantidade a Entregar
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
            onClick={handleConfirmarEntrega}
            disabled={!quantidade || Number(quantidade) <= 0 || saving}
            loading={saving}
          >
            CONFIRMAR ENTREGA
          </ActionButton>

          <RegistrarOcorrenciaColetorButton
            contexto={{
              etapa: "ABASTECIMENTO",
              produto_id: produtoId || undefined,
              produto_descricao: produtoDesc,
              tarefa_id: tarefaId,
              tarefa_execucao_id: execId || undefined,
              endereco_id: enderecoDestinoIdEsperado || undefined,
              endereco_descricao: enderecoDestinoDesc,
              quantidade_esperada: Number(qtdColetada || 0),
            }}
          />
        </div>
      )}
    </ColetorLayout>
  );
}
