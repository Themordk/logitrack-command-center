// Prévia das ações (HTTP, webhook, ERP) usando as MESMAS funções do servidor (motorPrevia).
// Só a UI decide como exibir; URL, headers, envelope, assinatura e chamadas Omie saem daqui.
import * as Motor from "./motorPrevia";
import type { Destino, Ligacao } from "../retornos.types";

interface NoMin { id: string; tipo: string }

/**
 * Nó "Montar payload" cujo corpo o servidor usaria, sem corpo_de: o payload mais próximo ANTES deste nó
 * no caminho (o servidor usa o último payload executado). `ambiguo` = há payloads em ramos diferentes
 * à mesma distância; o corpo real depende do caminho que o documento seguir.
 */
export function payloadAnterior(noId: string, nos: NoMin[], ligacoes: Ligacao[]): { id: string | null; ambiguo: boolean } {
  const tipo = new Map(nos.map((n) => [n.id, n.tipo]));
  let fronteira = [noId];
  const vistos = new Set([noId]);
  while (fronteira.length) {
    const prox: string[] = [];
    for (const atual of fronteira) {
      for (const l of ligacoes) if (l.para === atual && !vistos.has(l.de)) { vistos.add(l.de); prox.push(l.de); }
    }
    const payloads = prox.filter((id) => tipo.get(id) === "dados.payload");
    if (payloads.length) return { id: payloads[0], ambiguo: payloads.length > 1 };
    fronteira = prox;
  }
  return { id: null, ambiguo: false };
}

/** Destino do front no formato do motor. O segredo nunca chega ao navegador: a assinatura sai mascarada. */
function destinoMotor(d: Destino): Motor.Destino {
  return {
    id: d.id, nome: d.nome, modo: d.modo, metodo: d.metodo, url_base: d.url_base, auth_tipo: d.auth_tipo,
    auth_config: d.auth_config ?? {}, headers: d.headers ?? {}, timeout_ms: d.timeout_ms, max_tentativas: d.max_tentativas,
    ativo: true, pausado: !!d.pausado_em, segredo: "previa",
  };
}

export interface PreviaRequisicao {
  metodo: string;
  url: string;
  headers: Record<string, string>;
  corpo: unknown;
  /** Motivo pelo qual o servidor recusaria a URL (http, IP interno…), ou null. */
  bloqueio: string | null;
  assinado: boolean;
}

/**
 * Requisição como o servidor monta para acao.http / acao.webhook.
 * `corpo` = saída do payload (corpo_de ou payloadAnterior) ou, se não houver: webhook → contexto; http → {}.
 */
export async function previaRequisicao(p: {
  tipo: "acao.http" | "acao.webhook";
  noId: string;
  config: Record<string, unknown>;
  destino: Destino;
  contexto: Record<string, unknown>;
  corpoPayload: unknown | undefined;
}): Promise<PreviaRequisicao> {
  const d = destinoMotor(p.destino);
  const corpo = p.corpoPayload !== undefined ? p.corpoPayload : p.tipo === "acao.webhook" ? p.contexto : {};
  const req = await Motor.montarRequisicao({
    destino: d, cfgNo: p.config, ctxTemplate: p.contexto, corpo, execucaoId: "<id da execução>", noId: p.noId, tentativa: 1,
    envelope: p.tipo === "acao.webhook" || d.modo === "webhook", evento: String(p.contexto.evento ?? ""),
  });
  const m = Motor.mascararRequisicao(req, d) as { metodo: string; url: string; headers: Record<string, string>; corpo: string | null };
  const perm = Motor.urlPermitida(req.url);
  return {
    metodo: m.metodo,
    url: m.url,
    headers: m.headers,
    corpo: m.corpo === null ? null : Motor.lerJsonSeguro(m.corpo),
    bloqueio: perm.ok ? null : perm.motivo ?? "URL recusada",
    assinado: "X-LogiTrack-Signature" in req.headers,
  };
}

export type PreviaOmie =
  | { ok: true; chamadas: { call: string; endpoint: string; param: Record<string, unknown> }[]; observacao?: string }
  | { ok: false; erro: string };

/** Chamadas que o servidor faria ao Omie para acao.provedor. */
export function previaOmie(config: Record<string, unknown>, contexto: Record<string, unknown>): PreviaOmie {
  const operacao = String(config.operacao ?? "");
  const parametros = (config.parametros ?? {}) as Motor.Obj;
  if (operacao === "alterar_etapa_recebimento" || operacao === "trocar_etapa_pedido") {
    const r = operacao === "alterar_etapa_recebimento" ? Motor.omieParamRecebimento(contexto, parametros) : Motor.omieParamTrocarEtapa(contexto, parametros);
    if ("erro" in r) return { ok: false, erro: r.erro };
    return { ok: true, chamadas: [{ call: r.call, endpoint: r.endpoint, param: r.param }] };
  }
  if (operacao === "ajustar_cortes_pedido") {
    const cortes = Motor.omieItensCorte(contexto);
    if (!cortes.length) return { ok: true, chamadas: [], observacao: "Sem itens cortados neste documento: nada é enviado ao Omie (segue pela saída sucesso)." };
    const codigo = Number(Motor.obterCaminho(contexto, "documento.codigo_erp"));
    if (!codigo) return { ok: false, erro: "Pedido sem código do Omie (codigo_erp)" };
    return {
      ok: true,
      chamadas: [
        { call: "ConsultarPedido", endpoint: "/produtos/pedido/", param: { codigo_pedido: codigo } },
        { call: "AlterarPedidoVenda", endpoint: "/produtos/pedido/", param: { cabecalho: { codigo_pedido: codigo }, itens_cortados: cortes } },
      ],
      observacao: "Os itens do pedido são lidos no Omie e só os cortados são alterados (atendida = 0 exclui o item).",
    };
  }
  return { ok: false, erro: "Operação de ERP não suportada." };
}
