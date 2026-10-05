// Prévia no cliente. TODA a regra de negócio vem de ./motorPrevia (cópia fiel do motor do servidor);
// este arquivo só adapta a assinatura usada pelas telas e guarda os utilitários de UI
// (presets, conversão para JSONata, erro de sintaxe, contexto de lote).
// Não reimplemente regras aqui: se a prévia divergir do servidor, o teste motorPrevia.paridade.test.ts falha.
import jsonata from "jsonata";
import * as Motor from "./motorPrevia";
import type { CampoMapeado, Combinador, ConfigPayload, MapaItem, Regra } from "../retornos.types";

export const obterCaminho = (obj: unknown, caminho: string): unknown => Motor.obterCaminho(obj, caminho);

export function comoTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** {{caminho}} → valor do contexto. Use codificar=true para montar URLs (o servidor codifica o caminho). */
export const renderTemplate = (tpl: string, ctx: unknown, codificar = false): string => Motor.renderTemplate(tpl, ctx, codificar);

export const avaliarRegra = (regra: Regra, ctx: unknown): boolean => Motor.avaliarRegra(ctx, regra as Motor.Regra);

export const avaliarFiltros = (regras: Regra[] | undefined, combinador: Combinador | undefined, ctx: unknown): boolean =>
  Motor.avaliarFiltros(ctx, regras ?? [], combinador);

export type FuncaoMapa = (dominio: string, valor: unknown) => unknown;

/** De-para: item do fluxo vence o da empresa; sem correspondência o valor passa como veio. */
export function criarMapa(itens: MapaItem[] | undefined): FuncaoMapa {
  return Motor.criarMapa((itens ?? []).map((i) => ({ dominio: i.dominio, valor_wms: i.valor_wms, valor_erp: i.valor_erp, do_fluxo: !!i.fluxo_id })));
}

export const avaliarJsonata = (expressao: string, entrada: unknown, raiz: unknown, mapa: FuncaoMapa): Promise<unknown> =>
  Motor.avaliarJsonata(expressao, entrada, (raiz ?? {}) as Motor.Obj, mapa);

export const montarPayload = (config: Partial<ConfigPayload> | Record<string, unknown>, ctx: unknown, mapa: FuncaoMapa): Promise<unknown> =>
  Motor.montarPayload(config as Motor.Obj, (ctx ?? {}) as Motor.Obj, mapa);

/** Erro de sintaxe JSONata (null = ok). */
export function erroSintaxeJsonata(expressao: string): string | null {
  if (!expressao.trim()) return null;
  try { jsonata(expressao); return null; } catch (e) {
    const err = e as { message?: string; position?: number };
    return `${err.message ?? "Expressão inválida"}${typeof err.position === "number" ? ` (posição ${err.position})` : ""}`;
  }
}

// ---------- Presets (§6 do contrato) ----------
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
// Todo campo escalar vira $formatar(<expr>, "<formato>"): $formatar é a MESMA função do mapeamento visual,
// exposta pelo servidor ao JSONata. Assim número com vírgula, vazio, "sim/não" e campo ausente (null)
// dão exatamente o mesmo corpo nos dois modos.
function caminhoJsonata(caminho: string): string {
  const c = caminho.trim();
  if (!c) return "null";
  if (c === "$raiz") return "$raiz";
  let pre = "";
  let resto = c;
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
  if (tipo === "objeto") return objetoJsonata(c.campos ?? [], nivel + 1);
  if (tipo === "lista") return `[${caminhoJsonata(comoTexto(c.valor))}.${objetoJsonata(c.campos ?? [], nivel + 1)}]`;
  let e: string;
  if (tipo === "fixo") e = JSON.stringify(c.valor ?? null);
  else if (tipo === "expressao") e = `(${comoTexto(c.valor) || "null"})`;
  else e = caminhoJsonata(comoTexto(c.valor));
  if (c.dominio) e = `$mapa(${JSON.stringify(c.dominio)}, ${e})`;
  return `$formatar(${e}, ${JSON.stringify(c.formato ?? "")})`;
}

function objetoJsonata(campos: CampoMapeado[], nivel: number): string {
  const ind = "  ".repeat(nivel + 1);
  const linhas = campos.filter((c) => c.campo).map((c) => `${ind}${JSON.stringify(c.campo)}: ${exprCampo(c, nivel)}`);
  return linhas.length ? `{\n${linhas.join(",\n")}\n${"  ".repeat(nivel)}}` : "{}";
}

export function mapeamentoParaJsonata(campos: CampoMapeado[]): string {
  return objetoJsonata(campos, 0);
}

/** Contexto que fluxos agrupados recebem (lote com 1 documento na prévia). Mesmo formato do servidor. */
export function contextoLote(ctx: Record<string, unknown>): Record<string, unknown> {
  return { versao_contexto: 1, evento: ctx.evento ?? null, lote: true, quantidade: 1, ocorrido_em: ctx.ocorrido_em ?? null, empresa: ctx.empresa ?? null, documentos: [ctx] };
}
