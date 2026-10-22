import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarExecucoes, obterExecucao } from "../retornosService";
import type { DocumentoRecente, Ligacao } from "../retornos.types";
import { criarMapa, montarPayload } from "./avaliacao";
import type { FluxoNode } from "./definicaoRf";
import { nosAnteriores, type NoAnterior } from "./saidasAnteriores";
import { useMapaRetorno } from "./useMapaRetorno";

export interface SaidaAnterior extends NoAnterior {
  valor: unknown;
  origem: "previa" | "ultima_execucao" | "modelo";
  erro?: string;
}

interface Params {
  noId: string | null; nos: FluxoNode[]; ligacoes: Ligacao[];
  contexto: Record<string, unknown>;
  tenantId: string; empresaId: string; fluxoId: string | null;
  amostra: DocumentoRecente | null;
}

/** Saídas dos nós que vêm antes de `noId`, calculadas como o servidor faria (prévia, última execução ou modelo). */
export function useSaidasAnteriores(p: Params): { saidas: Record<string, unknown>; lista: SaidaAnterior[]; calculando: boolean } {
  const mapa = useMapaRetorno(p.tenantId, p.empresaId, p.fluxoId);
  const documentoId = p.amostra?.documento_id ?? null;

  const execQ = useQuery({
    queryKey: ["retornos", "saidas-execucao", p.fluxoId, documentoId],
    queryFn: async () => {
      const lista = await listarExecucoes(p.tenantId, p.empresaId, { fluxo_id: p.fluxoId as string, documento_id: documentoId as string }, 5);
      const ultima = lista.itens[0];
      if (!ultima) return {} as Record<string, unknown>;
      const det = await obterExecucao(ultima.id);
      const s = (det.estado as { saidas?: Record<string, unknown> } | null)?.saidas;
      return s && typeof s === "object" ? s : {};
    },
    enabled: !!p.fluxoId && !!documentoId && !!p.tenantId && !!p.empresaId,
    staleTime: 60_000,
    retry: false,
  });
  const saidasExecucao = execQ.data;

  const anterioresCalc = useMemo(
    () => (p.noId ? nosAnteriores(p.noId, p.nos.map((n) => ({ id: n.id, tipo: n.data.tipo, nome: n.data.nome })), p.ligacoes) : []),
    [p.noId, p.nos, p.ligacoes],
  );
  const chaveAnteriores = JSON.stringify(anterioresCalc);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const anteriores = useMemo(() => anterioresCalc, [chaveAnteriores]);
  const configs = useMemo(
    () => JSON.stringify(anteriores.map((a) => p.nos.find((n) => n.id === a.id)?.data.config ?? null)),
    [anteriores, p.nos],
  );

  const [res, setRes] = useState<{ saidas: Record<string, unknown>; lista: SaidaAnterior[] }>({ saidas: {}, lista: [] });
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    if (!anteriores.length) { setRes({ saidas: {}, lista: [] }); setCalculando(false); return; }
    let vivo = true;
    setCalculando(true);
    const t = setTimeout(async () => {
      const acumulado: Record<string, unknown> = {};
      const lista: SaidaAnterior[] = [];
      const fn = criarMapa(mapa);
      for (const a of anteriores) {
        if (!vivo) return;
        if (a.soPeloErro) { lista.push({ ...a, valor: undefined, origem: "modelo" }); continue; }
        const no = p.nos.find((n) => n.id === a.id);
        const config = no?.data.config ?? {};
        if (a.tipo === "dados.payload") {
          const entrada = { ...p.contexto, saidas: { ...acumulado }, erro: null, execucao: { id: "<prévia>", modo: "teste", fluxo: "" } };
          try {
            const v = await montarPayload(config, entrada, fn);
            acumulado[a.id] = v;
            lista.push({ ...a, valor: v, origem: "previa" });
          } catch (e) {
            lista.push({ ...a, valor: null, origem: "previa", erro: (e as { message?: string })?.message ?? "Falha ao avaliar" });
          }
          continue;
        }
        if (saidasExecucao && a.id in saidasExecucao) {
          acumulado[a.id] = saidasExecucao[a.id];
          lista.push({ ...a, valor: saidasExecucao[a.id], origem: "ultima_execucao" });
          continue;
        }
        const modelo = a.tipo === "acao.provedor" ? {} : { status: 200, corpo: null };
        acumulado[a.id] = modelo;
        lista.push({ ...a, valor: modelo, origem: "modelo" });
      }
      if (vivo) { setRes({ saidas: acumulado, lista }); setCalculando(false); }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anteriores, configs, p.contexto, mapa, saidasExecucao]);

  return { ...res, calculando };
}
