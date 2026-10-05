// Avaliação no cliente — só para PRÉ-VISUALIZAR. A fonte da verdade é o motor no backend.
// Semântica: comparações como texto; "existe" = não vazio; "em"/"nao_em" com array ou lista
// separada por vírgula; maior/menor numéricos; combinador "e"/"ou".
import jsonata from "jsonata";
import type { CampoMapeado, Combinador, ConfigPayload, MapaItem, Regra } from "../retornos.types";

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

// ---------- Payload (prévia) ----------
// Porte das regras do motor (criarMapa / avaliarCampos / montarPayload) conforme o contrato §3.3 e §6.

export type FuncaoMapa = (dominio: string, valor: unknown) => unknown;

/** De-para: item do fluxo vence o da empresa; sem correspondência, o valor passa sem tradução. */
export function criarMapa(itens: MapaItem[] | undefined): FuncaoMapa {
  const empresa = new Map<string, string>();
  const fluxo = new Map<string, string>();
  for (const i of itens ?? []) (i.fluxo_id ? fluxo : empresa).set(`${i.dominio}\u0000${i.valor_wms}`, i.valor_erp);
  return (dominio, valor) => {
    if (valor === null || valor === undefined) return valor ?? null;
    const k = `${dominio}\u0000${comoTexto(valor)}`;
    if (fluxo.has(k)) return fluxo.get(k);
    if (empresa.has(k)) return empresa.get(k);
    return valor;
  };
}

function bindings(raiz: unknown, mapa: FuncaoMapa) {
  return { mapa: (d: string, v: unknown) => mapa(d, v), raiz, agora: () => new Date().toISOString() };
}

export async function avaliarJsonata(expressao: string, entrada: unknown, raiz: unknown, mapa: FuncaoMapa): Promise<unknown> {
  if (!expressao.trim()) return null;
  const r = await jsonata(expressao).evaluate(entrada, bindings(raiz, mapa));
  return r === undefined ? null : r;
}

function formatar(v: unknown, formato: CampoMapeado["formato"]): unknown {
  if (!formato || v === null || v === undefined) return v ?? null;
  const t = comoTexto(v).trim();
  switch (formato) {
    case "texto": return comoTexto(v);
    case "numero": { if (t === "") return null; const n = Number(t.replace(",", ".")); return Number.isFinite(n) ? n : null; }
    case "inteiro": { if (t === "") return null; const n = Number(t.replace(",", ".")); return Number.isFinite(n) ? Math.trunc(n) : null; }
    case "booleano": return ["true", "1", "sim", "s", "yes", "y"].includes(t.toLowerCase());
    default: return v;
  }
}

function lerCaminho(caminho: string, item: unknown, raiz: unknown): unknown {
  const c = caminho.trim();
  if (c === "$raiz") return raiz;
  if (c.startsWith("$raiz.")) return obterCaminho(raiz, c.slice(6));
  return obterCaminho(item, c);
}

export async function avaliarCampos(campos: CampoMapeado[], item: unknown, raiz: unknown, mapa: FuncaoMapa): Promise<Record<string, unknown>> {
  const saida: Record<string, unknown> = {};
  for (const c of campos ?? []) {
    if (!c.campo) continue;
    const tipo = c.tipo ?? "caminho";
    let v: unknown;
    if (tipo === "fixo") v = c.valor;
    else if (tipo === "expressao") v = await avaliarJsonata(comoTexto(c.valor), item, raiz, mapa);
    else if (tipo === "objeto") v = await avaliarCampos(c.campos ?? [], item, raiz, mapa);
    else if (tipo === "lista") {
      const base = lerCaminho(comoTexto(c.valor), item, raiz);
      const arr = Array.isArray(base) ? base : base === null || base === undefined ? [] : [base];
      const r: unknown[] = [];
      for (const x of arr) r.push(await avaliarCampos(c.campos ?? [], x, raiz, mapa));
      v = r;
    } else v = lerCaminho(comoTexto(c.valor), item, raiz);
    if (c.dominio && tipo !== "lista" && tipo !== "objeto") v = mapa(c.dominio, v);
    saida[c.campo] = tipo === "lista" || tipo === "objeto" ? v : formatar(v, c.formato);
  }
  return saida;
}

export async function montarPayload(config: Partial<ConfigPayload> | Record<string, unknown>, ctx: unknown, mapa: FuncaoMapa): Promise<unknown> {
  const c = config as Record<string, unknown>;
  if (c.modo === "jsonata") return avaliarJsonata(comoTexto(c.expressao), ctx, ctx, mapa);
  return avaliarCampos((c.campos as CampoMapeado[]) ?? [], ctx, ctx, mapa);
}

/** Erro de sintaxe JSONata (null = ok). */
export function erroSintaxeJsonata(expressao: string): string | null {
  if (!expressao.trim()) return null;
  try { jsonata(expressao); return null; } catch (e) {
    const err = e as { message?: string; position?: number };
    return `${err.message ?? "Expressão inválida"}${typeof err.position === "number" ? ` (posição ${err.position})` : ""}`;
  }
}

// ---------- Presets (§6) ----------
export function presetSoStatus(): CampoMapeado[] {
  return [
    { campo: "pedido", valor: "documento.numero" },
    { campo: "codigo_erp", valor: "documento.codigo_erp" },
    { campo: "status", tipo: "expressao", valor: "evento", dominio: "status" },
    { campo: "data", valor: "ocorrido_em" },
  ];
}

export function presetStatusItens(entrada: boolean): CampoMapeado[] {
  const q = entrada ? ["qtd_esperada", "qtd_conferida", "qtd_divergente"] : ["qtd_solicitada", "qtd_atendida", "qtd_cortada"];
  return [...presetSoStatus(), {
    campo: "itens", tipo: "lista", valor: "itens", campos: [
      { campo: "sku", valor: "produto.sku" },
      { campo: "codigo_erp", valor: "produto.codigo_erp" },
      { campo: "solicitado", valor: q[0] },
      { campo: "atendido", valor: q[1] },
      { campo: "cortado", valor: q[2] },
    ],
  }];
}

// ---------- Mapeamento → JSONata ----------
function caminhoJsonata(caminho: string): string {
  const c = caminho.trim();
  if (!c) return "null";
  let pre = "";
  let resto = c;
  if (c === "$raiz") return "$raiz";
  if (c.startsWith("$raiz.")) { pre = "$raiz."; resto = c.slice(6); }
  const partes: string[] = [];
  for (const p of resto.split(".")) {
    if (/^\d+$/.test(p) && partes.length) partes[partes.length - 1] += `[${p}]`;
    else partes.push(/^[A-Za-z_][A-Za-z0-9_]*$/.test(p) ? p : `\`${p}\``);
  }
  return pre + partes.join(".");
}

function exprCampo(c: CampoMapeado, nivel: number): string {
  const tipo = c.tipo ?? "caminho";
  let e: string;
  if (tipo === "fixo") e = JSON.stringify(c.valor ?? null);
  else if (tipo === "expressao") e = `(${comoTexto(c.valor) || "null"})`;
  else if (tipo === "objeto") e = objetoJsonata(c.campos ?? [], nivel + 1);
  else if (tipo === "lista") e = `[${caminhoJsonata(comoTexto(c.valor))}.${objetoJsonata(c.campos ?? [], nivel + 1)}]`;
  else e = caminhoJsonata(comoTexto(c.valor));
  if (c.dominio && tipo !== "lista" && tipo !== "objeto") e = `$mapa(${JSON.stringify(c.dominio)}, ${e})`;
  if (tipo !== "lista" && tipo !== "objeto") {
    if (c.formato === "texto") e = `$string(${e})`;
    else if (c.formato === "numero") e = `$number(${e})`;
    else if (c.formato === "inteiro") e = `$floor($number(${e}))`;
    else if (c.formato === "booleano") e = `$boolean(${e})`;
  }
  return e;
}

function objetoJsonata(campos: CampoMapeado[], nivel: number): string {
  const ind = "  ".repeat(nivel + 1);
  const linhas = campos.filter((c) => c.campo).map((c) => `${ind}${JSON.stringify(c.campo)}: ${exprCampo(c, nivel)}`);
  return linhas.length ? `{\n${linhas.join(",\n")}\n${"  ".repeat(nivel)}}` : "{}";
}

export function mapeamentoParaJsonata(campos: CampoMapeado[]): string {
  return objetoJsonata(campos, 0);
}

/** Contexto que fluxos agrupados recebem (lote com 1 documento na prévia). */
export function contextoLote(ctx: Record<string, unknown>): Record<string, unknown> {
  return { versao_contexto: 1, evento: ctx.evento ?? null, lote: true, quantidade: 1, ocorrido_em: ctx.ocorrido_em ?? null, empresa: ctx.empresa ?? null, documentos: [ctx] };
}
