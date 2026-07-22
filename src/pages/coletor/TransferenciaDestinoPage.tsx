import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";

import { Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

const TIPO_TAREFA_TRANF = "6942b989-816c-45c5-8af5-50cd22589cc6";

export function TransferenciaDestinoPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const empresaId = localStorage.getItem("core_empresa_id") || "";
  const usuarioId = localStorage.getItem("core_usuario_id") || "";
  const origemId = sessionStorage.getItem("transf_origem_id") || "";
  const origemDesc = sessionStorage.getItem("transf_origem_desc") || "";
  const produtoId = sessionStorage.getItem("transf_produto_id") || "";
  const sku = sessionStorage.getItem("transf_produto_sku") || "";
  const quantidade = Number(sessionStorage.getItem("transf_quantidade") || "0");
  const lote = sessionStorage.getItem("transf_lote") || "";
  const validade = sessionStorage.getItem("transf_validade") || "";
  const fabricacao = sessionStorage.getItem("transf_fabricacao") || "";
  const huId = sessionStorage.getItem("transf_hu_id") || "";

  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  const handleScan = async (code: string) => {
    setScanned(code);
    setLoading(true);
    try {
      // Find destination address
      const { data: enderecos } = await (supabase as any)
        .from("endereco")
        .select("id, descricao, situacao, tipo_endereco")
        .or(`descricao.eq.${code},codigo_endereco.eq.${code}`)
        .limit(1);

      if (!enderecos || enderecos.length === 0) {
        setOverlay("error");
        setOverlayMsg("Endereço destino não encontrado.");
        setLoading(false);
        return;
      }

      if (!["LIVRE", "OCUPADO"].includes(enderecos[0].situacao)) {
        setOverlay("error");
        setOverlayMsg(`Endereço ${enderecos[0].descricao} está ${enderecos[0].situacao}. Movimentações não são permitidas. Procure a supervisão.`);
        setLoading(false);
        return;
      }

      const destinoId = enderecos[0].id;
      const destinoDesc = enderecos[0].descricao;
      const destinoTipo = enderecos[0].tipo_endereco;

      if (destinoId === origemId) {
        setOverlay("error");
        setOverlayMsg("Endereço destino igual ao origem.");
        setLoading(false);
        return;
      }

      // Validar regras de armazenagem quando destino for PICKING
      if (destinoTipo === "PICKING") {
        const armazemId = localStorage.getItem("core_armazem_id");
        const { data: validacao, error: valErr } = await (supabase as any).rpc("rpc_validar_endereco_picking", {
          p_tenant_id: tenantId,
          p_armazem_id: armazemId,
          p_produto_id: produtoId,
          p_endereco_id: destinoId,
          p_lote: lote || null,
          p_validade: validade && validade !== "1900-01-01" ? validade : null,
          p_quantidade: quantidade,
        });
        if (valErr) throw valErr;
        if (validacao && !validacao.valido) {
          setOverlay("error");
          setOverlayMsg(validacao.erros?.join(" • ") || "Endereço destino não permitido pelas regras de armazenagem.");
          setLoading(false);
          return;
        }
      }

      const now = new Date().toISOString();

      // Create tarefa
      const { data: tarefa, error: errTarefa } = await (supabase as any)
        .from("tarefa")
        .insert({
          tenant_id: tenantId,
          empresa_id: empresaId,
          tipo_tarefa_id: TIPO_TAREFA_TRANF,
          produto_id: produtoId,
          quantidade_requerida: quantidade,
          status: "CONCLUIDA",
          prioridade_tarefa: "NORMAL",
          criado_em: now,
          id_local_origem: origemId,
          id_local_destino: destinoId,
        })
        .select("id")
        .single();

      if (errTarefa) throw errTarefa;

      // Create tarefa_execucao
      const { error: errExec } = await (supabase as any)
        .from("tarefa_execucao")
        .insert({
          tenant_id: tenantId,
          tarefa_id: tarefa.id,
          usuario_id: usuarioId,
          status: "CONCLUIDA",
          quantidade_executada: quantidade,
          endereco_origem_id: origemId,
          endereco_destino_id: destinoId,
          lote: lote || null,
          validade: validade && validade !== "1900-01-01" ? validade : null,
          fabricacao: fabricacao && fabricacao !== "1900-01-01" ? fabricacao : null,
          hu: huId || null,
          iniciado_em: now,
          concluido_em: now,
        });

      if (errExec) throw errExec;

      // Store success data
      sessionStorage.setItem("transf_destino_desc", destinoDesc);
      onNavigate("/coletor/movimentos/transferencia/concluido");
    } catch (err: any) {
      setOverlay("error");
      setOverlayMsg(err?.message || "Erro ao gravar transferência.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ColetorLayout title="Transferência - Destino" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/transferencia/detalhe">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 4 de 4</span>
        <p className="text-sm font-bold text-white">Escanear o endereço de DESTINO</p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Origem</span><p className="text-xs font-mono text-white">{origemDesc}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Produto</span><p className="text-xs font-mono text-white">{sku}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Quantidade</span><p className="text-xs font-bold text-white">{quantidade}</p></div>
        </div>
      </div>

      <ScanField label="Escanear Endereço Destino" onScan={handleScan} lastScanned={scanned} disabled={loading} />
      {loading && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={28} /></div>}
    </ColetorLayout>
  );
}
