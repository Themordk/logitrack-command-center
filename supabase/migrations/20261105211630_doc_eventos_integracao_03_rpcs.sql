-- Copiada de produção (schema_migrations, versão 20261105211630): estava aplicada em produção e faltava no repositório.
-- ============================================================
-- Autorização: quem pode ver a tela do documento OU quem tem Retornos (READ)
-- ============================================================
CREATE OR REPLACE FUNCTION integracao.fn_doc_eventos_autorizar(p_tenant_id uuid, p_empresa_id uuid, p_entidade text)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $$
DECLARE
  v_usuario uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL OR p_entidade IS NULL THEN
    RAISE EXCEPTION 'DOC_EVENTOS_PARAMETROS: tenant_id, empresa_id e entidade são obrigatórios' USING ERRCODE = '22023';
  END IF;
  IF p_entidade NOT IN ('documento_saida', 'documento_entrada') THEN
    RAISE EXCEPTION 'DOC_EVENTOS_ENTIDADE_INVALIDA: %', p_entidade USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'DOC_EVENTOS_NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'DOC_EVENTOS_EMPRESA_INVALIDA' USING ERRCODE = '42501';
  END IF;
  IF is_platform_support(auth.uid()) THEN
    RETURN NULL;
  END IF;
  SELECT u.id INTO v_usuario
  FROM usuario u
  WHERE u.auth_user_id = auth.uid() AND u.tenant_id = p_tenant_id AND u.ativo
  LIMIT 1;
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'DOC_EVENTOS_ACESSO_NEGADO' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM usuario_perfil up WHERE up.usuario_id = v_usuario)
     OR EXISTS (SELECT 1 FROM usuario_perfil up JOIN perfil p ON p.id = up.perfil_id
                WHERE up.usuario_id = v_usuario AND p.nome = 'ADMINISTRADOR')
     OR fn_usuario_tem_permissao(v_usuario,
          CASE p_entidade WHEN 'documento_saida' THEN 'web.atividades.saidas' ELSE 'web.atividades.entradas' END, 'READ')
     OR fn_usuario_tem_permissao(v_usuario, 'web.config.integracao.retornos', 'READ') THEN
    RETURN v_usuario;
  END IF;
  RAISE EXCEPTION 'DOC_EVENTOS_SEM_PERMISSAO' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION integracao.fn_doc_eventos_autorizar(uuid, uuid, text) FROM PUBLIC, anon;

-- ============================================================
-- Linha do tempo: todos os eventos de integração de um documento
-- ============================================================
CREATE OR REPLACE FUNCTION public.integracao_documento_eventos(
  p_tenant_id          uuid,
  p_empresa_id         uuid,
  p_entidade           text,
  p_documento_id       uuid,
  p_direcao            text    DEFAULT NULL,   -- ERP_WMS | WMS | WMS_ERP | NULL (todas)
  p_somente_problemas  boolean DEFAULT false,
  p_ordem              text    DEFAULT 'asc',  -- asc | desc
  p_limite             integer DEFAULT 300,
  p_offset             integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $$
DECLARE
  v_tipo     text;
  v_codigo   text;
  v_numero   text;
  v_status_i text;
  v_criado   timestamptz;
  v_sis_orig text;
  v_limite   int := least(greatest(coalesce(p_limite, 300), 1), 500);
  v_offset   int := greatest(coalesce(p_offset, 0), 0);
  v_desc     boolean := lower(coalesce(p_ordem, 'asc')) = 'desc';
  v_result   jsonb;
BEGIN
  PERFORM integracao.fn_doc_eventos_autorizar(p_tenant_id, p_empresa_id, p_entidade);

  IF p_direcao IS NOT NULL AND p_direcao NOT IN ('ERP_WMS', 'WMS', 'WMS_ERP') THEN
    RAISE EXCEPTION 'DOC_EVENTOS_PARAMETROS: direcao inválida (%)', p_direcao USING ERRCODE = '22023';
  END IF;

  IF p_entidade = 'documento_saida' THEN
    v_tipo := 'SAIDA';
    SELECT d.codigo_erp, d.numero_pedido::text, d.status_integracao, d.created_at, d.sistema_origem
      INTO v_codigo, v_numero, v_status_i, v_criado, v_sis_orig
      FROM documento_saida d
     WHERE d.id = p_documento_id AND d.tenant_id = p_tenant_id AND d.empresa_id = p_empresa_id;
  ELSE
    v_tipo := 'ENTRADA';
    SELECT d.codigo_erp, d.numero_nota::text, d.status_integracao, d.created_at, NULL
      INTO v_codigo, v_numero, v_status_i, v_criado, v_sis_orig
      FROM documento_entrada d
     WHERE d.id = p_documento_id AND d.tenant_id = p_tenant_id AND d.empresa_id = p_empresa_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOC_EVENTOS_DOCUMENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  WITH ev AS (
    -- 1) Importação / alteração recebida do ERP
    SELECT a.id, 'documento_alteracao'::text AS fonte, 'ERP_WMS'::text AS direcao,
           CASE WHEN a.id_alteracao_anterior IS NULL
                 AND coalesce((a.diferenca ->> 'original_existe')::boolean, false) = false
                THEN 'importacao' ELSE 'alteracao' END AS categoria,
           CASE WHEN a.id_alteracao_anterior IS NULL
                 AND coalesce((a.diferenca ->> 'original_existe')::boolean, false) = false
                THEN CASE WHEN a.situacao = 'recusada' THEN 'Importação recusada' ELSE 'Documento importado do ERP' END
                ELSE CASE WHEN a.situacao = 'recusada' THEN 'Alteração do ERP recusada' ELSE 'Alteração recebida do ERP' END
           END AS titulo,
           a.id_alteracao AS codigo,
           a.situacao,
           coalesce(a.motivo,
                    CASE WHEN a.diferenca ? 'qtd_itens' THEN (a.diferenca ->> 'qtd_itens') || ' item(ns)' END) AS mensagem,
           'API'::text AS origem,
           NULL::uuid AS ator_usuario_id, NULL::uuid AS ator_auth_id,
           a.created_at AS ocorrido_em, 10 AS ordem,
           a.request_id, a.id_alteracao, NULL::uuid AS pai_id,
           CASE WHEN a.documento_id IS NULL THEN 'codigo_erp' ELSE 'documento' END AS vinculo,
           false AS sintetico,
           jsonb_build_object('id_alteracao_anterior', a.id_alteracao_anterior, 'tentativas', a.tentativas,
                              'processado_em', a.processado_em) AS extra
      FROM integracao.documento_alteracao a
     WHERE a.tenant_id = p_tenant_id AND a.empresa_id = p_empresa_id AND a.tipo = v_tipo
       AND (a.documento_id = p_documento_id
            OR (a.documento_id IS NULL AND v_codigo IS NOT NULL AND a.codigo_erp = v_codigo))

    UNION ALL
    -- 2) Requisição do ERP barrada na API (sem duplicar recusas já registradas em documento_alteracao)
    SELECT e.id, 'api_erro', 'ERP_WMS', 'rejeicao_api',
           'Requisição do ERP recusada pela API' ||
             CASE e.acao WHEN 'criar' THEN ' (criação)' WHEN 'cancelar' THEN ' (cancelamento)'
                         WHEN 'consultar' THEN ' (consulta)' ELSE '' END,
           e.metodo || ' ' || e.caminho,
           'recusado',
           coalesce(e.codigo_erro || ': ', '') || coalesce(e.mensagem, ''),
           'API', NULL, NULL,
           e.created_at, 5,
           e.request_id::text, e.id_alteracao, NULL,
           'codigo_erp', false,
           jsonb_build_object('http_status', e.http_status, 'acao', e.acao)
      FROM integracao.api_erro e
     WHERE e.tenant_id = p_tenant_id
       AND (e.empresa_id = p_empresa_id OR e.empresa_id IS NULL)
       AND v_codigo IS NOT NULL AND e.codigo_erp = v_codigo
       AND e.entidade = CASE v_tipo WHEN 'SAIDA' THEN 'documentos-saida' ELSE 'documentos-entrada' END
       AND NOT EXISTS (SELECT 1 FROM integracao.documento_alteracao a2
                        WHERE a2.tenant_id = e.tenant_id AND a2.request_id = e.request_id::text)

    UNION ALL
    -- 3) Cancelamento de documento de saída
    SELECT c.id, 'documento_saida_cancelamento',
           CASE WHEN c.origem ILIKE '%API%' OR c.origem ILIKE '%ERP%' THEN 'ERP_WMS' ELSE 'WMS' END,
           'cancelamento',
           CASE WHEN c.origem ILIKE '%API%' OR c.origem ILIKE '%ERP%'
                THEN 'Cancelamento solicitado pelo ERP' ELSE 'Cancelamento do documento' END,
           c.estagio,
           lower(c.resultado),
           coalesce(c.mensagem, c.codigo_recusa, c.motivo_texto),
           c.origem, c.usuario_id, NULL,
           c.created_at, 30,
           c.request_id, c.id_alteracao, NULL,
           'documento', false,
           jsonb_build_object('numero_onda', c.numero_onda, 'status_retirada', c.status_retirada,
                              'codigo_recusa', c.codigo_recusa)
      FROM documento_saida_cancelamento c
     WHERE p_entidade = 'documento_saida'
       AND c.tenant_id = p_tenant_id AND c.documento_saida_id = p_documento_id

    UNION ALL
    -- 4) Exclusão / restauração / cancelamento de entrada (log append-only)
    SELECT l.id, 'documento_evento_log', x.dir, lower(l.tipo),
           CASE l.tipo
             WHEN 'EXCLUSAO'    THEN CASE WHEN x.dir = 'ERP_WMS' THEN 'Exclusão solicitada pelo ERP' ELSE 'Documento excluído' END
             WHEN 'RESTAURACAO' THEN 'Exclusão desfeita'
             ELSE CASE WHEN x.dir = 'ERP_WMS' THEN 'Cancelamento solicitado pelo ERP' ELSE 'Cancelamento do documento' END
           END,
           NULL, 'registrado', l.motivo, x.orig, l.usuario_id, l.auth_user_id,
           l.ocorrido_em, 40,
           l.request_id, NULL, NULL,
           'documento', (l.origem = 'BACKFILL'),
           l.detalhe
      FROM integracao.documento_evento_log l
      CROSS JOIN LATERAL (
        SELECT CASE WHEN l.origem = 'BACKFILL'
                    THEN coalesce(l.detalhe ->> 'origem_estimada', l.detalhe ->> 'cancelamento_origem', 'BACKFILL')
                    ELSE l.origem END AS orig
      ) o
      CROSS JOIN LATERAL (
        SELECT o.orig,
               CASE WHEN o.orig ILIKE '%API%' OR o.orig ILIKE '%ERP%' THEN 'ERP_WMS' ELSE 'WMS' END AS dir
      ) x
     WHERE l.tenant_id = p_tenant_id AND l.entidade = p_entidade AND l.documento_id = p_documento_id

    UNION ALL
    -- 5) Alteração operacional de pedido (API de alteração / interceptador de devolução)
    SELECT x.id, 'documento_saida_alteracao',
           CASE WHEN x.origem = 'API' THEN 'ERP_WMS' ELSE 'WMS' END,
           'alteracao_operacional',
           CASE
             WHEN p_entidade = 'documento_saida' AND x.documento_saida_gerado_id = p_documento_id THEN 'Documento gerado por alteração de pedido'
             WHEN p_entidade = 'documento_entrada' AND x.documento_entrada_gerado_id = p_documento_id THEN 'Entrada gerada por devolução de alteração'
             WHEN p_entidade = 'documento_entrada' THEN 'Entrada vinculada a alteração de pedido'
             WHEN x.origem = 'API' THEN 'Alteração de pedido recebida do ERP'
             ELSE 'Alteração de pedido detectada (interceptador)'
           END,
           x.numero_vinculo,
           lower(x.situacao),
           coalesce(x.erro, 'Modo: ' || x.modo),
           x.origem, NULL, NULL,
           x.created_at, 20,
           x.request_id, x.id_alteracao, NULL,
           'documento', false,
           jsonb_build_object('modo', x.modo, 'tentativas', x.tentativas, 'processado_em', x.processado_em)
      FROM documento_saida_alteracao x
     WHERE x.tenant_id = p_tenant_id
       AND (
         (p_entidade = 'documento_saida'
            AND (x.documentos_saida @> ARRAY[p_documento_id] OR x.documento_saida_gerado_id = p_documento_id))
         OR
         (p_entidade = 'documento_entrada'
            AND (x.documento_entrada_id = p_documento_id OR x.documento_entrada_gerado_id = p_documento_id))
       )

    UNION ALL
    -- 6) Eventos de sincronização (NF do pedido, atualização do documento)
    SELECT ei.id, 'evento_integracao', 'ERP_WMS', 'nf',
           CASE
             WHEN ei.entidade = 'documento_saida_nf' AND ei.operacao = 'insert' THEN 'Nota fiscal recebida do ERP'
             WHEN ei.entidade = 'documento_saida_nf' THEN 'Nota fiscal atualizada pelo ERP'
             ELSE 'Documento atualizado pela sincronização'
           END,
           ei.id_externo,
           CASE WHEN ei.mensagem_erro IS NULL THEN 'sucesso' ELSE 'erro' END,
           ei.mensagem_erro,
           'SINCRONIZACAO', NULL, NULL,
           ei.criado_em, 15,
           NULL, NULL, NULL,
           'documento', false,
           jsonb_build_object('operacao', ei.operacao, 'entidade', ei.entidade)
      FROM integracao.evento_integracao ei
     WHERE ei.tenant_id = p_tenant_id
       AND (
         (ei.entidade = p_entidade AND ei.id_interno = p_documento_id)
         OR (p_entidade = 'documento_saida' AND ei.entidade = 'documento_saida_nf'
             AND ei.id_interno IN (SELECT nf.id FROM documento_saida_nf nf
                                    WHERE nf.tenant_id = p_tenant_id AND nf.documento_saida_id = p_documento_id))
       )

    UNION ALL
    -- 7) Documento removido de movimento / onda
    SELECT r.id, 'movimento_documento_remocao', 'WMS', 'remocao_movimento',
           CASE WHEN r.tipo_movimento = 'SAIDA' THEN 'Documento removido da onda' ELSE 'Documento removido do movimento' END
             || coalesce(' nº ' || r.numero_movimento::text, ''),
           NULL, 'registrado', r.observacao, 'USUARIO', r.removido_por, NULL,
           coalesce(r.removido_em, r.created_at), 50,
           NULL, NULL, NULL,
           'documento', false,
           jsonb_build_object('status_movimento', r.status_movimento, 'status_movimento_final', r.status_movimento_final)
      FROM movimento_documento_remocao r
     WHERE r.tenant_id = p_tenant_id AND r.documento_id = p_documento_id
       AND r.tipo_movimento = v_tipo

    UNION ALL
    -- 8) Evento operacional do WMS que dispara retornos
    SELECT re.id, 'retorno_evento', 'WMS', 'operacao_wms',
           coalesce(cat.nome, re.evento),
           re.evento,
           re.status,
           re.erro,
           CASE WHEN re.disparado_por IS NULL THEN 'AUTOMATICO' ELSE 'USUARIO' END,
           NULL, re.disparado_por,
           re.created_at, 60,
           NULL, NULL, NULL,
           'documento', false,
           jsonb_build_object('movimento_id', re.movimento_id)
      FROM integracao.retorno_evento re
      LEFT JOIN integracao.retorno_evento_catalogo cat ON cat.codigo = re.evento
     WHERE re.tenant_id = p_tenant_id AND re.empresa_id = p_empresa_id
       AND re.documento_id = p_documento_id AND re.entidade = p_entidade

    UNION ALL
    -- 9) Retorno ao ERP (execução de fluxo)
    SELECT x.id, 'retorno_execucao', 'WMS_ERP', 'retorno_erp',
           coalesce(f.nome, 'Retorno ao ERP') || CASE WHEN x.documento_id IS DISTINCT FROM p_documento_id THEN ' (lote)' ELSE '' END,
           x.evento,
           x.status,
           x.erro,
           upper(x.modo), NULL, NULL,
           x.created_at, 70,
           NULL, NULL, x.evento_id,
           'documento', false,
           jsonb_build_object('modo', x.modo, 'fluxo_id', x.fluxo_id, 'fluxo_versao', x.fluxo_versao,
                              'erro_http_status', x.erro_http_status, 'lote_execucao_id', x.lote_execucao_id,
                              'disparado_por', x.disparado_por,
                              'duracao_ms', CASE WHEN x.finalizado_em IS NOT NULL AND x.iniciado_em IS NOT NULL
                                                 THEN (extract(epoch FROM x.finalizado_em - x.iniciado_em) * 1000)::int END)
      FROM integracao.retorno_execucao x
      LEFT JOIN integracao.retorno_fluxo f ON f.id = x.fluxo_id
     WHERE x.tenant_id = p_tenant_id AND x.empresa_id = p_empresa_id AND x.entidade = p_entidade
       AND x.modo NOT IN ('teste', 'simulacao')
       AND (x.documento_id = p_documento_id
            OR x.id IN (SELECT m.lote_execucao_id FROM integracao.retorno_execucao m
                         WHERE m.documento_id = p_documento_id AND m.lote_execucao_id IS NOT NULL))
  ),
  ev_full AS (
    SELECT * FROM ev
    UNION ALL
    -- 0) Registro do documento no WMS quando não há trilha de importação (documentos antigos/manuais)
    SELECT p_documento_id, 'documento', 'WMS', 'registro', 'Documento registrado no WMS',
           v_codigo, 'registrado',
           CASE WHEN v_sis_orig IS NOT NULL THEN 'Origem: ' || v_sis_orig END,
           coalesce(v_sis_orig, 'SISTEMA'), NULL, NULL,
           v_criado, 0, NULL, NULL, NULL, 'documento', true, '{}'::jsonb
     WHERE v_criado IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ev WHERE ev.categoria = 'importacao')
  ),
  -- Normalização de situação para filtro de problemas
  ev_norm AS (
    SELECT e.*,
           (e.situacao IN ('erro', 'recusada', 'recusado', 'falha', 'aguardando_retry', 'descartado')) AS problema
      FROM ev_full e
  ),
  ev_ator AS (
    SELECT e.*,
           coalesce(u1.nome, u1.login, u2.nome, u2.login) AS ator_nome
      FROM ev_norm e
      LEFT JOIN usuario u1 ON u1.id = e.ator_usuario_id AND u1.tenant_id = p_tenant_id
      LEFT JOIN LATERAL (SELECT u.nome, u.login FROM usuario u
                          WHERE e.ator_auth_id IS NOT NULL AND u.auth_user_id = e.ator_auth_id AND u.tenant_id = p_tenant_id
                          LIMIT 1) u2 ON true
  ),
  filtrado AS (
    SELECT * FROM ev_ator
     WHERE (p_direcao IS NULL OR direcao = p_direcao)
       AND (NOT coalesce(p_somente_problemas, false) OR problema)
  ),
  pagina AS (
    SELECT *, row_number() OVER (ORDER BY ocorrido_em ASC NULLS FIRST, ordem, id) AS seq
      FROM filtrado
  )
  SELECT jsonb_build_object(
    'documento', jsonb_build_object('id', p_documento_id, 'entidade', p_entidade, 'codigo_erp', v_codigo,
                                    'numero', v_numero, 'status_integracao', v_status_i),
    'resumo', (SELECT jsonb_build_object(
                 'total', count(*),
                 'erp_wms', count(*) FILTER (WHERE direcao = 'ERP_WMS'),
                 'wms', count(*) FILTER (WHERE direcao = 'WMS'),
                 'wms_erp', count(*) FILTER (WHERE direcao = 'WMS_ERP'),
                 'problemas', count(*) FILTER (WHERE problema),
                 'pendentes', count(*) FILTER (WHERE situacao IN ('pendente', 'executando', 'aguardando_retry', 'agrupando')),
                 'primeiro_em', min(ocorrido_em), 'ultimo_em', max(ocorrido_em))
               FROM ev_norm),
    'total_filtrado', (SELECT count(*) FROM filtrado),
    'limite', v_limite, 'offset', v_offset,
    'eventos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'seq', p.seq, 'fonte', p.fonte, 'direcao', p.direcao, 'categoria', p.categoria,
               'titulo', p.titulo, 'codigo', p.codigo, 'situacao', p.situacao, 'problema', p.problema,
               'mensagem', p.mensagem, 'origem', p.origem, 'ator_nome', p.ator_nome,
               'ocorrido_em', p.ocorrido_em, 'request_id', p.request_id, 'id_alteracao', p.id_alteracao,
               'pai_id', p.pai_id, 'vinculo', p.vinculo, 'sintetico', p.sintetico, 'extra', p.extra,
               'tem_detalhe', (p.fonte <> 'documento'))
             ORDER BY CASE WHEN v_desc THEN -p.seq ELSE p.seq END)
        FROM (SELECT * FROM pagina
               ORDER BY CASE WHEN v_desc THEN -seq ELSE seq END
               LIMIT v_limite OFFSET v_offset) p
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.integracao_documento_eventos(uuid, uuid, text, uuid, text, boolean, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integracao_documento_eventos(uuid, uuid, text, uuid, text, boolean, text, integer, integer) TO authenticated;

-- ============================================================
-- Detalhe de um evento (payloads carregados sob demanda)
-- ============================================================
CREATE OR REPLACE FUNCTION public.integracao_documento_evento_detalhe(
  p_tenant_id    uuid,
  p_empresa_id   uuid,
  p_entidade     text,
  p_documento_id uuid,
  p_fonte        text,
  p_id           uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $$
DECLARE
  v_codigo   text;
  v_r        jsonb;
  v_completo boolean := false;
BEGIN
  PERFORM integracao.fn_doc_eventos_autorizar(p_tenant_id, p_empresa_id, p_entidade);

  IF p_fonte NOT IN ('documento_alteracao','api_erro','documento_saida_cancelamento','documento_evento_log',
                     'documento_saida_alteracao','evento_integracao','movimento_documento_remocao',
                     'retorno_evento','retorno_execucao') THEN
    RAISE EXCEPTION 'DOC_EVENTOS_FONTE_INVALIDA: %', p_fonte USING ERRCODE = '22023';
  END IF;

  IF p_entidade = 'documento_saida' THEN
    SELECT d.codigo_erp INTO v_codigo FROM documento_saida d
     WHERE d.id = p_documento_id AND d.tenant_id = p_tenant_id AND d.empresa_id = p_empresa_id;
  ELSE
    SELECT d.codigo_erp INTO v_codigo FROM documento_entrada d
     WHERE d.id = p_documento_id AND d.tenant_id = p_tenant_id AND d.empresa_id = p_empresa_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOC_EVENTOS_DOCUMENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  CASE p_fonte
  WHEN 'documento_alteracao' THEN
    SELECT jsonb_build_object(
             'id', a.id, 'tipo', a.tipo, 'codigo_erp', a.codigo_erp, 'id_alteracao', a.id_alteracao,
             'id_alteracao_anterior', a.id_alteracao_anterior, 'situacao', a.situacao, 'motivo', a.motivo,
             'tentativas', a.tentativas, 'request_id', a.request_id, 'payload_hash', a.payload_hash,
             'diferenca', a.diferenca, 'documentos_gerados', a.documentos_gerados, 'payload', a.payload,
             'created_at', a.created_at, 'processado_em', a.processado_em)
      INTO v_r
      FROM integracao.documento_alteracao a
     WHERE a.id = p_id AND a.tenant_id = p_tenant_id AND a.empresa_id = p_empresa_id
       AND (a.documento_id = p_documento_id OR (a.documento_id IS NULL AND a.codigo_erp = v_codigo));

  WHEN 'api_erro' THEN
    SELECT jsonb_build_object(
             'id', e.id, 'request_id', e.request_id, 'metodo', e.metodo, 'caminho', e.caminho, 'acao', e.acao,
             'http_status', e.http_status, 'codigo_erro', e.codigo_erro, 'mensagem', e.mensagem,
             'detalhes', e.detalhes, 'payload', e.payload, 'payload_bytes', e.payload_bytes,
             'payload_truncado', e.payload_truncado, 'amostrado', e.amostrado, 'duracao_ms', e.duracao_ms,
             'versao_gateway', e.versao_gateway, 'id_alteracao', e.id_alteracao, 'created_at', e.created_at)
      INTO v_r
      FROM integracao.api_erro e
     WHERE e.id = p_id AND e.tenant_id = p_tenant_id
       AND (e.empresa_id = p_empresa_id OR e.empresa_id IS NULL)
       AND e.codigo_erp = v_codigo;

  WHEN 'documento_saida_cancelamento' THEN
    SELECT to_jsonb(c) - 'tenant_id' - 'empresa_id' - 'idempotency_key'
      INTO v_r
      FROM documento_saida_cancelamento c
     WHERE c.id = p_id AND c.tenant_id = p_tenant_id AND c.documento_saida_id = p_documento_id;

  WHEN 'documento_evento_log' THEN
    SELECT to_jsonb(l) - 'tenant_id' - 'empresa_id' - 'auth_user_id'
      INTO v_r
      FROM integracao.documento_evento_log l
     WHERE l.id = p_id AND l.tenant_id = p_tenant_id AND l.documento_id = p_documento_id;

  WHEN 'documento_saida_alteracao' THEN
    SELECT (to_jsonb(x) - 'tenant_id' - 'empresa_id') || jsonb_build_object(
             'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                 'produto_id', i.produto_id, 'produto_codigo', p.codigo_erp, 'produto_descricao', p.descricao,
                                 'documento_saida_id', i.documento_saida_id, 'acao', i.acao,
                                 'quantidade', i.quantidade, 'estagio', i.estagio, 'detalhe', i.detalhe)
                               ORDER BY i.created_at), '[]'::jsonb)
                         FROM documento_saida_alteracao_item i
                         LEFT JOIN produto p ON p.id = i.produto_id
                        WHERE i.alteracao_id = x.id AND i.tenant_id = p_tenant_id))
      INTO v_r
      FROM documento_saida_alteracao x
     WHERE x.id = p_id AND x.tenant_id = p_tenant_id
       AND ( (p_entidade = 'documento_saida' AND (x.documentos_saida @> ARRAY[p_documento_id] OR x.documento_saida_gerado_id = p_documento_id))
          OR (p_entidade = 'documento_entrada' AND (x.documento_entrada_id = p_documento_id OR x.documento_entrada_gerado_id = p_documento_id)) );

  WHEN 'evento_integracao' THEN
    SELECT jsonb_build_object('id', ei.id, 'entidade', ei.entidade, 'operacao', ei.operacao,
                              'id_externo', ei.id_externo, 'id_interno', ei.id_interno,
                              'mensagem_erro', ei.mensagem_erro, 'payload', ei.payload, 'criado_em', ei.criado_em)
      INTO v_r
      FROM integracao.evento_integracao ei
     WHERE ei.id = p_id AND ei.tenant_id = p_tenant_id
       AND ( (ei.entidade = p_entidade AND ei.id_interno = p_documento_id)
          OR (p_entidade = 'documento_saida' AND ei.entidade = 'documento_saida_nf'
              AND ei.id_interno IN (SELECT nf.id FROM documento_saida_nf nf
                                     WHERE nf.tenant_id = p_tenant_id AND nf.documento_saida_id = p_documento_id)) );

  WHEN 'movimento_documento_remocao' THEN
    SELECT to_jsonb(r) - 'tenant_id' - 'empresa_id' - 'hash_analise'
      INTO v_r
      FROM movimento_documento_remocao r
     WHERE r.id = p_id AND r.tenant_id = p_tenant_id AND r.documento_id = p_documento_id;

  WHEN 'retorno_evento' THEN
    SELECT jsonb_build_object('id', re.id, 'evento', re.evento, 'nome', cat.nome, 'descricao', cat.descricao,
                              'status', re.status, 'erro', re.erro, 'contexto', re.contexto,
                              'contexto_versao', re.contexto_versao, 'movimento_id', re.movimento_id,
                              'created_at', re.created_at,
                              'execucoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status,
                                                     'fluxo_nome', f.nome, 'erro', x.erro) ORDER BY x.created_at), '[]'::jsonb)
                                              FROM integracao.retorno_execucao x
                                              LEFT JOIN integracao.retorno_fluxo f ON f.id = x.fluxo_id
                                             WHERE x.evento_id = re.id))
      INTO v_r
      FROM integracao.retorno_evento re
      LEFT JOIN integracao.retorno_evento_catalogo cat ON cat.codigo = re.evento
     WHERE re.id = p_id AND re.tenant_id = p_tenant_id AND re.empresa_id = p_empresa_id
       AND re.documento_id = p_documento_id;

  WHEN 'retorno_execucao' THEN
    -- Request/response dos passos só para quem tem Retornos (READ)
    BEGIN
      PERFORM integracao.fn_retorno_autorizar(p_tenant_id, p_empresa_id, 'READ');
      v_completo := true;
    EXCEPTION WHEN others THEN
      v_completo := false;
    END;
    SELECT integracao.fn_retorno_execucao_json(x, v_completo) || jsonb_build_object('completo', v_completo)
      INTO v_r
      FROM integracao.retorno_execucao x
     WHERE x.id = p_id AND x.tenant_id = p_tenant_id AND x.empresa_id = p_empresa_id
       AND (x.documento_id = p_documento_id
            OR x.id IN (SELECT m.lote_execucao_id FROM integracao.retorno_execucao m
                         WHERE m.documento_id = p_documento_id AND m.lote_execucao_id IS NOT NULL));
  END CASE;

  IF v_r IS NULL THEN
    RAISE EXCEPTION 'DOC_EVENTOS_EVENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('fonte', p_fonte, 'dados', v_r);
END;
$$;
REVOKE ALL ON FUNCTION public.integracao_documento_evento_detalhe(uuid, uuid, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integracao_documento_evento_detalhe(uuid, uuid, text, uuid, text, uuid) TO authenticated;;
