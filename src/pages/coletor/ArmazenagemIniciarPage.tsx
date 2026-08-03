import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { Loader2, AlertTriangle, MapPin } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface TarefaResult {
  tarefa_id: string;
  produto_id: string;
  sku: string;
  descricao: string;
  qtd_conferida: number;
  qtd_armazenada: number;
  qtd_a_armazenar: number;
  validade: string | null;
  fabricacao: string | null;
  lote: string | null;
  varios_pickings: string | null;
  enderecos_picking: string | null;
  fator_caixa: number | null;
}

function ConvCaixa({ qtd, fator }: { qtd: number; fator: number }) {
  if (!(fator > 1)) return null;
  const cx = Math.floor(Number(qtd) / fator);
  const resto = Number(qtd) % fator;
  return (
    <span className="block text-[10px] text-[hsl(217,91%,70%)] leading-tight">
      = {cx} CX{resto > 0 ? ` + ${resto} UN` : ""}
    </span>
  );
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
      // Se código for HU, resolver produto via HU e depois buscar tarefa por EAN
      if (code.startsWith("HU-") || code.startsWith("hu-")) {
        const { data: huResult, error: huErr } = await (supabase as any).rpc("buscar_hu_por_codigo", {
          p_tenant_id: tenantId,
          p_codigo_hu: code,
        });
        if (huErr) throw huErr;
        const hu = typeof huResult === "string" ? JSON.parse(huResult) : huResult;
        if (!hu?.encontrada) {
          setOverlay("error");
          setOverlayMsg("HU não encontrada: " + code);
          return;
        }
        const { data: huItens, error: huItensErr } = await (supabase as any).rpc("listar_itens_hu", {
          p_tenant_id: tenantId,
          p_hu_id: hu.hu_id,
        });
        if (huItensErr) throw huItensErr;
        const itensResult = typeof huItens === "string" ? JSON.parse(huItens) : huItens;
        if (!itensResult?.itens || itensResult.itens.length === 0) {
          setOverlay("error");
          setOverlayMsg("HU " + code + " está vazia.");
          return;
        }
        const firstItem = itensResult.itens[0];
        const { data: eanData } = await (supabase as any)
          .from("produto_embalagem")
          .select("ean")
          .eq("produto_id", firstItem.produto_id)
          .limit(1);
        if (!eanData || eanData.length === 0) {
          setOverlay("error");
          setOverlayMsg("Produto da HU sem EAN cadastrado.");
          return;
        }
        sessionStorage.setItem("coletor_armazenagem_hu", hu.hu_id);
        sessionStorage.setItem("coletor_armazenagem_hu_codigo", hu.codigo_hu);

        const { data, error } = await supabase.rpc("fn_buscar_dados_armazenagem" as any, {
          p_tenant_id: tenantId,
          p_empresa_ids: [empresaId],
          p_ean: eanData[0].ean,
        });
        if (error) throw error;
        if (!data || data.length === 0) {
          setOverlay("error");
          setOverlayMsg("Nenhuma tarefa de armazenagem para o produto da HU");
          return;
        }
        const row = data[0] as TarefaResult;
        setTarefa(row);
        setOverlay("success");
        setOverlayMsg(`HU ${code} → ${row.descricao}`);
        return;
      }

      const { data, error } = await supabase.rpc("fn_buscar_dados_armazenagem" as any, {
        p_tenant_id: tenantId,
        p_empresa_ids: [empresaId],
        p_ean: code,
      });
      if (error) throw error;
      if (!data || data.length === 0) {
        setOverlay("error");
        setOverlayMsg("Nenhuma tarefa encontrada para este código");
        return;
      }
      const row = data[0] as TarefaResult;
      setTarefa(row);
      setOverlay("success");
      setOverlayMsg(`Produto encontrado: ${row.descricao}`);
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
    sessionStorage.setItem("coletor_armazenagem_produto_desc", tarefa.descricao);
    sessionStorage.setItem("coletor_armazenagem_produto_sku", tarefa.sku || "");
    sessionStorage.setItem("coletor_armazenagem_qtd_restante", String(tarefa.qtd_a_armazenar));
    sessionStorage.setItem("coletor_armazenagem_lote", tarefa.lote || "");
    sessionStorage.setItem("coletor_armazenagem_validade", tarefa.validade || "");
    sessionStorage.setItem("coletor_armazenagem_fabricacao", tarefa.fabricacao || "");
    sessionStorage.setItem("coletor_armazenagem_picking_sugerido", tarefa.enderecos_picking || "");
    sessionStorage.setItem("coletor_armazenagem_varios_pickings", tarefa.varios_pickings || "N");
    if (!sessionStorage.getItem("coletor_armazenagem_hu")) {
      sessionStorage.removeItem("coletor_armazenagem_hu_codigo");
    }
    onNavigate("/coletor/armazenagem/execucao");
  };

  const variosPickings = tarefa?.varios_pickings === "S";

  return (
    <ColetorLayout title="Confirmar Produto" onNavigate={onNavigate} showBack backPath="/coletor/armazenagem/itens">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      <ScanField label="Escanear EAN ou HU" lastScanned={lastScanned} onScan={handleScan} />

      {loading && (
        <div className="flex justify-center py-6"><Loader2 size={28} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
      )}

      {tarefa && !loading && (
        <>
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm font-bold text-[hsl(213,31%,80%)]">{tarefa.sku}</span>
            </div>
            <p className="text-lg font-bold text-white leading-snug">{tarefa.descricao}</p>

            {(tarefa.lote || tarefa.validade || tarefa.fabricacao) && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[hsl(213,31%,55%)] border-t border-[hsl(222,35%,22%)] pt-2">
                {tarefa.lote && <span>Lote: <b className="text-[hsl(213,31%,85%)]">{tarefa.lote}</b></span>}
                {tarefa.fabricacao && <span>Fab: <b className="text-[hsl(213,31%,85%)]">{tarefa.fabricacao}</b></span>}
                {tarefa.validade && <span>Val: <b className="text-[hsl(213,31%,85%)]">{tarefa.validade}</b></span>}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <span className="text-[11px] text-[hsl(213,31%,55%)] uppercase block">A armazenar</span>
                <span className="text-xl font-bold text-white">{tarefa.qtd_conferida}</span>
                <ConvCaixa qtd={tarefa.qtd_conferida} fator={fatorCaixa} />
              </div>
              <div className="text-center">
                <span className="text-[11px] text-[hsl(213,31%,55%)] uppercase block">Armazenado</span>
                <span className="text-xl font-bold text-[#22C55E]">{tarefa.qtd_armazenada}</span>
                <ConvCaixa qtd={tarefa.qtd_armazenada} fator={fatorCaixa} />
              </div>
              <div className="text-center">
                <span className="text-[11px] text-[hsl(213,31%,55%)] uppercase block">Restante</span>
                <span className="text-xl font-bold text-[hsl(45,93%,47%)]">{tarefa.qtd_a_armazenar}</span>
                <ConvCaixa qtd={tarefa.qtd_a_armazenar} fator={fatorCaixa} />
              </div>
            </div>


            {tarefa.enderecos_picking && (
              <div className="flex items-center gap-1.5 border-t border-[hsl(222,35%,22%)] pt-2">
                <MapPin size={14} className="text-[hsl(280,70%,55%)] shrink-0" />
                <span className="text-xs text-[hsl(213,31%,80%)]">
                  Picking: <b className="text-[hsl(280,70%,65%)]">{tarefa.enderecos_picking}</b>
                </span>
              </div>
            )}

            {variosPickings && (
              <div className="flex items-center gap-1.5 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30 px-2 py-1.5">
                <AlertTriangle size={14} className="text-[hsl(45,93%,47%)] shrink-0" />
                <span className="text-xs text-[hsl(45,93%,80%)]">Produto possui múltiplos endereços de picking</span>
              </div>
            )}
          </div>

          <ActionButton onClick={handleConfirm} variant="primary">
            CONFIRMAR E ARMAZENAR
          </ActionButton>
        </>
      )}
    </ColetorLayout>
  );
}
