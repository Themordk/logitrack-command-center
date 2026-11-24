import { useEffect, useState } from "react";
import { fetchOpcoesFiltroEntregas, type OpcaoFiltro, type OpcoesFiltroEntregas } from "./entregas.service";

export interface EntregasFiltrosValor {
  dataInicio: string;
  dataFim: string;
  usuarioId: string;
  veiculoId: string;
  parceiroId: string;
  parceiroNome: string;
}

/** Período padrão: últimos 30 dias (data local). */
export function filtrosIniciais(hoje = new Date()): EntregasFiltrosValor {
  const fmt = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
  const ini = new Date(hoje.getTime() - 29 * 86_400_000);
  return { dataInicio: fmt(ini), dataFim: fmt(hoje), usuarioId: "", veiculoId: "", parceiroId: "", parceiroNome: "" };
}

export function useOpcoesFiltroEntregas(tenantId?: string | null, empresaId?: string | null, versao?: unknown) {
  const [opcoes, setOpcoes] = useState<OpcoesFiltroEntregas>({ entregadores: [], veiculos: [], motivos: [] });
  useEffect(() => {
    if (!tenantId || !empresaId) return;
    let vivo = true;
    fetchOpcoesFiltroEntregas(tenantId, empresaId)
      .then((o) => { if (vivo) setOpcoes(o); })
      .catch((e) => console.error(e));
    return () => { vivo = false; };
  }, [tenantId, empresaId, versao]);
  return opcoes;
}

export function rotuloOpcao(opcoes: OpcaoFiltro[], id: string): string {
  return opcoes.find((o) => o.value === id)?.label ?? id;
}
