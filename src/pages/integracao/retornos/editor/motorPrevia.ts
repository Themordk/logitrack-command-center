// =============================================================================
// CÓPIA FIEL do motor do servidor: supabase/functions/retorno-dispatcher/motor.ts
// (Edge Function retorno-dispatcher v3, 05/10/2026). Só muda o import do jsonata.
// NÃO edite à mão. Regra nova ou correção: muda primeiro no motor.ts do servidor e copia para cá.
// O teste motorPrevia.paridade.test.ts compara a prévia com resultados gerados pelo servidor.
// =============================================================================
import jsonata from "jsonata";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Obj = Record<string, unknown>;

export interface No {
  id: string;
  tipo: string;
  nome?: string;
  config?: Obj;
}
export interface Ligacao {
  de: string;
  para: string;
  saida?: string;
}
export interface Definicao {
  versao_schema?: number;
  nos: No[];
  ligacoes: Ligacao[];
}
export interface Destino {
  id: string;
  nome: string;
  modo: "http" | "webhook";
  metodo: string;
  url_base: string;
  auth_tipo: "nenhuma" | "api_key" | "bearer" | "basic" | "hmac";
  auth_config: Obj;
  headers: Record<string, string>;
  timeout_ms: number;
  max_tentativas: number;
  ativo: boolean;
  pausado: boolean;
  segredo: string | null;
}
export interface MapaItem {
  dominio: string;
  valor_wms: string;
  valor_erp: string;
  do_fluxo: boolean;
}

// ---------------------------------------------------------------------------
// Caminhos e templates
// ---------------------------------------------------------------------------
export function obterCaminho(obj: unknown, caminho: string): unknown {
  if (!caminho) return undefined;
  let atual: unknown = obj;
  for (const parte of caminho.split(".")) {
    if (atual === null || atual === undefined) return undefined;
    if (Array.isArray(atual)) {
      const i = Number(parte);
      atual = Number.isInteger(i) ? atual[i] : undefined;
    } else if (typeof atual === "object") {
      atual = (atual as Obj)[parte];
    } else {
      return undefined;
    }
  }
  return atual;
}

function comoTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Substitui {{caminho}} por valores do contexto. `codificar` aplica encodeURIComponent (URLs). */
export function renderTemplate(tpl: string, ctx: unknown, codificar = false): string {
  return String(tpl ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, caminho) => {
    const v = comoTexto(obterCaminho(ctx, caminho)) ?? "";
    return codificar ? encodeURIComponent(v) : v;
  });
}

// ---------------------------------------------------------------------------
// Regras / filtros (mesma semântica do SQL)
// ---------------------------------------------------------------------------
export interface Regra {
  campo: string;
  operador?: string;
  valor?: unknown;
}

export function avaliarRegra(ctx: unknown, regra: Regra): boolean {
  const v = obterCaminho(ctx, regra.campo ?? "");
  const vTxt = v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : String(v);
  const op = String(regra.operador ?? "igual").toLowerCase();
  const alvo = regra.valor;
  const aTxt = alvo === null || alvo === undefined ? null : typeof alvo === "object" && !Array.isArray(alvo) ? JSON.stringify(alvo) : Array.isArray(alvo) ? JSON.stringify(alvo) : String(alvo);
  switch (op) {
    case "existe":
      return (vTxt ?? "") !== "";
    case "nao_existe":
      return (vTxt ?? "") === "";
    case "igual":
      return vTxt === aTxt;
    case "diferente":
      return vTxt !== aTxt;
    case "contem":
      return (vTxt ?? "").toLowerCase().includes((aTxt ?? "").toLowerCase());
    case "em":
    case "nao_em": {
      const lista = Array.isArray(alvo) ? alvo.map((x) => String(x)) : (aTxt ?? "").split(",").map((s) => s.trim());
      const dentro = vTxt !== null && lista.includes(vTxt);
      return op === "em" ? dentro : !dentro;
    }
    case "maior":
    case "menor":
    case "maior_igual":
    case "menor_igual": {
      if (vTxt === null || aTxt === null || vTxt.trim() === "" || aTxt.trim() === "") return false;
      const n1 = Number(vTxt), n2 = Number(aTxt);
      if (Number.isNaN(n1) || Number.isNaN(n2)) return false;
      return op === "maior" ? n1 > n2 : op === "menor" ? n1 < n2 : op === "maior_igual" ? n1 >= n2 : n1 <= n2;
    }
    default:
      return false;
  }
}

export function avaliarFiltros(ctx: unknown, regras: unknown, combinador?: string): boolean {
  if (!Array.isArray(regras) || regras.length === 0) return true;
  const rs = regras as Regra[];
  return String(combinador ?? "e").toLowerCase() === "ou"
    ? rs.some((r) => avaliarRegra(ctx, r))
    : rs.every((r) => avaliarRegra(ctx, r));
}

// ---------------------------------------------------------------------------
// De-para
// ---------------------------------------------------------------------------
export function criarMapa(mapa: MapaItem[]) {
  // Itens do fluxo têm prioridade sobre os da empresa
  const ord = [...mapa].sort((a, b) => Number(b.do_fluxo) - Number(a.do_fluxo));
  // Sem correspondência o valor passa como veio (número continua número, booleano continua booleano).
  return (dominio: string, valor: unknown): unknown => {
    if (valor === null || valor === undefined) return null;
    const v = comoTexto(valor);
    const achado = ord.find((m) => m.dominio === dominio && m.valor_wms === v);
    return achado ? achado.valor_erp : valor;
  };
}

// ---------------------------------------------------------------------------
// Montagem de payload: JSONata ou mapeamento visual
// ---------------------------------------------------------------------------
export interface CampoMapeado {
  campo: string;
  tipo?: "caminho" | "fixo" | "expressao" | "lista" | "objeto";
  valor?: unknown; // caminho, valor fixo ou expressão JSONata
  dominio?: string; // aplica de-para
  campos?: CampoMapeado[]; // para lista/objeto
  formato?: "texto" | "numero" | "inteiro" | "booleano";
}

function paraNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = (comoTexto(v) ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Formatos do mapeamento. Vazio ou inválido vira null; aceita vírgula decimal; booleano aceita sim/s/true/1 sem diferenciar maiúsculas. */
export function formatar(v: unknown, formato?: string): unknown {
  if (v === null || v === undefined) return null;
  switch (formato) {
    case "texto":
      return comoTexto(v);
    case "numero":
      return paraNumero(v);
    case "inteiro": {
      const n = paraNumero(v);
      return n === null ? null : Math.trunc(n);
    }
    case "booleano":
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v === 1;
      return ["true", "1", "sim", "s"].includes((comoTexto(v) ?? "").trim().toLowerCase());
    default:
      return v;
  }
}

function lerCaminho(caminhoBruto: unknown, base: unknown, raiz: Obj): unknown {
  const caminho = String(caminhoBruto ?? "").trim();
  if (caminho === "$raiz") return raiz;
  return caminho.startsWith("$raiz.") ? obterCaminho(raiz, caminho.slice(6)) : obterCaminho(base, caminho);
}

async function avaliarCampos(
  campos: CampoMapeado[],
  base: unknown,
  raiz: Obj,
  mapa: (d: string, v: unknown) => unknown,
): Promise<Obj> {
  const out: Obj = {};
  for (const c of campos ?? []) {
    if (!c?.campo) continue;
    const tipo = c.tipo ?? "caminho";
    let v: unknown;
    if (tipo === "fixo") v = c.valor;
    else if (tipo === "caminho") {
      v = lerCaminho(c.valor, base, raiz);
    } else if (tipo === "expressao") {
      v = await avaliarJsonata(String(c.valor ?? ""), base, raiz, mapa);
    } else if (tipo === "lista") {
      const arr = lerCaminho(c.valor, base, raiz);
      v = [];
      for (const item of Array.isArray(arr) ? arr : []) {
        (v as unknown[]).push(await avaliarCampos(c.campos ?? [], item, raiz, mapa));
      }
    } else if (tipo === "objeto") {
      v = await avaliarCampos(c.campos ?? [], base, raiz, mapa);
    }
    const composto = tipo === "lista" || tipo === "objeto";
    if (c.dominio && !composto) v = mapa(c.dominio, v);
    out[c.campo] = composto ? v : formatar(v, c.formato);
  }
  return out;
}

export async function avaliarJsonata(
  expressao: string,
  entrada: unknown,
  raiz: Obj,
  mapa: (d: string, v: unknown) => unknown,
): Promise<unknown> {
  if (!String(expressao ?? "").trim()) return null;
  const expr = jsonata(expressao);
  const resultado = await expr.evaluate(entrada, {
    mapa: (dominio: string, valor: unknown) => mapa(dominio, valor),
    raiz,
    agora: () => new Date().toISOString(),
    // Mesmo formato do mapeamento visual; usado na conversão mapeamento → JSONata. Ausente vira null.
    formatar: (valor: unknown, formato?: string) => formatar(valor, formato || undefined),
  });
  return resultado === undefined ? null : resultado;
}

export async function montarPayload(cfg: Obj, entrada: Obj, mapa: (d: string, v: unknown) => unknown): Promise<unknown> {
  const modo = String(cfg.modo ?? "jsonata");
  if (modo === "mapeamento") {
    return await avaliarCampos((cfg.campos as CampoMapeado[]) ?? [], entrada, entrada, mapa);
  }
  return await avaliarJsonata(String(cfg.expressao ?? ""), entrada, entrada, mapa);
}

// ---------------------------------------------------------------------------
// HTTP: segurança, autenticação, mascaramento, classificação
// ---------------------------------------------------------------------------
const HOST_BLOQUEADO = [
  /^localhost$/i, /\.localhost$/i, /\.internal$/i, /\.local$/i, /^metadata/i,
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./,
  /^\[?::1\]?$/, /^\[?(fc|fd|fe80)/i,
];

export function urlPermitida(url: string): { ok: boolean; motivo?: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, motivo: "URL inválida" };
  }
  if (u.protocol !== "https:") return { ok: false, motivo: "Somente https é permitido" };
  if (HOST_BLOQUEADO.some((r) => r.test(u.hostname))) return { ok: false, motivo: "Endereço interno bloqueado" };
  return { ok: true };
}

export async function hmacSha256Hex(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RequisicaoMontada {
  url: string;
  metodo: string;
  headers: Record<string, string>;
  corpo: string | null;
  headersSensiveis: string[];
}

export async function montarRequisicao(params: {
  destino: Destino;
  cfgNo: Obj;
  ctxTemplate: unknown;
  corpo: unknown;
  execucaoId: string;
  noId: string;
  tentativa: number;
  envelope?: boolean;
  evento?: string;
}): Promise<RequisicaoMontada> {
  const { destino, cfgNo, ctxTemplate, execucaoId, noId, tentativa } = params;
  const caminho = renderTemplate(String(cfgNo.caminho ?? ""), ctxTemplate, true);
  let url = destino.url_base.replace(/\/+$/, "") + (caminho ? (caminho.startsWith("/") || caminho.startsWith("?") ? caminho : "/" + caminho) : "");
  url = renderTemplate(url, ctxTemplate, true);
  const metodo = String(cfgNo.metodo ?? destino.metodo ?? "POST").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "LogiTrack-Retorno/1.0",
    "Idempotency-Key": `${execucaoId}:${noId}`,
    "X-LogiTrack-Execution-Id": execucaoId,
    "X-LogiTrack-Attempt": String(tentativa),
  };
  for (const [k, v] of Object.entries(destino.headers ?? {})) headers[k] = renderTemplate(String(v), ctxTemplate);
  for (const [k, v] of Object.entries((cfgNo.headers as Record<string, string>) ?? {})) headers[k] = renderTemplate(String(v), ctxTemplate);
  if (params.evento) headers["X-LogiTrack-Event"] = params.evento;

  let corpoObj: unknown = params.corpo;
  if (params.envelope) {
    corpoObj = {
      id: execucaoId,
      evento: params.evento,
      ocorrido_em: obterCaminho(ctxTemplate, "ocorrido_em") ?? new Date().toISOString(),
      tentativa,
      dados: params.corpo,
    };
  }
  const corpo = metodo === "GET" || metodo === "DELETE" ? null : JSON.stringify(corpoObj ?? {});
  const sensiveis: string[] = [];
  const segredo = destino.segredo ?? "";
  const auth = destino.auth_config ?? {};
  switch (destino.auth_tipo) {
    case "api_key": {
      const nome = String(auth.header ?? "X-API-Key");
      if (auth.query) {
        const u = new URL(url);
        u.searchParams.set(String(auth.query), segredo);
        url = u.toString();
      } else {
        headers[nome] = segredo;
        sensiveis.push(nome);
      }
      break;
    }
    case "bearer":
      headers["Authorization"] = `Bearer ${segredo}`;
      sensiveis.push("Authorization");
      break;
    case "basic":
      headers["Authorization"] = `Basic ${btoa(`${String(auth.usuario ?? "")}:${segredo}`)}`;
      sensiveis.push("Authorization");
      break;
    case "hmac": {
      const ts = Math.floor(Date.now() / 1000).toString();
      headers["X-LogiTrack-Timestamp"] = ts;
      headers["X-LogiTrack-Signature"] = "sha256=" + (await hmacSha256Hex(segredo, `${ts}.${corpo ?? ""}`));
      sensiveis.push("X-LogiTrack-Signature");
      break;
    }
  }
  return { url, metodo, headers, corpo, headersSensiveis: sensiveis };
}

export function mascararRequisicao(r: RequisicaoMontada, destino?: Destino): Obj {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) {
    headers[k] = r.headersSensiveis.includes(k) || /authorization|api-key|token|secret|signature/i.test(k) ? "***" : v;
  }
  let url = r.url;
  if (destino?.auth_tipo === "api_key" && destino.auth_config?.query) {
    try {
      const u = new URL(url);
      u.searchParams.set(String(destino.auth_config.query), "***");
      url = u.toString();
    } catch { /* mantém */ }
  }
  return { metodo: r.metodo, url, headers, corpo: truncar(r.corpo, 20000) };
}

export function truncar(s: string | null | undefined, max: number): string | null {
  if (s === null || s === undefined) return null;
  return s.length > max ? s.slice(0, max) + `…[+${s.length - max} caracteres]` : s;
}

export function statusRetentavel(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

const BACKOFF_SEG = [60, 300, 900, 3600, 21600];
export function proximaTentativa(tentativa: number, retryAfter?: string | null): Date {
  let seg = BACKOFF_SEG[Math.min(Math.max(tentativa - 1, 0), BACKOFF_SEG.length - 1)];
  if (retryAfter) {
    const n = Number(retryAfter);
    if (!Number.isNaN(n) && n > 0) seg = Math.min(n, 21600);
    else {
      const d = Date.parse(retryAfter);
      if (!Number.isNaN(d)) seg = Math.min(Math.max((d - Date.now()) / 1000, 1), 21600);
    }
  }
  return new Date(Date.now() + seg * 1000);
}

export function lerJsonSeguro(txt: string): unknown {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Omie: requisições das operações nativas (usadas também na simulação)
// ---------------------------------------------------------------------------
export function omieParamRecebimento(ctx: Obj, parametros: Obj): { endpoint: string; call: string; param: Obj } | { erro: string } {
  const codigo = obterCaminho(ctx, "documento.codigo_erp");
  if (!codigo || Number.isNaN(Number(codigo))) return { erro: "Documento sem código do recebimento no Omie (codigo_erp)" };
  // Correção do legado: o Omie aceita nIdReceb OU cChaveNfe, nunca os dois
  return {
    endpoint: "/produtos/recebimentonfe/",
    call: "AlterarEtapaRecebimento",
    param: { nIdReceb: Number(codigo), cEtapa: String(parametros.etapa ?? "80") },
  };
}

export function omieParamTrocarEtapa(ctx: Obj, parametros: Obj): { endpoint: string; call: string; param: Obj } | { erro: string } {
  const codigo = obterCaminho(ctx, "documento.codigo_erp");
  if (!codigo || Number.isNaN(Number(codigo))) return { erro: "Pedido sem código do Omie (codigo_erp)" };
  return {
    endpoint: "/produtos/pedido/",
    call: "TrocarEtapaPedido",
    param: { codigo_pedido: Number(codigo), etapa: String(parametros.etapa ?? "40") },
  };
}

/** Itens a ajustar no Omie a partir dos cortes do contexto. Usa qtd_atendida (não qtd_separada). */
export function omieItensCorte(ctx: Obj): { codigo_produto: string; atendida: number; cortada: number }[] {
  const itens = (obterCaminho(ctx, "itens") as Obj[]) ?? [];
  return itens
    .filter((i) => Number(i.qtd_cortada ?? 0) > 0)
    .map((i) => ({
      codigo_produto: String(obterCaminho(i, "produto.codigo_erp") ?? obterCaminho(i, "produto.codigo_erp_pedido") ?? ""),
      atendida: Number(i.qtd_atendida ?? 0),
      cortada: Number(i.qtd_cortada ?? 0),
    }));
}

export function omieDetAlterado(detAtual: Obj[], cortes: ReturnType<typeof omieItensCorte>): Obj[] {
  const out: Obj[] = [];
  for (const det of detAtual ?? []) {
    const prod = (det.produto as Obj) ?? {};
    const ide = (det.ide as Obj) ?? {};
    const codProd = String(prod.codigo_produto ?? "");
    const corte = cortes.find((c) => c.codigo_produto === codProd);
    if (!corte) continue;
    if (corte.atendida <= 0) {
      out.push({
        ide: { codigo_item_integracao: String(ide.codigo_item_integracao ?? ""), codigo_item: Number(ide.codigo_item ?? 0), acao_item: "E" },
        produto: { codigo_produto: Number(codProd), quantidade: 0 },
      });
    } else {
      out.push({
        ide: { codigo_item_integracao: String(ide.codigo_item_integracao ?? ""), codigo_item: Number(ide.codigo_item ?? 0), acao_item: "A" },
        produto: {
          codigo_produto: Number(codProd),
          quantidade: corte.atendida,
          valor_unitario: Number(prod.valor_unitario ?? 0),
          unidade: String(prod.unidade ?? "UN"),
        },
      });
    }
  }
  return out;
}

/** Classifica falha do Omie: REDUNDANT/servidor = tentar de novo; Client = erro definitivo. */
export function classificarFalhaOmie(httpStatus: number, texto: string): { retentavel: boolean; aguardarSeg?: number; mensagem: string } {
  const dados = lerJsonSeguro(texto) as Obj | null;
  const fault = String(dados?.faultstring ?? "");
  const code = String(dados?.faultcode ?? "");
  if (/REDUNDANT/i.test(texto) || /consumo redundante/i.test(fault)) {
    const m = texto.match(/Aguarde (\d+) segundos/i);
    return { retentavel: true, aguardarSeg: m ? Number(m[1]) + 3 : 60, mensagem: fault || "Omie: consumo redundante" };
  }
  if (/Client/i.test(code)) return { retentavel: false, mensagem: `Omie: ${fault || texto.slice(0, 300)}` };
  if (httpStatus >= 500 || httpStatus === 429 || httpStatus === 0) return { retentavel: true, mensagem: `Omie HTTP ${httpStatus}: ${fault || texto.slice(0, 300)}` };
  return { retentavel: false, mensagem: `Omie HTTP ${httpStatus}: ${fault || texto.slice(0, 300)}` };
}
