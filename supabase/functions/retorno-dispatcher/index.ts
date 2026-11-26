// =============================================================================
// retorno-dispatcher — executor do Motor de Retorno ERP (CORE LogiTrack)
//
// Ações (POST JSON):
//   {acao:"tick"}                          → agendamento (header x-retorno-token)
//   {acao:"executar", execucao_id}          → roda agora uma execução (JWT do usuário)
//   {acao:"testar_destino", destino_id}     → envia um ping ao destino (JWT, permissão UPDATE)
//   {acao:"executar_interativo", execucao_id} → botão "Importar do ERP": roda a execução interativa
//                                              na própria requisição e devolve o resultado (JWT de quem pediu)
//
// Segurança: verify_jwt=false porque o agendamento usa token próprio (Vault);
// chamadas de usuário validam o JWT e a permissão via RPC no banco.
// =============================================================================
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  avaliarFiltros, classificarFalhaOmie, criarMapa, Definicao, Destino, lerJsonSeguro, MapaItem, mascararRequisicao,
  montarPayload, montarRequisicao, No, Obj, omieDetAlterado, omieItensCorte, omieParamRecebimento,
  omieParamTrocarEtapa, proximaTentativa, renderTemplate, statusRetentavel, truncar, urlPermitida,
  variaveisVaziasNoCaminho,
} from "./motor.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ORCAMENTO_MS = 45_000;
const MAX_PASSOS = 100; // >= limite de nós (40): num grafo sem ciclos um caminho nunca repete nó
// Prazo de cada execução: precisa terminar ANTES da reserva (3 min em integracao_retorno_svc_reservar)
// e antes do teto da invocação da Edge Function. Se o próximo nó externo não couber, a execução
// pausa como "pendente" a partir desse nó e continua no próximo tick (mesmo mecanismo do nó Aguardar).
const PRAZO_PACOTE_MS = 120_000;
const PRAZO_REQUISICAO_MS = 140_000;
const FOLGA_MS = 5_000;
const TIMEOUT_PROVEDOR_MS = 30_000;
const NOS_EXTERNOS = new Set(["acao.http", "acao.webhook", "acao.provedor", "acao.gravar_logitrack"]);
// Botão "Importar do ERP": o usuário está esperando. Sem retry agendado e sem pausa por orçamento:
// o que não couber no prazo vira erro "Tempo esgotado" (o navegador espera até ~60 s).
const PRAZO_INTERATIVO_MS = 55_000;
const TIMEOUT_GRAVAR_MS = 20_000;
const GATEWAY_SLUG = Deno.env.get("RETORNO_GATEWAY_SLUG") ?? "integration-gateway";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retorno-token",
};

/** Resultado declarado pelo nó "Atualizar documento" (S1). Valor ausente ou desconhecido = automático (null). */
const RESULTADOS_INTEGRACAO = new Set(["integrado", "ignorado", "erro", "nao_alterar"]);
function resultadoIntegracao(v: unknown): string | null {
  return typeof v === "string" && RESULTADOS_INTEGRACAO.has(v) ? v : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

interface Pacote {
  id: string;
  tenant_id: string;
  empresa_id: string;
  fluxo_id: string;
  fluxo_nome: string;
  evento: string;
  entidade: string;
  documento_id: string | null;
  documento_numero: string | null;
  modo: "automatico" | "manual" | "teste" | "simulacao" | "lote" | "interativo";
  proximo_no: string | null;
  estado: Obj;
  tentativas_no: number;
  definicao: Definicao;
  contexto: Obj;
  destinos: Record<string, Destino>;
  mapa: MapaItem[];
}

interface Passo {
  no_id: string;
  no_tipo: string;
  tentativa: number;
  status: "sucesso" | "erro" | "retry" | "ignorado" | "simulado" | "filtrado";
  saida?: string | null;
  entrada?: unknown;
  resultado?: unknown;
  request?: unknown;
  response?: unknown;
  http_status?: number | null;
  duracao_ms?: number;
  erro?: string | null;
}

type ResultadoNo =
  | { tipo: "seguir"; saida: string; passo: Passo; saidaDados?: unknown }
  | { tipo: "pausar"; status: "aguardando_retry" | "pendente" | "aguardando_confirmacao"; processar_apos: Date; proximo_no: string; tentativas_no: number; passo: Passo; erro?: string; http?: number | null };

// ---------------------------------------------------------------------------
// Execução de um pacote (um fluxo para um documento ou lote)
// ---------------------------------------------------------------------------
async function executarPacote(sb: SupabaseClient, p: Pacote, prazo: number): Promise<{ status: string; passos: number; erro?: string | null }> {
  const nos = new Map<string, No>((p.definicao?.nos ?? []).map((n) => [n.id, n]));
  const ligacoes = new Map<string, string>((p.definicao?.ligacoes ?? []).map((l) => [`${l.de}|${l.saida ?? "principal"}`, l.para]));
  const estado: Obj = { saidas: {}, ...(p.estado ?? {}) };
  const saidas = estado.saidas as Obj;
  const mapa = criarMapa(p.mapa ?? []);
  const simulacao = p.modo === "simulacao";
  const semEfeitosNoWms = p.modo === "simulacao" || p.modo === "teste";
  const passos: Passo[] = [];
  let atual: string | null = p.proximo_no;
  let tentativas = p.tentativas_no ?? 0;
  let houveErro = Boolean(estado.houve_erro);
  let erroFinal: string | null = (estado.erro as Obj | undefined)?.mensagem as string ?? null;
  let erroHttp: number | null = ((estado.erro as Obj | undefined)?.http_status as number) ?? null;
  let contador = 0;

  const entradaBase = (): Obj => ({ ...p.contexto, saidas, erro: estado.erro ?? null, execucao: { id: p.id, modo: p.modo, fluxo: p.fluxo_nome } });

  while (atual && contador++ < MAX_PASSOS) {
    const no = nos.get(atual);
    if (!no) {
      houveErro = true;
      erroFinal = `Nó ${atual} não existe na definição`;
      passos.push({ no_id: atual, no_tipo: "desconhecido", tentativa: 1, status: "erro", erro: erroFinal });
      break;
    }
    // Orçamento de tempo: só pausa se já houve progresso nesta rodada (evita laço sem avanço).
    if (!simulacao && contador > 1 && NOS_EXTERNOS.has(no.tipo)) {
      const dest = no.tipo === "acao.provedor" || no.tipo === "acao.gravar_logitrack" ? null : p.destinos?.[String((no.config as Obj | undefined)?.destino_id ?? "")];
      const custo = (dest?.timeout_ms || (no.tipo === "acao.provedor" ? TIMEOUT_PROVEDOR_MS : no.tipo === "acao.gravar_logitrack" ? TIMEOUT_GRAVAR_MS : 15000)) + FOLGA_MS;
      if (Date.now() + custo > prazo && p.modo === "interativo") {
        houveErro = true;
        erroFinal = "Tempo esgotado: o ERP demorou para responder e a importação foi interrompida. Tente de novo.";
        passos.push({ no_id: no.id, no_tipo: no.tipo, tentativa: tentativas + 1, status: "erro", erro: erroFinal });
        estado.erro = { no_id: no.id, mensagem: erroFinal, http_status: null };
        break;
      }
      if (Date.now() + custo > prazo) {
        await sb.rpc("integracao_retorno_svc_concluir", {
          p_execucao_id: p.id,
          p_resultado: {
            status: "pendente", proximo_no: no.id, estado: { ...estado, houve_erro: houveErro },
            tentativas_no: tentativas, processar_apos: new Date().toISOString(), erro: null, erro_http_status: null, passos,
          },
        }).throwOnError();
        return { status: "pendente", passos: passos.length, erro: null };
      }
    }
    let r: ResultadoNo;
    try {
      r = await executarNo(sb, p, no, entradaBase(), estado, mapa, tentativas, simulacao, semEfeitosNoWms);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = { tipo: "seguir", saida: "erro", passo: { no_id: no.id, no_tipo: no.tipo, tentativa: tentativas + 1, status: "erro", erro: msg } };
    }
    if (r.tipo === "pausar" && r.status === "aguardando_retry" && p.modo === "interativo") {
      // Ninguém vai esperar o próximo retry: a falha volta na hora para o usuário.
      const erroMsg = r.erro ?? r.passo.erro ?? "Falha";
      r = { tipo: "seguir", saida: "erro", passo: { ...r.passo, status: "erro", saida: "erro", erro: erroMsg } };
    }
    passos.push(r.passo);

    if (r.tipo === "pausar") {
      await sb.rpc("integracao_retorno_svc_concluir", {
        p_execucao_id: p.id,
        p_resultado: {
          status: r.status, proximo_no: r.proximo_no, estado: { ...estado, houve_erro: houveErro },
          tentativas_no: r.tentativas_no, processar_apos: r.processar_apos.toISOString(),
          erro: r.erro ?? null, erro_http_status: r.http ?? null, passos,
        },
      }).throwOnError();
      return { status: r.status, passos: passos.length, erro: r.erro ?? null };
    }

    if (r.saidaDados !== undefined) saidas[no.id] = r.saidaDados as never;
    if (r.passo.status === "erro") {
      houveErro = true;
      erroFinal = r.passo.erro ?? "Erro";
      erroHttp = r.passo.http_status ?? null;
      estado.erro = { no_id: no.id, mensagem: erroFinal, http_status: erroHttp };
    }
    tentativas = 0;
    if (r.passo.status === "filtrado") {
      await sb.rpc("integracao_retorno_svc_concluir", {
        p_execucao_id: p.id,
        p_resultado: { status: "filtrado", proximo_no: null, estado, tentativas_no: 0, erro: r.passo.erro, passos },
      }).throwOnError();
      return { status: "filtrado", passos: passos.length, erro: r.passo.erro };
    }
    atual = ligacoes.get(`${no.id}|${r.saida}`) ?? null;
  }
  if (contador >= MAX_PASSOS) {
    houveErro = true;
    erroFinal = "Limite de passos atingido";
  }
  const status = houveErro ? "erro" : "sucesso";
  await sb.rpc("integracao_retorno_svc_concluir", {
    p_execucao_id: p.id,
    p_resultado: { status, proximo_no: null, estado, tentativas_no: 0, erro: houveErro ? erroFinal : null, erro_http_status: houveErro ? erroHttp : null, passos },
  }).throwOnError();
  return { status, passos: passos.length, erro: houveErro ? erroFinal : null };
}

// ---------------------------------------------------------------------------
// Cada tipo de nó
// ---------------------------------------------------------------------------
async function executarNo(
  sb: SupabaseClient, p: Pacote, no: No, entrada: Obj, estado: Obj, mapa: (d: string, v: unknown) => unknown,
  tentativas: number, simulacao: boolean, semEfeitosNoWms: boolean,
): Promise<ResultadoNo> {
  const cfg = (no.config ?? {}) as Obj;
  const t0 = Date.now();
  const base = (extra: Partial<Passo>): Passo => ({ no_id: no.id, no_tipo: no.tipo, tentativa: tentativas + 1, status: "sucesso", duracao_ms: Date.now() - t0, ...extra });

  switch (no.tipo) {
    case "gatilho.evento":
    case "gatilho.manual": {
      // Filtros já avaliados no banco ao criar a execução; reavaliados aqui por segurança (ex.: reprocessamento)
      const ok = p.modo === "lote" ? true : avaliarFiltros(p.contexto, cfg.filtros, cfg.combinador as string);
      if (!ok) return { tipo: "seguir", saida: "principal", passo: base({ status: "filtrado", erro: "Barrado pelos filtros do gatilho" }) };
      return { tipo: "seguir", saida: "principal", passo: base({ resultado: { evento: p.evento, modo: p.modo } }) };
    }

    case "logica.condicao": {
      const ok = avaliarFiltros(entrada, cfg.regras, cfg.combinador as string);
      return { tipo: "seguir", saida: ok ? "verdadeiro" : "falso", passo: base({ saida: ok ? "verdadeiro" : "falso", resultado: { resultado: ok } }) };
    }

    case "logica.aguardar": {
      const aguardados = (estado.aguardados as Record<string, boolean>) ?? {};
      if (simulacao || aguardados[no.id]) {
        return { tipo: "seguir", saida: "principal", passo: base({ status: simulacao ? "simulado" : "sucesso", resultado: { aguardou_minutos: Number(cfg.minutos ?? 0) } }) };
      }
      aguardados[no.id] = true;
      estado.aguardados = aguardados;
      const ate = new Date(Date.now() + Number(cfg.minutos ?? 1) * 60_000);
      return { tipo: "pausar", status: "pendente", processar_apos: ate, proximo_no: no.id, tentativas_no: 0, passo: base({ resultado: { aguardar_ate: ate.toISOString() } }) };
    }

    case "dados.payload": {
      const payload = await montarPayload(cfg, entrada, mapa);
      estado.ultimo_payload = payload as never;
      return { tipo: "seguir", saida: "principal", saidaDados: payload, passo: base({ saida: "principal", resultado: payload }) };
    }

    case "acao.http":
    case "acao.webhook":
      return await executarHttp(sb, p, no, cfg, entrada, estado, tentativas, simulacao, base);

    case "acao.provedor":
      return await executarProvedor(sb, p, no, cfg, entrada, tentativas, simulacao, base);

    case "logica.confirmar_usuario": {
      const confirmados = (estado.confirmados as Record<string, boolean>) ?? {};
      if (semEfeitosNoWms || p.modo !== "interativo" || confirmados[no.id]) {
        return {
          tipo: "seguir", saida: "principal",
          passo: base({ status: semEfeitosNoWms ? "simulado" : "sucesso", resultado: { confirmado: Boolean(confirmados[no.id]), observacao: semEfeitosNoWms ? `sem pausa no modo ${p.modo}` : undefined } }),
        };
      }
      const minutos = Math.min(Math.max(Number(cfg.expira_minutos ?? 15) || 15, 1), 60);
      const ate = new Date(Date.now() + minutos * 60_000);
      const previaDe = String(cfg.previa_de ?? "");
      const saidasObj = (estado.saidas as Obj) ?? {};
      const previa = previaDe ? saidasObj[previaDe] : estado.ultimo_payload;
      estado.previa = previa ?? null;
      estado.confirmacao = {
        no_id: no.id,
        titulo: renderTemplate(String(cfg.titulo ?? "Confirme a importação"), entrada),
        mensagem: renderTemplate(String(cfg.mensagem ?? ""), entrada),
      };
      return {
        tipo: "pausar", status: "aguardando_confirmacao", processar_apos: ate, proximo_no: no.id, tentativas_no: 0,
        passo: base({ resultado: { aguardando_confirmacao_ate: ate.toISOString() } }),
      };
    }

    case "acao.gravar_logitrack":
      return await executarGravar(sb, p, no, cfg, estado, semEfeitosNoWms, base);

    case "acao.atualizar_documento": {
      // S1: o nó declara o resultado da integração deste caminho; sem declaração, o banco deduz pelos envios.
      const resultado = resultadoIntegracao(cfg.resultado_integracao);
      const mensagem = resultado === "erro" ? renderTemplate(String(cfg.mensagem_erro ?? ""), entrada).trim() || null : null;
      if (semEfeitosNoWms) {
        return { tipo: "seguir", saida: "principal", passo: base({ status: "simulado", resultado: { status_integracao: cfg.status_integracao ?? null, marcar_exportado: Boolean(cfg.marcar_exportado), resultado_integracao: resultado, mensagem_erro: mensagem, observacao: `não aplicado no modo ${p.modo}` } }) };
      }
      const { data, error } = await sb.rpc("integracao_retorno_svc_atualizar_documento", {
        p_execucao_id: p.id, p_status_integracao: renderTemplate(String(cfg.status_integracao ?? "retornado"), entrada), p_marcar_exportado: Boolean(cfg.marcar_exportado),
        p_resultado: resultado, p_mensagem: mensagem,
      });
      if (error) return { tipo: "seguir", saida: "principal", passo: base({ status: "erro", erro: error.message }) };
      return { tipo: "seguir", saida: "principal", passo: base({ resultado: data }) };
    }

    case "acao.notificar": {
      const titulo = renderTemplate(String(cfg.titulo ?? "Retorno ao ERP"), entrada);
      const mensagem = renderTemplate(String(cfg.mensagem ?? ""), entrada);
      if (semEfeitosNoWms) {
        return { tipo: "seguir", saida: "principal", passo: base({ status: "simulado", resultado: { titulo, mensagem } }) };
      }
      const { error } = await sb.rpc("integracao_retorno_svc_notificar", { p_execucao_id: p.id, p_titulo: titulo, p_descricao: mensagem, p_cor: String(cfg.cor ?? "red") });
      if (error) return { tipo: "seguir", saida: "principal", passo: base({ status: "erro", erro: error.message }) };
      return { tipo: "seguir", saida: "principal", passo: base({ resultado: { titulo, mensagem } }) };
    }

    default:
      return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", erro: `Tipo de nó não suportado: ${no.tipo}` }) };
  }
}

// ---------------------------------------------------------------------------
// "Gravar no LogiTrack": POST na própria API (integration-gateway) com a chave da conexão ERP
// da empresa. Mesmo contrato, validação, idempotência e log da API pública.
// ---------------------------------------------------------------------------
async function executarGravar(
  sb: SupabaseClient, p: Pacote, no: No, cfg: Obj, estado: Obj, semEfeitosNoWms: boolean,
  base: (extra: Partial<Passo>) => Passo,
): Promise<ResultadoNo> {
  const imp = (p.contexto?.importacao ?? {}) as Obj;
  const rota = String(imp.rota ?? "").replace(/^\/+/, "");
  if (!rota) return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", erro: "Este fluxo não é de um botão Importar do ERP (sem rota de gravação)." }) };
  const saidasObj = (estado.saidas as Obj) ?? {};
  const corpo = cfg.corpo_de ? saidasObj[String(cfg.corpo_de)] : estado.ultimo_payload;
  const url = `${SUPABASE_URL}/functions/v1/${GATEWAY_SLUG}/${rota}`;
  const corpoTxt = JSON.stringify(corpo ?? null);
  const idem = `${p.id}:${no.id}`.slice(0, 100);
  const requestLog = { metodo: "POST", url, headers: { "Content-Type": "application/json", "x-api-key": "***", "Idempotency-Key": idem, "X-Request-Id": p.id }, corpo: truncar(corpoTxt, 20000) };
  if (corpo === null || corpo === undefined || typeof corpo !== "object") {
    return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", request: requestLog, erro: "Nada para gravar: monte o registro com um nó Montar payload antes de Gravar no LogiTrack." }) };
  }
  if (semEfeitosNoWms) {
    return {
      tipo: "seguir", saida: "sucesso", saidaDados: { simulado: true, rota, corpo },
      passo: base({ status: "simulado", saida: "sucesso", request: requestLog, resultado: { observacao: `não gravado no modo ${p.modo}` } }),
    };
  }
  const { data: ch, error: errCh } = await sb.rpc("integracao_retorno_svc_chave_api", { p_execucao_id: p.id });
  const chave = (ch as Obj | null)?.chave as string | undefined;
  if (errCh || !chave) {
    return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", request: requestLog, erro: "A empresa não tem a API do LogiTrack ativa (chave da conexão ERP). Ative-a em Integração › Conexão ERP para o fluxo conseguir gravar." }) };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_GRAVAR_MS);
  const t0 = Date.now();
  let status = 0;
  let texto = "";
  let falha: string | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": chave, "Idempotency-Key": idem, "X-Request-Id": p.id, "User-Agent": "LogiTrack-Retorno/1.0 (importacao)" },
      body: corpoTxt, signal: ctrl.signal,
    });
    status = res.status;
    texto = await res.text();
  } catch (e) {
    falha = e instanceof DOMException && e.name === "AbortError" ? `Timeout após ${TIMEOUT_GRAVAR_MS} ms na API do LogiTrack` : `Falha ao chamar a API do LogiTrack: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    clearTimeout(timer);
  }
  const duracao = Date.now() - t0;
  const json = lerJsonSeguro(texto) as Obj | null;
  const respLog = { status, corpo: truncar(texto, 20000), json };
  if (!falha && status >= 200 && status < 300 && json?.success !== false) {
    const dados = (json?.data ?? json ?? {}) as Obj;
    const reg = Array.isArray(dados) ? (dados[0] as Obj) ?? {} : dados;
    await sb.rpc("integracao_retorno_svc_importacao_registrar", { p_execucao_id: p.id, p_resposta: reg });
    return { tipo: "seguir", saida: "sucesso", saidaDados: reg, passo: base({ saida: "sucesso", request: requestLog, response: respLog, http_status: status, duracao_ms: duracao, resultado: reg }) };
  }
  const errObj = (json?.error ?? {}) as Obj;
  const detalhes = Array.isArray(errObj.details) ? ` (${(errObj.details as unknown[]).map((d) => typeof d === "string" ? d : JSON.stringify(d)).join("; ").slice(0, 500)})` : "";
  const msg = falha ?? `API LogiTrack ${status}${errObj.code ? ` ${errObj.code}` : ""}: ${String(errObj.message ?? texto.slice(0, 300))}${detalhes}`;
  return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", request: requestLog, response: respLog, http_status: status || null, duracao_ms: duracao, erro: msg }) };
}

async function executarHttp(
  sb: SupabaseClient, p: Pacote, no: No, cfg: Obj, entrada: Obj, estado: Obj, tentativas: number, simulacao: boolean,
  base: (extra: Partial<Passo>) => Passo,
): Promise<ResultadoNo> {
  const destino = p.destinos?.[String(cfg.destino_id ?? "")];
  if (!destino || !destino.ativo) {
    return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", erro: "Destino inexistente ou inativo" }) };
  }
  if (destino.pausado && !simulacao && p.modo !== "teste") {
    return {
      tipo: "pausar", status: "aguardando_retry", processar_apos: new Date(Date.now() + 5 * 60_000), proximo_no: no.id,
      tentativas_no: tentativas, passo: base({ status: "retry", erro: `Destino "${destino.nome}" pausado (circuit breaker)` }),
      erro: `Destino "${destino.nome}" pausado`,
    };
  }
  const saidasObj = (estado.saidas as Obj) ?? {};
  const corpo = cfg.corpo_de ? saidasObj[String(cfg.corpo_de)] : (estado.ultimo_payload ?? (no.tipo === "acao.webhook" ? p.contexto : {}));
  const vazias = [...new Set([
    ...variaveisVaziasNoCaminho(destino.url_base, entrada),
    ...variaveisVaziasNoCaminho(String(cfg.caminho ?? ""), entrada),
  ])];
  if (vazias.length) {
    return {
      tipo: "seguir", saida: "erro",
      passo: base({
        status: "erro", saida: "erro",
        erro: `Variável vazia no caminho da URL: ${vazias.map((v) => `{{${v}}}`).join(", ")}. A requisição não foi enviada.`,
      }),
    };
  }
  const tentativa = tentativas + 1;
  const req = await montarRequisicao({
    destino, cfgNo: cfg, ctxTemplate: entrada, corpo, execucaoId: p.id, noId: no.id, tentativa,
    envelope: no.tipo === "acao.webhook" || destino.modo === "webhook", evento: p.evento,
  });
  const reqLog = mascararRequisicao(req, destino);
  const perm = urlPermitida(req.url);
  if (!perm.ok) {
    return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", request: reqLog, erro: perm.motivo }) };
  }
  if (simulacao) {
    return { tipo: "seguir", saida: "sucesso", saidaDados: { simulado: true }, passo: base({ status: "simulado", saida: "sucesso", request: reqLog, resultado: { observacao: "requisição montada, não enviada (simulação)" } }) };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), destino.timeout_ms || 15000);
  const t0 = Date.now();
  let status = 0;
  let texto = "";
  let retryAfter: string | null = null;
  let falhaRede: string | null = null;
  try {
    const res = await fetch(req.url, { method: req.metodo, headers: req.headers, body: req.corpo ?? undefined, signal: ctrl.signal, redirect: "manual" });
    status = res.status;
    retryAfter = res.headers.get("retry-after");
    texto = await res.text();
  } catch (e) {
    falhaRede = e instanceof DOMException && e.name === "AbortError" ? `Timeout após ${destino.timeout_ms} ms` : `Falha de rede: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    clearTimeout(timer);
  }
  const duracao = Date.now() - t0;
  const respLog = { status, corpo: truncar(texto, 20000), json: lerJsonSeguro(texto) };

  if (!falhaRede && status >= 200 && status < 300) {
    await sb.rpc("integracao_retorno_svc_destino_resultado", { p_destino_id: destino.id, p_sucesso: true, p_erro: null });
    return { tipo: "seguir", saida: "sucesso", saidaDados: { status, corpo: respLog.json ?? texto }, passo: base({ saida: "sucesso", request: reqLog, response: respLog, http_status: status, duracao_ms: duracao }) };
  }

  const msg = falhaRede ?? `HTTP ${status}${texto ? ": " + texto.slice(0, 300) : ""}`;
  await sb.rpc("integracao_retorno_svc_destino_resultado", { p_destino_id: destino.id, p_sucesso: false, p_erro: msg });
  const retentavel = falhaRede !== null || statusRetentavel(status);
  const max = destino.max_tentativas || 5;
  if (retentavel && tentativa < max) {
    return {
      tipo: "pausar", status: "aguardando_retry", processar_apos: proximaTentativa(tentativa, retryAfter), proximo_no: no.id,
      tentativas_no: tentativa, erro: msg, http: status || null,
      passo: base({ status: "retry", request: reqLog, response: respLog, http_status: status || null, duracao_ms: duracao, erro: `${msg} (tentativa ${tentativa}/${max})` }),
    };
  }
  return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", request: reqLog, response: respLog, http_status: status || null, duracao_ms: duracao, erro: retentavel ? `${msg} (tentativas esgotadas: ${tentativa}/${max})` : msg }) };
}

// ---------------------------------------------------------------------------
// Ações nativas de ERP (Omie)
// ---------------------------------------------------------------------------
async function credenciaisOmie(sb: SupabaseClient, p: Pacote): Promise<{ cred: Obj; cfg: Obj } | null> {
  const { data } = await sb.rpc("integracao_get_credenciais", { p_tenant_id: p.tenant_id, p_empresa_id: p.empresa_id, p_erp_provedor_id: "omie" });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return { cred: (row.credenciais ?? {}) as Obj, cfg: (row.config_extra ?? {}) as Obj };
}

async function chamarOmie(c: { cred: Obj; cfg: Obj }, endpoint: string, call: string, param: Obj) {
  const baseUrl = String(c.cfg.omie_base_url ?? "https://app.omie.com.br/api/v1");
  const corpo = JSON.stringify({ call, app_key: c.cred.app_key, app_secret: c.cred.app_secret, param: [param] });
  const t0 = Date.now();
  let status = 0, texto = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    const res = await fetch(`${baseUrl}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, signal: ctrl.signal });
    clearTimeout(timer);
    status = res.status;
    texto = await res.text();
  } catch (e) {
    texto = e instanceof Error ? e.message : String(e);
  }
  const dados = lerJsonSeguro(texto) as Obj | null;
  const ok = status >= 200 && status < 300 && !dados?.faultstring;
  return {
    ok, status, texto, dados, duracao: Date.now() - t0,
    requestLog: { metodo: "POST", url: `${baseUrl}${endpoint}`, corpo: { call, app_key: "***", app_secret: "***", param: [param] } },
  };
}

async function executarProvedor(
  sb: SupabaseClient, p: Pacote, no: No, cfg: Obj, entrada: Obj, tentativas: number, simulacao: boolean,
  base: (extra: Partial<Passo>) => Passo,
): Promise<ResultadoNo> {
  const operacao = String(cfg.operacao ?? "");
  const parametros = (cfg.parametros ?? {}) as Obj;
  const tentativa = tentativas + 1;
  const MAX = 5;

  const falha = (r: { status: number; texto: string; requestLog: Obj; duracao: number; dados: Obj | null }): ResultadoNo => {
    const cls = classificarFalhaOmie(r.status, r.texto);
    const respLog = { status: r.status, corpo: truncar(r.texto, 20000), json: r.dados };
    if (cls.retentavel && tentativa < MAX) {
      return {
        tipo: "pausar", status: "aguardando_retry",
        processar_apos: cls.aguardarSeg ? new Date(Date.now() + cls.aguardarSeg * 1000) : proximaTentativa(tentativa),
        proximo_no: no.id, tentativas_no: tentativa, erro: cls.mensagem, http: r.status || null,
        passo: base({ status: "retry", request: r.requestLog, response: respLog, http_status: r.status || null, duracao_ms: r.duracao, erro: `${cls.mensagem} (tentativa ${tentativa}/${MAX})` }),
      };
    }
    return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", request: r.requestLog, response: respLog, http_status: r.status || null, duracao_ms: r.duracao, erro: cls.mensagem }) };
  };

  if (operacao === "alterar_etapa_recebimento" || operacao === "trocar_etapa_pedido") {
    const montado = operacao === "alterar_etapa_recebimento" ? omieParamRecebimento(entrada, parametros) : omieParamTrocarEtapa(entrada, parametros);
    if ("erro" in montado) return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", erro: montado.erro }) };
    const requestLog = { metodo: "POST", url: `omie${montado.endpoint}`, corpo: { call: montado.call, app_key: "***", app_secret: "***", param: [montado.param] } };
    if (simulacao) return { tipo: "seguir", saida: "sucesso", passo: base({ status: "simulado", saida: "sucesso", request: requestLog, resultado: { observacao: "não enviado (simulação)" } }) };
    const c = await credenciaisOmie(sb, p);
    if (!c) return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", request: requestLog, erro: "Empresa sem conexão Omie ativa" }) };
    const r = await chamarOmie(c, montado.endpoint, montado.call, montado.param);
    if (!r.ok) return falha(r);
    return { tipo: "seguir", saida: "sucesso", saidaDados: r.dados, passo: base({ saida: "sucesso", request: r.requestLog, response: { status: r.status, json: r.dados }, http_status: r.status, duracao_ms: r.duracao }) };
  }

  if (operacao === "ajustar_cortes_pedido") {
    const cortes = omieItensCorte(entrada);
    if (cortes.length === 0) {
      return { tipo: "seguir", saida: "sucesso", passo: base({ saida: "sucesso", status: simulacao ? "simulado" : "sucesso", resultado: { sem_cortes: true } }) };
    }
    const codigo = Number((entrada.documento as Obj | undefined)?.codigo_erp);
    if (!codigo) return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", erro: "Pedido sem código do Omie (codigo_erp)" }) };
    if (simulacao) {
      return {
        tipo: "seguir", saida: "sucesso",
        passo: base({ status: "simulado", saida: "sucesso", request: { metodo: "POST", url: "omie/produtos/pedido/", corpo: { chamadas: ["ConsultarPedido", "AlterarPedidoVenda"], codigo_pedido: codigo, cortes } }, resultado: { observacao: "não enviado (simulação)" } }),
      };
    }
    const c = await credenciaisOmie(sb, p);
    if (!c) return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", saida: "erro", erro: "Empresa sem conexão Omie ativa" }) };
    const consulta = await chamarOmie(c, "/produtos/pedido/", "ConsultarPedido", { codigo_pedido: codigo });
    if (!consulta.ok) return falha(consulta);
    const pedido = ((consulta.dados?.pedido_venda_produto as Obj) ?? consulta.dados ?? {}) as Obj;
    const cab = (pedido.cabecalho as Obj) ?? {};
    const det = omieDetAlterado((pedido.det as Obj[]) ?? [], cortes);
    if (det.length === 0) {
      return { tipo: "seguir", saida: "sucesso", passo: base({ saida: "sucesso", resultado: { aviso: "Nenhum item do pedido Omie corresponde aos itens cortados", cortes } }) };
    }
    const alt = await chamarOmie(c, "/produtos/pedido/", "AlterarPedidoVenda", {
      cabecalho: { codigo_pedido: codigo, codigo_pedido_integracao: String(cab.codigo_pedido_integracao ?? ""), etapa: String(cab.etapa ?? "") },
      det,
    });
    if (!alt.ok) return falha(alt);
    return { tipo: "seguir", saida: "sucesso", saidaDados: alt.dados, passo: base({ saida: "sucesso", request: alt.requestLog, response: { status: alt.status, json: alt.dados }, http_status: alt.status, duracao_ms: consulta.duracao + alt.duracao }) };
  }

  return { tipo: "seguir", saida: "erro", passo: base({ status: "erro", erro: `Operação não suportada: ${operacao}` }) };
}

// ---------------------------------------------------------------------------
// Entrada HTTP
// ---------------------------------------------------------------------------
async function usuarioDaRequisicao(req: Request): Promise<SupabaseClient | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const cli = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await cli.auth.getUser(auth.slice(7));
  if (error || !data?.user) return null;
  return cli;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ erro: "Método não permitido", codigo: "METODO" }, 405);
  const t0 = Date.now();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const body = (await req.json().catch(() => ({}))) as Obj;
  const acao = String(body.acao ?? "tick");

  try {
    if (acao === "tick") {
      const token = req.headers.get("x-retorno-token") ?? "";
      const { data: valido } = await sb.rpc("integracao_retorno_svc_token_valido", { p_token: token });
      if (!valido) return json({ erro: "Não autorizado", codigo: "TOKEN" }, 401);
      const resultados: Obj[] = [];
      while (Date.now() - t0 < ORCAMENTO_MS) {
        const { data: lote, error } = await sb.rpc("integracao_retorno_svc_reservar", { p_limite: 5, p_execucao_id: null });
        if (error) throw error;
        const pacotes = (lote ?? []) as Pacote[];
        if (pacotes.length === 0) break;
        for (const pacote of pacotes) {
          try {
            const r = await executarPacote(sb, pacote, Math.min(Date.now() + PRAZO_PACOTE_MS, t0 + PRAZO_REQUISICAO_MS));
            resultados.push({ id: pacote.id, ...r });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[retorno-dispatcher] falha na execução", pacote.id, msg);
            await sb.rpc("integracao_retorno_svc_concluir", {
              p_execucao_id: pacote.id,
              p_resultado: { status: "aguardando_retry", processar_apos: new Date(Date.now() + 60_000).toISOString(), erro: `Falha interna: ${msg}`, passos: [] },
            });
            resultados.push({ id: pacote.id, status: "aguardando_retry", erro: msg });
          }
        }
      }
      return json({ processados: resultados.length, duracao_ms: Date.now() - t0, resultados });
    }

    // Ações de usuário
    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return json({ erro: "JWT ausente ou inválido", codigo: "JWT" }, 401);

    if (acao === "executar") {
      const execucaoId = String(body.execucao_id ?? "");
      // Autorização: o usuário precisa enxergar a execução (RPC valida tenant/empresa/permissão)
      const { error: errAut } = await usuario.rpc("integracao_retorno_obter_execucao", { p_execucao_id: execucaoId });
      if (errAut) return json({ erro: errAut.message, codigo: "SEM_ACESSO" }, 403);
      const { data: lote, error } = await sb.rpc("integracao_retorno_svc_reservar", { p_limite: 1, p_execucao_id: execucaoId });
      if (error) throw error;
      const pacote = ((lote ?? []) as Pacote[])[0];
      if (!pacote) return json({ execucao_id: execucaoId, executado: false, motivo: "Execução não está pendente ou aguarda uma execução anterior do mesmo documento" });
      const r = await executarPacote(sb, pacote, Math.min(Date.now() + PRAZO_PACOTE_MS, t0 + PRAZO_REQUISICAO_MS));
      const { data: detalhe } = await usuario.rpc("integracao_retorno_obter_execucao", { p_execucao_id: execucaoId });
      return json({ execucao_id: execucaoId, executado: true, ...r, detalhe });
    }

    if (acao === "executar_interativo") {
      const execucaoId = String(body.execucao_id ?? "");
      // Autorização: quem pediu a importação (ou suporte / leitura de retornos) — validado no banco
      const { data: info, error: errAut } = await usuario.rpc("integracao_retorno_importacao_obter", { p_execucao_id: execucaoId });
      if (errAut || !info) return json({ erro: errAut?.message ?? "Execução não encontrada", codigo: "SEM_ACESSO" }, 403);
      const inf = info as Obj;
      if (inf.modo !== "interativo") return json({ erro: "Esta execução não é de um botão Importar do ERP", codigo: "MODO" }, 400);
      if (inf.status !== "pendente") return json({ execucao_id: execucaoId, executado: false, motivo: `Execução em ${inf.status}`, importacao: inf });
      const { data: lote, error } = await sb.rpc("integracao_retorno_svc_reservar", { p_limite: 1, p_execucao_id: execucaoId });
      if (error) throw error;
      const pacote = ((lote ?? []) as Pacote[])[0];
      if (!pacote) return json({ execucao_id: execucaoId, executado: false, motivo: "Execução já está em andamento", importacao: inf });
      const r = await executarPacote(sb, pacote, Date.now() + PRAZO_INTERATIVO_MS);
      const { data: final } = await usuario.rpc("integracao_retorno_importacao_obter", { p_execucao_id: execucaoId });
      return json({ execucao_id: execucaoId, executado: true, ...r, importacao: final });
    }

    if (acao === "testar_destino") {
      const destinoId = String(body.destino_id ?? "");
      const { data: d } = await sb.schema("integracao").from("retorno_destino").select("tenant_id, empresa_id").eq("id", destinoId).maybeSingle();
      if (!d) return json({ erro: "Destino não encontrado", codigo: "DESTINO" }, 404);
      const { data: pode } = await usuario.rpc("integracao_retorno_pode_editar", { p_tenant_id: d.tenant_id, p_empresa_id: d.empresa_id });
      if (!pode) return json({ erro: "Sem permissão para testar este destino", codigo: "SEM_PERMISSAO" }, 403);
      // Reaproveita o pacote para obter o segredo do Vault sem expô-lo ao navegador
      const { data: pk } = await sb.rpc("integracao_retorno_svc_destino_teste", { p_destino_id: destinoId });
      const destino = pk as Destino;
      const ctx = { evento: "logitrack.ping", ocorrido_em: new Date().toISOString() };
      const reqM = await montarRequisicao({ destino, cfgNo: {}, ctxTemplate: ctx, corpo: { ping: true }, execucaoId: crypto.randomUUID(), noId: "ping", tentativa: 1, envelope: true, evento: "logitrack.ping" });
      const perm = urlPermitida(reqM.url);
      if (!perm.ok) return json({ ok: false, erro: perm.motivo });
      const ini = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), destino.timeout_ms || 15000);
        const res = await fetch(reqM.url, { method: reqM.metodo === "GET" ? "GET" : "POST", headers: reqM.headers, body: reqM.metodo === "GET" ? undefined : reqM.corpo ?? undefined, signal: ctrl.signal, redirect: "manual" });
        clearTimeout(timer);
        const texto = await res.text();
        return json({ ok: res.ok, http_status: res.status, duracao_ms: Date.now() - ini, resposta: truncar(texto, 2000), request: mascararRequisicao(reqM, destino) });
      } catch (e) {
        return json({ ok: false, erro: e instanceof Error ? e.message : String(e), duracao_ms: Date.now() - ini });
      }
    }

    return json({ erro: `Ação inválida: ${acao}`, codigo: "ACAO" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as Obj)?.message ?? String(e);
    console.error("[retorno-dispatcher]", msg);
    return json({ erro: "Erro interno", detalhe: msg, codigo: "INTERNO" }, 500);
  }
});
