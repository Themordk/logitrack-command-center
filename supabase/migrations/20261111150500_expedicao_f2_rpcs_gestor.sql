-- =============================================================================
-- Expedição por etapas — Fase 2: RPCs da tela "Responsáveis da onda" (convocação manual)
--   rpc_onda_responsaveis_obter      -> etapas, modo, status, contagens, convocados e operadores atuais
--   rpc_onda_operadores_elegiveis    -> quem pode ser convocado para a etapa (R7, R3, R9), com motivo
--   rpc_onda_responsaveis_salvar     -> grava a convocação e aplica, tudo ou nada; modo simular
-- O gestor é identificado pela sessão (auth.uid()); p_usuario_id só vale em chamadas internas.
-- Reversão: DROP das funções criadas aqui.
-- =============================================================================

-- 1. Quem está chamando
CREATE OR REPLACE FUNCTION public._fn_gestor_sessao(p_usuario_id uuid, p_tenant_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  v_id uuid;
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN p_usuario_id;
  END IF;
  SELECT u.id INTO v_id FROM usuario u
  WHERE u.auth_user_id = auth.uid() AND u.tenant_id = p_tenant_id
  ORDER BY (u.id = p_usuario_id) DESC NULLS LAST
  LIMIT 1;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public._fn_gestor_sessao(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._fn_usuario_pode_convocar(p_usuario_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM usuario u
                 WHERE u.id = p_usuario_id AND u.ativo
                   AND (u.tipo_usuario::text IN ('ADMINISTRADOR', 'GESTOR')
                        OR public.fn_usuario_tem_permissao(u.id, 'web.atividades.mov-saida', 'UPDATE')));
$$;
REVOKE ALL ON FUNCTION public._fn_usuario_pode_convocar(uuid) FROM PUBLIC, anon, authenticated;

-- 2. Elegibilidade de um operador para uma etapa da onda
--    p_conv_sep / p_conv_conf: convocados pretendidos (NULL = os atuais), para checar R9 antes de gravar
CREATE OR REPLACE FUNCTION public._fn_usuario_elegivel_etapa(
  p_movimento_saida_id uuid, p_tipo_tarefa_id uuid, p_usuario_id uuid,
  p_conv_sep uuid[] DEFAULT NULL, p_conv_conf uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_empresa uuid; v_codigo text; v_modulo text;
  v_u record; v_por_zona boolean; v_permite boolean; v_conf_id uuid; v_sep_id uuid;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id INTO v_tenant, v_empresa FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt WHERE tt.id = p_tipo_tarefa_id AND tt.tenant_id = v_tenant;
  SELECT u.id, u.ativo, u.tenant_id, u.empresa_id, u.tipo_usuario::text AS tipo_usuario, u.zona_atividade_separacao
    INTO v_u FROM usuario u WHERE u.id = p_usuario_id;

  IF v_u.id IS NULL OR v_u.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_INVALIDO', 'mensagem', 'Usuário não encontrado.');
  END IF;
  IF NOT COALESCE(v_u.ativo, false) THEN
    RETURN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_INATIVO', 'mensagem', 'Usuário inativo.');
  END IF;
  IF v_u.empresa_id IS NOT NULL AND v_u.empresa_id <> v_empresa THEN
    RETURN jsonb_build_object('elegivel', false, 'codigo', 'OUTRA_EMPRESA', 'mensagem', 'Usuário de outra empresa.');
  END IF;

  v_modulo := CASE v_codigo WHEN 'SEP' THEN 'coletor.separacao' WHEN 'SEP-CONF' THEN 'coletor.conferencia' END;
  IF v_modulo IS NOT NULL AND COALESCE(v_u.tipo_usuario, '') <> 'ADMINISTRADOR' AND NOT EXISTS (
       SELECT 1 FROM usuario_perfil up
       JOIN perfil_permissao pp ON pp.perfil_id = up.perfil_id AND pp.tenant_id = up.tenant_id
       JOIN permissao pe ON pe.id = pp.permissao_id
       JOIN modulo m ON m.id = pe.modulo_id AND m.ativo
       WHERE up.usuario_id = p_usuario_id AND m.codigo = v_modulo) THEN
    RETURN jsonb_build_object('elegivel', false, 'codigo', 'SEM_PERMISSAO',
      'mensagem', CASE v_codigo WHEN 'SEP' THEN 'Sem permissão de separação no coletor.'
                                ELSE 'Sem permissão de conferência no coletor.' END);
  END IF;

  SELECT i.por_zona INTO v_por_zona FROM public.fn_onda_etapa_info(p_movimento_saida_id, p_tipo_tarefa_id) i;
  IF COALESCE(v_por_zona, false) AND v_u.zona_atividade_separacao IS NULL THEN
    RETURN jsonb_build_object('elegivel', false, 'codigo', 'SEM_ZONA_CADASTRADA', 'mensagem', 'Sem zona de atividade cadastrada.');
  END IF;

  -- R9
  SELECT tt.id INTO v_conf_id FROM tipo_tarefa tt WHERE tt.tenant_id = v_tenant AND tt.codigo = 'SEP-CONF' LIMIT 1;
  SELECT tt.id INTO v_sep_id  FROM tipo_tarefa tt WHERE tt.tenant_id = v_tenant AND tt.codigo = 'SEP' LIMIT 1;
  SELECT i.permite_mesmo_operador INTO v_permite FROM public.fn_onda_etapa_info(p_movimento_saida_id, v_conf_id) i;

  IF NOT COALESCE(v_permite, true) THEN
    IF v_codigo = 'SEP-CONF' AND (
         p_usuario_id = ANY (COALESCE(p_conv_sep,
             ARRAY(SELECT r.usuario_id FROM movimento_saida_responsavel r
                   WHERE r.movimento_saida_id = p_movimento_saida_id AND r.tipo_tarefa_id = v_sep_id AND r.ativo)))
      OR EXISTS (SELECT 1 FROM tarefa_execucao te
                 JOIN tarefa t ON t.id = te.tarefa_id AND t.tipo_tarefa_id = v_sep_id
                 JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
                 WHERE msi.movimento_saida_id = p_movimento_saida_id
                   AND te.usuario_id = p_usuario_id AND te.status = 'CONCLUIDA')) THEN
      RETURN jsonb_build_object('elegivel', false, 'codigo', 'MESMO_OPERADOR_SEPARACAO',
        'mensagem', 'Separou ou está convocado para a separação desta onda.');
    END IF;
    IF v_codigo = 'SEP' AND p_usuario_id = ANY (COALESCE(p_conv_conf,
           ARRAY(SELECT r.usuario_id FROM movimento_saida_responsavel r
                 WHERE r.movimento_saida_id = p_movimento_saida_id AND r.tipo_tarefa_id = v_conf_id AND r.ativo))) THEN
      RETURN jsonb_build_object('elegivel', false, 'codigo', 'MESMO_OPERADOR_CONFERENCIA',
        'mensagem', 'Está convocado para a conferência desta onda.');
    END IF;
  END IF;

  RETURN jsonb_build_object('elegivel', true, 'codigo', 'OK', 'mensagem', NULL);
END $$;
REVOKE ALL ON FUNCTION public._fn_usuario_elegivel_etapa(uuid, uuid, uuid, uuid[], uuid[]) FROM PUBLIC, anon, authenticated;

-- 3. Dados do modal
CREATE OR REPLACE FUNCTION public.rpc_onda_responsaveis_obter(p_movimento_saida_id uuid, p_usuario_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_numero bigint; v_status text; v_gestor uuid; v_final boolean;
  r record; v_info record; v_stats record; v_etapa_status text;
  v_etapas jsonb := '[]'::jsonb; v_conv jsonb; v_ops jsonb;
BEGIN
  SELECT ms.tenant_id, ms.numero_onda, ms.status::text INTO v_tenant, v_numero, v_status
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_NAO_ENCONTRADA', 'mensagem', 'Onda não encontrada.');
  END IF;
  PERFORM public.assert_tenant_access(v_tenant);
  v_gestor := public._fn_gestor_sessao(p_usuario_id, v_tenant);
  v_final := v_status IN ('CONCLUIDA', 'CANCELADA', 'EXPORTADA_ERP');

  FOR r IN SELECT tt.id, tt.codigo, tt.descricao, tt.etapa_onda_ordem
           FROM tipo_tarefa tt WHERE tt.tenant_id = v_tenant AND tt.etapa_onda_ordem IS NOT NULL
           ORDER BY tt.etapa_onda_ordem
  LOOP
    SELECT i.* INTO v_info FROM public.fn_onda_etapa_info(p_movimento_saida_id, r.id) i;

    SELECT count(*) AS total,
           count(*) FILTER (WHERE t.status = 'CONCLUIDA') AS concluidas,
           count(*) FILTER (WHERE t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
                              AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)) AS abertas,
           count(*) FILTER (WHERE t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
                              AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0) AND ta.id IS NULL) AS livres,
           count(*) FILTER (WHERE ta.id IS NOT NULL) AS com_dono,
           count(*) FILTER (WHERE t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
                              AND COALESCE(t.quantidade_executada, 0) > 0) AS com_progresso,
           COALESCE(sum(t.quantidade_requerida), 0) AS qtd_requerida,
           COALESCE(sum(COALESCE(t.quantidade_executada, 0)), 0) AS qtd_executada
      INTO v_stats
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    LEFT JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
    WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tenant_id = v_tenant
      AND t.tipo_tarefa_id = r.id AND t.status <> 'CANCELADA';

    v_etapa_status := CASE
      WHEN NOT COALESCE(v_info.ativa, true) THEN 'NAO_SE_APLICA'
      WHEN v_stats.total = 0 THEN 'NAO_GERADA'
      WHEN v_stats.abertas = 0 THEN 'CONCLUIDA'
      WHEN v_stats.com_dono > 0 OR v_stats.qtd_executada > 0 THEN 'EM_ANDAMENTO'
      ELSE 'AGUARDANDO' END;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('usuario_id', m.usuario_id, 'nome', u.nome,
             'definido_por', g.nome, 'definido_em', m.definido_em) ORDER BY u.nome), '[]'::jsonb)
      INTO v_conv
    FROM movimento_saida_responsavel m
    JOIN usuario u ON u.id = m.usuario_id
    LEFT JOIN usuario g ON g.id = m.definido_por
    WHERE m.movimento_saida_id = p_movimento_saida_id AND m.tipo_tarefa_id = r.id AND m.ativo;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('usuario_id', x.usuario_id, 'nome', x.nome, 'tarefas', x.n,
             'com_progresso', x.prog, 'origem', x.origem) ORDER BY x.nome), '[]'::jsonb)
      INTO v_ops
    FROM (SELECT ta.usuario_id, u.nome, count(*) AS n,
                 count(*) FILTER (WHERE COALESCE(t.quantidade_executada, 0) > 0) AS prog,
                 CASE WHEN bool_or(ta.tipo_convocacao = 'CONVOCACAO_GESTOR') THEN 'GESTOR' ELSE 'COLETOR' END AS origem
          FROM tarefa t
          JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
          JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
          JOIN usuario u ON u.id = ta.usuario_id
          WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tipo_tarefa_id = r.id
            AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
          GROUP BY ta.usuario_id, u.nome) x;

    v_etapas := v_etapas || jsonb_build_array(jsonb_build_object(
      'tipo_tarefa_id', r.id, 'codigo', r.codigo, 'nome', r.descricao, 'ordem', r.etapa_onda_ordem,
      'modo', v_info.modo, 'ativa', COALESCE(v_info.ativa, true), 'por_zona', COALESCE(v_info.por_zona, false),
      'permite_mesmo_operador', COALESCE(v_info.permite_mesmo_operador, true),
      'status', v_etapa_status,
      'travada', v_final OR v_etapa_status IN ('CONCLUIDA', 'NAO_SE_APLICA'),
      'totais', jsonb_build_object('total', v_stats.total, 'concluidas', v_stats.concluidas,
                  'abertas', v_stats.abertas, 'livres', v_stats.livres, 'com_dono', v_stats.com_dono,
                  'com_progresso', v_stats.com_progresso,
                  'qtd_requerida', v_stats.qtd_requerida, 'qtd_executada', v_stats.qtd_executada),
      'convocados', v_conv,
      'operadores', v_ops));
  END LOOP;

  RETURN jsonb_build_object('sucesso', true,
    'onda', jsonb_build_object('id', p_movimento_saida_id, 'numero_onda', v_numero, 'status', v_status, 'editavel', NOT v_final),
    'pode_convocar', COALESCE(public._fn_usuario_pode_convocar(v_gestor), false),
    'etapas', v_etapas);
END $$;

-- 4. Operadores que podem ser convocados para a etapa
CREATE OR REPLACE FUNCTION public.rpc_onda_operadores_elegiveis(
  p_movimento_saida_id uuid, p_tipo_tarefa_id uuid, p_busca text DEFAULT NULL, p_usuario_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_codigo text; v_funcao text; v_res jsonb;
BEGIN
  SELECT ms.tenant_id INTO v_tenant FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  IF v_tenant IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  PERFORM public.assert_tenant_access(v_tenant);

  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt WHERE tt.id = p_tipo_tarefa_id AND tt.tenant_id = v_tenant;
  v_funcao := CASE v_codigo WHEN 'SEP' THEN 'SEPARACAO' WHEN 'SEP-CONF' THEN 'CONFERENCIA' END;

  SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.elegivel DESC, x.funcao DESC, x.logado DESC, x.carga, x.nome), '[]'::jsonb)
    INTO v_res
  FROM (
    SELECT u.nome,
           (el ->> 'elegivel')::boolean AS elegivel,
           COALESCE(u.tipo_operacao::text = v_funcao, false) AS funcao,
           COALESCE(s.logado, false) AS logado,
           COALESCE(c.carga, 0) AS carga,
           jsonb_build_object(
             'usuario_id', u.id, 'nome', u.nome, 'login', u.login,
             'funcao_principal', u.tipo_operacao, 'funcao_igual_etapa', COALESCE(u.tipo_operacao::text = v_funcao, false),
             'zona', za.descricao, 'logado', COALESCE(s.logado, false),
             'tarefas_abertas', COALESCE(c.carga, 0),
             'convocado', EXISTS (SELECT 1 FROM movimento_saida_responsavel m
                                  WHERE m.movimento_saida_id = p_movimento_saida_id AND m.tipo_tarefa_id = p_tipo_tarefa_id
                                    AND m.usuario_id = u.id AND m.ativo),
             'elegivel', (el ->> 'elegivel')::boolean,
             'motivo', el ->> 'codigo', 'mensagem', el ->> 'mensagem') AS obj
    FROM usuario u
    CROSS JOIN LATERAL public._fn_usuario_elegivel_etapa(p_movimento_saida_id, p_tipo_tarefa_id, u.id) el
    LEFT JOIN zona_atividade za ON za.id = u.zona_atividade_separacao
    LEFT JOIN LATERAL (
      SELECT true AS logado FROM log_sessao_usuario ls
      WHERE ls.usuario_id = u.id AND ls.fim_sessao IS NULL
        AND COALESCE(ls.ultimo_heartbeat, ls.inicio_sessao) > now() - interval '15 minutes'
      LIMIT 1) s ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS carga FROM tarefa_atribuicao ta
      JOIN tarefa t ON t.id = ta.tarefa_id
      WHERE ta.usuario_id = u.id AND ta.liberado_em IS NULL
        AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')) c ON true
    WHERE u.tenant_id = v_tenant AND u.ativo
      AND (p_busca IS NULL OR u.nome ILIKE '%' || p_busca || '%' OR u.login ILIKE '%' || p_busca || '%')
  ) x;

  RETURN v_res;
END $$;

-- 5. Salvar a convocação (tudo ou nada)
--    p_alteracoes: [{"tipo_tarefa_id": "...", "usuarios": ["uuid", ...]}]  ([] = etapa livre)
CREATE OR REPLACE FUNCTION public.rpc_onda_responsaveis_salvar(
  p_movimento_saida_id uuid, p_alteracoes jsonb,
  p_confirmar_progresso boolean DEFAULT false, p_motivo text DEFAULT NULL,
  p_simular boolean DEFAULT false, p_usuario_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_empresa uuid; v_status text; v_numero bigint; v_gestor uuid;
  v_sep uuid; v_conf uuid; v_conv_sep uuid[]; v_conv_conf uuid[];
  v_alt jsonb; v_tipo uuid; v_codigo text; v_nome_etapa text; v_ordem smallint;
  v_modo text; v_ativa boolean; v_novos uuid[]; v_u uuid; v_el jsonb;
  v_erros jsonb := '[]'::jsonb; v_resumo jsonb := '[]'::jsonb; v_res jsonb; v_nomes text;
  v_total_prog integer := 0; v_dev integer; v_precisa_confirmar boolean := false; ra record;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id, ms.status::text, ms.numero_onda
    INTO v_tenant, v_empresa, v_status, v_numero
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id
  FOR UPDATE;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_NAO_ENCONTRADA', 'mensagem', 'Onda não encontrada.');
  END IF;
  PERFORM public.assert_tenant_access(v_tenant);

  v_gestor := public._fn_gestor_sessao(p_usuario_id, v_tenant);
  IF v_gestor IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'USUARIO_NAO_IDENTIFICADO', 'mensagem', 'Não foi possível identificar o usuário da sessão.');
  END IF;
  IF NOT public._fn_usuario_pode_convocar(v_gestor) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_PERMISSAO', 'mensagem', 'Você não tem permissão para convocar operadores nesta onda.');
  END IF;
  IF v_status IN ('CONCLUIDA', 'CANCELADA', 'EXPORTADA_ERP') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_FINALIZADA', 'mensagem', format('Onda #%s está %s.', v_numero, v_status));
  END IF;
  IF p_alteracoes IS NULL OR jsonb_typeof(p_alteracoes) <> 'array' OR jsonb_array_length(p_alteracoes) = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'PARAMETROS', 'mensagem', 'Nenhuma alteração informada.');
  END IF;

  SELECT tt.id INTO v_sep  FROM tipo_tarefa tt WHERE tt.tenant_id = v_tenant AND tt.codigo = 'SEP' LIMIT 1;
  SELECT tt.id INTO v_conf FROM tipo_tarefa tt WHERE tt.tenant_id = v_tenant AND tt.codigo = 'SEP-CONF' LIMIT 1;

  -- Convocação pretendida após a gravação (para checar R9 entre etapas)
  v_conv_sep := ARRAY(SELECT r.usuario_id FROM movimento_saida_responsavel r
                      WHERE r.movimento_saida_id = p_movimento_saida_id AND r.tipo_tarefa_id = v_sep AND r.ativo);
  v_conv_conf := ARRAY(SELECT r.usuario_id FROM movimento_saida_responsavel r
                       WHERE r.movimento_saida_id = p_movimento_saida_id AND r.tipo_tarefa_id = v_conf AND r.ativo);
  FOR v_alt IN SELECT value FROM jsonb_array_elements(p_alteracoes) LOOP
    v_tipo := NULLIF(v_alt ->> 'tipo_tarefa_id', '')::uuid;
    v_novos := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(COALESCE(v_alt -> 'usuarios', '[]'::jsonb)) x);
    IF v_tipo = v_sep THEN v_conv_sep := v_novos; ELSIF v_tipo = v_conf THEN v_conv_conf := v_novos; END IF;
  END LOOP;

  -- Validação completa antes de gravar
  FOR v_alt IN SELECT value FROM jsonb_array_elements(p_alteracoes) LOOP
    v_tipo := NULLIF(v_alt ->> 'tipo_tarefa_id', '')::uuid;
    SELECT tt.codigo, tt.descricao INTO v_codigo, v_nome_etapa FROM tipo_tarefa tt
    WHERE tt.id = v_tipo AND tt.tenant_id = v_tenant AND tt.etapa_onda_ordem IS NOT NULL;
    IF v_codigo IS NULL THEN
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('tipo_tarefa_id', v_tipo, 'codigo', 'ETAPA_INVALIDA', 'mensagem', 'Etapa inválida.'));
      CONTINUE;
    END IF;

    SELECT i.modo, i.ativa INTO v_modo, v_ativa FROM public.fn_onda_etapa_info(p_movimento_saida_id, v_tipo) i;
    IF NOT COALESCE(v_ativa, true) THEN
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('tipo_tarefa_id', v_tipo, 'codigo', 'ETAPA_INATIVA',
                   'mensagem', format('%s não se aplica a esta onda.', v_nome_etapa)));
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM tarefa t JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
               WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tipo_tarefa_id = v_tipo AND t.status <> 'CANCELADA')
       AND NOT EXISTS (SELECT 1 FROM tarefa t JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
               WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tipo_tarefa_id = v_tipo
                 AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
                 AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)) THEN
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('tipo_tarefa_id', v_tipo, 'codigo', 'ETAPA_CONCLUIDA',
                   'mensagem', format('%s já foi concluída.', v_nome_etapa)));
      CONTINUE;
    END IF;

    v_novos := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(COALESCE(v_alt -> 'usuarios', '[]'::jsonb)) x);
    IF v_modo = 'EXCLUSIVA' AND cardinality(v_novos) > 1 THEN
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('tipo_tarefa_id', v_tipo, 'codigo', 'UM_RESPONSAVEL',
                   'mensagem', format('%s tem reserva total e aceita um único responsável.', v_nome_etapa)));
      CONTINUE;
    END IF;

    FOREACH v_u IN ARRAY v_novos LOOP
      v_el := public._fn_usuario_elegivel_etapa(p_movimento_saida_id, v_tipo, v_u, v_conv_sep, v_conv_conf);
      IF NOT (v_el ->> 'elegivel')::boolean THEN
        v_erros := v_erros || jsonb_build_array(jsonb_build_object('tipo_tarefa_id', v_tipo, 'usuario_id', v_u,
                     'codigo', v_el ->> 'codigo',
                     'mensagem', format('%s: %s', (SELECT u.nome FROM usuario u WHERE u.id = v_u), v_el ->> 'mensagem')));
      END IF;
    END LOOP;
  END LOOP;

  IF jsonb_array_length(v_erros) > 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VALIDACAO', 'mensagem', v_erros -> 0 ->> 'mensagem', 'erros', v_erros);
  END IF;

  -- Gravação + aplicação. Simulação ou falta de confirmação desfazem tudo (bloco com rollback).
  BEGIN
    FOR v_alt IN SELECT value FROM jsonb_array_elements(p_alteracoes) LOOP
      v_tipo := (v_alt ->> 'tipo_tarefa_id')::uuid;
      SELECT tt.codigo, tt.descricao, tt.etapa_onda_ordem INTO v_codigo, v_nome_etapa, v_ordem FROM tipo_tarefa tt WHERE tt.id = v_tipo;
      v_novos := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(COALESCE(v_alt -> 'usuarios', '[]'::jsonb)) x);

      UPDATE movimento_saida_responsavel
         SET ativo = false, removido_por = v_gestor, removido_em = now()
       WHERE movimento_saida_id = p_movimento_saida_id AND tipo_tarefa_id = v_tipo AND ativo
         AND NOT (usuario_id = ANY (v_novos));

      INSERT INTO movimento_saida_responsavel (tenant_id, empresa_id, movimento_saida_id, tipo_tarefa_id,
                                               usuario_id, definido_por, observacao)
      SELECT v_tenant, v_empresa, p_movimento_saida_id, v_tipo, x, v_gestor, p_motivo
      FROM unnest(v_novos) x
      WHERE NOT EXISTS (SELECT 1 FROM movimento_saida_responsavel m
                        WHERE m.movimento_saida_id = p_movimento_saida_id AND m.tipo_tarefa_id = v_tipo
                          AND m.usuario_id = x AND m.ativo);

      v_dev := 0;
      IF cardinality(v_novos) = 0 THEN
        -- Etapa volta a ficar livre: tarefas convocadas pelo gestor voltam para a fila
        FOR ra IN
          SELECT t.id AS tarefa_id, ta.id AS atr_id, ta.usuario_id, COALESCE(t.quantidade_executada, 0) > 0 AS progresso
          FROM tarefa t
          JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
          JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
                                   AND ta.tipo_convocacao = 'CONVOCACAO_GESTOR'
          WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tipo_tarefa_id = v_tipo
            AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
          FOR UPDATE OF t
        LOOP
          UPDATE tarefa_atribuicao
             SET status = 'LIBERADA', liberado_em = now(), liberado_por = v_gestor,
                 motivo_liberacao = 'DEVOLUCAO_FILA', observacao = COALESCE(p_motivo, observacao)
           WHERE id = ra.atr_id;
          UPDATE tarefa SET status = 'CRIADA' WHERE id = ra.tarefa_id AND status = 'ATRIBUIDA';
          INSERT INTO tarefa_evento_execucao (tenant_id, tarefa_id, tipo_evento, carga_util, created_by)
          VALUES (v_tenant, ra.tarefa_id, 'REATRIBUICAO',
                  jsonb_build_object('origem', 'GESTOR', 'acao', 'DEVOLUCAO_FILA', 'de', ra.usuario_id, 'para', NULL,
                                     'movimento_saida_id', p_movimento_saida_id, 'numero_onda', v_numero,
                                     'etapa', v_codigo, 'com_progresso', ra.progresso, 'motivo', p_motivo),
                  v_gestor);
          v_dev := v_dev + 1;
          IF ra.progresso THEN v_total_prog := v_total_prog + 1; END IF;
        END LOOP;
        v_res := jsonb_build_object('aplicado', true, 'tarefas_devolvidas', v_dev, 'livre', true);
      ELSE
        v_res := public.fn_onda_aplicar_responsaveis(p_movimento_saida_id, v_tipo, v_gestor, true, p_motivo, false);
        v_total_prog := v_total_prog + COALESCE((v_res ->> 'com_progresso')::integer, 0);
      END IF;

      SELECT string_agg(u.nome, ', ' ORDER BY u.nome) INTO v_nomes FROM usuario u WHERE u.id = ANY (v_novos);
      v_resumo := v_resumo || jsonb_build_array(v_res || jsonb_build_object(
        'tipo_tarefa_id', v_tipo, 'etapa', v_nome_etapa, 'codigo_etapa', v_codigo, 'ordem', v_ordem,
        'convocados', COALESCE(v_nomes, 'Livre (autoconvocação)')));
    END LOOP;

    v_precisa_confirmar := v_total_prog > 0 AND NOT p_confirmar_progresso;
    IF p_simular OR v_precisa_confirmar THEN
      RAISE EXCEPTION 'desfazer' USING ERRCODE = 'P0099';
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0099' THEN
    NULL;
  END;

  IF v_precisa_confirmar AND NOT p_simular THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'CONFIRMAR_PROGRESSO',
      'mensagem', format('%s tarefa(s) com progresso mudarão de dono e continuarão de onde pararam. Confirme para aplicar.', v_total_prog),
      'com_progresso', v_total_prog, 'resumo', v_resumo);
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'simulado', p_simular,
    'codigo', CASE WHEN p_simular THEN 'SIMULACAO' ELSE 'APLICADO' END,
    'mensagem', CASE WHEN p_simular THEN 'Prévia do que será aplicado.' ELSE 'Convocação aplicada.' END,
    'com_progresso', v_total_prog, 'resumo', v_resumo);
END $$;

-- 6. Permissões
REVOKE ALL ON FUNCTION public.rpc_onda_responsaveis_obter(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_onda_operadores_elegiveis(uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_onda_responsaveis_salvar(uuid, jsonb, boolean, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_onda_responsaveis_obter(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_onda_operadores_elegiveis(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_onda_responsaveis_salvar(uuid, jsonb, boolean, text, boolean, uuid) TO authenticated;
