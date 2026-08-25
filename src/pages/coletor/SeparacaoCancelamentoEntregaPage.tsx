import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ScanField } from "@/components/coletor/ScanField";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useFeedback } from "@/hooks/useFeedback";
import { Ban, MapPin, AlertTriangle, CheckCircle2, ArrowRight, XCircle, ClipboardList } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface ItemCancelado {
  tarefa_id: string;
  sku: string;
  produto: string;
  referencia: string | null;
  quantidade: number;
  endereco_origem: string;
  documento_numero: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function SeparacaoCancelamentoEntregaPage({ onNavigate }: Props) {
  const result = useResultDialog({ coletorMode: true });
  const feedback = useFeedback();

  const [step, setStep] = useState<"scan" | "confirmar" | "conclusao">("scan");
  const [lastScanned, setLastScanned] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultadoEntrega, setResultadoEntrega] = useState<any>(null);

  const [itens] = useState<ItemCancelado[]>(() => readJson<ItemCancelado[]>("coletor_separacao_cancel_itens", []));
  const [documentosCancelados] = useState<string[]>(() => readJson<string[]>("coletor_separacao_cancel_docs", []));

  const enderecoCancelamento = sessionStorage.getItem("coletor_separacao_cancel_endereco") || "";
  const enderecoDestinoId = sessionStorage.getItem("coletor_separacao_cancel_endereco_id") || "";
  const movimentoSaidaId = sessionStorage.getItem("coletor_separacao_cancel_movimento_id") || "";

  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  const totalUnidades = itens.reduce((acc, i) => acc + Number(i.quantidade || 0), 0);

  const limparSessao = () => {
    [
      "coletor_separacao_cancel_itens",
      "coletor_separacao_cancel_endereco",
      "coletor_separacao_cancel_endereco_id",
      "coletor_separacao_cancel_docs",
      "coletor_separacao_cancel_movimento_id",
      "coletor_separacao_cancel_resultado",
    ].forEach((k) => sessionStorage.removeItem(k));
  };

  const handleScan = (code: string) => {
    const scan = code.trim();
    setLastScanned(scan);
    if (scan.toUpperCase() === enderecoCancelamento.trim().toUpperCase()) {
      feedback.success();
      setStep("confirmar");
    } else {
      feedback.error();
      result.showWarning("Endereço incorreto!", {
        details: `Esperado: ${enderecoCancelamento}`,
        instruction: "Escaneie o endereço de cancelamento indicado na tela.",
      });
    }
  };

  const handleConfirmar = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("separacao_confirmar_entrega_cancelamento" as any, {
        p_tenant_id: tenantId,
        p_movimento_saida_id: movimentoSaidaId,
        p_usuario_id: usuarioId,
        p_endereco_destino_id: enderecoDestinoId,
      });
      if (error) throw error;

      const resultado = typeof data === "string" ? JSON.parse(data) : (data as any);

      if (resultado && resultado.sucesso === false) {
        feedback.error();
        result.showWarning(resultado.mensagem || "Não foi possível confirmar a entrega.");
        return;
      }

      feedback.success();
      sessionStorage.setItem("coletor_separacao_cancel_resultado", JSON.stringify(resultado ?? {}));

      setResultadoEntrega(resultado);
      setStep("conclusao");
    } catch (err: unknown) {
      feedback.error();
      result.showError(err, { context: "cancelamento-entrega" });
    } finally {
      setLoading(false);
    }
  };

  // Empty state
  if (!itens.length || !enderecoCancelamento) {
    return (
      <ColetorLayout title="Entrega de cancelados" onNavigate={onNavigate} showBack backPath="/coletor/separacao/iniciar">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
          <XCircle size={44} className="text-red-400" />
          <p className="text-sm text-[hsl(213,31%,55%)]">
            Nenhum item cancelado encontrado para devolução.
          </p>
          <ActionButton variant="secondary" onClick={() => { limparSessao(); onNavigate("/coletor/separacao/iniciar"); }}>
            Voltar às ondas
          </ActionButton>
        </div>
        <ResultDialog {...result.dialogProps} />
      </ColetorLayout>
    );
  }

  const ItensLista = (
    <>
      {itens.map((item, idx) => (
        <div
          key={`${item.tarefa_id}-${idx}`}
          className="flex items-center justify-between gap-2 py-2 border-t border-red-500/20 first:border-t-0"
        >
          <div className="min-w-0">
            <p className="text-sm font-mono font-bold text-white truncate">{item.sku}</p>
            <p className="text-sm text-[hsl(213,31%,55%)] truncate">{item.produto}</p>
          </div>
          <span className="shrink-0 text-sm font-mono font-black text-red-400">{item.quantidade}x</span>
        </div>
      ))}
    </>
  );

  return (
    <ColetorLayout
      title={step === "conclusao" ? "Devolução concluída" : "Entrega de cancelados"}
      onNavigate={onNavigate}
      showBack={step !== "conclusao"}
      backPath="/coletor/separacao/iniciar"
    >
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {/* Barra de progresso */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-bold flex items-center gap-1.5 ${step === "conclusao" ? "text-green-400" : "text-red-400"}`}>
              {step === "conclusao" ? <CheckCircle2 size={16} /> : <Ban size={16} />}
              {step === "conclusao" ? "Entrega concluída" : "Entrega de cancelados"}
            </span>
            <span className="text-sm font-mono text-[hsl(213,31%,55%)]">
              {documentosCancelados.length ? `Pedido #${documentosCancelados.join(", #")}` : ""}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[hsl(222,35%,16%)] overflow-hidden">
            <div
              className={`h-1.5 rounded-full ${step === "conclusao" ? "bg-green-500" : "bg-red-500"}`}
              style={{ width: step === "scan" ? "33%" : step === "confirmar" ? "66%" : "100%" }}
            />
          </div>
        </div>

        {step === "scan" ? (
          <>
            {/* Itens para devolver */}
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={18} className="text-red-400" />
                <span className="text-sm font-bold text-white">Itens para devolver</span>
                <span className="ml-auto text-sm font-bold text-red-400">
                  {itens.length} {itens.length === 1 ? "item" : "itens"}
                </span>
              </div>
              {ItensLista}
            </div>

            {/* Endereço de cancelamento */}
            <div className="rounded-2xl border border-red-500/30 bg-[hsl(222,40%,12%)] p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <MapPin size={16} className="text-red-400" />
                <span className="text-sm font-bold text-[hsl(213,31%,91%)]">Endereço de Cancelamento</span>
              </div>
              <p className="text-2xl font-mono font-black text-red-400 tracking-wide">{enderecoCancelamento}</p>
              <p className="text-sm text-[hsl(213,31%,55%)] mt-1">Deposite TODOS os itens neste endereço</p>
            </div>

            <p className="text-sm text-[hsl(213,31%,55%)]">
              Deposite TODOS os itens e escaneie o endereço para confirmar a entrega de uma vez.
            </p>

            <ScanField
              label="Escanear endereço de cancelamento"
              lastScanned={lastScanned}
              onScan={handleScan}
              disabled={loading}
              suppressKeyboard
            />
          </>
        ) : step === "confirmar" ? (
          <>
            {/* Movimento */}
            <div className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4">
              <p className="text-sm font-bold text-white mb-2">Movimento de estoque</p>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-[hsl(213,31%,45%)]">Origem</p>
                  <p className="text-sm font-mono font-bold text-[hsl(213,31%,91%)]">Diversos</p>
                </div>
                <ArrowRight size={18} className="text-red-400 shrink-0" />
                <div className="min-w-0 text-right">
                  <p className="text-sm text-[hsl(213,31%,45%)]">Cancelamento</p>
                  <p className="text-sm font-mono font-bold text-red-400">{enderecoCancelamento}</p>
                </div>
              </div>
            </div>

            {/* Endereço confirmado */}
            <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 flex items-center gap-3">
              <CheckCircle2 size={22} className="text-green-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-green-400">Endereço confirmado</p>
                <p className="text-sm font-mono font-bold text-white truncate">{enderecoCancelamento}</p>
              </div>
            </div>

            {/* Resumo */}
            <div className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList size={18} className="text-[hsl(213,31%,55%)]" />
                <span className="text-sm font-bold text-white">Resumo da entrega</span>
              </div>
              {ItensLista}
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-[hsl(222,35%,22%)]">
                <span className="text-sm text-[hsl(213,31%,55%)]">Total de unidades</span>
                <span className="text-sm font-mono font-black text-white">{totalUnidades} un</span>
              </div>
            </div>

            {/* Aviso */}
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
              <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">
                Confirme que TODOS os itens foram depositados no endereço de cancelamento.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <ActionButton variant="danger" onClick={handleConfirmar} loading={loading}>
                Confirmar Entrega — Ação Irreversível
              </ActionButton>
              <ActionButton variant="secondary" onClick={() => setStep("scan")} disabled={loading}>
                Voltar
              </ActionButton>
            </div>
          </>
        ) : null}

        {step === "conclusao" && (
          <>
            {/* Ícone de sucesso */}
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <p className="text-lg font-bold text-green-400">Entrega concluída</p>
              <p className="text-sm text-[hsl(213,31%,55%)]">
                Todos os itens foram devolvidos com sucesso.
              </p>
            </div>

            {/* Resumo da devolução */}
            <div className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList size={18} className="text-[hsl(213,31%,55%)]" />
                <span className="text-sm font-bold text-white">Resumo da devolução</span>
              </div>

              {/* Itens devolvidos */}
              {itens.map((item, idx) => (
                <div
                  key={`${item.tarefa_id}-${idx}`}
                  className="flex items-center justify-between gap-2 py-2 border-t border-[hsl(222,35%,22%)] first:border-t-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-bold text-white truncate">{item.sku}</p>
                    <p className="text-sm text-[hsl(213,31%,55%)] truncate">{item.produto}</p>
                  </div>
                  <span className="shrink-0 text-sm font-mono font-black text-green-400">{item.quantidade}x</span>
                </div>
              ))}

              {/* Totais */}
              <div className="flex items-center justify-between pt-2 mt-2 border-t border-[hsl(222,35%,22%)]">
                <span className="text-sm text-[hsl(213,31%,55%)]">Total devolvido</span>
                <span className="text-sm font-mono font-black text-white">{totalUnidades} un</span>
              </div>
            </div>

            {/* Endereço de destino */}
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 flex items-center gap-3">
              <MapPin size={18} className="text-green-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-[hsl(213,31%,55%)]">Destino</p>
                <p className="text-sm font-mono font-bold text-green-400">{enderecoCancelamento}</p>
              </div>
            </div>

            {/* Documentos cancelados */}
            {documentosCancelados.length > 0 && (
              <div className="rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
                <p className="text-sm text-[hsl(213,31%,55%)] mb-1">Pedidos cancelados</p>
                <p className="text-sm font-mono font-bold text-red-400">
                  #{documentosCancelados.join(", #")}
                </p>
              </div>
            )}

            {/* Botão de voltar */}
            <div className="pt-2">
              <ActionButton
                variant="primary"
                onClick={() => {
                  limparSessao();
                  onNavigate("/coletor/separacao/iniciar");
                }}
              >
                Voltar às ondas
              </ActionButton>
            </div>
          </>
        )}
      </div>

      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}
