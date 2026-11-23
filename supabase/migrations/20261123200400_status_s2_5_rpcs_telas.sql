-- =====================================================================
-- Status S2 · 5/5 — Leituras para as telas · 2026-11-23
--   rpc_pedidos_acompanhamento   (nova) Acompanhamento de Pedidos: lista paginada, filtros e cartões
--   rpc_pedido_situacao          (nova) detalhe do pedido: etapa, entrega, integração, onda, carga, tentativas
--   rpc_ondas_carregamento_lista devolve entrega_resumo e contadores (troca só a lista de colunas)
--   _fn_entrega_json             cada parada leva o status de integração (S1) do pedido
-- Leitura só; tenant vem do JWT (get_current_tenant) e é filtrado explicitamente; permissão
-- web.atividades.saidas, web.atividades.mov-saida ou web.atividades.montagem-carga (READ), ou ADMINISTRADOR.
-- Erros {codigo, mensagem} (RAISE P0001) lidos pelo errorMapper.
-- =====================================================================

-- 0) Autorização de leitura ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_situacao_pedido_autorizar(p_empresa_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant  uuid := public.get_current_tenant();
  v_usuario uuid;
BEGIN
  IF v_tenant IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = jsonb_build_object(
      'codigo', 'SESSAO_SEM_TENANT', 'mensagem', 'Sessão sem empresa válida. Entre novamente.')::text;
  END IF;
  IF p_empresa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = v_tenant) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = jsonb_build_object(
      'codigo', 'EMPRESA_INVALIDA', 'mensagem', 'Empresa não pertence a este cliente.')::text;
  END IF;
  IF public.is_platform_support(auth.uid()) THEN
    RETURN v_tenant;
  END IF;
  SELECT u.id INTO v_usuario FROM usuario u
   WHERE u.auth_user_id = auth.uid() AND u.tenant_id = v_tenant AND u.ativo LIMIT 1;
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = jsonb_build_object(
      'codigo', 'SEM_PERMISSAO', 'mensagem', 'Usuário sem acesso a este cliente.')::text;
  END IF;
  IF EXISTS (SELECT 1 FROM usuario_perfil up JOIN perfil p ON p.id = up.perfil_id
              WHERE up.usuario_id = v_usuario AND p.nome = 'ADMINISTRADOR')
     OR public.fn_usuario_tem_permissao(v_usuario, 'web.atividades.saidas', 'READ')
     OR public.fn_usuario_tem_permissao(v_usuario, 'web.atividades.mov-saida', 'READ')
     OR public.fn_usuario_tem_permissao(v_usuario, 'web.atividades.montagem-carga', 'READ') THEN
    RETURN v_tenant;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = jsonb_build_object(
    'codigo', 'SEM_PERMISSAO', 'mensagem', 'Você não tem permissão para ver os pedidos de saída.')::text;
END;
$function$;

REVOKE ALL ON FUNCTION public._fn_situacao_pedido_autorizar(uuid) FROM PUBLIC, anon, authenticated;

-- 1) Acompanhamento de Pedidos ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_pedidos_acompanhamento(
  p_empresa_id   uuid,
  p_data_de      date    DEFAULT NULL,
  p_data_ate     date    DEFAULT NULL,
  p_busca        text    DEFAULT NULL,
  p_etapas       text[]  DEFAULT NULL,
  p_entregas     text[]  DEFAULT NULL,
  p_integracoes  text[]  DEFAULT NULL,
  p_cartao       text    DEFAULT NULL,
  p_page         integer DEFAULT 1,
  p_page_size    integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_tenant uuid := public._fn_situacao_pedido_autorizar(p_empresa_id);
  v_tz     text := 'America/Fortaleza';
  v_size   int  := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_off    int  := (greatest(coalesce(p_page, 1), 1) - 1) * least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_busca  text := nullif(btrim(p_busca), '');
  v_num    bigint;
  v_res    jsonb;
BEGIN
  IF p_cartao IS NOT NULL AND p_cartao NOT IN ('expedidos_sem_entrega', 'nao_entregues', 'erro_erp', 'entrega_nao_gerada') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = jsonb_build_object(
      'codigo', 'PARAMETRO_INVALIDO', 'mensagem', 'Cartão inválido.')::text;
  END IF;
  IF v_busca ~ '^\d{1,18}$' THEN v_num := v_busca::bigint; END IF;

  WITH base AS MATERIALIZED (
    SELECT ds.id, ds.numero_pedido, ds.codigo_erp, ds.data_emissao, ds.status, ds.parceiro_id,
           ds.etapa, ds.etapa_em, ds.etapa_onda_numero, ds.etapa_carga_numero,
           ds.entrega_status, ds.entrega_em, ds.entrega_motivo, ds.entrega_tentativas,
           ds.integracao_estado, ds.integracao_evento, ds.integracao_em, ds.integracao_erro,
           ds.integracao_erros_outros, ds.status_integracao,
           coalesce(ds.tipo_pedido_id, (SELECT ms.tipo_saida FROM movimento_saida_documento msd
                                           JOIN movimento_saida ms ON ms.id = msd.movimento_saida_id
                                          WHERE msd.documento_saida_id = ds.id
                                          ORDER BY ms.created_at DESC LIMIT 1)) AS tipo_id
      FROM documento_saida ds
     WHERE ds.tenant_id = v_tenant
       AND (p_empresa_id IS NULL OR ds.empresa_id = p_empresa_id)
       AND (p_data_de  IS NULL OR ds.data_emissao >= (p_data_de::timestamp AT TIME ZONE v_tz))
       AND (p_data_ate IS NULL OR ds.data_emissao <  ((p_data_ate + 1)::timestamp AT TIME ZONE v_tz))
       AND (ds.status <> 99 OR 'excluido' = ANY (coalesce(p_etapas, '{}')))
       AND (v_busca IS NULL
            OR ds.numero_pedido = v_num
            OR ds.etapa_onda_numero = v_num
            OR ds.etapa_carga_numero = v_num
            OR ds.codigo_erp = v_busca
            OR EXISTS (SELECT 1 FROM parceiro pa WHERE pa.id = ds.parceiro_id
                        AND (pa.razaosocial ILIKE '%' || v_busca || '%' OR pa.nome_fantasia ILIKE '%' || v_busca || '%'
                             OR pa.codigo_erp = v_busca))
            OR EXISTS (SELECT 1 FROM documento_saida_nf nf WHERE nf.documento_saida_id = ds.id
                        AND ltrim(nf.numero_nf, '0') = ltrim(v_busca, '0')))
  ),
  marcada AS (
    SELECT b.*,
           (b.etapa = 'expedido' AND b.entrega_status IN ('aguardando_expedicao', 'aguardando_saida', 'em_rota', 'entrega_nao_gerada')) AS c_exp_sem_entrega,
           (b.entrega_status = 'nao_entregue') AS c_nao_entregue,
           (b.integracao_estado = 'erro')     AS c_erro_erp,
           (b.entrega_status = 'entrega_nao_gerada') AS c_nao_gerada
      FROM base b
  ),
  filtrada AS (
    SELECT m.* FROM marcada m
     WHERE (p_etapas IS NULL OR cardinality(p_etapas) = 0 OR m.etapa = ANY (p_etapas))
       AND (p_entregas IS NULL OR cardinality(p_entregas) = 0 OR m.entrega_status = ANY (p_entregas))
       AND (p_integracoes IS NULL OR cardinality(p_integracoes) = 0 OR m.integracao_estado = ANY (p_integracoes))
       AND (p_cartao IS NULL
            OR (p_cartao = 'expedidos_sem_entrega' AND m.c_exp_sem_entrega)
            OR (p_cartao = 'nao_entregues' AND m.c_nao_entregue)
            OR (p_cartao = 'erro_erp' AND m.c_erro_erp)
            OR (p_cartao = 'entrega_nao_gerada' AND m.c_nao_gerada))
  ),
  pagina AS (
    SELECT f.* FROM filtrada f
     ORDER BY f.data_emissao DESC NULLS LAST, f.numero_pedido DESC
     LIMIT v_size OFFSET v_off
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtrada),
    'pagina', greatest(coalesce(p_page, 1), 1),
    'tamanho', v_size,
    'cartoes', (SELECT jsonb_build_object(
                  'expedidos_sem_entrega', count(*) FILTER (WHERE c_exp_sem_entrega),
                  'nao_entregues',         count(*) FILTER (WHERE c_nao_entregue),
                  'erro_erp',              count(*) FILTER (WHERE c_erro_erp),
                  'entrega_nao_gerada',    count(*) FILTER (WHERE c_nao_gerada),
                  'entregues',             count(*) FILTER (WHERE entrega_status = 'entregue'),
                  'em_rota',               count(*) FILTER (WHERE entrega_status = 'em_rota'),
                  'total',                 count(*))
                  FROM marcada),
    'linhas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'numero_pedido', p.numero_pedido, 'codigo_erp', p.codigo_erp,
               'data_emissao', p.data_emissao, 'status', p.status,
               'cliente', coalesce(nullif(btrim(pa.nome_fantasia), ''), pa.razaosocial),
               'cidade', pa.cidade, 'uf', pa.estado,
               'tipo_saida', ts.descricao,
               'numero_nf', nf.numero_nf,
               'etapa', p.etapa, 'etapa_em', p.etapa_em,
               'onda_numero', p.etapa_onda_numero, 'carga_numero', p.etapa_carga_numero,
               'entrega_status', p.entrega_status, 'entrega_em', p.entrega_em,
               'entrega_motivo', p.entrega_motivo, 'entrega_tentativas', p.entrega_tentativas,
               'integracao', jsonb_build_object(
                 'estado', p.integracao_estado, 'evento', p.integracao_evento, 'em', p.integracao_em,
                 'erro', p.integracao_erro, 'erros_outros', p.integracao_erros_outros, 'marcador', p.status_integracao))
             ORDER BY p.data_emissao DESC NULLS LAST, p.numero_pedido DESC)
        FROM pagina p
        LEFT JOIN parceiro pa ON pa.id = p.parceiro_id
        LEFT JOIN tipo_saida ts ON ts.id = p.tipo_id
        LEFT JOIN LATERAL (SELECT v.numero_nf FROM vw_documento_saida_nf_vigente v
                            WHERE v.documento_saida_id = p.id LIMIT 1) nf ON true
    ), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_pedidos_acompanhamento(uuid, date, date, text, text[], text[], text[], text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_pedidos_acompanhamento(uuid, date, date, text, text[], text[], text[], text, integer, integer) TO authenticated, service_role;

-- 2) Situação de um pedido (detalhe) ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_pedido_situacao(p_documento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_tenant uuid := public._fn_situacao_pedido_autorizar(NULL);
  v_res    jsonb;
BEGIN
  SELECT jsonb_build_object(
    'documento_id', ds.id, 'status', ds.status,
    'etapa', ds.etapa, 'etapa_em', ds.etapa_em,
    'entrega_status', ds.entrega_status, 'entrega_em', ds.entrega_em,
    'entrega_motivo', ds.entrega_motivo, 'entrega_tentativas', ds.entrega_tentativas,
    'integracao', integracao.fn_documento_integracao_json('documento_saida', ds.id),
    'onda', (SELECT jsonb_build_object('id', ms.id, 'numero', ms.numero_onda, 'status', ms.status)
               FROM movimento_saida_documento msd JOIN movimento_saida ms ON ms.id = msd.movimento_saida_id
              WHERE msd.documento_saida_id = ds.id
              ORDER BY (ms.status::text <> 'CANCELADA') DESC, ms.created_at DESC LIMIT 1),
    'carga', (SELECT jsonb_build_object('id', c.id, 'numero', c.numero_carga, 'status', c.status,
                       'modalidade', c.modalidade, 'ativo', cd.ativo, 'embarcado_em', cd.embarcado_em,
                       'placa', coalesce(nullif(btrim(c.placa), ''), v.placa), 'veiculo', v.descricao,
                       'motorista', c.motorista, 'liberada_em', c.liberada_em, 'fechada_em', c.fechada_em,
                       'transportadora', t.razaosocial)
                FROM carga_documento cd JOIN carga c ON c.id = cd.carga_id
                LEFT JOIN veiculos v ON v.id = c.veiculo_id
                LEFT JOIN parceiro t ON t.id = c.transportadora_id
               WHERE cd.documento_saida_id = ds.id
               ORDER BY cd.ativo DESC, (c.status <> 'CANCELADA') DESC, c.created_at DESC LIMIT 1),
    'entrega', (SELECT jsonb_build_object('id', e.id, 'status', e.status, 'entregador', u.nome,
                         'atribuida_em', e.atribuida_em, 'aceita_em', e.aceita_em, 'concluida_em', e.concluida_em,
                         'parada_status', p.status, 'parada_sequencia', p.sequencia, 'recebedor_nome', p.recebedor_nome)
                  FROM entrega_parada p JOIN entrega e ON e.id = p.entrega_id
                  LEFT JOIN usuario u ON u.id = e.usuario_id
                 WHERE p.documento_saida_id = ds.id
                 ORDER BY (e.status <> 'CANCELADA') DESC, e.created_at DESC LIMIT 1),
    'tentativas', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'numero', t.numero_tentativa, 'resultado', t.resultado, 'registrada_em', t.registrada_em,
               'entregador', u.nome, 'motivo', mo.descricao, 'recebedor_nome', t.recebedor_nome,
               'ressalvas', t.ressalvas, 'estornada_em', t.estornada_em, 'motivo_estorno', t.motivo_estorno)
             ORDER BY t.registrada_em, t.created_at)
        FROM entrega_tentativa t
        LEFT JOIN usuario u ON u.id = t.usuario_id
        LEFT JOIN motivo_ocorrencia mo ON mo.id = t.motivo_ocorrencia_id
       WHERE t.documento_saida_id = ds.id), '[]'::jsonb))
    INTO v_res
    FROM documento_saida ds
   WHERE ds.id = p_documento_id AND ds.tenant_id = v_tenant;

  IF v_res IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = jsonb_build_object(
      'codigo', 'DOCUMENTO_NAO_ENCONTRADO', 'mensagem', 'Pedido não encontrado.')::text;
  END IF;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_pedido_situacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_pedido_situacao(uuid) TO authenticated, service_role;

-- 3) Lista de ondas com o resumo de entrega (muda o tipo de retorno: DROP + CREATE) --------------
DO $lista$
DECLARE
  v_sig  constant text := 'public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text)';
  v_def  text := pg_get_functiondef(v_sig::regprocedure);
  a1 constant text := $t$qtd_sem_saldo integer)$t$;
  a2 constant text := 'coalesce\(pend\.n, 0\)\s+as qtd_sem_saldo';
BEGIN
  IF position('entrega_resumo' in v_def) > 0 THEN RETURN; END IF;
  IF position(a1 in v_def) = 0 OR v_def !~* a2 THEN
    RAISE EXCEPTION 'Trecho esperado não encontrado em rpc_ondas_carregamento_lista';
  END IF;
  v_def := replace(v_def, a1, $t$qtd_sem_saldo integer, entrega_resumo text, entrega_total integer, entrega_entregues integer, entrega_nao_entregues integer)$t$);
  v_def := regexp_replace(v_def, a2, $t$coalesce(pend.n, 0) as qtd_sem_saldo,
         ms.entrega_resumo, ms.entrega_total, ms.entrega_entregues, ms.entrega_nao_entregues$t$, 'i');
  EXECUTE 'DROP FUNCTION ' || v_sig;
  EXECUTE v_def;
  EXECUTE 'REVOKE ALL ON FUNCTION ' || v_sig || ' FROM PUBLIC, anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_sig || ' TO authenticated, service_role';
END
$lista$;

-- 4) Entrega: integração por parada ---------------------------------------------------------------
DO $ent$
DECLARE
  v_sig constant text := 'public._fn_entrega_json(uuid)';
  v_def text := pg_get_functiondef(v_sig::regprocedure);
  a1 constant text := $t$'finalizada_em', p.finalizada_em,$t$;
BEGIN
  IF position('fn_documento_integracao_json' in v_def) > 0 THEN RETURN; END IF;
  IF position(a1 in v_def) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado não encontrado em _fn_entrega_json';
  END IF;
  EXECUTE replace(v_def, a1, $t$'finalizada_em', p.finalizada_em,
        'integracao', integracao.fn_documento_integracao_json('documento_saida', p.documento_saida_id),
        'situacao', jsonb_build_object('etapa', ds.etapa, 'entrega_status', ds.entrega_status, 'entrega_motivo', ds.entrega_motivo),$t$);
END
$ent$;
