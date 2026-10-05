import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { Catalogo, Definicao, Ligacao, No, TipoNo } from "../retornos.types";

export type FluxoNodeData = {
  tipo: TipoNo;
  nome?: string;
  config: Record<string, unknown>;
  /** Chaves desconhecidas vindas do banco — preservadas ao salvar. */
  extra: Record<string, unknown>;
};
export type FluxoNode = Node<FluxoNodeData, "fluxo">;
export type FluxoEdge = Edge<Record<string, never>, "fluxo">;

export const COR_SAIDA: Record<string, string> = {
  sucesso: "rgb(16 185 129)",
  verdadeiro: "rgb(16 185 129)",
  erro: "rgb(244 63 94)",
  falso: "rgb(244 63 94)",
};
export const corSaida = (saida: string | null | undefined) => COR_SAIDA[saida ?? ""] ?? "hsl(var(--muted-foreground))";

export function criarEdge(de: string, para: string, saida: string): FluxoEdge {
  return {
    id: `${de}:${saida}->${para}`,
    source: de,
    target: para,
    sourceHandle: saida,
    targetHandle: "entrada",
    type: "fluxo",
    markerEnd: { type: MarkerType.ArrowClosed, color: corSaida(saida), width: 16, height: 16 },
  };
}

function layoutAutomatico(def: Definicao): Map<string, { x: number; y: number }> {
  const prof = new Map<string, number>();
  const fila: string[] = [];
  def.nos.filter((n) => n.tipo.startsWith("gatilho.")).forEach((n) => { prof.set(n.id, 0); fila.push(n.id); });
  while (fila.length) {
    const atual = fila.shift() as string;
    for (const l of def.ligacoes.filter((x) => x.de === atual)) {
      if (!prof.has(l.para)) { prof.set(l.para, (prof.get(atual) ?? 0) + 1); fila.push(l.para); }
    }
  }
  const linhas = new Map<number, number>();
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of def.nos) {
    const col = prof.get(n.id) ?? 0;
    const lin = linhas.get(col) ?? 0;
    linhas.set(col, lin + 1);
    pos.set(n.id, { x: col * 280, y: lin * 160 });
  }
  return pos;
}

export function paraRf(def: Definicao, _catalogo?: Catalogo): { nodes: FluxoNode[]; edges: FluxoEdge[] } {
  const nos = def?.nos ?? [];
  const ligacoes = def?.ligacoes ?? [];
  const precisaLayout = nos.some((n) => !n.posicao);
  const auto = precisaLayout ? layoutAutomatico({ versao_schema: 1, nos, ligacoes }) : null;
  const nodes: FluxoNode[] = nos.map((no) => {
    const { id, tipo, nome, posicao, config, ...extra } = no;
    const p = posicao ?? auto?.get(id) ?? { x: 0, y: 0 };
    return {
      id,
      type: "fluxo",
      position: { x: p.x ?? 0, y: p.y ?? 0 },
      data: { tipo, nome, config: (config ?? {}) as Record<string, unknown>, extra: extra as Record<string, unknown> },
      deletable: !tipo.startsWith("gatilho."),
    };
  });
  const edges = ligacoes.map((l) => criarEdge(l.de, l.para, l.saida ?? "principal"));
  return { nodes, edges };
}

export function deRf(nodes: FluxoNode[], edges: FluxoEdge[]): Definicao {
  return {
    versao_schema: 1,
    nos: nodes.map((n) => ({
      ...n.data.extra,
      id: n.id,
      tipo: n.data.tipo,
      ...(n.data.nome ? { nome: n.data.nome } : {}),
      config: n.data.config,
      posicao: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    })) as No[],
    ligacoes: edges.map((e) => {
      const saida = e.sourceHandle ?? "principal";
      const l: Ligacao = { de: e.source, para: e.target };
      if (saida !== "principal") l.saida = saida;
      return l;
    }),
  };
}
