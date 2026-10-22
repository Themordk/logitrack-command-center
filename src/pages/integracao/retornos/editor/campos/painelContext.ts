import { createContext, useContext } from "react";
import type { Contexto } from "../../retornos.types";
import type { SaidaAnterior } from "../useSaidasAnteriores";

export const MIME_CAMINHO = "text/x-retorno-caminho";
/** Presente quando o caminho arrastado é uma lista (array). */
export const MIME_LISTA = "text/x-retorno-lista";

export interface GrupoCaminhos {
  /** "documento" | id do nó */
  chave: string;
  /** "Documento" | nome do nó */
  titulo: string;
  id?: string;
  tipo?: string;
  aviso?: string;
  caminhos: { caminho: string; valor: unknown }[];
}

export interface PainelContextoValor {
  contexto: Contexto;
  caminhos: string[];
  somenteLeitura: boolean;
  fluxoId?: string | null;
  grupos: GrupoCaminhos[];
  anteriores: SaidaAnterior[];
  nosDoFluxo: { id: string; nome: string; tipo: string }[];
}

export const PainelContext = createContext<PainelContextoValor>({
  contexto: {}, caminhos: [], somenteLeitura: true, grupos: [], anteriores: [], nosDoFluxo: [],
});
export const usePainel = () => useContext(PainelContext);

/** Caminhos das folhas do contexto (arrays: primeiro item). */
export function listarCaminhos(obj: unknown, prefixo = "", saida: string[] = []): string[] {
  if (Array.isArray(obj)) {
    if (prefixo) saida.push(prefixo);
    if (obj.length) listarCaminhos(obj[0], prefixo ? `${prefixo}.0` : "0", saida);
    return saida;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) listarCaminhos(v, prefixo ? `${prefixo}.${k}` : k, saida);
    return saida;
  }
  if (prefixo) saida.push(prefixo);
  return saida;
}

/** Mensagem de alerta para uma referência saidas.<id> usada no nó atual, ou null se estiver ok. */
export function avisoReferencia(
  id: string, anteriores: SaidaAnterior[], nosDoFluxo: { id: string; nome: string }[],
): { cor: "rose" | "amber"; texto: string } | null {
  const no = nosDoFluxo.find((n) => n.id === id);
  if (!no) return { cor: "rose", texto: `saidas.${id} não existe neste fluxo (nó apagado ou cópia com outro ID).` };
  const a = anteriores.find((x) => x.id === id);
  if (!a) return { cor: "rose", texto: `"${no.nome}" (${id}) não vem antes deste nó — o valor ficará vazio.` };
  if (a.soPeloErro) return { cor: "amber", texto: `Neste ramo (erro) a saída de "${a.nome}" fica vazia.` };
  if (a.condicional) return { cor: "amber", texto: `Pode ficar vazio: nem todo caminho até aqui passa por "${a.nome}".` };
  return null;
}
