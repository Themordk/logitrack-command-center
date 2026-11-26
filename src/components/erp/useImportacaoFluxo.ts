import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import {
  cancelarImportacao, confirmarImportacao, importacaoDisponivel, iniciarImportacao, invokeDispatcher, obterImportacao,
  type ParametrosImportacao,
} from "@/pages/integracao/retornos/retornosService";
import type { EventoImportacao, Importacao } from "@/pages/integracao/retornos/retornos.types";
import { importacaoParada, situacaoImportacao, type SituacaoImportacao } from "./importacaoFluxo";

/** Espera extra depois do dispatcher (que já segura ~55 s): consulta a cada 2 s por até 30 s. */
const INTERVALO_MS = 2_000;
const ESPERA_EXTRA_MS = 30_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const importacaoKeys = {
  disponivel: (tenantId: string | null, empresaId: string | null, evento: EventoImportacao | null) =>
    ["retorno-importacao-disponivel", tenantId, empresaId, evento] as const,
};

export type EstadoImportacaoFluxo = "ocioso" | SituacaoImportacao;

export interface ImportacaoFluxo {
  /** Consulta de disponibilidade ainda carregando: a tela mostra skeleton, não o caminho antigo. */
  carregando: boolean;
  /** Há exatamente um fluxo ativo para o botão desta tela. */
  disponivel: boolean;
  /** Mais de um fluxo ativo: o servidor recusa (RETORNO_IMPORTACAO_AMBIGUA). */
  ambiguo: boolean;
  temConfirmacao: boolean;
  fluxoNome: string | null;
  estado: EstadoImportacaoFluxo;
  importacao: Importacao | null;
  /** Erro de chamada (RPC/Edge) já traduzido pelo errorMapper. */
  erro: { titulo: string; instrucao?: string } | null;
  ocupado: boolean;
  buscar: (parametros: ParametrosImportacao) => Promise<void>;
  confirmar: () => Promise<void>;
  cancelar: () => Promise<void>;
  reiniciar: () => void;
}

/**
 * Botão Importar do ERP pelo Retorno ao ERP: disponibilidade → iniciar → executar_interativo →
 * prévia/confirmar/cancelar. Sem fluxo ativo (`disponivel=false`) a tela segue com o caminho antigo.
 */
export function useImportacaoFluxo(evento: EventoImportacao | null, ativo: boolean): ImportacaoFluxo {
  const { tenantId, empresaId } = useTenant();
  const [estado, setEstado] = useState<EstadoImportacaoFluxo>("ocioso");
  const [importacao, setImportacao] = useState<Importacao | null>(null);
  const [erro, setErro] = useState<ImportacaoFluxo["erro"]>(null);
  const [ocupado, setOcupado] = useState(false);
  const vivo = useRef(true);
  const atual = useRef<Importacao | null>(null);

  const q = useQuery({
    queryKey: importacaoKeys.disponivel(tenantId, empresaId, evento),
    queryFn: () => importacaoDisponivel(tenantId as string, empresaId as string, evento),
    enabled: ativo && !!evento && !!tenantId && !!empresaId,
    staleTime: 60_000,
    // Sem permissão ou sem a RPC: a tela fica no caminho antigo, que tem a própria checagem.
    retry: false,
  });
  const linha = q.data?.find((d) => d.evento === evento) ?? null;

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const aplicar = useCallback((imp: Importacao) => {
    atual.current = imp;
    if (!vivo.current) return;
    setImportacao(imp);
    setEstado(situacaoImportacao(imp));
  }, []);

  const falhar = useCallback((e: unknown, contexto: string) => {
    if (!vivo.current) return;
    const pe = parseError(e, contexto);
    setErro({ titulo: pe.title, instrucao: pe.instruction || undefined });
    setEstado("erro");
  }, []);

  /** Roda o dispatcher e, se ele devolver antes do fim, acompanha até parar. */
  const rodar = useCallback(async (execucaoId: string) => {
    const r = await invokeDispatcher({ acao: "executar_interativo", execucao_id: execucaoId });
    let imp = r.importacao ?? (await obterImportacao(execucaoId));
    aplicar(imp);
    const limite = Date.now() + ESPERA_EXTRA_MS;
    while (!importacaoParada(imp) && Date.now() < limite && vivo.current) {
      await esperar(INTERVALO_MS);
      imp = await obterImportacao(execucaoId);
      aplicar(imp);
    }
    if (!importacaoParada(imp) && vivo.current) {
      setErro({ titulo: "A importação ainda não terminou.", instrucao: "Acompanhe em Integração › Retorno ao ERP › Execuções." });
      setEstado("erro");
    }
  }, [aplicar]);

  const buscar = useCallback(async (parametros: ParametrosImportacao) => {
    if (!evento || !tenantId || !empresaId) return;
    setOcupado(true); setErro(null); setImportacao(null); atual.current = null; setEstado("executando");
    try {
      const ini = await iniciarImportacao(tenantId, empresaId, evento, parametros);
      if (ini.status === "filtrado") {
        aplicar(await obterImportacao(ini.execucao_id));
        return;
      }
      await rodar(ini.execucao_id);
    } catch (e) {
      falhar(e, "Importar do ERP");
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }, [evento, tenantId, empresaId, aplicar, rodar, falhar]);

  const confirmar = useCallback(async () => {
    const imp = atual.current;
    if (!imp) return;
    setOcupado(true); setErro(null); setEstado("executando");
    try {
      aplicar(await confirmarImportacao(imp.execucao_id));
      await rodar(imp.execucao_id);
    } catch (e) {
      falhar(e, "Confirmar importação");
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }, [aplicar, rodar, falhar]);

  const cancelar = useCallback(async () => {
    const imp = atual.current;
    if (!imp || situacaoImportacao(imp) !== "aguardando") return;
    setOcupado(true);
    try {
      aplicar(await cancelarImportacao(imp.execucao_id));
    } catch {
      // A prévia expira sozinha (cron a cada 5 min): não trava a tela por falha ao cancelar.
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }, [aplicar]);

  // Diálogo fechado (X, Esc, clique fora) com a prévia aberta: descarta a importação em vez de esperar o cron.
  useEffect(() => {
    if (ativo) return;
    const imp = atual.current;
    if (imp && situacaoImportacao(imp) === "aguardando") void cancelarImportacao(imp.execucao_id).catch(() => undefined);
  }, [ativo]);

  const reiniciar = useCallback(() => {
    atual.current = null;
    setImportacao(null); setErro(null); setEstado("ocioso");
  }, []);

  return {
    carregando: q.isLoading && q.fetchStatus !== "idle",
    disponivel: !!linha?.disponivel,
    ambiguo: !!linha && !linha.disponivel && linha.fluxos_ativos > 1,
    temConfirmacao: !!linha?.tem_confirmacao,
    fluxoNome: linha?.fluxo_nome ?? null,
    estado, importacao, erro, ocupado,
    buscar, confirmar, cancelar, reiniciar,
  };
}
