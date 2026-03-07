import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { nowBrasilia } from "@/lib/dateUtils";
import { Loader2, Archive, LayoutGrid, ArrowUp, MapPin } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function ArmazenagemExecucaoPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const usuarioId = localStorage.getItem("core_usuario_id");
  const tarefaId = sessionStorage.getItem("coletor_armazenagem_tarefa_id") || "";
  const produtoId = sessionStorage.getItem("coletor_armazenagem_produto_id") || "";
  const produtoDesc = sessionStorage.getItem("coletor_armazenagem_produto_desc") || "";
  const qtdRestante = Number(sessionStorage.getItem("coletor_armazenagem_qtd_restante") || "0");

  const [estoquePulmao, setEstoquePulmao] = useState(0);
  const [estoquePicking, setEstoquePicking] = useState(0);
  const [totalArmazenar, setTotalArmazenar] = useState(0);
  const [totalArmazenado, setTotalArmazenado] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  const [pickingEndereco, setPickingEndereco] = useState<string | null>(null);
  const [loadingPicking, setLoadingPicking] = useState(true);

  const [quantidade, setQuantidade] = useState("");
  const [enderecoScan, setEnderecoScan] = useState("");
  const [enderecoId, setEnderecoId] = useState<string | null>(null);
  const [enderecoDesc, setEnderecoDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  // Fetch stats
  useEffect(() => {
    if (!tenantId || !empresaId) return;
    (async () => {
      setLoadingStats(true);
      try {
        const { data, error } = await supabase.rpc("rpc_coletor_armazenagem_execucao" as any, {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_produto_id: produtoId,
        });
        if (error) throw error;
        if (data && data.length > 0) {
          setEstoquePulmao(Number(data[0].estoque_pulmao) || 0);
          setEstoquePicking(Number(data[0].estoque_picking) || 0);
          setTotalArmazenar(Number(data[0].total_a_armazenar) || 0);
          setTotalArmazenado(Number(data[0].total_armazenado) || 0);
        }
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoadingStats(false);
      }
    })();
  }, [tenantId, empresaId, produtoId]);

  // Fetch picking address for product
  useEffect(() => {
    if (!tenantId || !produtoId) { setLoadingPicking(false); return; }
    (async () => {
      setLoadingPicking(true);
      try {
        const { data, error } = await (supabase as any)
          .from("picking_produto")
          .select("endereco_id, endereco:endereco_id(descricao)")
          .eq("tenant_id", tenantId)
          .eq("produto_id", produtoId)
          .eq("ativo", true)
          .limit(1);
        if (error) throw error;
        if (data && data.length > 0 && data[0].endereco) {
          setPickingEndereco(data[0].endereco.descricao);
        } else {
          setPickingEndereco(null);
        }
      } catch {
        setPickingEndereco(null);
      } finally {
        setLoadingPicking(false);
      }
    })();
  }, [tenantId, produtoId]);

  const handleScanEndereco = async (code: string) => {
    setEnderecoScan(code);
    setEnderecoId(null);
    setEnderecoDesc("");
    try {
      const { data, error } = await (supabase as any)
        .from("endereco")
        .select("id, descricao")
        .eq("codigo_endereco", Number(code))
        .eq("tenant_id", tenantId)
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) {
        setOverlay("error");
        setOverlayMsg("Endereço não encontrado");
        return;
      }
      setEnderecoId(data[0].id);
      setEnderecoDesc(data[0].descricao);
      setOverlay("success");
      setOverlayMsg(`Endereço: ${data[0].descricao}`);
    } catch (err: any) {
      setOverlay("error");
      setOverlayMsg(err.message || "Erro ao buscar endereço");
    }
  };

  const handleConfirm = async () => {
    if (!tarefaId || !tenantId || !usuarioId || !enderecoId || !quantidade) return;
    setSaving(true);
    try {
      const now = nowBrasilia();
      const { data: execData, error: execErr } = await (supabase as any)
        .from("tarefa_execucao")
        .insert({
          tenant_id: tenantId,
          tarefa_id: tarefaId,
          usuario_id: usuarioId,
          status: "CONCLUIDA",
          atribuido_em: now,
          iniciado_em: now,
          concluido_em: now,
          quantidade_executada: Number(quantidade),
          endereco_destino_id: enderecoId,
        })
        .select("id")
        .single();
      if (execErr) throw execErr;

      // Log event
      await (supabase as any).from("tarefa_evento_execucao").insert({
        tenant_id: tenantId,
        execucao_tarefa_id: execData.id,
        tipo_evento: "ARMAZENAGEM",
        carga_util: {
          produto_id: produtoId,
          endereco_destino_id: enderecoId,
          endereco_descricao: enderecoDesc,
          quantidade: Number(quantidade),
        },
      });

      // Update tarefa with destination
      await (supabase as any)
        .from("tarefa")
        .update({
          id_local_destino: enderecoId,
          status: "CONCLUIDA",
          usuario_execucao_id: usuarioId,
        })
        .eq("id", tarefaId);

      setOverlay("success");
      setOverlayMsg("Armazenagem registrada com sucesso!");
      setTimeout(() => onNavigate("/coletor/armazenagem/concluido"), 1200);
    } catch (err: any) {
      setOverlay("error");
      setOverlayMsg(err.message || "Erro ao registrar armazenagem");
    } finally {
      setSaving(false);
    }
  };

  const stats = [
    { icon: <Archive size={16} />, label: "Pulmão", value: estoquePulmao, color: "hsl(217,91%,50%)" },
    { icon: <LayoutGrid size={16} />, label: "Picking", value: estoquePicking, color: "hsl(280,70%,55%)" },
    { icon: <ArrowUp size={16} />, label: "A Armazenar", value: totalArmazenar, color: "hsl(45,93%,47%)" },
  ];

  return (
    <ColetorLayout title="Execução Armazenagem" onNavigate={onNavigate} showBack backPath="/coletor/armazenagem/iniciar">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      {/* Stats */}
      {loadingStats ? (
        <div className="flex justify-center py-4"><Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-2 flex flex-col items-center gap-0.5">
              <div style={{ color: s.color }}>{s.icon}</div>
              <span className="text-lg font-bold text-white">{s.value}</span>
              <span className="text-[10px] text-[hsl(213,31%,55%)] text-center">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Product info + picking */}
      <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 space-y-1">
        <p className="text-sm text-[hsl(213,31%,55%)]">Produto</p>
        <p className="text-base font-bold text-white">{produtoDesc}</p>
        <p className="text-xs text-[hsl(213,31%,55%)]">Restante: <b className="text-[hsl(45,93%,47%)]">{qtdRestante}</b></p>
        <div className="flex items-center gap-1.5 pt-1 border-t border-[hsl(222,35%,22%)] mt-1">
          <MapPin size={14} className="text-[hsl(280,70%,55%)] shrink-0" />
          {loadingPicking ? (
            <Loader2 size={14} className="animate-spin text-[hsl(213,31%,55%)]" />
          ) : pickingEndereco ? (
            <span className="text-xs text-[hsl(213,31%,80%)]">Picking: <b className="text-[hsl(280,70%,65%)]">{pickingEndereco}</b></span>
          ) : (
            <span className="text-xs text-[hsl(45,93%,47%)]">Sem picking cadastrado</span>
          )}
        </div>
      </div>

      {/* Quantity */}
      <div>
        <label className="block text-sm font-semibold text-[hsl(213,31%,65%)] mb-1 uppercase">Quantidade a Armazenar</label>
        <input
          type="number"
          inputMode="numeric"
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          placeholder="0"
          className="w-full h-16 px-4 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-3xl font-bold text-white text-center outline-none focus:border-[hsl(217,91%,50%)] transition-colors"
        />
      </div>

      {/* Scan address */}
      <ScanField
        label="Escanear Endereço Destino"
        lastScanned={enderecoDesc || enderecoScan}
        onScan={handleScanEndereco}
        placeholder="Leia o código do endereço"
      />

      {/* Confirm */}
      <ActionButton
        onClick={handleConfirm}
        disabled={!quantidade || Number(quantidade) <= 0 || !enderecoId}
        loading={saving}
        variant="success"
      >
        CONFIRMAR ARMAZENAGEM
      </ActionButton>
    </ColetorLayout>
  );
}
