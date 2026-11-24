import {
    createClient,
    SupabaseClient
} from 'https://esm.sh/@supabase/supabase-js@2'
interface Conexao {
    conexao_id: string;
    tenant_id: string;
    empresa_id: string;
    erp_provedor_id: string;
    credenciais: Record < string, unknown > ;
    config_extra: Record < string, unknown > ;
    permitir_reenvio_cancelado ? : boolean
}
interface Ctx {
    sb: SupabaseClient;
    conn: Conexao;
    requestId: string;
    t0: number;
    query: URLSearchParams;
    idempotencyKey ? : string | null
}
interface ApiResponse {
    success: boolean;
    data ? : unknown;
    error ? : {
        code: string;message: string;details ? : unknown[]
    };
    metadata: {
        request_id: string;timestamp: string;processing_ms ? : number;
        [k: string]: unknown
    }
}
interface RateInfo {
    limite: number;
    usado: number;
    resetEm: number; // epoch em segundos
    modo: string
}
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-api-key, x-tenant-id, x-empresa-id, content-type, idempotency-key, x-request-id',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Request-Id, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Mode, Idempotent-Replayed',
    'Content-Type': 'application/json'
}
const VERSAO_GATEWAY = '1.23'
// v23 (2026-11-23): MÓDULO DE ENTREGAS — parceiro aceita `contato` (nome da pessoa de contato), opcional,
//   no POST /master-data/parceiros (e batch) e no PATCH /master-data/parceiros/{codigo_erp}, ao lado de
//   `telefone` e `email` (já aceitos). Os três são opcionais; vazio não apaga o valor atual.
//   O coletor de entregas mostra o telefone/contato na parada (botão Ligar). Nenhuma resposta muda.
// v22 (2026-11-02): ALTERAÇÕES DE DOCUMENTO DE SAÍDA PELO WMS (sem inflar estoque).
//   - GET  /movements/documentos-saida/{codigo_erp}/posicao             → posição da OS inteira (original + alterações)
//   - POST /movements/documentos-saida/{codigo_erp}/alteracoes/simular  → mostra o que aconteceria, sem gravar
//   - POST /movements/documentos-saida/{codigo_erp}/alteracoes          → aplica (corte, estorno, devolução, inclusão)
//   - GET  /movements/documentos-saida/{codigo_erp}/alteracoes/{id}     → situação de uma alteração
//   - POST /movements/documentos-saida/{codigo_erp}/devolucoes          → devolução limitada ao que já foi retirado
//   - /cancel passa por fn_cancelar_documento_saida_v3 (config_extra.cancelamento_saida_v3 = false volta à v2).
//   - Requer as migrations fase1_* , fase2_* e fase3_* .
// v20 (2026-10-28): PORTAL DO DESENVOLVEDOR — FASE 1 (FUNDAÇÃO). Nenhuma resposta existente muda.
//   - RATE LIMIT por chave: autenticação e contagem numa única RPC (integracao_autenticar_api),
//     janela fixa de 1 minuto. Toda resposta autenticada leva X-RateLimit-Limit, X-RateLimit-Remaining,
//     X-RateLimit-Reset (epoch s) e X-RateLimit-Mode. Modo por conexão em config_extra.rate_limit_modo:
//     'observar' (padrão: só conta e informa) | 'aplicar' (429 RATE_LIMITED + Retry-After) | 'desligado'.
//     Limite em config_extra.rate_limit_por_minuto (padrão 600). Se a RPC nova falhar ou não existir,
//     o gateway volta sozinho para integracao_resolver_webhook (comportamento da v19, sem contagem).
//   - PAGINAÇÃO opcional em todas as listagens GET: ?limit=1..500 (padrão 100), ?cursor=, ?updated_since=ISO-8601.
//     Ordem (updated_at, id); metadata.paginacao = { limit, has_more, next_cursor, updated_since }.
//     Sem nenhum desses parâmetros a listagem é exatamente a da v19.
//   - IDEMPOTENCY-KEY em todo POST/PATCH (antes só no cancelamento de saída, que segue usando a própria RPC):
//     mesma chave + mesmo conteúdo em 24 h = mesma resposta com Idempotent-Replayed: true;
//     mesma chave com outro conteúdo = 422 IDEMPOTENCY_KEY_REUSED; chave ainda processando = 409 RETRY_LATER.
//     Respostas 5xx liberam a chave para nova tentativa. Falha no controle = processa normalmente.
//   - Requer as migrations 20261028a_api_rate_limit_idempotencia e 20261028b_updated_at_sync_incremental.
const MAX_BATCH = 50
// v14 (2026-10-19): limite de lote POR ENTIDADE. Entidades fora do mapa seguem MAX_BATCH (50).
//   parceiro 200 (~7 ms de banco por item) | produto 100 (produto + embalagens, ~2-3x o custo de um parceiro)
const BATCH_LIMITS: Record < string, number > = {
    parceiro: 200,
    produto: 100
}

// v19 (2026-10-26): PRODUTOS MAIS RÁPIDOS (plano "Acelerar o integration-gateway")
//   Medido: ~200 ms por ida e volta ao PostgREST e 5 idas e voltas por produto (~1 s/produto);
//   o banco gasta ~6 ms por produto. Respostas, códigos e limites inalterados.
//   - Fase 1 (padrão LIGADO; desliga por conexão com config_extra.otimizar_lote = false):
//     . parceiro e grupo de um lote de produtos resolvidos uma vez por código (memória da requisição);
//     . mapeamento (id_map) e embalagens do produto gravados ao mesmo tempo.
//   - Fase 2 (padrão DESLIGADO; liga por conexão com config_extra.produto_lote = true):
//     . POST produtos/batch chama integracao_gravar_produtos_lote: 1 chamada por lote, mesma resposta;
//     . se a chamada em lote falhar (nada é gravado: é uma transação), cai no caminho item a item.
//   - Requer a migration 20261026_gravar_produtos_lote aplicada ANTES de ligar produto_lote.
// v18 (2026-10-21): REGISTRO DE TODOS OS ERROS DA API (Fase 2 do plano de registro de erros)
//   - Captura central no Deno.serve: toda resposta HTTP >= 400 e cada item com erro de um lote 207
//     é gravada em integracao.api_erro (RPC integracao_registrar_erro_api) com request_id, rota,
//     codigo_erp, id_alteracao, código/mensagem/detalhes do erro e o payload recebido.
//   - 401 (AUTH_MISSING/AUTH_INVALID) vai para integracao.api_erro_autenticacao, só com o SHA-256
//     e os 4 primeiros caracteres da chave (a chave nunca é gravada).
//   - Gravação em segundo plano (EdgeRuntime.waitUntil): não atrasa nem altera a resposta ao ERP.
//     Falha ao gravar só gera console.error.
//   - Toda resposta leva o header X-Request-Id (= metadata.request_id). Um X-Request-Id enviado
//     pelo cliente é guardado em detalhes.request_id_cliente.
//   - Desligamento sem deploy: secret API_ERRO_REGISTRO=off (global) |
//     config_extra.registrar_erros_api = false (por conexão) |
//     config_extra.registrar_payload_erro = false (grava o erro sem o payload, só hash e tamanho).
//   - Respostas, códigos e logSync/sync_log inalterados em relação à v17.
//   - Requer a migration 20261021_api_erro_registro aplicada ANTES.
// v17 (2026-10-20): CANCELAMENTO DE DOCUMENTO DE SAÍDA v2
//   - PATCH|POST documentos-saida/{codigo_erp}/cancel chama fn_cancelar_documento_saida v2:
//     estorno das coletas (padrão Limpar separação), auditoria em documento_saida_cancelamento,
//     recusa a partir de EM_CONFERENCIA, PED-CAN só para retirada física.
//   - Corpo opcional: { "motivo": "...", "solicitado_por": "..." }. Corpo vazio é aceito.
//   - Header opcional Idempotency-Key (até 100 caracteres): mesma chave = mesma resposta.
//   - HTTP: 200 cancelled/already_cancelled | 404 NOT_FOUND | 409 RETRY_LATER (+ Retry-After)
//           | 422 CANCELAMENTO_NAO_PERMITIDO, CONFERENCIA_INICIADA, VOLUME_EXPEDICAO_EXISTENTE,
//             CONFIGURACAO_INCOMPLETA | 500 INTERNAL_ERROR. O 202 deixa de ser usado.
//   - GET .../cancel-status lê a auditoria e as PED-CAN pelo cancelamento (antes: sempre 0).
//   - Reversão sem deploy: integracao.erp_conexao.config_extra.cancelamento_saida_v2 = false
//     faz a conexão voltar para a v1 (fn_cancelar_documento_saida_bkp_20261020).
//   - Requer a migration 20261020_cancelamento_saida_v2 aplicada ANTES.
// v16 (2026-10-19): Parceiro identificado pelo CNPJ. Busca por codigo do parceiro (produtos,
//   documentos de entrada/saida e GET /parceiros/{codigo}) usa integracao_resolver_parceiro:
//   GAUD-CLI-x, GAUD-FORN-y e transportador do mesmo CNPJ resolvem para o mesmo parceiro.
//   Requer as migrations 20261019c_parceiro_cnpj_chave_mestra e 20261019d aplicadas ANTES.
// v14 (2026-10-19): Limite de lote por entidade — parceiros 200, produtos 100, demais 50.
// v13 (2026-10-19): GRAVAÇÃO ATÔMICA de documentos-entrada e documentos-saida
//   - Cabeçalho + itens (+ lotes) gravados numa única RPC transacional:
//     integracao_gravar_documento_saida / integracao_gravar_documento_entrada.
//     Qualquer item inválido → 422 ITEMS_INVALID com a lista completa em error.details; NADA é gravado.
//   - Produto repetido em várias linhas é somado num único item (quantidade e valor_total).
//   - Produto inativo → PRODUTO_INATIVO. Lote sem número/quantidade/fabricacao/validade → LOTE_INVALIDO.
//   - Reenvio de original já existente com itens → 200 already_exists (não anexa itens).
//     Original (ou alteração pendente) sem itens e status 0 → 201 repaired (grava os itens).
//   - Aceite parcial só para conexões com config_extra.aceitar_itens_parciais = true.
//   - Documento criado pela API grava sistema_origem = 'api_rest' (saída).
//   - Requer as migrations 20261019_gravacao_atomica_documentos e 20261019b aplicadas ANTES.
// v12 (2026-10-19): Campo opcional VENDEDOR em documentos-entrada e documentos-saida
//   - Texto (ou número, convertido para texto), até 150 caracteres; espaços nas pontas são
//     removidos e vazio é tratado como não informado (null). >150 → erro de validação.
//   - Gravado na criação do documento (original ou alteração com id_alteracao). Reenvio do
//     mesmo codigo_erp sem id_alteracao não altera o documento existente (regra já vigente).
//   - Listagens GET passam a devolver vendedor.
//   - Requer a migration 20261019_vendedor_documentos aplicada ANTES.
// v11 (2026-10-15): id_alteracao ALFANUMÉRICO
//   - Aceita texto (1-50 caracteres: letras, números, . _ - /) ou número inteiro positivo
//     (convertido para texto). Espaços nas pontas são removidos; maiúsculas/minúsculas diferenciam.
//   - O hash de reenvio usa o valor normalizado: 2 e "2" são o mesmo movimento.
//   - ?id_alteracao=ALT-2 aceito nas consultas/cancelamentos.
//   - Requer a migration id_alteracao_06_alfanumerico aplicada ANTES.
// v10 (2026-10-14): Campo opcional id_alteracao em documentos-entrada e documentos-saida
//   - Sem id_alteracao: documento ORIGINAL, fluxo idêntico à v9 (upsert por codigo_erp).
//   - Com id_alteracao (inteiro > 0): cada par codigo_erp + id_alteracao gera um documento
//     novo e grava o histórico em integracao.documento_alteracao (hash SHA-256 do payload).
//     Reenvio idêntico → 200 already_processed; mesmo id com outro conteúdo → 409.
//   - GET / cancel / delete / cancel-status por codigo_erp atuam no ORIGINAL; para uma
//     alteração use ?id_alteracao=N. Sem original e com 2+ alterações ativas → 409.
//   - GET /{codigo_erp}?todos=true lista original + alterações; GET /{codigo_erp}/alteracoes
//     devolve o histórico. id_map de alterações usa '{codigo_erp}#{id_alteracao}'.
//   - FIX: GET /{codigo_erp}/cancel-status era inalcançável (o GET genérico respondia antes).
//   - Requer migrations id_alteracao_01..04 e 03c aplicadas ANTES.
// v9 (2026-10-13): Reenvio de documento de SAÍDA cancelado + proteção da sync Omiê
//   - Entrada e saída enviam p_permitir_reenvio_cancelado conforme a regra da conexão
//     (integracao.erp_conexao.permitir_reenvio_cancelado, padrão true, configurável na tela).
//     Só a API REST recria documento cancelado; a sincronização automática nunca recria.
//   - GET/delete/cancel-status de documentos-saida por codigo_erp priorizam o ativo
//     (podem coexistir cancelado + ativo com o mesmo codigo_erp)
//   - Cancel de saída idempotente: já cancelado responde 200 'already_cancelled' (antes 422)
//   - Requer as migrations 20261013_reenvio_documento_saida_cancelado.sql e
//     20261013b_regra_reenvio_cancelado_por_conexao.sql aplicadas ANTES
// v8 (2026-10-06): Reenvio de documento de entrada CANCELADO
//   - Documento cancelado (status 9) pode ser reenviado pelo ERP → gera documento novo
//     (regra no banco: integracao_upsert_documento_entrada v3 + índices únicos parciais)
//   - GET/delete/cancel de documentos-entrada por codigo_erp priorizam o registro mais recente
//     (podem coexistir cancelado + ativo com o mesmo codigo_erp)
//   - Cancel idempotente: documento já cancelado responde 200 'already_cancelled' (antes 422)
//   - Cancel ignora excluídos (99) e o update filtra tenant_id
// v7 (2026-08-20): Cancelamento inteligente de documento de saída
//   - Endpoint cancel agora usa RPC fn_cancelar_documento_saida (cobre todos os estágios)
//   - Novo endpoint GET /{codigo_erp}/cancel-status para acompanhar cancelamento assíncrono
// v1.21 (2026-10-28):
//   - Cancelar por codigo_erp um documento que só existe como alteração e já está cancelado
//     responde 200 already_cancelled (antes 404 NOT_FOUND). Só no /cancel de entrada e saída.
//   - PATCH /master-data/produtos/{codigo_erp} e PATCH /master-data/parceiros/{codigo_erp}:
//     atualizam só os campos enviados; os demais ficam como estão. 404 se não existir.
//   - POST de produto: tipo_controle e tipo_separacao passam a ser opcionais. Ausentes, valem as
//     regras de preenchimento do tenant (integracao.produto_regra_padrao); sem regra, UNIDADE e
//     FRACIONADO na criação, e o valor atual na atualização.
// v6 (2026-08-19): Compatibilidade HTTP — cancel/delete aceitam POST além de PATCH
//   Clientes Java/Spring com HttpURLConnection não suportam PATCH nativo.
//   Agora POST /{codigo_erp}/cancel e POST /{codigo_erp}/delete também funcionam.
// v5 (2026-08-14): Exclusão de documentos
// - GET de documentos agora filtra status != 99 (excluídos)
// - Novo PATCH /{codigo_erp}/delete para exclusão via API
// v4 (2026-08-07): FIX — extractRpcResult defensivo para evitar erro 22P02

function extractRpcResult(data: unknown): Record<string, unknown> | null {
    if (data == null) return null;
    if (Array.isArray(data)) {
        return data.length > 0 && typeof data[0] === 'object' && data[0] !== null
            ? data[0] as Record<string, unknown>
            : null;
    }
    if (typeof data === 'object') return data as Record<string, unknown>;
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) return parsed.length > 0 && typeof parsed[0] === 'object' ? parsed[0] : null;
            if (typeof parsed === 'object' && parsed !== null) return parsed;
        } catch {}
        return null;
    }
    return null;
}

function json(body: ApiResponse, status = 200): Response {
    if (body.metadata && !body.metadata.timestamp) body.metadata.timestamp = new Date().toISOString();
    return new Response(JSON.stringify(body), {
        status,
        headers: CORS
    })
}

function ok(data: unknown, ctx: Ctx, status = 200): Response {
    return json({
        success: true,
        data,
        metadata: {
            request_id: ctx.requestId,
            timestamp: new Date().toISOString(),
            processing_ms: Date.now() - ctx.t0
        }
    }, status)
}

function erro(code: string, message: string, ctx: Ctx, status = 400, details ? : unknown[]): Response {
    return json({
        success: false,
        error: {
            code,
            message,
            ...(details ? {
                details
            } : {})
        },
        metadata: {
            request_id: ctx.requestId,
            timestamp: new Date().toISOString(),
            processing_ms: Date.now() - ctx.t0
        }
    }, status)
}

function erroSimples(code: string, message: string, requestId: string, status = 400): Response {
    return json({
        success: false,
        error: {
            code,
            message
        },
        metadata: {
            request_id: requestId,
            timestamp: new Date().toISOString()
        }
    }, status)
}

// ---------------- v20: paginação por cursor ----------------
const PAG_LIMIT_PADRAO = 100;
const PAG_LIMIT_MAX = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Pagina {
    limit: number;
    since: string | null;
    cursor: { u: string; i: string } | null
}
function b64urlEncode(s: string): string {
    return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '='.repeat((4 - b.length % 4) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
// null = cliente não pediu paginação (listagem legada da v19); Response = parâmetro inválido
function lerPaginacao(ctx: Ctx): Pagina | Response | null {
    const q = ctx.query;
    const rawLimit = q.get('limit'), rawCursor = q.get('cursor'), rawSince = q.get('updated_since');
    if (rawLimit === null && rawCursor === null && rawSince === null) return null;
    let limit = PAG_LIMIT_PADRAO;
    if (rawLimit !== null) {
        if (!/^\d{1,4}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > PAG_LIMIT_MAX)
            return erro('VALIDATION_ERROR', `limit deve ser um inteiro entre 1 e ${PAG_LIMIT_MAX}.`, ctx, 400);
        limit = Number(rawLimit);
    }
    let since: string | null = null;
    if (rawSince !== null && rawSince.trim() !== '') {
        const t = Date.parse(rawSince.trim());
        if (Number.isNaN(t)) return erro('VALIDATION_ERROR', 'updated_since deve ser uma data ISO-8601 (ex.: 2026-10-28T00:00:00Z).', ctx, 400);
        since = new Date(t).toISOString();
    }
    let cursor: { u: string; i: string } | null = null;
    if (rawCursor !== null && rawCursor.trim() !== '') {
        try {
            const c = JSON.parse(b64urlDecode(rawCursor.trim()));
            if (typeof c?.u !== 'string' || Number.isNaN(Date.parse(c.u)) || typeof c?.i !== 'string' || !UUID_RE.test(c.i)) throw new Error('cursor');
            cursor = { u: c.u, i: c.i };
        } catch {
            return erro('INVALID_CURSOR', 'cursor inválido. Use o next_cursor devolvido pela página anterior.', ctx, 400);
        }
    }
    return { limit, since, cursor };
}
async function listarPaginado(ctx: Ctx, tabela: string, campos: string, pg: Pagina, semExcluidos = false): Promise < Response > {
    let q: any = ctx.sb.from(tabela).select(campos + ',updated_at').eq('tenant_id', ctx.conn.tenant_id);
    if (semExcluidos) q = q.neq('status', 99);
    if (pg.since) q = q.gte('updated_at', pg.since);
    if (pg.cursor) q = q.or(`updated_at.gt."${pg.cursor.u}",and(updated_at.eq."${pg.cursor.u}",id.gt.${pg.cursor.i})`);
    q = q.order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(pg.limit + 1);
    const { data, error } = await q;
    if (error) {
        console.error('[gw] listarPaginado', tabela, error);
        return erro('INTERNAL_ERROR', 'Falha ao listar registros.', ctx, 500);
    }
    const linhas: any[] = data ?? [];
    const temMais = linhas.length > pg.limit;
    const pagina = temMais ? linhas.slice(0, pg.limit) : linhas;
    const ultimo = pagina.at(-1);
    return json({
        success: true,
        data: pagina,
        metadata: {
            request_id: ctx.requestId,
            timestamp: new Date().toISOString(),
            processing_ms: Date.now() - ctx.t0,
            paginacao: {
                limit: pg.limit,
                has_more: temMais,
                next_cursor: temMais && ultimo ? b64urlEncode(JSON.stringify({ u: ultimo.updated_at, i: ultimo.id })) : null,
                updated_since: pg.since
            }
        }
    })
}
// ---------------- fim v20 paginação ----------------
async function logSync(ctx: Ctx, entidade: string, status: string, inseridos = 0, atualizados = 0, erros = 0, msgErro ? : string) {
    try {
        await ctx.sb.rpc('integracao_log_sync', {
            p_tenant_id: ctx.conn.tenant_id,
            p_empresa_id: ctx.conn.empresa_id,
            p_erp_provedor_id: ctx.conn.erp_provedor_id,
            p_modulo: 'api_rest',
            p_entidade: entidade,
            p_operacao: 'webhook',
            p_status: status,
            p_inseridos: inseridos,
            p_atualizados: atualizados,
            p_erros: erros,
            p_mensagem_erro: msgErro ?? null,
            p_duracao_ms: Date.now() - ctx.t0,
            p_id_chamada: ctx.requestId,
            p_disparado_por: 'api_rest'
        })
    } catch (e) {
        console.error('[gw] log err:', e)
    }
}
async function resolverRefDireto(ctx: Ctx, tabela: string, codigoErp: string, coluna = 'codigo_erp'): Promise < string | null > {
    if (!codigoErp) return null;
    // v16: parceiro e identificado pelo CNPJ; qualquer codigo do ERP (CLI/FORN/TRANSP) e apelido dele
    if (tabela === 'parceiro' && coluna === 'codigo_erp') {
        const { data: pid, error: pe } = await ctx.sb.rpc('integracao_resolver_parceiro', {
            p_tenant_id: ctx.conn.tenant_id,
            p_codigo_erp: String(codigoErp).trim()
        });
        if (!pe) return (pid as string) ?? null;
        console.error('[gw] resolver parceiro err (fallback codigo_erp):', pe.message)
    }
    const {
        data
    } = await ctx.sb.from(tabela).select('id').eq('tenant_id', ctx.conn.tenant_id).eq(coluna, codigoErp).maybeSingle();
    return data?.id ?? null
}
async function registrarIdMap(ctx: Ctx, entidade: string, idExterno: string, idInterno: string) {
    try {
        await ctx.sb.rpc('integracao_upsert_id_map', {
            p_tenant_id: ctx.conn.tenant_id,
            p_empresa_id: ctx.conn.empresa_id,
            p_erp_provedor_id: ctx.conn.erp_provedor_id,
            p_entidade: entidade,
            p_id_externo: idExterno,
            p_id_interno: idInterno
        })
    } catch (e) {
        console.error('[gw] idmap err:', e)
    }
}
// ---------------- v19: produtos mais rápidos ----------------
function configExtra(ctx: Ctx): Record < string, unknown > {
    return (ctx.conn.config_extra ?? {}) as Record < string, unknown >
}
function otimizacaoLoteLigada(ctx: Ctx): boolean {
    return configExtra(ctx).otimizar_lote !== false
}
function produtoLoteLigado(ctx: Ctx): boolean {
    return configExtra(ctx).produto_lote === true
}
// Memória da requisição: parceiro e grupo citados por vários produtos do mesmo lote.
// Só para leituras dentro de produtos (um lote de produtos não cria parceiro nem grupo).
const memoriaRefs = new WeakMap < Ctx, Map < string, Promise < string | null >>> ();
function resolverRefProduto(ctx: Ctx, tabela: 'parceiro' | 'grupo_produto', codigoErp: string): Promise < string | null > {
    if (!otimizacaoLoteLigada(ctx)) return resolverRefDireto(ctx, tabela, codigoErp);
    let mem = memoriaRefs.get(ctx);
    if (!mem) {
        mem = new Map();
        memoriaRefs.set(ctx, mem)
    }
    const chave = `${tabela}|${codigoErp}`;
    let p = mem.get(chave);
    if (!p) {
        p = resolverRefDireto(ctx, tabela, codigoErp);
        mem.set(chave, p)
    }
    return p
}
// ---------------- v10: id_alteracao ----------------
const RE_ID_ALTERACAO = /^[A-Za-z0-9._\/-]{1,50}$/;
const MSG_ID_ALTERACAO = 'id_alteracao invalido: use de 1 a 50 caracteres (letras, numeros, . _ - /), ex.: "ALT-2" ou 2.';
// v12: vendedor opcional — texto até 150 caracteres; número vira texto; vazio vira null
function normalizarVendedor(v: unknown): { valor: string | null; erro ? : string } {
    if (v === undefined || v === null) return { valor: null };
    if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
    if (typeof v !== 'string') return { valor: null, erro: 'vendedor deve ser texto.' };
    const s = v.trim();
    if (s === '') return { valor: null };
    if (s.length > 150) return { valor: null, erro: `vendedor excede 150 caracteres (${s.length}).` };
    return { valor: s };
}
function normalizarIdAlteracao(v: unknown): { valor: string | null; erro ? : string } {
    let t: string;
    if (typeof v === 'number') {
        if (!Number.isSafeInteger(v) || v <= 0) return { valor: null, erro: MSG_ID_ALTERACAO };
        t = String(v);
    } else if (typeof v === 'string') {
        t = v.trim();
    } else return { valor: null, erro: MSG_ID_ALTERACAO };
    if (!RE_ID_ALTERACAO.test(t)) return { valor: null, erro: MSG_ID_ALTERACAO };
    return { valor: t };
}
function lerIdAlteracao(item: any): { presente: boolean; valor: string | null; erro ? : string } {
    if (item == null || typeof item !== 'object' || item.id_alteracao === undefined || item.id_alteracao === null) return { presente: false, valor: null };
    const n = normalizarIdAlteracao(item.id_alteracao);
    if (n.erro) return { presente: true, valor: null, erro: n.erro };
    return { presente: true, valor: n.valor };
}
function jsonEstavel(v: unknown): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
    if (Array.isArray(v)) return '[' + v.map(jsonEstavel).join(',') + ']';
    const o = v as Record < string, unknown > ;
    return '{' + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ':' + jsonEstavel(o[k])).join(',') + '}';
}
async function hashPayload(item: unknown): Promise < string > {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jsonEstavel(item)));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function registrarRecusaAlteracao(ctx: Ctx, tipo: 'ENTRADA' | 'SAIDA', item: any, idAlt: string, hash: string, motivo: string) {
    try {
        await ctx.sb.rpc('integracao_registrar_alteracao_recusada', {
            p_tenant_id: ctx.conn.tenant_id,
            p_empresa_id: ctx.conn.empresa_id,
            p_tipo: tipo,
            p_codigo_erp: item?.codigo_erp ?? null,
            p_id_alteracao: idAlt,
            p_payload: item,
            p_payload_hash: hash,
            p_motivo: motivo,
            p_request_id: ctx.requestId,
            p_conexao_id: ctx.conn.conexao_id ?? null
        })
    } catch (e) {
        console.error('[gw] recusa alteracao err:', e)
    }
}
async function finalizarAlteracao(ctx: Ctx, alteracaoId: string, situacao: 'aplicada' | 'pendente', motivo: string | null, gerados: unknown) {
    try {
        await ctx.sb.rpc('integracao_finalizar_alteracao', {
            p_alteracao_id: alteracaoId,
            p_situacao: situacao,
            p_motivo: motivo,
            p_documentos_gerados: gerados
        })
    } catch (e) {
        console.error('[gw] finalizar alteracao err:', e)
    }
}
// Localiza o documento por codigo_erp: sem ?id_alteracao → ORIGINAL; com → aquela alteração.
// Sem original: 1 alteração ativa → ela; 2+ → 409 AMBIGUOUS_DOCUMENT.
async function resolverDocPorCodigo(ctx: Ctx, tabela: 'documento_entrada' | 'documento_saida', codigo: string, campos: string, aceitarAlteracaoCancelada = false): Promise < { data ? : any; resp ? : Response } > {
    const raw = ctx.query.get('id_alteracao');
    const ordCol = tabela === 'documento_entrada' ? 'created_at' : 'cancelamento_solicitado_em';
    const ordOpt = tabela === 'documento_entrada' ? { ascending: false } : { ascending: false, nullsFirst: true };
    let q = ctx.sb.from(tabela).select(campos).eq('tenant_id', ctx.conn.tenant_id).eq('codigo_erp', codigo).neq('status', 99);
    if (raw !== null) {
        const n = normalizarIdAlteracao(raw);
        if (n.erro) return { resp: erro('VALIDATION_ERROR', 'Parametro ' + n.erro, ctx, 400) };
        q = q.eq('id_alteracao', n.valor);
    } else {
        q = q.is('id_alteracao', null);
    }
    const { data } = await q.order(ordCol, ordOpt).limit(1).maybeSingle();
    if (data) return { data };
    if (raw === null) {
        const { data: alts } = await ctx.sb.from(tabela).select(campos).eq('tenant_id', ctx.conn.tenant_id).eq('codigo_erp', codigo).not('id_alteracao', 'is', null).not('status', 'in', '(9,99)').limit(2);
        if (alts && alts.length > 1) return { resp: erro('AMBIGUOUS_DOCUMENT', `Documento original de '${codigo}' nao encontrado e ha mais de uma alteracao ativa. Informe ?id_alteracao=N.`, ctx, 409) };
        if (alts && alts.length === 1) return { data: alts[0] };
        // v1.21: sem original e sem alteração ativa, o cancelamento enxerga a alteração já cancelada (already_cancelled)
        if (aceitarAlteracaoCancelada) {
            const { data: canc } = await ctx.sb.from(tabela).select(campos).eq('tenant_id', ctx.conn.tenant_id).eq('codigo_erp', codigo).not('id_alteracao', 'is', null).eq('status', 9).order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (canc) return { data: canc };
        }
    }
    return {};
}
async function listarAlteracoes(ctx: Ctx, tipo: 'ENTRADA' | 'SAIDA', codigo: string): Promise < Response > {
    const { data, error } = await ctx.sb.rpc('integracao_listar_alteracoes', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_tipo: tipo,
        p_codigo_erp: codigo
    });
    if (error) return erro('INTERNAL_ERROR', error.message, ctx, 500);
    return ok({ codigo_erp: codigo, alteracoes: data ?? [] }, ctx)
}
function resumoErros(r: any): string {
    const det = Array.isArray(r?.details) ? r.details.map((d: any) => `${d.produto_codigo_erp ?? '-'}:${d.codigo}`).join(', ') : '';
    return `${r?.codigo_erp ?? ''} ${r?.error ?? ''}${det ? ' | ' + det : ''}`.trim().slice(0, 1000);
}
async function respostaDocUnico(r: any, entidade: string, ctx: Ctx): Promise < Response > {
    if (r.status === 'error') {
        const code: string = r.code ?? 'VALIDATION_ERROR';
        if (code === 'ITEMS_INVALID' || code === 'DOCUMENTO_SEM_ITENS') {
            await logSync(ctx, entidade, 'erro', 0, 0, 1, resumoErros(r));
            return erro(code, r.error!, ctx, 422, r.details);
        }
        if (code === 'DOCUMENTO_DUPLICADO') {
            await logSync(ctx, entidade, 'erro', 0, 0, 1, resumoErros(r));
            return erro(code, r.error!, ctx, 409);
        }
        if (code === 'DOCUMENTO_EXCLUIDO') return erro('VALIDATION_ERROR', `DOCUMENTO_EXCLUIDO: ${r.error}`, ctx, 400);
        if (code === 'REFERENCIA_INVALIDA') return erro('VALIDATION_ERROR', r.error!, ctx, 400);
        return erro('VALIDATION_ERROR', r.error!, ctx, 400);
    }
    if (r.status === 'id_alteracao_conflict') {
        await logSync(ctx, entidade, 'erro', 0, 0, 1, r.error);
        return erro('ID_ALTERACAO_CONFLICT', r.error, ctx, 409);
    }
    if (r.status === 'already_processed' || r.status === 'already_exists') return ok(r, ctx, 200);
    if (r.status === 'repaired') await logSync(ctx, entidade, 'sucesso', 0, 1, 0);
    else if (r.status === 'created_with_warnings') await logSync(ctx, entidade, 'parcial', 1, 0, r.itens?.com_erro ?? 0, resumoErros(r));
    else await logSync(ctx, entidade, 'sucesso', 1, 0, 0);
    return ok(r, ctx, 201)
}
// v13: converte o retorno das RPCs de gravação atômica no formato de resposta da API
async function mapearGravacao(item: any, ctx: Ctx, entidade: 'documento_entrada' | 'documento_saida', alt: { valor: string; hash: string } | null, res: Record < string, any > | null): Promise < any > {
    const base: any = { codigo_erp: item.codigo_erp, ...(alt ? { id_alteracao: alt.valor } : {}) };
    if (!res) return { ...base, status: 'error', code: 'INTERNAL_ERROR', error: 'Resposta vazia da gravacao.' };
    const st = res.status as string;
    if (st === 'created' || st === 'created_with_warnings' || st === 'repaired') {
        await registrarIdMap(ctx, entidade, alt ? `${item.codigo_erp}#${alt.valor}` : item.codigo_erp, res.documento_id);
        return {
            ...base,
            ...(alt ? { id_alteracao_anterior: res.id_alteracao_anterior ?? null, documento_original_id: res.documento_original_id ?? null, id_wms: res.documento_id } : {}),
            status: st,
            id: res.documento_id,
            itens: res.itens,
            ...(res.details ? { details: res.details } : {})
        };
    }
    if (st === 'already_exists') return { ...base, status: 'already_exists', id: res.documento_id, status_documento: res.status_documento };
    if (st === 'already_processed') return { ...base, status: 'already_processed', id: res.documento_id, id_wms: res.documento_id };
    if (st === 'id_alteracao_conflict') return { ...base, status: 'id_alteracao_conflict', id: res.documento_id, error: `id_alteracao ${alt?.valor} ja recebido para '${item.codigo_erp}' com conteudo diferente.` };
    if (st === 'invalid') return { ...base, status: 'error', code: res.code, error: res.error, itens: res.itens, details: res.details };
    return { ...base, status: 'error', code: res.code ?? 'VALIDATION_ERROR', error: res.error ?? 'Falha ao gravar documento.' };
}
// ---------------- fim v10 helpers ----------------
async function processarBatch(ctx: Ctx, items: unknown[], entidade: string, fn: (item: any, ctx: Ctx) => Promise < {
    status: string;codigo_erp: string;id ? : string;error ? : string
} > ): Promise < Response > {
    // v14: limite por entidade (fallback MAX_BATCH)
    const limite = BATCH_LIMITS[entidade] ?? MAX_BATCH;
    if (!Array.isArray(items) || items.length === 0) return erro('VALIDATION_ERROR', 'Campo items deve ser um array.', ctx, 400);
    if (items.length > limite) return erro('VALIDATION_ERROR', `Max ${limite} itens. Recebido: ${items.length}.`, ctx, 400);
    const results: any[] = [];
    let created = 0,
        updated = 0,
        errors = 0,
        alreadyProcessed = 0,
        alreadyExists = 0;
    for (const item of items) {
        try {
            const r = await fn(item, ctx);
            results.push(r);
            if (r.status === 'created' || r.status === 'created_with_warnings') created++;
            else if (r.status === 'updated' || r.status === 'repaired') updated++;
            else if (r.status === 'already_exists') alreadyExists++
            else if (r.status === 'error' || r.status === 'id_alteracao_conflict') errors++
            else if (r.status === 'already_processed') alreadyProcessed++
        } catch (e) {
            errors++;
            results.push({
                codigo_erp: (item as any)?.codigo_erp ?? '?',
                status: 'error',
                error: e instanceof Error ? e.message : 'Erro'
            })
        }
    }
    return respostaLote(ctx, entidade, items.length, results, { created, updated, errors, alreadyProcessed, alreadyExists })
}
// v19: resposta 207 de um lote (comum ao caminho item a item e à gravação em lote)
async function respostaLote(ctx: Ctx, entidade: string, total: number, results: any[], n: {
    created: number;updated: number;errors: number;alreadyProcessed: number;alreadyExists: number
}): Promise < Response > {
    const { created, updated, errors, alreadyProcessed, alreadyExists } = n;
    const items = { length: total };
    const msgErros = results.filter(r => r?.status === 'error').map(r => resumoErros(r)).join(' || ').slice(0, 1900);
    await logSync(ctx, entidade, errors > 0 ? 'parcial' : 'sucesso', created, updated, errors, msgErros || undefined);
    return ok({
        total: items.length,
        created,
        updated,
        errors,
        ...(alreadyProcessed > 0 ? { already_processed: alreadyProcessed } : {}),
        ...(alreadyExists > 0 ? { already_exists: alreadyExists } : {}),
        results
    }, ctx, 207)
}
async function upsertParceiro(item: any, ctx: Ctx) {
    const f = ['codigo_erp', 'cnpj', 'razao_social', 'endereco', 'bairro', 'cidade', 'estado', 'tipo_parceiro'].filter(c => !item[c]);
    if (f.length) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: `Campos ausentes: ${f.join(',')}`
    };
    let rotaId: string | null = null;
    if (item.rota_codigo_erp) rotaId = await resolverRefDireto(ctx, 'rotas', item.rota_codigo_erp);
    const {
        data: id,
        error
    } = await ctx.sb.rpc('integracao_upsert_parceiro', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_cnpj: item.cnpj,
        p_razao_social: item.razao_social,
        p_nome_fantasia: item.nome_fantasia ?? null,
        p_endereco: item.endereco,
        p_numero: item.numero ?? null,
        p_complemento: item.complemento ?? null,
        p_bairro: item.bairro,
        p_cidade: item.cidade,
        p_estado: item.estado,
        p_cep: item.cep ?? null,
        p_telefone: item.telefone ?? null,
        p_email: item.email ?? null,
        p_tipo_parceiro: item.tipo_parceiro,
        p_ativo: item.ativo ?? true,
        p_codigo_erp: item.codigo_erp,
        p_rota_id: rotaId,
        p_contato: item.contato ?? null
    });
    if (error) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: error.message
    };
    await registrarIdMap(ctx, 'parceiro', item.codigo_erp, id);
    return {
        codigo_erp: item.codigo_erp,
        status: 'created',
        id
    }
}
// v1.21: PATCH de parceiro pelo código (principal ou apelido). CNPJ não muda por PATCH (ele identifica o parceiro).
const CAMPOS_PATCH_PARCEIRO = ['razao_social', 'nome_fantasia', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep', 'telefone', 'email', 'contato', 'tipo_parceiro', 'ativo', 'rota_codigo_erp', 'cnpj'];
async function patchParceiro(codigo: string, b: any, ctx: Ctx): Promise < Response > {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return erro('INVALID_PAYLOAD', 'Envie um objeto JSON com os campos a alterar.', ctx, 400);
    if (b.codigo_erp != null && String(b.codigo_erp) !== codigo) return erro('VALIDATION_ERROR', 'codigo_erp do corpo difere do caminho; o codigo_erp nao pode ser alterado.', ctx, 400);
    const desconhecidos = Object.keys(b).filter(k => k !== 'codigo_erp' && !CAMPOS_PATCH_PARCEIRO.includes(k));
    if (desconhecidos.length) return erro('VALIDATION_ERROR', `Campos nao aceitos no PATCH: ${desconhecidos.join(',')}`, ctx, 400);
    const enviados = Object.keys(b).filter(k => k !== 'codigo_erp');
    if (!enviados.length) return erro('VALIDATION_ERROR', 'Nenhum campo para alterar.', ctx, 400);
    if (('numero' in b || 'complemento' in b) && !b.endereco) return erro('VALIDATION_ERROR', 'numero e complemento so podem ser enviados junto com endereco.', ctx, 400);
    for (const c of ['razao_social', 'endereco', 'bairro', 'cidade', 'estado']) if (c in b && (b[c] == null || String(b[c]).trim() === '')) return erro('VALIDATION_ERROR', `${c} nao pode ser vazio.`, ctx, 400);
    const pidAtual = await resolverRefDireto(ctx, 'parceiro', codigo);
    const { data: atual } = pidAtual ? await ctx.sb.from('parceiro').select('id,cnpj,razaosocial,nome_fantasia,endereco,bairro,cidade,estado,rota_id,tipo_parceiro,ativo').eq('tenant_id', ctx.conn.tenant_id).eq('id', pidAtual).maybeSingle() : { data: null };
    if (!atual) return erro('NOT_FOUND', `Parceiro '${codigo}' nao encontrado.`, ctx, 404);
    const soDigitos = (x: unknown) => String(x ?? '').replace(/\D/g, '');
    if ('cnpj' in b && soDigitos(b.cnpj) !== soDigitos(atual.cnpj)) return erro('VALIDATION_ERROR', 'O CNPJ identifica o parceiro e nao pode ser alterado por PATCH.', ctx, 400);
    // tipo e situação do código usado no caminho (o apelido pode ter tipo próprio)
    const { data: apelido } = await ctx.sb.from('parceiro_codigo_erp').select('tipo_parceiro,ativo').eq('tenant_id', ctx.conn.tenant_id).eq('codigo_erp', codigo).maybeSingle();
    let rotaId: string | null = atual.rota_id;
    if (b.rota_codigo_erp) {
        rotaId = await resolverRefDireto(ctx, 'rotas', b.rota_codigo_erp);
        if (!rotaId) return erro('VALIDATION_ERROR', `Rota '${b.rota_codigo_erp}' nao encontrada.`, ctx, 400);
    }
    const { data: id, error } = await ctx.sb.rpc('integracao_upsert_parceiro', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_cnpj: atual.cnpj,
        p_razao_social: b.razao_social ?? atual.razaosocial,
        p_nome_fantasia: b.nome_fantasia ?? null,
        p_endereco: b.endereco ?? atual.endereco,
        p_numero: b.endereco ? (b.numero ?? null) : null,
        p_complemento: b.endereco ? (b.complemento ?? null) : null,
        p_bairro: b.bairro ?? atual.bairro,
        p_cidade: b.cidade ?? atual.cidade,
        p_estado: b.estado ?? atual.estado,
        p_cep: b.cep ?? null,
        p_telefone: b.telefone ?? null,
        p_email: b.email ?? null,
        p_tipo_parceiro: b.tipo_parceiro ?? apelido?.tipo_parceiro ?? atual.tipo_parceiro,
        p_ativo: 'ativo' in b ? b.ativo : (apelido?.ativo ?? atual.ativo),
        p_codigo_erp: codigo,
        p_rota_id: rotaId,
        p_contato: b.contato ?? null
    });
    if (error) return erro('VALIDATION_ERROR', error.message, ctx, 400);
    await logSync(ctx, 'parceiro', 'sucesso', 0, 1, 0);
    return ok({ codigo_erp: codigo, status: 'updated', id: id ?? atual.id, campos_alterados: enviados }, ctx)
}
async function handleParceiros(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    if (m === 'GET') {
        if (s[0] && s[0] !== 'batch') {
            // v16: GET aceita qualquer codigo do parceiro (apelido)
            const pidGet = await resolverRefDireto(ctx, 'parceiro', s[0]);
            const {
                data
            } = pidGet ? await ctx.sb.from('parceiro').select('*').eq('tenant_id', ctx.conn.tenant_id).eq('id', pidGet).maybeSingle() : { data: null };
            if (!data) return erro('NOT_FOUND', `Parceiro '${s[0]}' nao encontrado.`, ctx, 404);
            return ok(data, ctx)
        }
        // v20: paginação opcional (sem limit/cursor/updated_since = listagem legada)
        { const pg = lerPaginacao(ctx); if (pg instanceof Response) return pg; if (pg) return listarPaginado(ctx, 'parceiro', 'id,codigo_erp,cnpj,razaosocial,cidade,estado,tipo_parceiro,ativo', pg); }
        const {
            data
        } = await ctx.sb.from('parceiro').select('id,codigo_erp,cnpj,razaosocial,cidade,estado,tipo_parceiro,ativo').eq('tenant_id', ctx.conn.tenant_id).order('razaosocial').limit(200);
        return ok(data, ctx)
    }
    if (m === 'POST' && s[0] === 'batch') return processarBatch(ctx, b?.items, 'parceiro', upsertParceiro);
    if (m === 'PATCH' && s[0] && s[0] !== 'batch' && !s[1]) return patchParceiro(s[0], b, ctx);
    if (m === 'POST') {
        const r = await upsertParceiro(b, ctx);
        if (r.status === 'error') return erro('VALIDATION_ERROR', r.error!, ctx, 400);
        await logSync(ctx, 'parceiro', 'sucesso', 1, 0, 0);
        return ok(r, ctx, 201)
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405)
}
async function upsertGrupo(item: any, ctx: Ctx) {
    if (!item.codigo_erp || !item.descricao) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: 'codigo_erp e descricao obrigatorios'
    };
    const {
        data: id,
        error
    } = await ctx.sb.rpc('integracao_upsert_grupo_produto', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_descricao: item.descricao,
        p_codigo_erp: item.codigo_erp,
        p_ativo: item.ativo ?? true
    });
    if (error) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: error.message
    };
    await registrarIdMap(ctx, 'grupo_produto', item.codigo_erp, id);
    return {
        codigo_erp: item.codigo_erp,
        status: 'created',
        id
    }
}
async function handleGrupos(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    if (m === 'GET') {
        // v20: paginação opcional (sem limit/cursor/updated_since = listagem legada)
        { const pg = lerPaginacao(ctx); if (pg instanceof Response) return pg; if (pg) return listarPaginado(ctx, 'grupo_produto', 'id,codigo_erp,descricao,ativo', pg); }
        const {
            data
        } = await ctx.sb.from('grupo_produto').select('id,codigo_erp,descricao,ativo').eq('tenant_id', ctx.conn.tenant_id).order('descricao').limit(500);
        return ok(data, ctx)
    }
    if (m === 'POST' && s[0] === 'batch') return processarBatch(ctx, b?.items, 'grupo_produto', upsertGrupo);
    if (m === 'POST') {
        const r = await upsertGrupo(b, ctx);
        if (r.status === 'error') return erro('VALIDATION_ERROR', r.error!, ctx, 400);
        await logSync(ctx, 'grupo_produto', 'sucesso', 1, 0, 0);
        return ok(r, ctx, 201)
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405)
}
async function upsertSubgrupo(item: any, ctx: Ctx) {
    if (!item.codigo_erp || !item.descricao || !item.grupo_codigo_erp) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: 'codigo_erp, descricao e grupo_codigo_erp obrigatorios'
    };
    const grupoId = await resolverRefDireto(ctx, 'grupo_produto', item.grupo_codigo_erp);
    if (!grupoId) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: `Grupo '${item.grupo_codigo_erp}' nao encontrado.`
    };
    const {
        data: id,
        error
    } = await ctx.sb.rpc('integracao_upsert_subgrupo_produto', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_grupo_id: grupoId,
        p_descricao: item.descricao,
        p_codigo_erp: item.codigo_erp,
        p_ativo: item.ativo ?? true
    });
    if (error) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: error.message
    };
    await registrarIdMap(ctx, 'subgrupo_produto', item.codigo_erp, id);
    return {
        codigo_erp: item.codigo_erp,
        status: 'created',
        id
    }
}
async function handleSubgrupos(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    if (m === 'GET') {
        // v20: paginação opcional (sem limit/cursor/updated_since = listagem legada)
        { const pg = lerPaginacao(ctx); if (pg instanceof Response) return pg; if (pg) return listarPaginado(ctx, 'subgrupo_produto', 'id,codigo_erp,descricao,grupo_id,ativo', pg); }
        const {
            data
        } = await ctx.sb.from('subgrupo_produto').select('id,codigo_erp,descricao,grupo_id,ativo').eq('tenant_id', ctx.conn.tenant_id).order('descricao').limit(500);
        return ok(data, ctx)
    }
    if (m === 'POST' && s[0] === 'batch') return processarBatch(ctx, b?.items, 'subgrupo_produto', upsertSubgrupo);
    if (m === 'POST') {
        const r = await upsertSubgrupo(b, ctx);
        if (r.status === 'error') return erro('VALIDATION_ERROR', r.error!, ctx, 400);
        await logSync(ctx, 'subgrupo_produto', 'sucesso', 1, 0, 0);
        return ok(r, ctx, 201)
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405)
}
async function upsertProduto(item: any, ctx: Ctx) {
    const f = ['codigo_erp', 'sku', 'descricao', 'referencia', 'parceiro_codigo_erp'].filter(c => !item[c]);
    if (f.length) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: `Campos ausentes: ${f.join(',')}`
    };
    const pid = await resolverRefProduto(ctx, 'parceiro', item.parceiro_codigo_erp);
    if (!pid) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: `Parceiro '${item.parceiro_codigo_erp}' nao encontrado.`
    };
    let gid: string | null = null;
    if (item.grupo_codigo_erp) gid = await resolverRefProduto(ctx, 'grupo_produto', item.grupo_codigo_erp);
    const {
        data: rows,
        error
    } = await ctx.sb.rpc('integracao_upsert_produto', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_sku: item.sku,
        p_descricao: item.descricao,
        p_referencia: item.referencia,
        p_marca: item.marca ?? null,
        p_preco_custo: item.preco_custo ?? null,
        p_peso_variavel: item.peso_variavel ?? false,
        p_ativo: item.ativo ?? true,
        p_codigo_erp: item.codigo_erp,
        p_tipo_controle: item.tipo_controle || null,
        p_tipo_separacao: item.tipo_separacao || null,
        p_usa_picking: item.usa_picking ?? true,
        p_varios_pickings: item.varios_pickings ?? false,
        p_parceiro_id: pid,
        p_grupo_id: gid
    });
    if (error) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: error.message
    };

    const row = extractRpcResult(rows);
    const prodId = (row?.produto_id as string) ?? null;

    if (!prodId) {
        console.error(`[gw] WARN: integracao_upsert_produto retornou formato inesperado. rows=${JSON.stringify(rows)}`);
        return {
            codigo_erp: item.codigo_erp,
            status: 'error',
            error: 'Falha ao extrair produto_id do resultado'
        };
    }

    // v19: mapeamento e embalagens ao mesmo tempo (independentes); sem otimização, em sequência.
    const idMap = registrarIdMap(ctx, 'produto', item.codigo_erp, prodId);
    if (!otimizacaoLoteLigada(ctx)) await idMap;
    let eOk = 0,
        eErr = 0;
    if (Array.isArray(item.embalagens) && item.embalagens.length > 0) {
        for (const e of item.embalagens) {
            if (!e.ean || !e.fator || !e.embalagem) {
                eErr++;
                continue
            }
            const {
                error: ee
            } = await ctx.sb.rpc('integracao_upsert_embalagem', {
                p_tenant_id: ctx.conn.tenant_id,
                p_empresa_id: ctx.conn.empresa_id,
                p_produto_id: prodId,
                p_ean: e.ean,
                p_fator: e.fator,
                p_embalagem: e.embalagem,
                p_altura: e.altura ?? null,
                p_largura: e.largura ?? null,
                p_comprimento: e.comprimento ?? null,
                p_peso_bruto: e.peso_bruto ?? null,
                p_peso_liq: e.peso_liquido ?? null,
                p_ativo: e.ativo ?? true,
                p_codigo_erp: e.codigo_erp ?? e.ean
            });
            if (ee) eErr++;
            else eOk++
        }
    }
    await idMap;
    return {
        codigo_erp: item.codigo_erp,
        status: 'created',
        id: prodId,
        embalagens: {
            processadas: eOk,
            erros: eErr
        }
    }
}
// v1.21: PATCH de produto — mescla o enviado sobre o cadastro atual e grava pela mesma RPC do POST.
const CAMPOS_PATCH_PRODUTO = ['sku', 'descricao', 'referencia', 'marca', 'preco_custo', 'peso_variavel', 'ativo', 'tipo_controle', 'tipo_separacao', 'usa_picking', 'varios_pickings', 'parceiro_codigo_erp', 'grupo_codigo_erp', 'peso_bruto', 'peso_liquido', 'embalagens'];
async function patchProduto(codigo: string, b: any, ctx: Ctx): Promise < Response > {
    if (!b || typeof b !== 'object' || Array.isArray(b)) return erro('INVALID_PAYLOAD', 'Envie um objeto JSON com os campos a alterar.', ctx, 400);
    if (b.codigo_erp != null && String(b.codigo_erp) !== codigo) return erro('VALIDATION_ERROR', 'codigo_erp do corpo difere do caminho; o codigo_erp nao pode ser alterado.', ctx, 400);
    const desconhecidos = Object.keys(b).filter(k => k !== 'codigo_erp' && !CAMPOS_PATCH_PRODUTO.includes(k));
    if (desconhecidos.length) return erro('VALIDATION_ERROR', `Campos nao aceitos no PATCH: ${desconhecidos.join(',')}`, ctx, 400);
    const enviados = Object.keys(b).filter(k => k !== 'codigo_erp');
    if (!enviados.length) return erro('VALIDATION_ERROR', 'Nenhum campo para alterar.', ctx, 400);
    for (const c of ['sku', 'descricao', 'referencia']) if (c in b && (b[c] == null || String(b[c]).trim() === '')) return erro('VALIDATION_ERROR', `${c} nao pode ser vazio.`, ctx, 400);
    const { data: atual } = await ctx.sb.from('produto').select('id,sku,descricao,referencia,marca,preco_custo,peso_variavel,ativo,tipo_controle,tipo_separacao,usa_picking,varios_pickings,parceiro_id,grupo_id').eq('tenant_id', ctx.conn.tenant_id).eq('empresa_id', ctx.conn.empresa_id).eq('codigo_erp', codigo).maybeSingle();
    if (!atual) return erro('NOT_FOUND', `Produto '${codigo}' nao encontrado.`, ctx, 404);
    let pid = atual.parceiro_id, gid = atual.grupo_id;
    if (b.parceiro_codigo_erp) {
        pid = await resolverRefProduto(ctx, 'parceiro', b.parceiro_codigo_erp);
        if (!pid) return erro('VALIDATION_ERROR', `Parceiro '${b.parceiro_codigo_erp}' nao encontrado.`, ctx, 400);
    }
    if (b.grupo_codigo_erp) {
        gid = await resolverRefProduto(ctx, 'grupo_produto', b.grupo_codigo_erp);
        if (!gid) return erro('VALIDATION_ERROR', `Grupo '${b.grupo_codigo_erp}' nao encontrado.`, ctx, 400);
    }
    const v = (c: string) => (c in b ? b[c] : (atual as any)[c]);
    const { data: rows, error } = await ctx.sb.rpc('integracao_upsert_produto', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_sku: v('sku'), p_descricao: v('descricao'), p_referencia: v('referencia'), p_marca: v('marca'),
        p_preco_custo: v('preco_custo'), p_peso_variavel: v('peso_variavel'), p_ativo: v('ativo'),
        p_codigo_erp: codigo,
        p_tipo_controle: v('tipo_controle'), p_tipo_separacao: v('tipo_separacao'),
        p_usa_picking: v('usa_picking'), p_varios_pickings: v('varios_pickings'),
        p_parceiro_id: pid, p_grupo_id: gid,
        p_peso_bruto: b.peso_bruto ?? null, p_peso_liquido: b.peso_liquido ?? null
    });
    if (error) return erro('VALIDATION_ERROR', error.message, ctx, 400);
    const prodId = (extractRpcResult(rows)?.produto_id as string) ?? atual.id;
    let eOk = 0, eErr = 0;
    if (Array.isArray(b.embalagens)) {
        for (const e of b.embalagens) {
            if (!e?.ean || !e?.fator || !e?.embalagem) { eErr++; continue }
            const { error: ee } = await ctx.sb.rpc('integracao_upsert_embalagem', {
                p_tenant_id: ctx.conn.tenant_id, p_empresa_id: ctx.conn.empresa_id, p_produto_id: prodId,
                p_ean: e.ean, p_fator: e.fator, p_embalagem: e.embalagem,
                p_altura: e.altura ?? null, p_largura: e.largura ?? null, p_comprimento: e.comprimento ?? null,
                p_peso_bruto: e.peso_bruto ?? null, p_peso_liq: e.peso_liquido ?? null,
                p_ativo: e.ativo ?? true, p_codigo_erp: e.codigo_erp ?? e.ean
            });
            if (ee) eErr++; else eOk++
        }
    }
    await logSync(ctx, 'produto', 'sucesso', 0, 1, 0);
    return ok({ codigo_erp: codigo, status: 'updated', id: prodId, campos_alterados: enviados, ...(Array.isArray(b.embalagens) ? { embalagens: { processadas: eOk, erros: eErr } } : {}) }, ctx)
}
// v19 (Fase 2): o lote inteiro numa chamada (integracao_gravar_produtos_lote), mesma resposta do item a item.
async function processarProdutosLote(ctx: Ctx, items: unknown[]): Promise < Response > {
    const limite = BATCH_LIMITS['produto'] ?? MAX_BATCH;
    if (!Array.isArray(items) || items.length === 0) return erro('VALIDATION_ERROR', 'Campo items deve ser um array.', ctx, 400);
    if (items.length > limite) return erro('VALIDATION_ERROR', `Max ${limite} itens. Recebido: ${items.length}.`, ctx, 400);
    const { data, error } = await ctx.sb.rpc('integracao_gravar_produtos_lote', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_erp_provedor_id: ctx.conn.erp_provedor_id,
        p_itens: items
    });
    const results = Array.isArray(data) ? data as any[] : null;
    if (error || !results || results.length !== items.length) {
        // A chamada em lote é uma transação só: se falhou, nada foi gravado. Segue item a item.
        console.error('[gw] produtos em lote falhou, seguindo item a item:', error?.message ?? `resultado inesperado (${results?.length ?? 'nulo'})`);
        return processarBatch(ctx, items, 'produto', upsertProduto)
    }
    let created = 0,
        errors = 0;
    for (const r of results) {
        if (r?.status === 'created') created++;
        else if (r?.status === 'error') errors++
    }
    return respostaLote(ctx, 'produto', items.length, results, { created, updated: 0, errors, alreadyProcessed: 0, alreadyExists: 0 })
}
async function handleProdutos(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    if (m === 'GET') {
        if (s[0] && s[0] !== 'batch') {
            const {
                data
            } = await ctx.sb.from('produto').select('*,produto_embalagem(*)').eq('tenant_id', ctx.conn.tenant_id).eq('codigo_erp', s[0]).maybeSingle();
            if (!data) return erro('NOT_FOUND', `Produto '${s[0]}' nao encontrado.`, ctx, 404);
            return ok(data, ctx)
        }
        // v20: paginação opcional (sem limit/cursor/updated_since = listagem legada)
        { const pg = lerPaginacao(ctx); if (pg instanceof Response) return pg; if (pg) return listarPaginado(ctx, 'produto', 'id,codigo_erp,sku,descricao,referencia,marca,tipo_controle,ativo', pg); }
        const {
            data
        } = await ctx.sb.from('produto').select('id,codigo_erp,sku,descricao,referencia,marca,tipo_controle,ativo').eq('tenant_id', ctx.conn.tenant_id).order('descricao').limit(200);
        return ok(data, ctx)
    }
    if (m === 'POST' && s[0] === 'batch') {
        return produtoLoteLigado(ctx) ? processarProdutosLote(ctx, b?.items) : processarBatch(ctx, b?.items, 'produto', upsertProduto)
    }
    if (m === 'PATCH' && s[0] && s[0] !== 'batch' && !s[1]) return patchProduto(s[0], b, ctx);
    if (m === 'POST') {
        const r = await upsertProduto(b, ctx);
        if (r.status === 'error') return erro('VALIDATION_ERROR', r.error!, ctx, 400);
        await logSync(ctx, 'produto', 'sucesso', 1, 0, 0);
        return ok(r, ctx, 201)
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405)
}
async function upsertRota(item: any, ctx: Ctx) {
    if (!item.descricao) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: 'descricao obrigatoria'
    };
    let aid: string | null = null;
    if (item.armazem_codigo_erp) aid = await resolverRefDireto(ctx, 'armazem', item.armazem_codigo_erp);
    if (!aid) {
        const {
            data: a
        } = await ctx.sb.from('armazem').select('id').eq('tenant_id', ctx.conn.tenant_id).eq('ativo', true).limit(1).maybeSingle();
        aid = a?.id ?? null
    }
    if (!aid) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: 'Armazem nao encontrado.'
    };
    const ce = item.codigo_erp ?? item.descricao;
    const {
        data: id,
        error
    } = await ctx.sb.rpc('integracao_upsert_rota', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_armazem_id: aid,
        p_descricao: item.descricao,
        p_codigo_erp: ce,
        p_ativo: item.ativo ?? true
    });
    if (error) return {
        codigo_erp: ce,
        status: 'error',
        error: error.message
    };
    await registrarIdMap(ctx, 'rota', ce, id);
    return {
        codigo_erp: ce,
        status: 'created',
        id
    }
}
async function handleRotas(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    if (m === 'GET') {
        // v20: paginação opcional (sem limit/cursor/updated_since = listagem legada)
        { const pg = lerPaginacao(ctx); if (pg instanceof Response) return pg; if (pg) return listarPaginado(ctx, 'rotas', 'id,codigo_erp,descricao,ativo', pg); }
        const {
            data
        } = await ctx.sb.from('rotas').select('id,codigo_erp,descricao,ativo').eq('tenant_id', ctx.conn.tenant_id).order('descricao').limit(200);
        return ok(data, ctx)
    }
    if (m === 'POST' && s[0] === 'batch') return processarBatch(ctx, b?.items, 'rota', upsertRota);
    if (m === 'POST') {
        const r = await upsertRota(b, ctx);
        if (r.status === 'error') return erro('VALIDATION_ERROR', r.error!, ctx, 400);
        await logSync(ctx, 'rota', 'sucesso', 1, 0, 0);
        return ok(r, ctx, 201)
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405)
}
async function upsertTE(item: any, ctx: Ctx) {
    if (!item.codigo_erp || !item.descricao) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: 'codigo_erp e descricao obrigatorios'
    };
    const {
        data: id,
        error
    } = await ctx.sb.rpc('integracao_upsert_tipo_entrada', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_descricao: item.descricao,
        p_codigo_erp: item.codigo_erp,
        p_ativo: item.ativo ?? true
    });
    if (error) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: error.message
    };
    await registrarIdMap(ctx, 'tipo_entrada', item.codigo_erp, id);
    return {
        codigo_erp: item.codigo_erp,
        status: 'created',
        id
    }
}
async function handleTE(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    if (m === 'GET') {
        // v20: paginação opcional (sem limit/cursor/updated_since = listagem legada)
        { const pg = lerPaginacao(ctx); if (pg instanceof Response) return pg; if (pg) return listarPaginado(ctx, 'tipo_entrada', 'id,codigo_erp,descricao,ativo', pg); }
        const {
            data
        } = await ctx.sb.from('tipo_entrada').select('id,codigo_erp,descricao,ativo').eq('tenant_id', ctx.conn.tenant_id).order('descricao');
        return ok(data, ctx)
    }
    if (m === 'POST' && s[0] === 'batch') return processarBatch(ctx, b?.items, 'tipo_entrada', upsertTE);
    if (m === 'POST') {
        const r = await upsertTE(b, ctx);
        if (r.status === 'error') return erro('VALIDATION_ERROR', r.error!, ctx, 400);
        await logSync(ctx, 'tipo_entrada', 'sucesso', 1, 0, 0);
        return ok(r, ctx, 201)
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405)
}
async function upsertTS(item: any, ctx: Ctx) {
    if (!item.codigo_erp || !item.descricao) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: 'codigo_erp e descricao obrigatorios'
    };
    const {
        data: id,
        error
    } = await ctx.sb.rpc('integracao_upsert_tipo_saida', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_descricao: item.descricao,
        p_codigo_erp: item.codigo_erp,
        p_realiza_conferencia: item.realiza_conferencia ?? true,
        p_conferencia_checkout: item.conferencia_checkout ?? false,
        p_separa_pulmao: item.separa_pulmao ?? false,
        p_ativo: item.ativo ?? true
    });
    if (error) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: error.message
    };
    await registrarIdMap(ctx, 'tipo_saida', item.codigo_erp, id);
    return {
        codigo_erp: item.codigo_erp,
        status: 'created',
        id
    }
}
async function handleTS(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    if (m === 'GET') {
        // v20: paginação opcional (sem limit/cursor/updated_since = listagem legada)
        { const pg = lerPaginacao(ctx); if (pg instanceof Response) return pg; if (pg) return listarPaginado(ctx, 'tipo_saida', 'id,codigo_erp,descricao,realiza_conferencia,conferencia_checkout,separa_pulmao,ativo', pg); }
        const {
            data
        } = await ctx.sb.from('tipo_saida').select('id,codigo_erp,descricao,realiza_conferencia,conferencia_checkout,separa_pulmao,ativo').eq('tenant_id', ctx.conn.tenant_id).order('descricao');
        return ok(data, ctx)
    }
    if (m === 'POST' && s[0] === 'batch') return processarBatch(ctx, b?.items, 'tipo_saida', upsertTS);
    if (m === 'POST') {
        const r = await upsertTS(b, ctx);
        if (r.status === 'error') return erro('VALIDATION_ERROR', r.error!, ctx, 400);
        await logSync(ctx, 'tipo_saida', 'sucesso', 1, 0, 0);
        return ok(r, ctx, 201)
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405)
}
async function processarDocEntrada(item: any, ctx: Ctx): Promise < any > {
    // v10: id_alteracao opcional — ausente = documento original (fluxo v9)
    const alt = lerIdAlteracao(item);
    if (alt.erro) return {
        codigo_erp: item?.codigo_erp ?? '',
        status: 'error',
        error: alt.erro
    };
    if (!alt.presente) return processarDocEntradaInterno(item, ctx, null);
    // v11: grava e compara sempre com o id_alteracao normalizado (texto)
    const itemN = { ...item, id_alteracao: alt.valor! };
    const hash = await hashPayload(itemN);
    const r = await processarDocEntradaInterno(itemN, ctx, { valor: alt.valor!, hash });
    if (r.status === 'error') await registrarRecusaAlteracao(ctx, 'ENTRADA', itemN, alt.valor!, hash, r.error ?? 'erro');
    return r
}
async function processarDocEntradaInterno(item: any, ctx: Ctx, alt: { valor: string; hash: string } | null): Promise < any > {
    const f = ['codigo_erp', 'numero_nota', 'parceiro_codigo_erp', 'tipo_entrada_codigo_erp', 'data_emissao', 'data_entrada', 'valor_total_produtos', 'valor_total_nota'].filter(c => !item[c] && item[c] !== 0);
    if (f.length) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: `Campos ausentes: ${f.join(',')}`
    };
    if (!Array.isArray(item.itens) || item.itens.length === 0) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: 'Array itens obrigatorio.'
    };
    const vend = normalizarVendedor(item.vendedor);
    if (vend.erro) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: vend.erro
    };
    const parcId = await resolverRefDireto(ctx, 'parceiro', item.parceiro_codigo_erp);
    if (!parcId) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: `Parceiro '${item.parceiro_codigo_erp}' nao encontrado.`
    };
    const teId = await resolverRefDireto(ctx, 'tipo_entrada', item.tipo_entrada_codigo_erp);
    if (!teId) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: `Tipo entrada '${item.tipo_entrada_codigo_erp}' nao encontrado.`
    };
    // v13: gravação atômica — cabeçalho + itens + lotes numa única transação
    const cabecalho = {
        codigo_erp: item.codigo_erp,
        parceiro_id: parcId,
        tipo_entrada_id: teId,
        numero_nota: item.numero_nota,
        data_emissao: item.data_emissao,
        data_entrada: item.data_entrada,
        valor_total_produtos: item.valor_total_produtos,
        valor_total_nota: item.valor_total_nota,
        qtd_volume: item.qtd_volume ?? 0,
        status: item.status ?? 0,
        chave_nfe: item.chave_nfe ?? null,
        vendedor: vend.valor
    };
    const { data: rg, error: eg } = await ctx.sb.rpc('integracao_gravar_documento_entrada', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_cabecalho: cabecalho,
        p_itens: item.itens,
        p_id_alteracao: alt ? alt.valor : null,
        p_payload: alt ? item : null,
        p_payload_hash: alt ? alt.hash : null,
        p_request_id: ctx.requestId,
        p_conexao_id: ctx.conn.conexao_id ?? null,
        p_permitir_reenvio_cancelado: ctx.conn.permitir_reenvio_cancelado !== false
    });
    if (eg) return { codigo_erp: item.codigo_erp, ...(alt ? { id_alteracao: alt.valor } : {}), status: 'error', error: eg.message };
    return mapearGravacao(item, ctx, 'documento_entrada', alt, extractRpcResult(rg));
}
async function handleDocEntrada(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    if (m === 'GET') {
        if (s[0] && s[0] !== 'batch') {
            // v10: histórico, lista completa ou documento (original ou ?id_alteracao=N)
            if (s[1] === 'alteracoes') return listarAlteracoes(ctx, 'ENTRADA', s[0]);
            if (ctx.query.get('todos') === 'true') {
                const { data: todos } = await ctx.sb.from('documento_entrada').select('*,documento_entrada_item(*,documento_entrada_item_lote(*))').eq('tenant_id', ctx.conn.tenant_id).eq('codigo_erp', s[0]).neq('status', 99).order('id_alteracao', { ascending: true, nullsFirst: true }).limit(200);
                if (!todos || todos.length === 0) return erro('NOT_FOUND', `Doc '${s[0]}' nao encontrado.`, ctx, 404);
                return ok(todos, ctx)
            }
            const { data, resp } = await resolverDocPorCodigo(ctx, 'documento_entrada', s[0], '*,documento_entrada_item(*,documento_entrada_item_lote(*))');
            if (resp) return resp;
            if (!data) return erro('NOT_FOUND', `Doc '${s[0]}' nao encontrado.`, ctx, 404);
            return ok(data, ctx)
        }
        // v20: paginação opcional (sem limit/cursor/updated_since = listagem legada)
        { const pg = lerPaginacao(ctx); if (pg instanceof Response) return pg; if (pg) return listarPaginado(ctx, 'documento_entrada', 'id,codigo_erp,numero_nota,chave_nfe,status,data_emissao,data_entrada,valor_total_nota,vendedor', pg, true); }
        const {
            data
        } = await ctx.sb.from('documento_entrada').select('id,codigo_erp,numero_nota,chave_nfe,status,data_emissao,data_entrada,valor_total_nota,vendedor').eq('tenant_id', ctx.conn.tenant_id).neq('status', 99).order('data_entrada', {
            ascending: false
        }).limit(100);
        return ok(data, ctx)
    }
    // v6: aceita POST além de PATCH para compatibilidade com clientes Java/Spring
    if ((m === 'PATCH' || m === 'POST') && s[1] === 'delete') {
        if (!b?.usuario_id || !b?.motivo_ocorrencia_id) return erro('VALIDATION_ERROR', 'usuario_id e motivo_ocorrencia_id obrigatorios no body.', ctx, 400);
        const { data: d, resp: rd } = await resolverDocPorCodigo(ctx, 'documento_entrada', s[0], 'id');
        if (rd) return rd;
        if (!d) return erro('NOT_FOUND', `Doc nao encontrado.`, ctx, 404);
        const { data: result, error: rpcErr } = await ctx.sb.rpc('fn_excluir_documento_entrada', {
            p_tenant_id: ctx.conn.tenant_id,
            p_empresa_id: ctx.conn.empresa_id,
            p_documento_entrada_id: d.id,
            p_usuario_id: b.usuario_id,
            p_motivo_ocorrencia_id: b.motivo_ocorrencia_id,
            p_observacao: b.observacao ?? null
        });
        if (rpcErr) return erro('DELETE_ERROR', rpcErr.message, ctx, 500);
        const res = typeof result === 'string' ? JSON.parse(result) : result;
        if (!res?.success) return erro('DELETE_FAILED', res?.message ?? 'Falha ao excluir documento.', ctx, 422);
        await logSync(ctx, 'documento_entrada', 'sucesso', 0, 1, 0);
        return ok({ codigo_erp: s[0], status: 'deleted', ocorrencia_id: res.ocorrencia_id, numero_ocorrencia: res.numero_ocorrencia }, ctx)
    }
    // v6: aceita POST além de PATCH para compatibilidade com clientes Java/Spring
    if ((m === 'PATCH' || m === 'POST') && s[1] === 'cancel') {
        const { data: d, resp: rd } = await resolverDocPorCodigo(ctx, 'documento_entrada', s[0], 'id,status,id_alteracao', true);
        if (rd) return rd;
        if (!d) return erro('NOT_FOUND', `Doc nao encontrado.`, ctx, 404);
        // v8: idempotente — cancelar um documento já cancelado não é erro
        if (d.status === 9) return ok({
            codigo_erp: s[0],
            ...(d.id_alteracao != null ? { id_alteracao: d.id_alteracao } : {}),
            status: 'already_cancelled'
        }, ctx);
        if (d.status > 0) return erro('DOCUMENT_LOCKED', 'Doc ja em processamento.', ctx, 422);
        const { error: ue } = await ctx.sb.from('documento_entrada').update({
            status: 9
        }).eq('id', d.id).eq('tenant_id', ctx.conn.tenant_id);
        if (ue) return erro('CANCEL_ERROR', ue.message, ctx, 500);
        await logSync(ctx, 'documento_entrada', 'sucesso', 0, 1, 0);
        return ok({
            codigo_erp: s[0],
            ...(d.id_alteracao != null ? { id_alteracao: d.id_alteracao } : {}),
            status: 'cancelled'
        }, ctx)
    }
    if (m === 'POST' && s[0] === 'batch') return processarBatch(ctx, b?.items, 'documento_entrada', processarDocEntrada);
    if (m === 'POST') {
        const r = await processarDocEntrada(b, ctx);
        return respostaDocUnico(r, 'documento_entrada', ctx)
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405)
}
async function processarDocSaida(item: any, ctx: Ctx): Promise < any > {
    // v10: id_alteracao opcional — ausente = documento original (fluxo v9)
    const alt = lerIdAlteracao(item);
    if (alt.erro) return {
        codigo_erp: item?.codigo_erp ?? '',
        status: 'error',
        error: alt.erro
    };
    if (!alt.presente) return processarDocSaidaInterno(item, ctx, null);
    // v11: grava e compara sempre com o id_alteracao normalizado (texto)
    const itemN = { ...item, id_alteracao: alt.valor! };
    const hash = await hashPayload(itemN);
    const r = await processarDocSaidaInterno(itemN, ctx, { valor: alt.valor!, hash });
    if (r.status === 'error') await registrarRecusaAlteracao(ctx, 'SAIDA', itemN, alt.valor!, hash, r.error ?? 'erro');
    return r
}
async function processarDocSaidaInterno(item: any, ctx: Ctx, alt: { valor: string; hash: string } | null): Promise < any > {
    const f = ['codigo_erp', 'numero_pedido', 'parceiro_codigo_erp', 'tipo_saida_codigo_erp', 'data_emissao', 'valor_pedido'].filter(c => !item[c] && item[c] !== 0);
    if (f.length) return {
        codigo_erp: item.codigo_erp ?? '',
        status: 'error',
        error: `Campos ausentes: ${f.join(',')}`
    };
    if (!Array.isArray(item.itens) || item.itens.length === 0) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: 'Array itens obrigatorio.'
    };
    const vend = normalizarVendedor(item.vendedor);
    if (vend.erro) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: vend.erro
    };
    const parcId = await resolverRefDireto(ctx, 'parceiro', item.parceiro_codigo_erp);
    if (!parcId) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: `Parceiro nao encontrado.`
    };
    const tsId = await resolverRefDireto(ctx, 'tipo_saida', item.tipo_saida_codigo_erp);
    if (!tsId) return {
        codigo_erp: item.codigo_erp,
        status: 'error',
        error: `Tipo saida nao encontrado.`
    };
    let rId: string | null = null;
    if (item.rota_codigo_erp) rId = await resolverRefDireto(ctx, 'rotas', item.rota_codigo_erp);
    // v13: gravação atômica — cabeçalho + itens numa única transação
    const cabecalho = {
        codigo_erp: item.codigo_erp,
        parceiro_id: parcId,
        tipo_pedido_id: tsId,
        rota_id: rId,
        numero_pedido: item.numero_pedido,
        data_emissao: item.data_emissao,
        valor_pedido: item.valor_pedido,
        observacao: item.observacao ?? null,
        transportador: item.transportador ?? null,
        status: item.status ?? 0,
        vendedor: vend.valor
    };
    const { data: rg, error: eg } = await ctx.sb.rpc('integracao_gravar_documento_saida', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_cabecalho: cabecalho,
        p_itens: item.itens,
        p_id_alteracao: alt ? alt.valor : null,
        p_payload: alt ? item : null,
        p_payload_hash: alt ? alt.hash : null,
        p_request_id: ctx.requestId,
        p_conexao_id: ctx.conn.conexao_id ?? null,
        p_permitir_reenvio_cancelado: ctx.conn.permitir_reenvio_cancelado !== false
    });
    if (eg) return { codigo_erp: item.codigo_erp, ...(alt ? { id_alteracao: alt.valor } : {}), status: 'error', error: eg.message };
    return mapearGravacao(item, ctx, 'documento_saida', alt, extractRpcResult(rg));
}
// v17: fluxo v1 preservado para reversão por conexão (config_extra.cancelamento_saida_v2 = false)
async function cancelarSaidaV1(ctx: Ctx, codigo: string, dc: any): Promise < Response > {
    const { data: result, error: rpcErr } = await ctx.sb.rpc('fn_cancelar_documento_saida_bkp_20261020', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_documento_saida_id: dc.id,
        p_codigo_erp: null,
        p_solicitado_por: 'API_ERP'
    });
    if (rpcErr) return erro('CANCEL_ERROR', rpcErr.message, ctx, 500);
    const res: any = typeof result === 'string' ? JSON.parse(result) : result;
    if (!res) return erro('CANCEL_ERROR', 'Resposta vazia da RPC.', ctx, 500);
    const extra = dc.id_alteracao != null ? { id_alteracao: dc.id_alteracao } : {};
    if (res.status === 'already_cancelled') {
        return json({ success: true, data: { codigo_erp: codigo, ...extra, ...res, success: true }, metadata: { request_id: ctx.requestId, timestamp: new Date().toISOString(), processing_ms: Date.now() - ctx.t0 } }, 200)
    }
    let code: number;
    if (res.status === 'cancelled') code = 200;
    else if (res.status === 'cancellation_in_progress' && res.success) code = 202;
    else if (res.status === 'cancellation_pending_approval') code = 202;
    else if (res.status === 'not_found') code = 404;
    else if (res.status === 'error') code = 500;
    else if (!res.success) code = 422;
    else code = 200;
    if (res.success) await logSync(ctx, 'documento_saida', 'sucesso', 0, 1, 0);
    else await logSync(ctx, 'documento_saida', 'erro', 0, 0, 1, res.message);
    return json({ success: res.success, data: { codigo_erp: codigo, ...extra, ...res }, metadata: { request_id: ctx.requestId, timestamp: new Date().toISOString(), processing_ms: Date.now() - ctx.t0 } }, code)
}
// v22: alterações de documento de saída resolvidas pelo WMS
const HTTP_ALTERACAO: Record < string, number > = {
    applied: 200, already_processed: 200, simulated: 200, pending: 202,
    conflict: 409, stale_analysis: 409, not_found: 404, invalid: 422, closed: 422, configuration_error: 422, error: 500
};
function respostaAlteracao(res: any, ctx: Ctx): Response {
    const st = String(res?.status ?? 'error');
    const http = HTTP_ALTERACAO[st] ?? 500;
    if (http >= 400) {
        const codigo = String(res?.codigo ?? (st === 'error' ? 'INTERNAL_ERROR' : st === 'configuration_error' ? 'CONFIGURACAO_INCOMPLETA' : st.toUpperCase()));
        const detalhes = Array.isArray(res?.detalhes) ? res.detalhes : undefined;
        return erro(codigo, String(res?.mensagem ?? 'Falha ao processar a alteração.'), ctx, http, detalhes);
    }
    const { status, ...resto } = res ?? {};
    return ok({ status, ...resto }, ctx, http);
}
function normalizarItensAlteracao(b: any): { itens?: any[]; erro?: string } {
    if (!Array.isArray(b?.itens) || b.itens.length === 0) return { erro: 'itens deve ser uma lista não vazia.' };
    if (b.itens.length > 500) return { erro: 'Máximo de 500 itens por alteração.' };
    const itens = b.itens.map((i: any) => ({
        codigo_erp_produto: i?.codigo_erp_produto ?? i?.produto_codigo_erp ?? i?.codigo_produto ?? i?.sku ?? null,
        quantidade: i?.quantidade
    }));
    if (itens.some((i: any) => !i.codigo_erp_produto)) return { erro: 'Cada item precisa de codigo_erp_produto.' };
    if (itens.some((i: any) => i.quantidade === null || i.quantidade === undefined || isNaN(Number(i.quantidade)))) {
        return { erro: 'Cada item precisa de quantidade numérica.' };
    }
    return { itens: itens.map((i: any) => ({ ...i, quantidade: Number(i.quantidade) })) };
}
async function handleAlteracoesSaida(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    const codigo = s[0];
    const tid = ctx.conn.tenant_id, eid = ctx.conn.empresa_id;
    if (m === 'GET' && s[1] === 'posicao') {
        const { data, error } = await ctx.sb.rpc('fn_posicao_os', { p_tenant_id: tid, p_empresa_id: eid, p_codigo_erp: codigo });
        if (error) return erro('POSICAO_ERROR', error.message, ctx, 500);
        const res = extractRpcResult(data) as any;
        if (!res?.sucesso) return erro(String(res?.codigo ?? 'NOT_FOUND'), String(res?.mensagem ?? 'Documento não encontrado.'), ctx, 404);
        const { sucesso, ...resto } = res;
        return ok(resto, ctx);
    }
    if (m === 'GET' && s[1] === 'alteracoes' && s[2]) {
        const { data, error } = await ctx.sb.rpc('fn_consultar_alteracao_saida', { p_tenant_id: tid, p_empresa_id: eid, p_codigo_erp: codigo, p_id_alteracao: decodeURIComponent(s[2]) });
        if (error) return erro('CONSULTA_ERROR', error.message, ctx, 500);
        const res = extractRpcResult(data) as any;
        if (!res?.sucesso) return erro(String(res?.codigo ?? 'NOT_FOUND'), String(res?.mensagem ?? 'Alteração não encontrada.'), ctx, 404);
        const { sucesso, ...resto } = res;
        return ok(resto, ctx);
    }
    if (m === 'POST' && (s[1] === 'alteracoes' || s[1] === 'devolucoes')) {
        const simular = s[1] === 'alteracoes' && s[2] === 'simular';
        if (s[1] === 'alteracoes' && s[2] && !simular) return erro('ROUTE_NOT_FOUND', `Rota nao encontrada: POST alteracoes/${s[2]}`, ctx, 404);
        const n = normalizarItensAlteracao(b);
        if (n.erro) return erro('VALIDATION_ERROR', n.erro, ctx, 400);
        let idAlt: string | null = null;
        if (!simular) {
            const ia = normalizarIdAlteracao(b?.id_alteracao);
            if (ia.erro || !ia.valor) return erro('VALIDATION_ERROR', ia.erro ?? 'id_alteracao obrigatorio.', ctx, 400);
            idAlt = ia.valor;
        }
        const modo = typeof b?.modo === 'string' ? b.modo : null;
        if (modo && !['delta', 'quantidade_final'].includes(modo)) return erro('VALIDATION_ERROR', 'modo deve ser delta ou quantidade_final.', ctx, 400);
        const { data, error } = await ctx.sb.rpc('fn_alterar_documento_saida', {
            p_tenant_id: tid, p_empresa_id: eid, p_codigo_erp: codigo, p_id_alteracao: idAlt, p_itens: n.itens,
            p_modo: modo, p_simular: simular, p_hash_analise: typeof b?.hash_analise === 'string' ? b.hash_analise : null,
            p_request_id: ctx.requestId, p_somente_devolucao: s[1] === 'devolucoes'
        });
        if (error) {
            await logSync(ctx, 'documento_saida', 'erro', 0, 0, 1, `${codigo} ALTERACAO_ERROR: ${error.message}`.slice(0, 1000));
            return erro('ALTERACAO_ERROR', error.message, ctx, 500);
        }
        const res = extractRpcResult(data) as any;
        if (!simular) {
            const st = String(res?.status ?? 'error');
            if (st === 'applied') await logSync(ctx, 'documento_saida', 'sucesso', 0, 1, 0);
            else if ((HTTP_ALTERACAO[st] ?? 500) >= 400) await logSync(ctx, 'documento_saida', 'erro', 0, 0, 1, `${codigo} ${res?.codigo ?? st}: ${res?.mensagem ?? ''}`.slice(0, 1000));
        }
        return respostaAlteracao(res, ctx);
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405);
}

async function handleDocSaida(m: string, s: string[], ctx: Ctx, b: any): Promise < Response > {
    // v17: status do cancelamento a partir da auditoria (documento_saida_cancelamento) e das PED-CAN
    if (m === 'GET' && s[1] === 'cancel-status') {
        const { data: d, resp: rd } = await resolverDocPorCodigo(ctx, 'documento_saida', s[0], 'id,status,numero_pedido,cancelamento_solicitado_em,cancelamento_origem,id_alteracao');
        if (rd) return rd;
        if (!d) return erro('NOT_FOUND', 'Doc nao encontrado.', ctx, 404);
        const tid = ctx.conn.tenant_id;

        const { data: hist } = await ctx.sb.from('documento_saida_cancelamento')
            .select('id,resultado,codigo_recusa,mensagem,origem,estagio,numero_onda,status_retirada,retirada_concluida_em,created_at')
            .eq('tenant_id', tid).eq('documento_saida_id', d.id)
            .order('created_at', { ascending: false }).limit(50);
        const historico: any[] = hist ?? [];
        const ultimoCancel = historico.find((h) => h.resultado === 'CANCELADO');
        const ultimaRecusa = historico.find((h) => h.resultado === 'RECUSADO');
        const recusadas = historico.filter((h) => h.resultado === 'RECUSADO').length;

        let cancelStatus = 'not_requested';
        if (d.status === 9) cancelStatus = 'cancelled';
        else if (d.status === 8) cancelStatus = 'cancellation_in_progress';
        else if (ultimaRecusa) cancelStatus = 'rejected';

        let itens: any[] = [];
        if (ultimoCancel) {
            const { data: tp } = await ctx.sb.from('tipo_tarefa').select('id').eq('tenant_id', tid).eq('codigo', 'PED-CAN').limit(1).maybeSingle();
            if (tp?.id) {
                const { data: tarefas } = await ctx.sb.from('tarefa')
                    .select('id,status,produto_id,quantidade_requerida,concluido_em')
                    .eq('tenant_id', tid).eq('cancelamento_documento_id', ultimoCancel.id).eq('tipo_tarefa_id', tp.id);
                const lista: any[] = tarefas ?? [];
                const prodIds = [...new Set(lista.map((t) => t.produto_id).filter(Boolean))];
                const skus: Record<string, string> = {};
                if (prodIds.length > 0) {
                    const { data: prods } = await ctx.sb.from('produto').select('id,sku').eq('tenant_id', tid).in('id', prodIds);
                    for (const p of prods ?? []) skus[(p as any).id] = (p as any).sku;
                }
                itens = lista.map((t) => ({ sku: skus[t.produto_id] ?? null, quantidade: t.quantidade_requerida, status: t.status, concluido_em: t.concluido_em }));
            }
        }
        const total = itens.length;
        const concluidas = itens.filter((i) => i.status === 'CONCLUIDA').length;

        return ok({
            codigo_erp: s[0],
            ...(d.id_alteracao != null ? { id_alteracao: d.id_alteracao } : {}),
            numero_pedido: d.numero_pedido,
            status: cancelStatus,
            cancelamento_id: ultimoCancel?.id ?? null,
            estagio_encontrado: ultimoCancel?.estagio ?? null,
            onda_numero: ultimoCancel?.numero_onda ?? null,
            solicitado_em: d.cancelamento_solicitado_em,
            origem: d.cancelamento_origem,
            retirada_fisica: {
                status: ultimoCancel?.status_retirada ?? 'NAO_APLICAVEL',
                total_tarefas: total,
                concluidas,
                pendentes: total - concluidas,
                percentual: total > 0 ? Math.round((concluidas / total) * 100) : (d.status === 9 ? 100 : 0),
                concluida_em: ultimoCancel?.retirada_concluida_em ?? null,
                itens
            },
            tentativas_recusadas: recusadas,
            ...(cancelStatus === 'rejected' ? { codigo_recusa: ultimaRecusa?.codigo_recusa, mensagem_recusa: ultimaRecusa?.mensagem } : {})
        }, ctx)
    }
    // v22: posição, alterações, simulação e devoluções
    if (s[0] && s[0] !== 'batch' && (s[1] === 'posicao' || s[1] === 'devolucoes' || (s[1] === 'alteracoes' && (m === 'POST' || s[2])))) {
        return handleAlteracoesSaida(m, s, ctx, b);
    }
    if (m === 'GET') {
        if (s[0] && s[0] !== 'batch') {
            // v10: histórico, lista completa ou documento (original ou ?id_alteracao=N)
            if (s[1] === 'alteracoes') return listarAlteracoes(ctx, 'SAIDA', s[0]);
            if (ctx.query.get('todos') === 'true') {
                const { data: todos } = await ctx.sb.from('documento_saida').select('*,documento_saida_item(*)').eq('tenant_id', ctx.conn.tenant_id).eq('codigo_erp', s[0]).neq('status', 99).order('id_alteracao', { ascending: true, nullsFirst: true }).limit(200);
                if (!todos || todos.length === 0) return erro('NOT_FOUND', `Doc nao encontrado.`, ctx, 404);
                return ok(todos, ctx)
            }
            const { data, resp } = await resolverDocPorCodigo(ctx, 'documento_saida', s[0], '*,documento_saida_item(*)');
            if (resp) return resp;
            if (!data) return erro('NOT_FOUND', `Doc nao encontrado.`, ctx, 404);
            return ok(data, ctx)
        }
        // v20: paginação opcional (sem limit/cursor/updated_since = listagem legada)
        { const pg = lerPaginacao(ctx); if (pg instanceof Response) return pg; if (pg) return listarPaginado(ctx, 'documento_saida', 'id,codigo_erp,numero_pedido,status,data_emissao,valor_pedido,transportador,vendedor', pg, true); }
        const {
            data
        } = await ctx.sb.from('documento_saida').select('id,codigo_erp,numero_pedido,status,data_emissao,valor_pedido,transportador,vendedor').eq('tenant_id', ctx.conn.tenant_id).neq('status', 99).order('data_emissao', {
            ascending: false
        }).limit(100);
        return ok(data, ctx)
    }
    // v6: aceita POST além de PATCH para compatibilidade com clientes Java/Spring
    if ((m === 'PATCH' || m === 'POST') && s[1] === 'delete') {
        if (!b?.usuario_id || !b?.motivo_ocorrencia_id) return erro('VALIDATION_ERROR', 'usuario_id e motivo_ocorrencia_id obrigatorios no body.', ctx, 400);
        const { data: d, resp: rd } = await resolverDocPorCodigo(ctx, 'documento_saida', s[0], 'id');
        if (rd) return rd;
        if (!d) return erro('NOT_FOUND', 'Doc nao encontrado.', ctx, 404);
        const { data: result, error: rpcErr } = await ctx.sb.rpc('fn_excluir_documento_saida', {
            p_tenant_id: ctx.conn.tenant_id,
            p_empresa_id: ctx.conn.empresa_id,
            p_documento_saida_id: d.id,
            p_usuario_id: b.usuario_id,
            p_motivo_ocorrencia_id: b.motivo_ocorrencia_id,
            p_observacao: b.observacao ?? null
        });
        if (rpcErr) return erro('DELETE_ERROR', rpcErr.message, ctx, 500);
        const res = typeof result === 'string' ? JSON.parse(result) : result;
        if (!res?.success) return erro('DELETE_FAILED', res?.message ?? 'Falha ao excluir documento.', ctx, 422);
        await logSync(ctx, 'documento_saida', 'sucesso', 0, 1, 0);
        return ok({ codigo_erp: s[0], status: 'deleted', ocorrencia_id: res.ocorrencia_id, numero_ocorrencia: res.numero_ocorrencia }, ctx)
    }
    // v17: cancelamento v2 (reversão por conexão: config_extra.cancelamento_saida_v2 = false -> v1)
    if ((m === 'PATCH' || m === 'POST') && s[1] === 'cancel') {
        const { data: dc, resp: rdc } = await resolverDocPorCodigo(ctx, 'documento_saida', s[0], 'id,id_alteracao', true);
        if (rdc) return rdc;
        if (!dc) return erro('NOT_FOUND', 'Doc nao encontrado.', ctx, 404);
        if ((ctx.conn.config_extra as any)?.cancelamento_saida_v2 === false) return cancelarSaidaV1(ctx, s[0], dc);

        const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null);
        const rpcCancel = (ctx.conn.config_extra as any)?.cancelamento_saida_v3 === false ? 'fn_cancelar_documento_saida' : 'fn_cancelar_documento_saida_v3';
        const { data: result, error: rpcErr } = await ctx.sb.rpc(rpcCancel, {
            p_tenant_id: ctx.conn.tenant_id,
            p_empresa_id: ctx.conn.empresa_id,
            p_documento_saida_id: dc.id,
            p_codigo_erp: null,
            p_solicitado_por: 'API_ERP',
            p_motivo: texto(b?.motivo, 500),
            p_solicitante: texto(b?.solicitado_por, 150),
            p_request_id: ctx.requestId,
            p_conexao_id: ctx.conn.conexao_id ?? null,
            p_idempotency_key: ctx.idempotencyKey ?? null
        });
        if (rpcErr) {
            await logSync(ctx, 'documento_saida', 'erro', 0, 0, 1, `${s[0]} CANCEL_ERROR: ${rpcErr.message}`);
            return erro('CANCEL_ERROR', rpcErr.message, ctx, 500);
        }
        const res = extractRpcResult(result);
        if (!res) return erro('CANCEL_ERROR', 'Resposta vazia da RPC.', ctx, 500);

        const st = String(res.status ?? 'error');
        const httpPorStatus: Record < string, number > = {
            cancelled: 200, already_cancelled: 200, cancellation_in_progress: 200,
            not_found: 404, retry_later: 409, cancellation_rejected: 422, configuration_error: 422, error: 500
        };
        const http = httpPorStatus[st] ?? 500;
        const sucesso = http === 200;
        const codigoErro = st === 'retry_later' ? 'RETRY_LATER'
            : st === 'configuration_error' ? 'CONFIGURACAO_INCOMPLETA'
            : st === 'not_found' ? 'NOT_FOUND'
            : st === 'error' ? 'INTERNAL_ERROR'
            : String(res.codigo ?? 'CANCELAMENTO_NAO_PERMITIDO');

        if (st === 'cancelled') await logSync(ctx, 'documento_saida', 'sucesso', 0, 1, 0);
        else if (!sucesso) await logSync(ctx, 'documento_saida', 'erro', 0, 0, 1, `${s[0]} ${codigoErro}: ${res.message ?? ''}`.slice(0, 1000));

        const corpo: ApiResponse = {
            success: sucesso,
            data: { codigo_erp: s[0], ...(dc.id_alteracao != null ? { id_alteracao: dc.id_alteracao } : {}), ...res, success: sucesso },
            metadata: { request_id: ctx.requestId, timestamp: new Date().toISOString(), processing_ms: Date.now() - ctx.t0 }
        };
        if (!sucesso) corpo.error = { code: codigoErro, message: String(res.message ?? 'Falha ao cancelar o documento.') };
        const headers: Record < string, string > = { ...CORS };
        if (st === 'retry_later') headers['Retry-After'] = String(Math.max(1, Math.ceil(Number(res.retry_after_ms ?? 3000) / 1000)));
        return new Response(JSON.stringify(corpo), { status: http, headers });
    }
    if (m === 'POST' && s[0] === 'batch') return processarBatch(ctx, b?.items, 'documento_saida', processarDocSaida);
    if (m === 'POST') {
        const r = await processarDocSaida(b, ctx);
        return respostaDocUnico(r, 'documento_saida', ctx)
    }
    return erro('METHOD_NOT_ALLOWED', 'Metodo nao suportado.', ctx, 405)
}

function handleHealth(rid: string): Response {
    return json({
        success: true,
        data: {
            service: 'CORE LogiTrack Integration Gateway',
            version: VERSAO_GATEWAY,
            status: 'operational',
            endpoints: {
                'master-data': ['parceiros', 'grupos', 'subgrupos', 'produtos', 'rotas', 'tipos-entrada', 'tipos-saida'],
                'movements': ['documentos-entrada', 'documentos-saida']
            }
        },
        metadata: {
            request_id: rid,
            timestamp: new Date().toISOString()
        }
    })
}

function parsePath(url: string): string[] {
    const u = new URL(url);
    const p = u.pathname.split('/').filter(Boolean);
    const i = p.findIndex(x => x.startsWith('integration-gateway')); // v13: aceita slug de homologação
    return i >= 0 ? p.slice(i + 1) : p
}
async function route(m: string, p: string[], ctx: Ctx, b: any): Promise < Response > {
    const a = p[0],
        e = p[1],
        r = p.slice(2);
    if (a === 'master-data') {
        switch (e) {
            case 'parceiros':
                return handleParceiros(m, r, ctx, b);
            case 'grupos':
                return handleGrupos(m, r, ctx, b);
            case 'subgrupos':
                return handleSubgrupos(m, r, ctx, b);
            case 'produtos':
                return handleProdutos(m, r, ctx, b);
            case 'rotas':
                return handleRotas(m, r, ctx, b);
            case 'tipos-entrada':
                return handleTE(m, r, ctx, b);
            case 'tipos-saida':
                return handleTS(m, r, ctx, b)
        }
    }
    if (a === 'movements') {
        switch (e) {
            case 'documentos-entrada':
                return handleDocEntrada(m, r, ctx, b);
            case 'documentos-saida':
                return handleDocSaida(m, r, ctx, b)
        }
    }
    return erro('ROUTE_NOT_FOUND', `Rota nao encontrada: ${m} /${p.join('/')}`, ctx, 404)
}
// ---------------- v18: registro de erros da API ----------------
interface Captura {
    rid: string;
    t0: number;
    metodo: string;
    path: string[];
    url: URL;
    userAgent: string | null;
    ip: string | null;
    requestIdCliente: string | null;
    chaveApi: string | null;
    conn: Conexao | null;
    sb: SupabaseClient | null;
    corpoTexto: string | null;
    corpo: any;
    rl ? : RateInfo | null;
}
const PAYLOAD_MAX_ENVIO = 70000; // a RPC trunca em 64 KB; isto só evita mandar corpos enormes ao banco
const MAX_ITENS_LOTE_REGISTRO = 200;

async function sha256Hex(texto: string): Promise < string > {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function emSegundoPlano(p: Promise < unknown > ) {
    const er = (globalThis as any).EdgeRuntime;
    const seguro = p.catch((e) => console.error('[gw] registro erro api:', e));
    if (er && typeof er.waitUntil === 'function') er.waitUntil(seguro);
}
function registroDesligado(): boolean {
    return (Deno.env.get('API_ERRO_REGISTRO') ?? '').toLowerCase() === 'off';
}
function acaoDaRota(metodo: string, p: string[]): string {
    const r = p.slice(2);
    if (metodo === 'GET') return 'consultar';
    if (r[1] === 'cancel') return 'cancelar';
    if (r[1] === 'delete') return 'excluir';
    if (r[1] === 'alteracoes') return r[2] === 'simular' ? 'simular' : 'alterar';
    if (r[1] === 'devolucoes') return 'devolver';
    if (metodo === 'POST' && r[0] === 'batch') return 'lote';
    if (metodo === 'POST') return 'criar';
    return 'outro';
}
function textoOuNull(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}
async function capturarErro(cap: Captura, resp: Response): Promise < void > {
    const status = resp.status;
    const caminho = '/' + cap.path.join('/') + (cap.url.search ?? '');

    // 401: tabela de plataforma (tenant desconhecido); a chave nunca é gravada
    if (status === 401) {
        const sb = cap.sb ?? createClient(Deno.env.get('SUPABASE_URL') !, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') !);
        let codigo = 'AUTH_INVALID';
        try { codigo = (await resp.json())?.error?.code ?? codigo } catch {}
        const { error } = await sb.rpc('integracao_registrar_erro_autenticacao', {
            p_registro: {
                request_id: cap.rid,
                metodo: cap.metodo,
                caminho,
                codigo_erro: codigo,
                chave_hash: cap.chaveApi ? await sha256Hex(cap.chaveApi) : null,
                chave_prefixo: cap.chaveApi ? cap.chaveApi.slice(0, 4) : null,
                user_agent: cap.userAgent,
                ip_origem: cap.ip
            }
        });
        if (error) console.error('[gw] registro 401:', error.message);
        return;
    }
    if (!cap.conn || !cap.sb) return;
    const extra = (cap.conn.config_extra ?? {}) as Record < string, unknown > ;
    if (extra.registrar_erros_api === false) return;
    const comPayload = extra.registrar_payload_erro !== false;

    let corpoResp: any = null;
    try { corpoResp = await resp.json() } catch {}

    const base = {
        request_id: cap.rid,
        metodo: cap.metodo,
        caminho,
        grupo: cap.path[0] ?? null,
        entidade: cap.path[1] ?? null,
        acao: acaoDaRota(cap.metodo, cap.path),
        user_agent: cap.userAgent,
        ip_origem: cap.ip,
        duracao_ms: Date.now() - cap.t0,
        versao_gateway: VERSAO_GATEWAY
    };
    const gravar = async (registro: Record < string, unknown > ) => {
        const { data, error } = await cap.sb!.rpc('integracao_registrar_erro_api', {
            p_tenant_id: cap.conn!.tenant_id,
            p_empresa_id: cap.conn!.empresa_id,
            p_conexao_id: cap.conn!.conexao_id ?? null,
            p_registro: registro
        });
        if (error) console.error('[gw] registro erro api:', error.message);
        else if (data && (data as any).gravado === false) console.error('[gw] registro erro api recusado:', (data as any).motivo);
    };

    // 207: um registro por item com erro, com o item enviado como payload
    if (status === 207) {
        const results: any[] = Array.isArray(corpoResp?.data?.results) ? corpoResp.data.results : [];
        const enviados: any[] = Array.isArray(cap.corpo?.items) ? cap.corpo.items : [];
        const comErro = results
            .map((r, i) => ({ r, i }))
            .filter(x => x.r?.status === 'error' || x.r?.status === 'id_alteracao_conflict')
            .slice(0, MAX_ITENS_LOTE_REGISTRO);
        const registros = comErro.map(({ r, i }) => {
            const enviado = enviados[i];
            return {
                ...base,
                item_indice: i,
                http_status: 207,
                codigo_erp: textoOuNull(r.codigo_erp ?? enviado?.codigo_erp),
                id_alteracao: textoOuNull(r.id_alteracao ?? enviado?.id_alteracao),
                codigo_erro: r.status === 'id_alteracao_conflict' ? 'ID_ALTERACAO_CONFLICT' : (r.code ?? 'ITEM_ERROR'),
                mensagem: r.error ?? null,
                detalhes: {
                    ...(r.details ? { itens: r.details } : {}),
                    ...(r.itens ? { resumo_itens: r.itens } : {}),
                    lote_total: enviados.length,
                    ...(cap.requestIdCliente ? { request_id_cliente: cap.requestIdCliente } : {})
                },
                payload: comPayload && enviado !== undefined ? enviado : null
            };
        });
        for (let k = 0; k < registros.length; k += 10) await Promise.all(registros.slice(k, k + 10).map(gravar));
        return;
    }

    // >= 400: um registro para a requisição
    const err = corpoResp?.error ?? {};
    const r = cap.path.slice(2);
    const codigoErp = r[0] && r[0] !== 'batch' ? r[0] : (Array.isArray(cap.corpo?.items) ? null : cap.corpo?.codigo_erp);
    const idAlt = cap.url.searchParams.get('id_alteracao') ?? cap.corpo?.id_alteracao ?? corpoResp?.data?.id_alteracao;
    let payload: unknown = null, bytes: number | null = null, hash: string | null = null;
    if (cap.corpoTexto != null && cap.corpoTexto !== '') {
        bytes = new TextEncoder().encode(cap.corpoTexto).length;
        hash = await sha256Hex(cap.corpoTexto);
        if (comPayload) payload = cap.corpo != null && cap.corpoTexto.length <= PAYLOAD_MAX_ENVIO ? cap.corpo : cap.corpoTexto.slice(0, PAYLOAD_MAX_ENVIO);
    }
    const dadosResp = corpoResp?.data && typeof corpoResp.data === 'object' && !Array.isArray(corpoResp.data) ? corpoResp.data : null;
    await gravar({
        ...base,
        http_status: status,
        codigo_erp: textoOuNull(codigoErp),
        id_alteracao: textoOuNull(idAlt),
        codigo_erro: err.code ?? `HTTP_${status}`,
        mensagem: err.message ?? null,
        detalhes: {
            ...(err.details ? { itens: err.details } : {}),
            ...(dadosResp ? { resposta: dadosResp } : {}),
            ...(resp.headers.get('retry-after') ? { retry_after: resp.headers.get('retry-after') } : {}),
            ...(cap.requestIdCliente ? { request_id_cliente: cap.requestIdCliente } : {})
        },
        payload,
        payload_bytes: bytes,
        payload_hash: hash
    });
}
// ---------------- fim v18 ----------------


// ---------------- v20: Idempotency-Key genérica ----------------
const IDEM_RESPOSTA_MAX = 256 * 1024;
async function comIdempotencia(metodo: string, path: string[], ctx: Ctx, body: any, cap: Captura): Promise < Response > {
    const rota = '/' + path.join('/') + (cap.url.search ?? '');
    const hash = await sha256Hex(jsonEstavel(body ?? null));
    const { data: res, error } = await ctx.sb.rpc('integracao_idempotencia_reservar', {
        p_tenant_id: ctx.conn.tenant_id,
        p_empresa_id: ctx.conn.empresa_id,
        p_conexao_id: ctx.conn.conexao_id,
        p_chave: ctx.idempotencyKey,
        p_metodo: metodo,
        p_rota: rota,
        p_payload_hash: hash,
        p_request_id: ctx.requestId
    });
    if (error || !res) {
        console.error('[gw] idempotencia indisponível, processando sem controle:', error?.message);
        return await route(metodo, path, ctx, body);
    }
    const estado = (res as any).estado;
    if (estado === 'concluido') {
        const original = (res as any).resposta_texto ?? JSON.stringify((res as any).resposta);
        const r = new Response(original, { status: (res as any).status_http ?? 200, headers: CORS });
        r.headers.set('Idempotent-Replayed', 'true');
        return r;
    }
    if (estado === 'conflito') {
        return erro('IDEMPOTENCY_KEY_REUSED', `Idempotency-Key ja usada em 24 h com outro conteudo ou rota (${(res as any).rota_original}). Gere uma chave nova para uma operacao nova.`, ctx, 422);
    }
    if (estado === 'em_andamento') {
        const r = erro('RETRY_LATER', 'Requisicao com esta Idempotency-Key ainda em processamento.', ctx, 409);
        r.headers.set('Retry-After', '2');
        return r;
    }
    // novo: processa e guarda a resposta
    const id = (res as any).id;
    let resp: Response;
    try {
        resp = await route(metodo, path, ctx, body);
    } catch (e) {
        await ctx.sb.rpc('integracao_idempotencia_liberar', { p_id: id, p_tenant_id: ctx.conn.tenant_id });
        throw e;
    }
    try {
        if (resp.status >= 500) {
            await ctx.sb.rpc('integracao_idempotencia_liberar', { p_id: id, p_tenant_id: ctx.conn.tenant_id });
        } else {
            const texto = await resp.clone().text();
            if (texto.length <= IDEM_RESPOSTA_MAX) {
                await ctx.sb.rpc('integracao_idempotencia_concluir', { p_id: id, p_tenant_id: ctx.conn.tenant_id, p_status_http: resp.status, p_resposta_texto: texto });
            } else {
                await ctx.sb.rpc('integracao_idempotencia_liberar', { p_id: id, p_tenant_id: ctx.conn.tenant_id });
            }
        }
    } catch (e) {
        console.error('[gw] idempotencia: falha ao guardar resposta', e);
    }
    return resp;
}
// ---------------- fim v20 idempotência ----------------

async function atender(req: Request, cap: Captura): Promise < Response > {
    const rid = cap.rid, t0 = cap.t0, path = cap.path;
    if (path.length === 0 || (path.length === 1 && path[0] === 'health')) return handleHealth(rid);
    const ak = req.headers.get('x-api-key');
    cap.chaveApi = ak;
    if (!ak) return erroSimples('AUTH_MISSING', 'Header x-api-key ausente.', rid, 401);
    const sb = createClient(Deno.env.get('SUPABASE_URL') !, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') !);
    cap.sb = sb;
    // v20: autentica e conta a chamada numa única RPC; qualquer falha nela volta ao caminho da v19
    let cx: any[] | null = null, ae: unknown = null;
    {
        const r = await sb.rpc('integracao_autenticar_api', { p_chave: ak });
        if (r.error) {
            console.error('[gw] integracao_autenticar_api indisponível, usando resolver_webhook:', r.error?.message);
            const r0 = await sb.rpc('integracao_resolver_webhook', { p_webhook_secret: ak });
            cx = r0.data; ae = r0.error;
        } else {
            cx = r.data; ae = null;
        }
    }
    if (ae || !cx || cx.length === 0) return erroSimples('AUTH_INVALID', 'x-api-key invalida.', rid, 401);
    const conn: Conexao = cx[0];
    cap.conn = conn;
    const lin: any = cx[0];
    if (lin.rl_modo && lin.rl_modo !== 'desligado' && typeof lin.rl_limite === 'number') {
        cap.rl = {
            limite: lin.rl_limite,
            usado: Number(lin.rl_usado ?? 0),
            resetEm: Math.ceil(Date.parse(lin.rl_reset_em) / 1000),
            modo: lin.rl_modo
        };
        if (cap.rl.modo === 'aplicar' && cap.rl.usado > cap.rl.limite) {
            const espera = Math.max(1, cap.rl.resetEm - Math.floor(Date.now() / 1000));
            const r429 = erroSimples('RATE_LIMITED', `Limite de ${cap.rl.limite} requisicoes por minuto excedido. Tente novamente em ${espera} s.`, rid, 429);
            r429.headers.set('Retry-After', String(espera));
            return r429;
        }
    }
    let body: any = null;
    if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
        // v17: corpo vazio aceito apenas no cancelamento (motivo é opcional)
        let texto = '';
        try {
            texto = await req.text()
        } catch {
            return erroSimples('INVALID_PAYLOAD', 'Corpo da requisicao ilegivel.', rid, 400)
        }
        cap.corpoTexto = texto;
        if (texto.trim() !== '') {
            try {
                body = JSON.parse(texto)
            } catch {
                return erroSimples('INVALID_PAYLOAD', 'JSON invalido.', rid, 400)
            }
        } else if (path[path.length - 1] !== 'cancel') {
            return erroSimples('INVALID_PAYLOAD', 'JSON invalido.', rid, 400)
        }
        cap.corpo = body;
    }
    // v17: Idempotency-Key opcional
    const idemRaw = req.headers.get('idempotency-key');
    const idempotencyKey = idemRaw && idemRaw.trim() !== '' ? idemRaw.trim() : null;
    if (idempotencyKey && idempotencyKey.length > 100) return erroSimples('VALIDATION_ERROR', 'Idempotency-Key excede 100 caracteres.', rid, 400);
    const ctx: Ctx = {
        sb,
        conn,
        requestId: rid,
        t0,
        query: cap.url.searchParams,
        idempotencyKey
    };
    try {
        // v20: Idempotency-Key genérica (o cancelamento de saída segue com a idempotência da própria RPC)
        const ehCancelSaida = path[1] === 'documentos-saida' && path[path.length - 1] === 'cancel';
        if (idempotencyKey && (req.method === 'POST' || req.method === 'PATCH') && !ehCancelSaida) {
            return await comIdempotencia(req.method, path, ctx, body, cap)
        }
        return await route(req.method, path, ctx, body)
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro interno.';
        console.error('[gw]', e);
        await logSync(ctx, path[1] ?? '?', 'erro', 0, 0, 1, msg);
        return erro('INTERNAL_ERROR', msg, ctx, 500)
    }
}

Deno.serve(async (req: Request) => {
    const t0 = Date.now();
    const rid = crypto.randomUUID();
    if (req.method === 'OPTIONS') return new Response('ok', {
        headers: CORS
    });
    const url = new URL(req.url);
    const ridCliente = req.headers.get('x-request-id');
    const cap: Captura = {
        rid,
        t0,
        metodo: req.method,
        path: parsePath(req.url),
        url,
        userAgent: req.headers.get('user-agent'),
        ip: req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for'),
        requestIdCliente: ridCliente && ridCliente.trim() !== '' ? ridCliente.trim().slice(0, 100) : null,
        chaveApi: null,
        conn: null,
        sb: null,
        corpoTexto: null,
        corpo: null,
        rl: null
    };
    let resp: Response;
    try {
        resp = await atender(req, cap);
    } catch (e) {
        console.error('[gw] falha nao tratada:', e);
        resp = erroSimples('INTERNAL_ERROR', e instanceof Error ? e.message : 'Erro interno.', rid, 500);
    }
    try { resp.headers.set('X-Request-Id', rid) } catch {}
    if (cap.rl) {
        try {
            resp.headers.set('X-RateLimit-Limit', String(cap.rl.limite));
            resp.headers.set('X-RateLimit-Remaining', String(Math.max(0, cap.rl.limite - cap.rl.usado)));
            resp.headers.set('X-RateLimit-Reset', String(cap.rl.resetEm));
            resp.headers.set('X-RateLimit-Mode', cap.rl.modo);
        } catch {}
    }
    if ((resp.status >= 400 || resp.status === 207) && !registroDesligado()) {
        try { emSegundoPlano(capturarErro(cap, resp.clone())) } catch (e) { console.error('[gw] captura:', e) }
    }
    return resp;
})
