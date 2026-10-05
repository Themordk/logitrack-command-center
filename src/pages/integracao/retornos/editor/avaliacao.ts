// Avaliação no cliente — só para PRÉ-VISUALIZAR. A fonte da verdade é o motor no backend.
// Semântica: comparações como texto; "existe" = não vazio; "em"/"nao_em" com array ou lista
// separada por vírgula; maior/menor numéricos; combinador "e"/"ou".
import type { Combinador, Regra } from "../retornos.types";

export function obterCaminho(obj: unknown, caminho: string): unknown {
  if (!caminho) return undefined;
  let atual: unknown = obj;
  for (const parte of caminho.split(".")) {
    if (atual === null || atual === undefined) return undefined;
    if (Array.isArray(atual)) {
      const i = Number(parte);
      atual = Number.isInteger(i) ? atual[i] : undefined;
    } else if (typeof atual === "object") {
      atual = (atual as Record<string, unknown>)[parte];
    } else {
      return undefined;
    }
  }
  return atual;
}

export function comoTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function renderTemplate(tpl: string, ctx: unknown): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, c: string) => comoTexto(obterCaminho(ctx, c)));
}

function lista(valor: Regra["valor"]): string[] {
  if (Array.isArray(valor)) return valor.map((x) => comoTexto(x).trim());
  return comoTexto(valor).split(",").map((x) => x.trim()).filter((x) => x !== "");
}

function numeros(a: string, b: unknown): [number, number] | null {
  if (a.trim() === "" || comoTexto(b).trim() === "") return null;
  const x = Number(a); const y = Number(comoTexto(b));
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

export function avaliarRegra(regra: Regra, ctx: unknown): boolean {
  const atual = comoTexto(obterCaminho(ctx, regra.campo));
  const esperado = comoTexto(regra.valor);
  switch (regra.operador) {
    case "igual": return atual === esperado;
    case "diferente": return atual !== esperado;
    case "contem": return atual.includes(esperado);
    case "em": return lista(regra.valor).includes(atual);
    case "nao_em": return !lista(regra.valor).includes(atual);
    case "existe": return atual.trim() !== "";
    case "nao_existe": return atual.trim() === "";
    case "maior": case "maior_igual": case "menor": case "menor_igual": {
      const n = numeros(atual, regra.valor);
      if (!n) return false;
      const [x, y] = n;
      if (regra.operador === "maior") return x > y;
      if (regra.operador === "maior_igual") return x >= y;
      if (regra.operador === "menor") return x < y;
      return x <= y;
    }
    default: return false;
  }
}

export function avaliarFiltros(regras: Regra[] | undefined, combinador: Combinador | undefined, ctx: unknown): boolean {
  const rs = regras ?? [];
  if (!rs.length) return true;
  return combinador === "ou" ? rs.some((r) => avaliarRegra(r, ctx)) : rs.every((r) => avaliarRegra(r, ctx));
}
