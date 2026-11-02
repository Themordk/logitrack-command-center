// Saídas de nós anteriores (saidas.<id>) — mesma semântica de integracao.fn_retorno_validar_definicao.
// Funções puras, sem React. Toda travessia usa conjunto de visitados: custo O(N + E), sem teto de profundidade.
import type { Ligacao } from "../retornos.types";

export type { Ligacao };

export const TIPOS_COM_SAIDA = ["dados.payload", "acao.http", "acao.webhook", "acao.provedor"] as const;
export const geraSaida = (tipo: string) => (TIPOS_COM_SAIDA as readonly string[]).includes(tipo);

export interface NoMin { id: string; tipo: string; nome?: string }

export interface NoAnterior {
  id: string; tipo: string; nome: string;
  /** true = existe caminho do gatilho até o nó atual que NÃO passa por este (a saída pode estar vazia) */
  condicional: boolean;
  /** true = o nó atual só é alcançado pelo ramo "erro" deste (a saída fica vazia) */
  soPeloErro: boolean;
}

const saidaDe = (l: Ligacao) => l.saida ?? "principal";

export interface IndiceGrafo {
  /** Lista de adjacência: id → saídas [{para, saida}]. */
  adj: Map<string, { para: string; saida: string }[]>;
  /** Ordem de execução (BFS a partir do gatilho; empate pela ordem de `nos`). */
  ordem: Map<string, number>;
  /** Nós alcançáveis a partir das saídas de `id` — "semErro" ignora o ramo erro, "soErro" usa só ele. Com cache. */
  descendentes(id: string, modo: "semErro" | "soErro"): Set<string>;
  /** Nós alcançáveis a partir de `inicio`, opcionalmente sem passar por `evitar`. Com cache. */
  alcancaveis(inicio: string[], evitar?: string): Set<string>;
}

/** Monta uma vez os mapas do grafo (adjacência, ordem topológica e caches de alcance). */
export function indexarGrafo(nos: NoMin[], ligacoes: Ligacao[]): IndiceGrafo {
  const adj = new Map<string, { para: string; saida: string }[]>();
  for (const l of ligacoes) {
    const lista = adj.get(l.de) ?? [];
    lista.push({ para: l.para, saida: saidaDe(l) });
    adj.set(l.de, lista);
  }

  const ordem = new Map<string, number>();
  const indiceNo = new Map(nos.map((n, i) => [n.id, i]));
  {
    let fronteira = nos.filter((n) => n.tipo.startsWith("gatilho.")).map((n) => n.id);
    const vistos = new Set(fronteira);
    let pos = 0;
    while (fronteira.length) {
      fronteira.sort((a, b) => (indiceNo.get(a) ?? 0) - (indiceNo.get(b) ?? 0));
      for (const id of fronteira) ordem.set(id, pos++);
      const prox: string[] = [];
      for (const atual of fronteira) {
        for (const l of adj.get(atual) ?? []) if (!vistos.has(l.para)) { vistos.add(l.para); prox.push(l.para); }
      }
      fronteira = prox;
    }
  }

  const bfs = (inicio: string[], evitar?: string): Set<string> => {
    const vistos = new Set(inicio.filter((i) => i !== evitar));
    let fronteira = [...vistos];
    while (fronteira.length) {
      const prox: string[] = [];
      for (const atual of fronteira) {
        for (const l of adj.get(atual) ?? []) {
          if (l.para !== evitar && !vistos.has(l.para)) { vistos.add(l.para); prox.push(l.para); }
        }
      }
      fronteira = prox;
    }
    return vistos;
  };

  const cacheDesc = new Map<string, Set<string>>();
  const cacheAlc = new Map<string, Set<string>>();
  return {
    adj,
    ordem,
    descendentes(id, modo) {
      const chave = `${id}|${modo}`;
      let r = cacheDesc.get(chave);
      if (!r) {
        const inicio = (adj.get(id) ?? [])
          .filter((l) => (modo === "soErro" ? l.saida === "erro" : l.saida !== "erro"))
          .map((l) => l.para);
        r = bfs(inicio);
        cacheDesc.set(chave, r);
      }
      return r;
    },
    alcancaveis(inicio, evitar) {
      const chave = `${[...inicio].sort().join(",")}|${evitar ?? ""}`;
      let r = cacheAlc.get(chave);
      if (!r) { r = bfs(inicio, evitar); cacheAlc.set(chave, r); }
      return r;
    },
  };
}

/** Nós que geram saída e vêm ANTES de `noId`, em ordem de execução (topológica a partir do gatilho). */
export function nosAnteriores(noId: string, nos: NoMin[], ligacoes: Ligacao[], indice: IndiceGrafo = indexarGrafo(nos, ligacoes)): NoAnterior[] {
  const gatilhos = nos.filter((n) => n.tipo.startsWith("gatilho.")).map((n) => n.id);
  const resultado: NoAnterior[] = [];
  for (const x of nos) {
    if (x.id === noId || !geraSaida(x.tipo)) continue;
    let soPeloErro: boolean;
    if (indice.descendentes(x.id, "semErro").has(noId)) soPeloErro = false;
    else if (indice.descendentes(x.id, "soErro").has(noId)) soPeloErro = true;
    else continue;
    const condicional = indice.alcancaveis(gatilhos, x.id).has(noId);
    resultado.push({ id: x.id, tipo: x.tipo, nome: x.nome || x.id, condicional, soPeloErro });
  }
  const indiceNo = new Map(nos.map((n, i) => [n.id, i]));
  const chave = (id: string) => indice.ordem.get(id) ?? Number.MAX_SAFE_INTEGER;
  return resultado.sort((a, b) => chave(a.id) - chave(b.id) || (indiceNo.get(a.id) ?? 0) - (indiceNo.get(b.id) ?? 0));
}

/** Ids referenciados em `saidas.<id>` dentro de qualquer string (template, caminho, JSONata, regra). */
export function referenciasSaidas(texto: string): string[] {
  const ids: string[] = [];
  for (const m of String(texto ?? "").matchAll(/saidas\.([A-Za-z0-9_]+)/g)) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

/** Nós cuja config referencia `saidas.<id>` (para avisar antes de excluir). */
export function dependentesDe(
  id: string, nos: { id: string; data: { nome?: string; config: unknown } }[],
): { id: string; nome: string }[] {
  return nos
    .filter((n) => n.id !== id && referenciasSaidas(JSON.stringify(n.data.config ?? {})).includes(id))
    .map((n) => ({ id: n.id, nome: n.data.nome || n.id }));
}
