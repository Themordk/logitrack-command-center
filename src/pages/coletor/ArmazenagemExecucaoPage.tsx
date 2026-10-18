import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { Archive, MapPin, AlertTriangle, CircleCheck, Minus, Plus } from "lucide-react";
import { markTarefaIniciadaByTarefa } from "@/lib/lmsTimestamp";
import type { OcorrenciaContexto } from "@/components/ocorrencia/RegistrarOcorrenciaModal";
import { EtapaIndicador } from "@/components/coletor/EtapaIndicador";
import { ProdutoHeader } from "@/components/coletor/ProdutoHeader";
import { StickyFooter } from "@/components/coletor/StickyFooter";
import { toast } from "sonner";
import { useOfflineAction } from "@/hooks/useOfflineAction";
import { getEnderecoFromCache, saveEnderecoToCache } from "@/lib/offlineEnderecoCache";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useOcorrenciaColetorContext } from "@/contexts/OcorrenciaColetorContext";
import { CancelamentoOverlay } from "@/components/coletor/CancelamentoOverlay";
import { useCancelamentoListener, documentoEntradaCancelado } from "@/hooks/useCancelamentoListener";
import { useFeedback } from "@/hooks/useFeedback";

interface Props { onNavigate: (path: string) => void; }

export function ArmazenagemExecucaoPage({ onNavigate }: Props) {
  const { setFabVisivel } = useOcorrenciaColetorContext();
  useEffect(() => {
    setFabVisivel(false);
  }, [setFabVisivel]);

  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");
  const tarefaId = sessionStorage.getItem("coletor_armazenagem_tarefa_id") || "";
  const produtoId = sessionStorage.getItem("coletor_armazenagem_produto_id") || "";
  const produtoDesc = sessionStorage.getItem("coletor_armazenagem_produto_desc") || "";
  const produtoSku = sessionStorage.getItem("coletor_armazenagem_produto_sku") || "";
  const qtdRestante = Number(sessionStorage.getItem("coletor_armazenagem_qtd_restante") || "0");
  const variosPickings = sessionStorage.getItem("coletor_armazenagem_varios_pickings") === "S";
  const huCodigo = sessionStorage.getItem("coletor_armazenagem_hu_codigo") || "";
  const destinoTipo = sessionStorage.getItem("coletor_armazenagem_destino_tipo") === "PICKING" ? "PICKING" : "PULMAO";
  const destinoEndId = sessionStorage.getItem("coletor_armazenagem_destino_endereco_id") || "";
  const destinoEndDesc = sessionStorage.getItem("coletor_armazenagem_destino_endereco_desc") || "";
  const qtdSugerida = Number(sessionStorage.getItem("coletor_armazenagem_qtd_sugerida") || qtdRestante || 0);
  const recDestino = sessionStorage.getItem("coletor_armazenagem_recomendacao_destino") || "";
  const recEndId = sessionStorage.getItem("coletor_armazenagem_recomendacao_endereco_id") || "";
  const { execute: executeOffline, isOnline } = useOfflineAction();
  const result = useResultDialog({ coletorMode: true });

  const [movimentoEntradaId, setMovimentoEntradaId] = useState<string | null>(null);
  const [documentoEntradaId, setDocumentoEntradaId] = useState<string | null>(null);
  const [docCanceladoInline, setDocCanceladoInline] = useState(false);
  const { cancelamento } = useCancelamentoListener(documentoEntradaId, tenantId);
  const { error: feedbackError } = useFeedback();

  // Resolve o documento de entrada vinculado ao movimento da tarefa
  useEffect(() => {
    if (!movimentoEntradaId || !tenantId || !isOnline) return;
    let ativo = true;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("movimento_entrada_documento")
          .select("documento_entrada_id")
          .eq("movimento_entrada_id", movimentoEntradaId)
          .eq("tenant_id", tenantId)
          .limit(1)
          .maybeSingle();
        if (ativo && data?.documento_entrada_id) setDocumentoEntradaId(data.documento_entrada_id);
      } catch {
        // ignora — verificação pré-ação cobre o fallback
      }
    })();
    return () => { ativo = false; };
  }, [movimentoEntradaId, tenantId, isOnline]);



  const [quantidade, setQuantidade] = useState("");
  const [enderecoScan, setEnderecoScan] = useState("");
  const [enderecoId, setEnderecoId] = useState<string | null>(null);
  const [enderecoDesc, setEnderecoDesc] = useState("");
  const [enderecoTipo, setEnderecoTipo] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");
  const [showCapModal, setShowCapModal] = useState(false);
  const [capInfo, setCapInfo] = useState<{ maximo: number; saldoAtual: number; cabeMais: number } | null>(null);
  const [showPickingModal, setShowPickingModal] = useState(false);
  const [pickingTipo, setPickingTipo] = useState<"FRACIONADO" | "MASTER" | "PDV">("FRACIONADO");
  const [pickingEstMinimo, setPickingEstMinimo] = useState("");
  const [pickingEstMaximo, setPickingEstMaximo] = useState("");

  // Catálogo de mensagens para erros de negócio da armazenagem
  const ERRO_ARMAZENAGEM: Record<string, {
    titulo: string;
    icone: "warning" | "error" | "info";
    instrucao?: string;
  }> = {
    TAREFA_NAO_ENCONTRADA: {
      titulo: "Tarefa não encontrada",
      icone: "error",
      instrucao: "Volte para a lista de tarefas e tente novamente.",
    },
    TAREFA_CONCLUIDA: {
      titulo: "Tarefa já concluída",
      icone: "warning",
      instrucao: "Esta tarefa já foi finalizada. Selecione outra tarefa.",
    },
    ENDERECO_NAO_ENCONTRADO: {
      titulo: "Endereço não encontrado",
      icone: "error",
      instrucao: "Verifique o código do endereço e escaneie novamente.",
    },
    ENDERECO_BLOQUEADO: {
      titulo: "Endereço bloqueado",
      icone: "warning",
      instrucao: "Movimentações não são permitidas neste endereço. Procure a supervisão.",
    },
    PICKING_FIXO_INVALIDO: {
      titulo: "Endereço de picking inválido",
      icone: "warning",
      instrucao: "Este produto possui picking fixo. Armazene no endereço de picking cadastrado ou no pulmão.",
    },
    PICKING_ENDERECO_DIVERGENTE: {
      titulo: "Picking já cadastrado em outro endereço",
      icone: "warning",
    },
    QUANTIDADE_EXCEDIDA: {
      titulo: "Quantidade excede o permitido",
      icone: "warning",
    },
  };

  // Contexto rico para o ícone de ocorrência do ProdutoHeader
  const ocorrenciaCtx: OcorrenciaContexto = {
    etapa: "ARMAZENAGEM",
    produto_id: produtoId || undefined,
    produto_descricao: produtoDesc || undefined,
    tarefa_id: tarefaId || undefined,
    endereco_id: enderecoId || undefined,
    endereco_descricao: enderecoDesc || undefined,
    documento_origem_id: movimentoEntradaId || undefined,
    tipo_documento_origem: "MOVIMENTO_ENTRADA",
    quantidade_esperada: Number(qtdRestante || 0),
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
    // Fallback offline: usa o movimento do sessionStorage
    const movIdFromSession = sessionStorage.getItem("coletor_armazenagem_movimento_id");
    if (movIdFromSession) setMovimentoEntradaId(movIdFromSession);

    if (!tarefaId || !tenantId || !isOnline) return;
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
  }, [tarefaId, tenantId, isOnline]);


  const handleScanEndereco = async (code: string) => {
    // Verificação pré-ação (fallback caso o Realtime falhe)
    if (isOnline && documentoEntradaId) {
      const cancelado = await documentoEntradaCancelado(documentoEntradaId, tenantId);
      if (cancelado) {
        setDocCanceladoInline(true);
        feedbackError();
        toast.error("Este documento foi cancelado. Não armazene este item.");
        return;
      }
    }
    setEnderecoScan(code);
    setEnderecoId(null);
    setEnderecoDesc("");
    setEnderecoTipo("");

    // LMS: mark task as started on first address scan
    markTarefaIniciadaByTarefa(tarefaId, usuarioId);
    try {
      let endData: { id: string; descricao: string; situacao: string; tipo_endereco: string } | null = null;

      if (!isOnline) {
        const cached = await getEnderecoFromCache(Number(code));
        if (!cached) {
          result.showWarning("Endereço não encontrado no cache", {
            instruction: "Escaneie este endereço quando estiver conectado à rede.",
          });
          return;
        }
        endData = cached;
      } else {
        const { data, error } = await (supabase as any)
          .from("endereco")
          .select("id, descricao, situacao, tipo_endereco")
          .eq("codigo_endereco", Number(code))
          .eq("tenant_id", tenantId)
          .limit(1);
        if (error) throw error;
        if (!data || data.length === 0) {
          result.showWarning("Endereço não encontrado");
          return;
        }
        endData = {
          id: data[0].id,
          descricao: data[0].descricao,
          situacao: data[0].situacao,
          tipo_endereco: data[0].tipo_endereco || "",
        };
        await saveEnderecoToCache({ ...endData, codigo_endereco: Number(code) }).catch(() => {});
      }

      if (!["LIVRE", "OCUPADO"].includes(endData.situacao)) {
        result.showWarning("Endereço bloqueado", {
          details: `Endereço ${endData.descricao} está ${endData.situacao}.`,
          instruction: "Movimentações não são permitidas neste endereço. Procure a supervisão.",
        });
        return;
      }
      setEnderecoId(endData.id);
      setEnderecoDesc(endData.descricao);
      setEnderecoTipo(endData.tipo_endereco || "");
      setOverlay("success");
      setOverlayMsg(`Endereço: ${endData.descricao}`);
    } catch (err: any) {
      result.showError(err, { context: "armazenagem-execucao-endereco" });
    }
  };

  const executarArmazenagem = async (pickingParams?: {
    p_picking_tipo: string;
    p_picking_est_minimo: number;
    p_picking_est_maximo: number;
  }) => {
    const lote = sessionStorage.getItem("coletor_armazenagem_lote") || "";
    const validadeRaw = sessionStorage.getItem("coletor_armazenagem_validade");
    const fabricacaoRaw = sessionStorage.getItem("coletor_armazenagem_fabricacao");
    const huId = sessionStorage.getItem("coletor_armazenagem_hu") || "00000000-0000-0000-0000-000000000000";
    const armazemId = localStorage.getItem("core_armazem_id");

    // Multiply quantity by embalagem fator (antes da validação, para ambas RPCs usarem o mesmo valor)
    const fatorRaw = sessionStorage.getItem("coletor_armazenagem_fator");
    const fator = fatorRaw ? Number(fatorRaw) : 1;
    const qtdFinal = Number(quantidade) * fator;

    // Validar endereço com as regras de armazenagem (somente PICKING) — pula quando offline
    if (enderecoTipo === "PICKING" && isOnline) {
      const { data: validacao, error: valErr } = await (supabase as any).rpc("rpc_validar_endereco_picking", {
        p_tenant_id: tenantId,
        p_armazem_id: armazemId,
        p_produto_id: produtoId,
        p_endereco_id: enderecoId,
        p_lote: lote || null,
        p_validade: validadeRaw && validadeRaw !== "1900-01-01" ? validadeRaw : null,
        p_quantidade: qtdFinal,
      });
      if (valErr) throw valErr;
      if (validacao && !validacao.valido) {
        setSaving(false);
        result.showWarning("Endereço não permitido", {
          details: validacao.erros?.join("\n") || "Endereço não permitido pelas regras de armazenagem.",
        });
        return;
      }
    } else if (enderecoTipo === "PICKING" && !isOnline) {
      toast.info("Sem conexão: a validação do endereço de picking será feita na sincronização.");
    }

    const offlineResult = await executeOffline("finalizar_armazenagem", {
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
      ...(pickingParams || {}),
    });

    if (!offlineResult.success) throw offlineResult.data;

    // Offline: ação enfileirada, sucesso imediato
    if (offlineResult.offline) {
      toast.info("Ação salva. Será enviada quando a conexão retornar.");
      result.showSuccess("Armazenagem registrada", {
        details: "Os dados serão sincronizados quando a conexão retornar.",
        onClose: () => onNavigate("/coletor/armazenagem/concluido"),
      });
      return;
    }

    // ====================================================
    // NOVO: Tratar resposta JSON estruturada
    // ====================================================
    const response = offlineResult.data;

    // --- ERRO DE NEGÓCIO ---
    if (response && response.sucesso === false) {
      const codigo = response.codigo as string;
      const dados = response.dados || {};

      // Caso especial: Picking não cadastrado → abrir modal
      if (codigo === "PICKING_NAO_CADASTRADO") {
        setPickingTipo("FRACIONADO");
        setPickingEstMinimo("");
        setPickingEstMaximo("");
        setShowPickingModal(true);
        return;
      }

      // Caso especial: Capacidade excedida → abrir modal de capacidade
      if (codigo === "CAPACIDADE_EXCEDIDA") {
        const capDados = {
          maximo: Number(dados.maximo) || 0,
          saldoAtual: Number(dados.saldo_atual) || 0,
          cabeMais: Number(dados.cabe_mais) || 0,
        };
        if (capDados.cabeMais > 0) {
          setCapInfo(capDados);
          setShowCapModal(true);
        } else {
          result.showWarning("Picking cheio", {
            instruction: "Armazene em um endereço de pulmão.",
          });
        }
        return;
      }

      // Caso especial: Picking já cadastrado em outro endereço → mostrar endereço correto
      if (codigo === "PICKING_ENDERECO_DIVERGENTE") {
        result.showWarning("Picking em outro endereço", {
          details: `Este produto já possui picking cadastrado no endereço ${dados.endereco_picking_cadastrado}.`,
          instruction: "Armazene no endereço de picking correto ou utilize um endereço de pulmão.",
        });
        return;
      }

      // Caso especial: Quantidade excedida → mostrar restante
      if (codigo === "QUANTIDADE_EXCEDIDA") {
        const catItem = ERRO_ARMAZENAGEM[codigo];
        result.showWarning(catItem?.titulo || response.mensagem, {
          details: `Restante permitido: ${dados.restante}`,
          instruction: "Ajuste a quantidade e tente novamente.",
        });
        return;
      }

      // Demais erros catalogados
      const catItem = ERRO_ARMAZENAGEM[codigo];
      if (catItem) {
        if (catItem.icone === "error") {
          result.showError(new Error(response.mensagem), { context: "armazenagem-execucao" });
        } else {
          result.showWarning(catItem.titulo, {
            details: response.mensagem,
            instruction: catItem.instrucao,
          });
        }
        return;
      }

      // Código desconhecido — fallback genérico
      result.showError(new Error(response.mensagem || "Erro desconhecido na armazenagem."), {
        context: "armazenagem-execucao",
      });
      return;
    }

    // --- SUCESSO ---
    // Log da sugestão (não crítico)
    try {
      const empresaIdLog = localStorage.getItem("core_empresa_id");
      await (supabase as any).from("log_sugestao_armazenagem").insert({
        tenant_id: tenantId,
        empresa_id: empresaIdLog,
        armazem_id: armazemId,
        produto_id: produtoId,
        endereco_sugerido_id: recEndId || destinoEndId || enderecoId,
        endereco_escolhido_id: enderecoId,
        score: 0,
        tipo_sugestao: "RECOMENDACAO_DESTINO",
        motivo_sugestao: recDestino || null,
        aceita: recEndId ? enderecoId === recEndId : null,
        lote: lote || null,
        quantidade: Number(quantidade),
        usuario_id: usuarioId,
      });
    } catch (logErr) {
      console.error("Log de sugestão falhou (não crítico):", logErr);
    }

    // Mensagem de sucesso diferenciada quando picking foi registrado inline
    const msgSucesso = response?.picking_registrado
      ? "Picking cadastrado e armazenagem registrada!"
      : "Armazenagem registrada com sucesso!";

    result.showSuccess(msgSucesso, {
      onClose: () => onNavigate("/coletor/armazenagem/concluido"),
    });
  };

  const handleConfirm = async () => {
    if (!tarefaId || !tenantId || !usuarioId || !enderecoId || !quantidade || !movimentoEntradaId) return;

    // Verificação pré-ação (fallback caso o Realtime falhe)
    if (isOnline && documentoEntradaId) {
      const cancelado = await documentoEntradaCancelado(documentoEntradaId, tenantId);
      if (cancelado) {
        setDocCanceladoInline(true);
        feedbackError();
        toast.error("Este documento foi cancelado. Não armazene este item.");
        return;
      }
    }

    setSaving(true);
    try {
      await executarArmazenagem();
    } catch (err: any) {
      // Apenas exceções de infraestrutura (assert_tenant_match, rede, etc.)
      const msg = err.message || "Erro inesperado ao registrar armazenagem";
      result.showError(new Error(msg), { context: "armazenagem-execucao" });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmComPicking = async () => {
    if (!pickingEstMinimo || !pickingEstMaximo) {
      toast.error("Preencha estoque mínimo e máximo.");
      return;
    }
    setShowPickingModal(false);
    setSaving(true);
    try {
      await executarArmazenagem({
        p_picking_tipo: pickingTipo,
        p_picking_est_minimo: Number(pickingEstMinimo),
        p_picking_est_maximo: Number(pickingEstMaximo),
      });
    } catch (err: any) {
      const msg = err.message || "Erro ao registrar armazenagem";
      result.showError(new Error(msg), { context: "armazenagem-execucao" });
    } finally {
      setSaving(false);
    }
  };

  const fatorCampo = Number(sessionStorage.getItem("coletor_armazenagem_fator") || "1") || 1;
  const unidadeCampo = fatorCampo > 1 ? "CX" : "UN";
  const qtdTudo = Math.floor(qtdSugerida / fatorCampo);
  const qtdNum = Number(quantidade) || 0;

  let avisoTipo = "";
  if (enderecoId) {
    if (destinoTipo === "PICKING" && enderecoTipo !== "PICKING") avisoTipo = "Você escolheu picking, mas leu um endereço de pulmão.";
    else if (destinoTipo === "PULMAO" && enderecoTipo === "PICKING") avisoTipo = "Você escolheu pulmão, mas leu um endereço de picking.";
    else if (destinoTipo === "PICKING" && destinoEndId && enderecoId !== destinoEndId) avisoTipo = "Endereço diferente do picking escolhido.";
  }

  return (
    <ColetorLayout title="Armazenar" onNavigate={onNavigate} showBack backPath="/coletor/armazenagem/iniciar">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />
      <ResultDialog {...result.dialogProps} />
      <EtapaIndicador etapa={3} />

      {cancelamento && (
        <CancelamentoOverlay
          titulo="NÃO ARMAZENE"
          mensagem="O documento deste item foi cancelado. Retorne o item ao box de recebimento."
          detalhes={{
            numeroNota: cancelamento.numeroNota,
            motivo: cancelamento.motivo,
            origem: cancelamento.origem,
          }}
          redirectPath="/coletor/armazenagem"
          onNavigate={onNavigate}
        />
      )}

      {docCanceladoInline && !cancelamento && (
        <div
          className="space-y-2"
          style={{
            backgroundColor: "rgba(239, 83, 80, 0.12)",
            border: "1px solid rgba(239, 83, 80, 0.3)",
            borderRadius: 6,
            padding: 12,
          }}
        >
          <p className="text-[14px] font-bold" style={{ color: "#ef5350" }}>✕ DOCUMENTO CANCELADO</p>
          <p className="text-[12px]" style={{ color: "#7a8899" }}>
            O documento deste item foi cancelado. Não armazene.
          </p>
          <button
            onClick={() => onNavigate("/coletor/armazenagem")}
            className="w-full font-bold uppercase text-[13px]"
            style={{ minHeight: 48, borderRadius: 8, border: "1px solid #ef5350", color: "#ef5350" }}
          >
            Voltar à armazenagem
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 -mt-1">
        <ProdutoHeader
          sku={produtoSku}
          descricao={produtoDesc}
          restante={qtdRestante}
          fatorCaixa={fatorCampo}
          linhas={1}
          onOcorrencia={ocorrenciaCtx}
        />

        {/* Card de destino */}
        <div className="rounded-[10px] border-[1.5px] border-[hsl(217,91%,60%)] bg-[hsl(217,91%,50%)]/10 px-2.5 py-2 text-center flex flex-col items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(213,31%,70%)]">
            Destino escolhido · {destinoTipo === "PICKING" ? "Picking" : "Pulmão"}
          </span>
          {enderecoId ? (
            <>
              <span className="font-mono text-[19px] font-bold text-white leading-tight">{enderecoDesc}</span>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[#22C55E]"><CircleCheck size={12} /> endereço lido ✓</span>
            </>
          ) : (
            <span className={`font-mono font-bold leading-tight ${destinoTipo === "PICKING" && destinoEndDesc ? "text-[19px] text-[hsl(280,70%,70%)]" : "text-[14px] text-white"}`}>
              {destinoTipo === "PICKING" ? (destinoEndDesc || "Bipe o endereço de picking") : "Bipe um endereço de pulmão"}
            </span>
          )}
          {avisoTipo && (
            <div className="w-full flex items-center gap-1.5 rounded-lg bg-[hsl(45,93%,47%)]/12 border border-[hsl(45,93%,47%)]/35 px-2 py-1 text-left">
              <AlertTriangle size={12} className="text-[hsl(45,93%,55%)] shrink-0" />
              <span className="text-[11px] text-[hsl(45,93%,80%)]">{avisoTipo}</span>
            </div>
          )}
          {(huCodigo || variosPickings) && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {huCodigo && (
                <span className="flex items-center gap-1 rounded-md bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[hsl(45,93%,80%)]">
                  <Archive size={10} /> HU: {huCodigo}
                </span>
              )}
              {variosPickings && (
                <span className="flex items-center gap-1 rounded-md bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30 px-1.5 py-0.5 text-[10px] text-[hsl(45,93%,80%)]">
                  <AlertTriangle size={10} /> Múltiplos pickings
                </span>
              )}
            </div>
          )}
        </div>

        <ScanField
          compact
          confirmado={!!enderecoId}
          label="Bipe o endereço destino"
          lastScanned={enderecoDesc || enderecoScan}
          onScan={handleScanEndereco}
          placeholder="Leia o código do endereço"
        />

        {/* Quantidade */}
        <div className="flex items-center justify-between">
          <label htmlFor="qtd-armazenar" className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(213,31%,55%)]">Quantidade</label>
          {qtdTudo > 0 && (
            <button
              type="button"
              onClick={() => setQuantidade(String(qtdTudo))}
              className="min-h-[32px] px-2 rounded-md text-[12px] font-semibold text-[hsl(217,91%,65%)] border border-[hsl(217,91%,60%)]/35"
            >
              Tudo ({qtdTudo})
            </button>
          )}
        </div>
        <div className="flex items-start gap-2">
          <button
            type="button"
            aria-label="Diminuir quantidade"
            onClick={() => setQuantidade(String(Math.max(0, qtdNum - 1)))}
            className="w-[52px] h-[52px] shrink-0 rounded-[10px] bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] text-white flex items-center justify-center active:bg-[hsl(222,35%,16%)]"
          >
            <Minus size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <input
              id="qtd-armazenar"
              type="number"
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="0"
              className="w-full h-[52px] px-2 rounded-[10px] border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-2xl font-bold text-white text-center outline-none focus:border-[hsl(217,91%,50%)]"
            />
            <p className="text-center text-[11px] text-[hsl(213,31%,60%)] leading-tight mt-0.5">
              {unidadeCampo}{fatorCampo > 1 && qtdNum > 0 ? ` = ${qtdNum * fatorCampo} UN` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Aumentar quantidade"
            onClick={() => setQuantidade(String(qtdNum + 1))}
            className="w-[52px] h-[52px] shrink-0 rounded-[10px] bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] text-white flex items-center justify-center active:bg-[hsl(222,35%,16%)]"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <StickyFooter>
        <ActionButton
          onClick={handleConfirm}
          disabled={!quantidade || Number(quantidade) <= 0 || !enderecoId || !movimentoEntradaId}
          loading={saving}
          variant="success"
        >
          CONFIRMAR ARMAZENAGEM
        </ActionButton>
      </StickyFooter>

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

      {/* Modal de picking não cadastrado */}
      {showPickingModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-5 space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-14 h-14 rounded-full bg-[hsl(280,70%,55%)]/20 flex items-center justify-center">
                <MapPin size={32} className="text-[hsl(280,70%,55%)]" />
              </div>
              <h3 className="text-lg font-bold text-white">Cadastrar Picking</h3>
              <p className="text-sm text-[hsl(213,31%,55%)]">
                Este produto não possui endereço de picking cadastrado. Preencha os dados abaixo para continuar a armazenagem.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[hsl(213,31%,55%)] mb-1">Tipo de Picking *</label>
                <select
                  value={pickingTipo}
                  onChange={(e) => setPickingTipo(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-lg border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]"
                >
                  <option value="FRACIONADO">Fracionado</option>
                  <option value="MASTER">Master</option>
                  <option value="PDV">PDV</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[hsl(213,31%,55%)] mb-1">Estoque Mínimo *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={pickingEstMinimo}
                  onChange={(e) => setPickingEstMinimo(e.target.value)}
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-lg border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[hsl(213,31%,55%)] mb-1">Estoque Máximo *</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={pickingEstMaximo}
                  onChange={(e) => setPickingEstMaximo(e.target.value)}
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-lg border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)]  text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <ActionButton
                onClick={handleConfirmComPicking}
                loading={saving}
                variant="success"
              >
                CONFIRMAR E ARMAZENAR
              </ActionButton>
              <ActionButton
                onClick={() => setShowPickingModal(false)}
                variant="secondary"
              >
                CANCELAR
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}