import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface TarefaResult {
  tarefa_id: string;
  produto_id: string;
  produto_descricao: string;
  quantidade_requerida: number;
  quantidade_armazenada: number;
  quantidade_restante: number;
}

export function ArmazenagemIniciarPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");

  const [lastScanned, setLastScanned] = useState("");
  const [loading, setLoading] = useState(false);
  const [tarefa, setTarefa] = useState<TarefaResult | null>(null);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  const handleScan = async (code: string) => {
    setLastScanned(code);
    setTarefa(null);
    if (!tenantId || !empresaId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("rpc_coletor_armazenagem_buscar_tarefa" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_codigo_scan: code,
      });
      if (error) throw error;
      if (!data || data.length === 0) {
        setOverlay("error");
        setOverlayMsg("Nenhuma tarefa encontrada para este código");
        return;
      }
      setTarefa(data[0]);
      setOverlay("success");
      setOverlayMsg(`Produto encontrado: ${data[0].produto_descricao}`);
    } catch (err: any) {
      setOverlay("error");
      setOverlayMsg(err.message || "Erro ao buscar tarefa");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!tarefa) return;
    sessionStorage.setItem("coletor_armazenagem_tarefa_id", tarefa.tarefa_id);
    sessionStorage.setItem("coletor_armazenagem_produto_id", tarefa.produto_id);
    sessionStorage.setItem("coletor_armazenagem_produto_desc", tarefa.produto_descricao);
    sessionStorage.setItem("coletor_armazenagem_qtd_restante", String(tarefa.quantidade_restante));
    onNavigate("/coletor/armazenagem/execucao");
  };

  return (
    <ColetorLayout title="Iniciar Armazenagem" onNavigate={onNavigate} showBack backPath="/coletor/armazenagem">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      <ScanField label="Escanear EAN ou HU" lastScanned={lastScanned} onScan={handleScan} />

      {loading && (
        <div className="flex justify-center py-6"><Loader2 size={28} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
      )}

      {tarefa && !loading && (
        <>
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-4 space-y-3">
            <p className="text-lg font-bold text-white">{tarefa.produto_descricao}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <span className="text-[11px] text-[hsl(213,31%,55%)] uppercase block">A armazenar</span>
                <span className="text-xl font-bold text-white">{tarefa.quantidade_requerida}</span>
              </div>
              <div className="text-center">
                <span className="text-[11px] text-[hsl(213,31%,55%)] uppercase block">Armazenado</span>
                <span className="text-xl font-bold text-[#22C55E]">{tarefa.quantidade_armazenada}</span>
              </div>
              <div className="text-center">
                <span className="text-[11px] text-[hsl(213,31%,55%)] uppercase block">Restante</span>
                <span className="text-xl font-bold text-[hsl(45,93%,47%)]">{tarefa.quantidade_restante}</span>
              </div>
            </div>
          </div>

          <ActionButton onClick={handleConfirm} variant="primary">
            CONFIRMAR E ARMAZENAR
          </ActionButton>
        </>
      )}
    </ColetorLayout>
  );
}
