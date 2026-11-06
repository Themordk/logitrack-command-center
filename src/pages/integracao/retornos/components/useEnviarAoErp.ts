import { useCallback, useState } from "react";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";
import type { VerificacaoEnvio } from "../retornos.types";
import { executar, invokeDispatcher, verificarEnvio } from "../retornosService";

/** Pedido de confirmação aberto quando o documento tem retornos anteriores travando a fila. */
export interface ConfirmacaoEnvio {
  fluxoId: string;
  fluxoNome: string;
  verificacao: VerificacaoEnvio;
}

/**
 * Fluxo único do botão "Enviar ao ERP" (detalhe do documento e card de retornos):
 * 1. pré-checa a fila do documento (integracao_retorno_verificar_envio);
 * 2. com bloqueio descartável → pede confirmação; com envio em andamento → avisa e para;
 * 3. executa (descartando os bloqueios só se o usuário confirmou) e dispara o dispatcher.
 * A regra é garantida no backend: sem confirmação a RPC recusa com RETORNO_DOCUMENTO_BLOQUEADO.
 */
export function useEnviarAoErp(documentoId: string, aoTerminar: () => void) {
  const [enviando, setEnviando] = useState(false);
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoEnvio | null>(null);

  const executarEDisparar = useCallback(async (fluxoId: string, descartar: boolean): Promise<boolean> => {
    const r = await executar(fluxoId, documentoId, "manual", false, descartar);
    if (r.status === "filtrado") { toast.warning("Documento barrado pelos filtros do fluxo."); return true; }
    const qtdDescartadas = r.descartadas?.length ?? 0;
    const d = await invokeDispatcher({ acao: "executar", execucao_id: r.execucao_id });
    const sufixo = qtdDescartadas > 0 ? ` ${qtdDescartadas} retorno(s) anterior(es) descartado(s).` : "";
    if (d.status === "sucesso") toast.success(`Enviado ao ERP.${sufixo}`);
    else if (d.status === "erro") toast.error(d.erro || "O envio falhou.", { description: sufixo.trim() || undefined });
    else toast.info(`Envio em processamento.${sufixo}`);
    return true;
  }, [documentoId]);

  const enviar = useCallback(async (fluxoId: string, fluxoNome: string): Promise<boolean> => {
    setEnviando(true);
    try {
      const v = await verificarEnvio(fluxoId, documentoId);
      if (v.em_andamento) {
        toast.info("Há um retorno deste documento sendo enviado agora.", { description: "Aguarde terminar e tente de novo." });
        return false;
      }
      if (v.bloqueios.length > 0) {
        setConfirmacao({ fluxoId, fluxoNome, verificacao: v });
        return false;
      }
      return await executarEDisparar(fluxoId, false);
    } catch (e) {
      const p = parseError(e, "retorno-enviar");
      // Corrida: alguém criou um bloqueio entre a pré-checagem e o envio → reabre a confirmação.
      if (p.errorCode === "RETORNO_DOCUMENTO_BLOQUEADO") {
        try { setConfirmacao({ fluxoId, fluxoNome, verificacao: await verificarEnvio(fluxoId, documentoId) }); return false; }
        catch { /* cai no toast abaixo */ }
      }
      toast.error(p.title, { description: p.instruction || undefined });
      return false;
    } finally {
      setEnviando(false);
      aoTerminar();
    }
  }, [documentoId, executarEDisparar, aoTerminar]);

  const confirmar = useCallback(async () => {
    if (!confirmacao) return;
    setEnviando(true);
    try {
      await executarEDisparar(confirmacao.fluxoId, true);
      setConfirmacao(null);
    } catch (e) {
      const p = parseError(e, "retorno-enviar");
      toast.error(p.title, { description: p.instruction || undefined });
      setConfirmacao(null);
    } finally {
      setEnviando(false);
      aoTerminar();
    }
  }, [confirmacao, executarEDisparar, aoTerminar]);

  const cancelar = useCallback(() => setConfirmacao(null), []);

  return { enviar, enviando, confirmacao, confirmar, cancelar };
}
