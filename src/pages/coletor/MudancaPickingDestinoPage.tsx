import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";

import { Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

const TIPO_TAREFA_TRANF = "6942b989-816c-45c5-8af5-50cd22589cc6";

interface ItemEstoque {
  id: string;
  produto_id: string;
  sku: string;
  quantidade_disponivel: number;
  lote: string | null;
  data_validade: string | null;
  data_fabricacao: string | null;
}

export function MudancaPickingDestinoPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const empresaId = localStorage.getItem("core_empresa_id") || "";
  const usuarioId = localStorage.getItem("core_usuario_id") || "";
  const origemId = sessionStorage.getItem("mudpick_origem_id") || "";
  const origemDesc = sessionStorage.getItem("mudpick_origem_desc") || "";
  const itens: ItemEstoque[] = JSON.parse(sessionStorage.getItem("mudpick_itens") || "[]");

  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  const qtdTotal = itens.reduce((s, i) => s + i.quantidade_disponivel, 0);

  const handleScan = async (code: string) => {
    setScanned(code);
    setLoading(true);
    try {
      const { data: enderecos } = await (supabase as any)
        .from("endereco")
        .select("id, descricao, situacao")
        .or(`descricao.eq.${code},codigo_endereco.eq.${code}`)
        .limit(1);

      if (!enderecos || enderecos.length === 0) {
        setOverlay("error");
        setOverlayMsg("Endereço destino não encontrado.");
        return;
      }
      if (!["LIVRE", "OCUPADO"].includes(enderecos[0].situacao)) {
        setOverlay("error");
        setOverlayMsg(`Endereço ${enderecos[0].descricao} está ${enderecos[0].situacao}. Movimentações não são permitidas.`);
        return;
      }
      const destinoId = enderecos[0].id;
      const destinoDesc = enderecos[0].descricao;
      if (destinoId === origemId) {
        setOverlay("error");
        setOverlayMsg("Endereço destino igual ao origem.");
        return;
      }

      // Processa cada item em loop; trigger de banco atualiza estoque_geral
      for (const it of itens) {
        const now = new Date().toISOString();
        const { data: tarefa, error: errTarefa } = await (supabase as any)
          .from("tarefa")
          .insert({
            tenant_id: tenantId,
            empresa_id: empresaId,
            tipo_tarefa_id: TIPO_TAREFA_TRANF,
            produto_id: it.produto_id,
            quantidade_requerida: it.quantidade_disponivel,
            status: "CONCLUIDA",
            prioridade_tarefa: "NORMAL",
            criado_em: now,
            id_local_origem: origemId,
            id_local_destino: destinoId,
          })
          .select("id")
          .single();
        if (errTarefa) throw errTarefa;

        const { error: errExec } = await (supabase as any)
          .from("tarefa_execucao")
          .insert({
            tenant_id: tenantId,
            tarefa_id: tarefa.id,
            usuario_id: usuarioId,
            status: "CONCLUIDA",
            quantidade_executada: it.quantidade_disponivel,
            endereco_origem_id: origemId,
            endereco_destino_id: destinoId,
            lote: it.lote || null,
            validade: it.data_validade && it.data_validade !== "1900-01-01" ? it.data_validade : null,
            fabricacao: it.data_fabricacao && it.data_fabricacao !== "1900-01-01" ? it.data_fabricacao : null,
            iniciado_em: now,
            concluido_em: now,
          });
        if (errExec) throw errExec;
      }

      sessionStorage.setItem("mudpick_destino_desc", destinoDesc);
      sessionStorage.setItem("mudpick_qtd_itens", String(itens.length));
      sessionStorage.setItem("mudpick_qtd_total", String(qtdTotal));
      onNavigate("/coletor/movimentos/mudanca-picking/concluido");
    } catch (err: any) {
      setOverlay("error");
      setOverlayMsg(err?.message || "Erro ao gravar mudança de picking.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ColetorLayout title="Mudança de Picking - Destino" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/mudanca-picking/lista">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 3 de 3</span>
        <p className="text-sm font-bold text-white">Escanear o endereço de DESTINO</p>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Origem</span><p className="text-xs font-mono text-white">{origemDesc}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Itens</span><p className="text-xs font-bold text-white">{itens.length}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Qtd. Total</span><p className="text-xs font-bold text-white">{qtdTotal}</p></div>
        </div>
      </div>

      <ScanField label="Escanear Endereço Destino" onScan={handleScan} lastScanned={scanned} disabled={loading} />
      {loading && <div className="flex flex-col items-center py-4 gap-2"><Loader2 className="animate-spin text-[hsl(280,80%,60%)]" size={28} /><span className="text-xs text-[hsl(213,31%,55%)]">Transferindo itens...</span></div>}
    </ColetorLayout>
  );
}
