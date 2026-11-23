/**
 * Armazenagem da HU inteira (Plano HU — H2).
 * O operador lê a HU, vê o que tem dentro e lê UM endereço: todos os itens vão juntos.
 * Regras (itens liberados, endereço, picking desmonta a HU, status) vivem em
 * rpc_coletor_hu_armazenagem / rpc_coletor_armazenar_hu. Só funciona com conexão.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, type OverlayType } from "@/components/coletor/StatusOverlay";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useFeedback } from "@/hooks/useFeedback";
import { Archive, MapPin, Loader2, CircleCheck, AlertTriangle, WifiOff } from "lucide-react";
import { huService, type ResumoHUArmazenagem } from "@/lib/huService";
import { rotaListaItens } from "@/lib/armazenagemOrigem";
import { iniciarHU } from "@/lib/lmsTimestamp";

interface Props { onNavigate: (path: string) => void; }

export const CHAVE_HU_ARMAZENAGEM = "coletor_armazenagem_hu_leitura";

interface EnderecoLido { id: string; descricao: string; situacao: string; tipo_endereco: string }

export function ArmazenagemHUPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const codigo = sessionStorage.getItem(CHAVE_HU_ARMAZENAGEM) || "";
  const result = useResultDialog({ coletorMode: true });
  const feedback = useFeedback();
  const [resumo, setResumo] = useState<ResumoHUArmazenagem | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [endereco, setEndereco] = useState<EnderecoLido | null>(null);
  const [ultimoLido, setUltimoLido] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");
  const online = typeof navigator === "undefined" || navigator.onLine;

  const carregar = useCallback(async () => {
    if (!codigo) { setCarregando(false); return; }
    setCarregando(true);
    try {
      const r = await huService.armazenagemResumo(codigo);
      setResumo(r);
      // LMS (Fase 2): o bipe da HU na doca é o início das tarefas de armazenagem dela
      if (r?.pode_armazenar) void iniciarHU(r.hu?.hu_id);
    } catch (err) {
      result.showError(err, { context: "armazenagem-hu" });
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const voltar = () => onNavigate(rotaListaItens("ENTRADA"));

  const lerEndereco = async (code: string) => {
    setUltimoLido(code);
    setEndereco(null);
    const numero = Number(String(code).trim());
    if (!Number.isFinite(numero)) {
      feedback.error();
      result.showWarning("Leia a etiqueta do endereço", { details: `Código lido: ${code}` });
      return;
    }
    const { data, error } = await supabase
      .from("endereco")
      .select("id, descricao, situacao, tipo_endereco")
      .eq("codigo_endereco", numero)
      .eq("tenant_id", tenantId ?? "")
      .limit(1);
    if (error) { result.showError(error, { context: "armazenagem-hu-endereco" }); return; }
    const e = data?.[0] as EnderecoLido | undefined;
    if (!e) { feedback.error(); result.showWarning("Endereço não encontrado"); return; }
    if (!["LIVRE", "OCUPADO"].includes(e.situacao)) {
      feedback.error();
      result.showWarning("Endereço bloqueado", { details: `Endereço ${e.descricao} está ${e.situacao}.` });
      return;
    }
    setEndereco(e);
    setOverlay("success");
    setOverlayMsg(`Endereço: ${e.descricao}`);
  };

  const armazenar = async () => {
    if (!resumo || !endereco || salvando) return;
    setSalvando(true);
    try {
      const r = await huService.armazenar(resumo.hu.hu_id, endereco.id);
      feedback.success();
      setOverlay("success");
      setOverlayMsg(r.mensagem || "HU armazenada.");
      sessionStorage.removeItem(CHAVE_HU_ARMAZENAGEM);
      window.setTimeout(voltar, 1200);
    } catch (err) {
      feedback.error();
      result.showError(err, { context: "armazenagem-hu" });
    } finally {
      setSalvando(false);
    }
  };

  const picking = endereco?.tipo_endereco === "PICKING";

  return (
    <ColetorLayout title={`Armazenar HU ${resumo?.hu.codigo_hu ?? codigo}`} onNavigate={onNavigate} showBack backPath={rotaListaItens("ENTRADA")}>
      <ResultDialog {...result.dialogProps} />
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      {!online && (
        <div className="flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
          <WifiOff size={16} /> A armazenagem da HU precisa de conexão. Aguarde o sinal voltar.
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-white" /></div>
      ) : !resumo ? (
        <div className="flex flex-col items-center gap-3 p-6 text-center text-[hsl(213,31%,65%)]">
          <Archive size={32} />
          <p className="text-base">Leia uma HU na lista de itens para armazená-la inteira.</p>
          <ActionButton variant="secondary" onClick={voltar}>VOLTAR</ActionButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <div className="rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
            <div className="flex items-center gap-2 text-white">
              <Archive size={18} className="text-[hsl(217,91%,60%)]" />
              <span className="font-mono text-lg font-bold">{resumo.hu.codigo_hu}</span>
              <span className="ml-auto text-sm text-[hsl(213,31%,65%)]">
                {resumo.hu.tipo_hu} {resumo.hu.tamanho} · {resumo.itens.length} item(ns)
              </span>
            </div>
            <ul className="mt-2 divide-y divide-[hsl(222,35%,18%)]" aria-label="Itens da HU">
              {resumo.itens.map((i) => (
                <li key={i.hu_item_id} className="flex items-start gap-2 py-2 text-sm">
                  {i.liberado
                    ? <CircleCheck size={16} className="mt-0.5 shrink-0 text-green-400" aria-label="Liberado" />
                    : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-yellow-400" aria-label="Não liberado" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-white">{i.descricao}</div>
                    <div className="text-[hsl(213,31%,65%)]">
                      SKU {i.sku}{i.lote ? ` · Lote ${i.lote}` : ""}{i.liberado ? "" : " · não liberado para armazenagem"}
                    </div>
                  </div>
                  <span className="font-mono text-base font-bold text-white">{Number(i.quantidade)}</span>
                </li>
              ))}
            </ul>
          </div>

          {!resumo.pode_armazenar ? (
            <div className="flex items-start gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {resumo.motivo}
            </div>
          ) : (
            <>
              <ScanField label="Leia o endereço de destino" lastScanned={ultimoLido} onScan={lerEndereco}
                confirmado={!!endereco} disabled={!online || salvando} />
              {endereco && (
                <div className="flex items-center gap-2 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3 text-white">
                  <MapPin size={16} className="text-[hsl(217,91%,60%)]" />
                  <span className="font-mono text-lg font-bold">{endereco.descricao}</span>
                  <span className="ml-auto text-sm text-[hsl(213,31%,65%)]">{picking ? "Picking" : "Pulmão"}</span>
                </div>
              )}
              {picking && (
                <div className="flex items-start gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  Endereço de picking: o estoque fica sem HU e a HU é desmontada.
                </div>
              )}
              <ActionButton variant="primary" onClick={armazenar} disabled={!endereco || salvando || !online}>
                {salvando ? <Loader2 size={20} className="animate-spin" /> : <CircleCheck size={20} />}
                ARMAZENAR HU INTEIRA
              </ActionButton>
            </>
          )}
        </div>
      )}
    </ColetorLayout>
  );
}
