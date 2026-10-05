import type { Catalogo } from "../retornos.types";
import type { FluxoEdge, FluxoNode } from "./definicaoRf";
import { ehGatilho } from "./novoNo";

export interface ConexaoProposta { source: string | null; target: string | null; sourceHandle?: string | null }

/** Retorna null quando a ligação é válida; senão o motivo ("" = bloquear sem mensagem). */
export function motivoBloqueio(c: ConexaoProposta, nodes: FluxoNode[], edges: FluxoEdge[], catalogo?: Catalogo): string | null {
  if (!c.source || !c.target) return "";
  const destino = nodes.find((n) => n.id === c.target);
  const origem = nodes.find((n) => n.id === c.source);
  if (!destino || !origem) return "";
  if (ehGatilho(destino.data.tipo)) return "Nada pode ligar de volta ao gatilho.";
  if (c.source === c.target) return "Um nó não pode ligar nele mesmo.";
  const saidas = saidasDoTipo(origem, catalogo);
  if (!saidas.includes(c.sourceHandle ?? "principal")) return "";
  // DFS a partir do destino procurando a origem
  const vistos = new Set<string>();
  const pilha = [c.target];
  while (pilha.length) {
    const atual = pilha.pop() as string;
    if (atual === c.source) return "Essa ligação criaria um ciclo.";
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    edges.filter((e) => e.source === atual).forEach((e) => pilha.push(e.target));
  }
  return null;
}

export function saidasDoTipo(no: FluxoNode, catalogo?: Catalogo): string[] {
  return catalogo?.nos.find((n) => n.tipo === no.data.tipo)?.saidas ?? ["principal"];
}

export function saidasLivres(no: FluxoNode, edges: FluxoEdge[], catalogo?: Catalogo): string[] {
  const usadas = new Set(edges.filter((e) => e.source === no.id).map((e) => e.sourceHandle ?? "principal"));
  return saidasDoTipo(no, catalogo).filter((s) => !usadas.has(s));
}
