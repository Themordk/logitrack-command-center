import { createContext, useContext } from "react";
import type { Contexto } from "../../retornos.types";

export const MIME_CAMINHO = "text/x-retorno-caminho";
/** Presente quando o caminho arrastado é uma lista (array). */
export const MIME_LISTA = "text/x-retorno-lista";

export interface PainelContextoValor {
  contexto: Contexto;
  caminhos: string[];
  somenteLeitura: boolean;
  fluxoId?: string | null;
}

export const PainelContext = createContext<PainelContextoValor>({ contexto: {}, caminhos: [], somenteLeitura: true });
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
