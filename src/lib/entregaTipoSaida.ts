/**
 * Configuração de entrega por tipo de saída (tipo_saida.realiza_entrega,
 * entrega_gerar_em, entrega_confere_volume). Quem decide gerar, sincronizar e
 * exigir a leitura dos volumes é o banco (_fn_entrega_gerar,
 * entrega_parada_conferir_volume / entrega_parada_confirmar); aqui só ficam os
 * rótulos e a limpeza do payload do formulário.
 */
export type EntregaGerarEm = "MONTADA" | "FECHADA";

export const ENTREGA_GERAR_EM_OPCOES: { value: EntregaGerarEm; label: string; descricao: string }[] = [
  {
    value: "MONTADA",
    label: "Carga montada",
    descricao: "A demanda vai para o entregador quando a carga é liberada, antes da conferência física dos volumes no embarque.",
  },
  {
    value: "FECHADA",
    label: "Carga fechada",
    descricao: "A demanda vai para o entregador quando o carregamento é concluído (volumes conferidos no veículo).",
  },
];

export const ENTREGA_PADRAO = {
  realiza_entrega: false,
  entrega_gerar_em: "FECHADA" as EntregaGerarEm,
  entrega_confere_volume: false,
};

type CamposEntrega = {
  realiza_embarque?: boolean | null;
  realiza_entrega?: boolean | null;
  entrega_gerar_em?: string | null;
  entrega_confere_volume?: boolean | null;
};

/** Sem embarque o pedido não entra em carga, então não há entrega; sem entrega, as opções voltam ao padrão. */
export function normalizarEntregaTipoSaida<T extends CamposEntrega & Record<string, unknown>>(payload: T): T {
  const p = { ...payload };
  if (!p.realiza_embarque) p.realiza_entrega = false;
  if (!p.realiza_entrega) {
    p.entrega_gerar_em = ENTREGA_PADRAO.entrega_gerar_em;
    p.entrega_confere_volume = false;
  } else if (p.entrega_gerar_em !== "MONTADA") {
    p.entrega_gerar_em = "FECHADA";
  }
  p.realiza_entrega = !!p.realiza_entrega;
  p.entrega_confere_volume = !!p.entrega_confere_volume;
  return p;
}

export function resumoEntregaTipoSaida(t: CamposEntrega): string {
  if (!t.realiza_embarque || !t.realiza_entrega) return "Não";
  const em = t.entrega_gerar_em === "MONTADA" ? "Montada" : "Fechada";
  return t.entrega_confere_volume ? `${em} · confere vol.` : em;
}
