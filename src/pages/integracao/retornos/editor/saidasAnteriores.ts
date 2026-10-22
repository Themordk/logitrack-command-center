// Saídas de nós anteriores (saidas.<id>) — mesma semântica de integracao.fn_retorno_validar_definicao.
// Funções puras, sem React.
import type { Ligacao } from "../retornos.types";

export type { Ligacao };

export const TIPOS_COM_SAIDA = ["dados.payload", "acao.http", "acao.webhook", "acao.provedor"] as const;
export const geraSaida = (tipo: string) => (TIPOS_COM_SAIDA as readonly string[]).includes(tipo);

const PROFUNDIDADE_MAX = 25;

export interface NoMin { id: string; tipo: string; nome?: string }

export interface NoAnterior {
  id: string; tipo: string; nome: string;
  /** true = existe caminho do gatilho até o nó atual que NÃO passa por este (a saída pode estar vazia) */
  condicional: boolean;
  /** true = o nó atual só é alcançado pelo ramo "erro" deste (a saída fica vazia) */
  soPeloErro: boolean;
}

const saidaDe = (l: Ligacao) => l.saida ?? "principal";

/** `alvo` alcançável a partir dos nós `inicio` (profundidade limitada), opcionalmente evitando um nó. */
function alcanca(inicio: string[], alvo: string, ligacoes: Ligacao[], evitar?: string): boolean {
  let fronteira = inicio.filter((i) => i !== evitar);
  const vistos = new Set(fronteira);
  for (let prof = 0; fronteira.length && prof <= PROFUNDIDADE_MAX; prof++) {
    if (fronteira.includes(alvo)) return true;
    const prox: string[] = [];
    for (const atual of fronteira) {
      for (const l of ligacoes) {
        if (l.de === atual && l.para !== evitar && !vistos.has(l.para)) { vistos.add(l.para); prox.push(l.para); }
      }
    }
    fronteira = prox;
  }
  return false;
}

/** Ordem de execução: BFS a partir do gatilho; empate pela ordem de `nos`. */
function ordemTopologica(nos: NoMin[], ligacoes: Ligacao[]): Map<string, number> {
  const ordem = new Map<string, number>();
  let fronteira = nos.filter((n) => n.tipo.startsWith("gatilho.")).map((n) => n.id);
  const indice = new Map(nos.map((n, i) => [n.id, i]));
  let pos = 0;
  const vistos = new Set(fronteira);
  while (fronteira.length) {
    fronteira.sort((a, b) => (indice.get(a) ?? 0) - (indice.get(b) ?? 0));
    for (const id of fronteira) ordem.set(id, pos++);
    const prox: string[] = [];
    for (const atual of fronteira) {
      for (const l of ligacoes) if (l.de === atual && !vistos.has(l.para)) { vistos.add(l.para); prox.push(l.para); }
    }
    fronteira = prox;
  }
  return ordem;
}

/** Nós que geram saída e vêm ANTES de `noId`, em ordem de execução (topológica a partir do gatilho). */
export function nosAnteriores(noId: string, nos: NoMin[], ligacoes: Ligacao[]): NoAnterior[] {
  const gatilhos = nos.filter((n) => n.tipo.startsWith("gatilho.")).map((n) => n.id);
  const resultado: NoAnterior[] = [];
  for (const x of nos) {
    if (x.id === noId || !geraSaida(x.tipo)) continue;
    const saindo = ligacoes.filter((l) => l.de === x.id);
    const normais = saindo.filter((l) => saidaDe(l) !== "erro").map((l) => l.para);
    const pelaErro = saindo.filter((l) => saidaDe(l) === "erro").map((l) => l.para);
    let soPeloErro: boolean;
    if (alcanca(normais, noId, ligacoes)) soPeloErro = false;
    else if (alcanca(pelaErro, noId, ligacoes)) soPeloErro = true;
    else continue;
    const condicional = alcanca(gatilhos, noId, ligacoes, x.id);
    resultado.push({ id: x.id, tipo: x.tipo, nome: x.nome || x.id, condicional, soPeloErro });
  }
  const ordem = ordemTopologica(nos, ligacoes);
  const indice = new Map(nos.map((n, i) => [n.id, i]));
  const chave = (id: string) => ordem.get(id) ?? Number.MAX_SAFE_INTEGER;
  return resultado.sort((a, b) => chave(a.id) - chave(b.id) || (indice.get(a.id) ?? 0) - (indice.get(b.id) ?? 0));
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
