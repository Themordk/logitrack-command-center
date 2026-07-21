import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { Loader2, Archive, LayoutGrid, ArrowUp, MapPin, AlertTriangle } from "lucide-react";
import { markTarefaIniciadaByTarefa } from "@/lib/lmsTimestamp";
import { RegistrarOcorrenciaColetorButton } from "@/components/ocorrencia/RegistrarOcorrenciaColetorButton";

interface Props { onNavigate: (path: string) => void; }

export function ArmazenagemExecucaoPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const usuarioId = localStorage.getItem("core_usuario_id");
  const tarefaId = sessionStorage.getItem("coletor_armazenagem_tarefa_id") || "";
  const produtoId = sessionStorage.getItem("coletor_armazenagem_produto_id") || "";
  const produtoDesc = sessionStorage.getItem("coletor_armazenagem_produto_desc") || "";
  const produtoSku = sessionStorage.getItem("coletor_armazenagem_produto_sku") || "";
  const qtdRestante = Number(sessionStorage.getItem("coletor_armazenagem_qtd_restante") || "0");
  const pickingSugerido = sessionStorage.getItem("coletor_armazenagem_picking_sugerido") || "";
  const variosPickings = sessionStorage.getItem("coletor_armazenagem_varios_pickings") === "S";
  const huCodigo = sessionStorage.getItem("coletor_armazenagem_hu_codigo") || "";

  const [estoquePulmao, setEstoquePulmao] = useState(0);
  const [estoquePicking, setEstoquePicking] = useState(0);
  const [totalArmazenar, setTotalArmazenar] = useState(0);
  const [totalArmazenado, setTotalArmazenado] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  const [movimentoEntradaId, setMovimentoEntradaId] = useState<string | null>(null);

  const [quantidade, setQuantidade] = useState("");
  const [enderecoScan, setEnderecoScan] = useState("");
  const [enderecoId, setEnderecoId] = useState<string | null>(null);
  const [enderecoDesc, setEnderecoDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");
  const [showCapModal, setShowCapModal] = useState(false);
  const [capInfo, setCapInfo] = useState<{ maximo: number; saldoAtual: number; cabeMais: number } | null>(null);

  const parseCapacidadeMsg = (msg: string): { maximo: number; saldoAtual: number; cabeMais: number } | null => {
    try {
      const maxMatch = msg.match(/Máximo:\s*([\d.,]+)/i);
      const saldoMatch = msg.match(/Saldo atual:\s*([\d.,]+)/i);
      const cabeMatch = msg.match(/Cabe mais:\s*([\d.,]+)/i);
      if (maxMatch && saldoMatch && cabeMatch) {
        return {
          maximo: Number(maxMatch[1].replace(",", ".")),
          saldoAtual: Number(saldoMatch[1].replace(",", ".")),
          cabeMais: Number(cabeMatch[1].replace(",", ".")),
        };
      }
    } catch {}
    return null;
  };

  const handleArmazenarParcial = () => {
    if (!capInfo) return;
    const fatorRaw = sessionStorage.getItem("coletor_armazenagem_fator");
    const fator = fatorRaw ? Number(fatorRaw) : 1;
    const qtdEmbalagem = fator > 1 ? Math.floor(capInfo.cabeMais / fator) : capInfo.cabeMais;
    setQuantidade(String(qtdEmbalagem));
    setShowCapModal(false);
    setCapInfo(null);
  };

  const handleAlterarEndereco = () => {
    setEnderecoId(null);
    setEnderecoDesc("");
    setEnderecoScan("");
    setShowCapModal(false);
    setCapInfo(null);
  };

  // Fetch movimento_entrada_id from tarefa
  useEffect(() => {
    if (!tarefaId || !tenantId) return;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("tarefa")
          .select("id_documento_origem")
          .eq("id", tarefaId)
          .single();
        if (error) throw error;
        if (data?.id_documento_origem) {
          const { data: meiData, error: meiErr } = await (supabase as any)
            .from("movimento_entrada_item")
            .select("movimento_entrada_id")
            .eq("id", data.id_documento_origem)
            .single();
          if (meiErr) throw meiErr;
          setMovimentoEntradaId(meiData?.movimento_entrada_id || null);
        }
      } catch (err: any) {
        console.error("Erro ao buscar movimento_entrada_id:", err);
      }
    })();
  }, [tarefaId, tenantId]);

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

  // Picking address comes from sessionStorage (returned by fn_buscar_dados_armazenagem)

  const handleScanEndereco = async (code: string) => {
    setEnderecoScan(code);
    setEnderecoId(null);
    setEnderecoDesc("");
    // LMS: mark task as started on first address scan
    markTarefaIniciadaByTarefa(tarefaId, usuarioId);
    try {
      const { data, error } = await (supabase as any)
        .from("endereco")
        .select("id, descricao, situacao")
        .eq("codigo_endereco", Number(code))
        .eq("tenant_id", tenantId)
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) {
        setOverlay("error");
        setOverlayMsg("Endereço não encontrado");
        return;
      }
      if (!["LIVRE", "OCUPADO"].includes(data[0].situacao)) {
        setOverlay("error");
        setOverlayMsg(`Endereço ${data[0].descricao} está ${data[0].situacao}. Movimentações não são permitidas. Procure a supervisão.`);
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
    if (!tarefaId || !tenantId || !usuarioId || !enderecoId || !quantidade || !movimentoEntradaId) return;
    setSaving(true);
    try {
      const lote = sessionStorage.getItem("coletor_armazenagem_lote") || "";
      const validadeRaw = sessionStorage.getItem("coletor_armazenagem_validade");
      const fabricacaoRaw = sessionStorage.getItem("coletor_armazenagem_fabricacao");
      const huId = sessionStorage.getItem("coletor_armazenagem_hu") || "00000000-0000-0000-0000-000000000000";

      // Multiply quantity by embalagem fator
      const fatorRaw = sessionStorage.getItem("coletor_armazenagem_fator");
      const fator = fatorRaw ? Number(fatorRaw) : 1;
      const qtdFinal = Number(quantidade) * fator;

      const { data, error } = await supabase.rpc("finalizar_armazenagem" as any, {
        p_tenant_id: tenantId,
        p_tarefa_id: tarefaId,
        p_movimento_entrada_id: movimentoEntradaId,
        p_usuario: usuarioId,
        p_quantidade: qtdFinal,
        p_endereco_destino_id: enderecoId,
        p_lote: lote,
        p_validade: validadeRaw || "1900-01-01",
        p_fabricacao: fabricacaoRaw || "1900-01-01",
        p_hu: huId,
      });
      if (error) throw error;

      setOverlay("success");
      setOverlayMsg("Armazenagem registrada com sucesso!");
      setTimeout(() => onNavigate("/coletor/armazenagem/concluido"), 1200);
    } catch (err: any) {
      const msg = err.message || "Erro ao registrar armazenagem";
      const code = err.code || "";
      if (code === "P0002" || msg.includes("Capacidade do picking excedida")) {
        const parsed = parseCapacidadeMsg(msg);
        if (parsed && parsed.cabeMais > 0) {
          setCapInfo(parsed);
          setShowCapModal(true);
        } else {
          setOverlay("warning");
          setOverlayMsg("Picking cheio. Armazene em um endereço de pulmão.");
        }
      } else {
        setOverlay("error");
        setOverlayMsg(msg);
      }
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
    <ColetorLayout title="Execução Armazenagem" onNavigate={onNavigate} showBack backPath="/coletor/armazenagem/itens">
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
        {produtoSku && <p className="font-mono text-xs text-[hsl(213,31%,70%)]">{produtoSku}</p>}
        <p className="text-base font-bold text-white">{produtoDesc}</p>
        <p className="text-xs text-[hsl(213,31%,55%)]">Restante: <b className="text-[hsl(45,93%,47%)]">{qtdRestante}</b></p>
        <div className="flex items-center gap-1.5 pt-1 border-t border-[hsl(222,35%,22%)] mt-1">
          <MapPin size={14} className="text-[hsl(280,70%,55%)] shrink-0" />
          {pickingSugerido ? (
            <span className="text-xs text-[hsl(213,31%,80%)]">Picking: <b className="text-[hsl(280,70%,65%)]">{pickingSugerido}</b></span>
          ) : (
            <span className="text-xs text-[hsl(45,93%,47%)]">Sem picking cadastrado</span>
          )}
        </div>
        {variosPickings && (
          <div className="flex items-center gap-1.5 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30 px-2 py-1 mt-1">
            <AlertTriangle size={12} className="text-[hsl(45,93%,47%)] shrink-0" />
            <span className="text-[11px] text-[hsl(45,93%,80%)]">Múltiplos endereços de picking</span>
          </div>
        )}
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
        disabled={!quantidade || Number(quantidade) <= 0 || !enderecoId || !movimentoEntradaId}
        loading={saving}
        variant="success"
      >
        CONFIRMAR ARMAZENAGEM
      </ActionButton>

      <RegistrarOcorrenciaColetorButton
        contexto={{
          etapa: "ARMAZENAGEM",
          produto_id: produtoId || undefined,
          produto_descricao: produtoDesc,
          tarefa_id: tarefaId,
          endereco_id: enderecoId || undefined,
          endereco_descricao: enderecoDesc || undefined,
          documento_origem_id: movimentoEntradaId || undefined,
          tipo_documento_origem: "MOVIMENTO_ENTRADA",
          quantidade_esperada: Number(qtdRestante || 0),
        }}
      />

      {/* Modal de capacidade excedida */}
      {showCapModal && capInfo && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-5 space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-14 h-14 rounded-full bg-[hsl(45,93%,47%)]/20 flex items-center justify-center">
                <AlertTriangle size={32} className="text-[hsl(45,93%,47%)]" />
              </div>
              <h3 className="text-lg font-bold text-white">Capacidade do Picking</h3>
              <p className="text-sm text-[hsl(213,31%,55%)]">
                A quantidade excede o limite do endereço de picking.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[hsl(222,35%,16%)] p-2">
                <span className="text-[10px] text-[hsl(213,31%,55%)] uppercase block">Máximo</span>
                <span className="text-xl font-bold text-white">{capInfo.maximo}</span>
              </div>
              <div className="rounded-lg bg-[hsl(222,35%,16%)] p-2">
                <span className="text-[10px] text-[hsl(213,31%,55%)] uppercase block">Saldo atual</span>
                <span className="text-xl font-bold text-[hsl(217,91%,60%)]">{capInfo.saldoAtual}</span>
              </div>
              <div className="rounded-lg bg-[hsl(222,35%,16%)] p-2">
                <span className="text-[10px] text-[hsl(213,31%,55%)] uppercase block">Cabe mais</span>
                <span className="text-xl font-bold text-[hsl(45,93%,47%)]">{capInfo.cabeMais}</span>
              </div>
            </div>

            <div className="space-y-2">
              {capInfo.cabeMais > 0 && (
                <ActionButton onClick={handleArmazenarParcial} variant="primary">
                  ARMAZENAR {capInfo.cabeMais} UN. NO PICKING
                </ActionButton>
              )}
              <ActionButton onClick={handleAlterarEndereco} variant="secondary">
                ALTERAR ENDEREÇO (PULMÃO)
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}