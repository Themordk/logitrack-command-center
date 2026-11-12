-- =============================================================================
-- Expedição por etapas — Fase 2: rotinas do coletor com convocação híbrida
--   Reescritas (backup *_bkp_20261111 criado antes):
--     fn_gerar_conferencia_saida    -> R10 (sem conferência conclui) + aplica convocação do gestor
--     fn_conferencia_validar_onda   -> modo gravado na onda, convocação, R9; sem filtro de zona (R4)
--     conferencia_buscar_tarefas    -> aplica convocação, autoconvoca só tarefas livres
--     separacao_buscar_ondas        -> só mostra ondas que o operador pode pegar; convocadas no topo
--     separacao_buscar_tarefas      -> aplica convocação; autoconvoca conforme o modo; zona só por roteiro
--   Novas para o coletor (R1.1):
--     rpc_coletor_onda_resumo, rpc_coletor_assumir_etapa, rpc_coletor_sair_etapa
--   Compatibilidade: separacao_buscar_tarefas e conferencia_buscar_tarefas continuam
--   assumindo ao abrir quando a etapa está livre, para o coletor atual seguir funcionando
--   até a tela nova (Assumir / Sair) ser publicada.
-- Reversão: recriar as funções a partir das cópias *_bkp_20261111 e dropar as rpc_coletor_*.
-- =============================================================================

-- 0. Backups das versões atuais
DO $$
DECLARE r record; v_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_gerar_conferencia_saida', 'fn_conferencia_validar_onda', 'conferencia_buscar_tarefas',
                        'separacao_buscar_ondas', 'separacao_buscar_tarefas')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'FUNCTION public.' || r.proname || '(', 'FUNCTION public.' || r.proname || '_bkp_20261111(');
    EXECUTE v_def;
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE '%\_bkp\_20261111' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.f);
  END LOOP;
END $$;

-- 1. Geração da conferência (R10 + convocação)
CREATE OR REPLACE FUNCTION public.fn_gerar_conferencia_saida(p_movimento_saida_id uuid, p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- v4 (2026-11-11): R10 — etapa de conferência inativa conclui a onda; aplica a convocação do gestor.
DECLARE
  v_tipo_tarefa_id uuid;
  v_empresa_id uuid;
  v_status text;
  v_total_criadas integer;
  v_ativa boolean;
  v_aplicacao jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT empresa_id, ms.status
    INTO v_empresa_id, v_status
  FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id
    AND ms.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO',
      'mensagem', 'Movimento de saída não encontrado.');
  END IF;

  IF v_status NOT IN ('SEPARADO', 'EM_CONFERENCIA') THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'IGNORADO',
      'mensagem', format('Status %s não requer geração de conferência.', v_status));
  END IF;

  SELECT id INTO v_tipo_tarefa_id
  FROM tipo_tarefa
  WHERE codigo = 'SEP-CONF' AND tenant_id = p_tenant_id;

  IF v_tipo_tarefa_id IS NULL THEN
    RAISE EXCEPTION 'Tipo tarefa SEP-CONF não encontrado para o tenant.';
  END IF;

  PERFORM public.fn_onda_snapshot_etapas(p_movimento_saida_id);
  SELECT i.ativa INTO v_ativa FROM public.fn_onda_etapa_info(p_movimento_saida_id, v_tipo_tarefa_id) i;

  -- R10: tipo de saída sem conferência -> conclui ao fim da separação
  IF NOT COALESCE(v_ativa, true) THEN
    IF NOT EXISTS (SELECT 1 FROM tarefa tc JOIN movimento_saida_item mi ON mi.id = tc.id_documento_origem
                   WHERE mi.movimento_saida_id = p_movimento_saida_id AND tc.tenant_id = p_tenant_id
                     AND tc.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa)) THEN
      UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now()
       WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';
      RETURN jsonb_build_object('sucesso', true, 'codigo', 'CONCLUIDA_SEM_CONFERENCIA',
        'mensagem', 'Tipo de saída sem conferência: onda concluída ao fim da separação.');
    END IF;
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'SEM_CONFERENCIA_PENDENCIAS',
      'mensagem', 'Tipo de saída sem conferência, mas a onda ainda tem tarefas abertas.');
  END IF;

  WITH inserted AS (
    INSERT INTO tarefa (
      id, tenant_id, empresa_id, tipo_tarefa_id,
      id_documento_origem, tipo_documento_origem,
      produto_id, quantidade_requerida, armazem_id,
      status, criado_em
    )
    SELECT
      gen_random_uuid(),
      msi.tenant_id,
      v_empresa_id,
      v_tipo_tarefa_id,
      msi.id,
      'MOVIMENTO_SAIDA_ITEM',
      msi.produto_id,
      SUM(t.quantidade_executada),
      (SELECT e.armazem_id FROM endereco e
       WHERE e.id = (array_agg(t.id_local_origem) FILTER (WHERE t.id_local_origem IS NOT NULL))[1]),
      'CRIADA',
      now()
    FROM movimento_saida_item msi
    JOIN tarefa t ON msi.id = t.id_documento_origem
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND msi.tenant_id = p_tenant_id
      AND msi.status <> 'CANCELADO'::enum_status_item_onda
      AND COALESCE(t.quantidade_executada, 0) > 0
      AND t.tipo_tarefa_id <> v_tipo_tarefa_id
      AND t.status <> 'CANCELADA'::enum_status_tarefa
      AND NOT EXISTS (
        SELECT 1 FROM tarefa tc
        WHERE tc.id_documento_origem = msi.id
          AND tc.tenant_id = p_tenant_id
          AND tc.tipo_tarefa_id = v_tipo_tarefa_id
          AND tc.status <> 'CANCELADA'::enum_status_tarefa
      )
    GROUP BY msi.id, msi.tenant_id, msi.produto_id
    RETURNING id
  )
  SELECT COUNT(*) INTO v_total_criadas FROM inserted;

  IF v_total_criadas = 0 THEN
    -- onda 100% cortada (nada separado, nada a conferir) => conclui sem conferência
    IF EXISTS (SELECT 1 FROM movimento_saida_item mi
                WHERE mi.movimento_saida_id = p_movimento_saida_id AND mi.tenant_id = p_tenant_id)
       AND NOT EXISTS (SELECT 1 FROM movimento_saida_item mi
                WHERE mi.movimento_saida_id = p_movimento_saida_id AND mi.tenant_id = p_tenant_id
                  AND mi.status NOT IN ('CORTE_TOTAL'::enum_status_item_onda, 'CANCELADO'::enum_status_item_onda))
       AND NOT EXISTS (SELECT 1 FROM tarefa tc JOIN movimento_saida_item mi ON mi.id = tc.id_documento_origem
                WHERE mi.movimento_saida_id = p_movimento_saida_id AND tc.tenant_id = p_tenant_id
                  AND (tc.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa)
                       OR (tc.status <> 'CANCELADA'::enum_status_tarefa AND COALESCE(tc.quantidade_executada, 0) > 0)))
    THEN
      UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now()
       WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';
      RETURN jsonb_build_object('sucesso', true, 'codigo', 'CONCLUIDA_CORTE_TOTAL',
        'mensagem', 'Todos os itens foram cortados; movimento concluído sem conferência.');
    END IF;
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'JA_EXISTE',
      'mensagem', 'Tarefas de conferência já existem para este movimento.');
  END IF;

  -- Convocação manual feita antes da conferência existir passa a valer agora
  v_aplicacao := public.fn_onda_aplicar_responsaveis(p_movimento_saida_id, v_tipo_tarefa_id);

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', 'CONFERENCIA_GERADA',
    'mensagem', v_total_criadas || ' tarefa(s) de conferência gerada(s).',
    'dados', jsonb_build_object(
      'movimento_saida_id', p_movimento_saida_id,
      'total_tarefas_criadas', v_total_criadas,
      'convocacao', v_aplicacao));
END;
$$;

-- 2. Validação da conferência
CREATE OR REPLACE FUNCTION public.fn_conferencia_validar_onda(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- v3 (2026-11-11): convocação híbrida; modo gravado na onda; R9; sem filtro de zona (R4).
DECLARE
  v_ms           record;
  v_conf         uuid;
  v_ativa        boolean;
  v_modo         text;
  v_check        jsonb;
  v_cod          text;
  v_docs_sem_nf  integer;
  v_agrupamento  text[];
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT ms.id, ms.numero_onda, ms.status::text AS status
    INTO v_ms
  FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id
    AND ms.tenant_id = p_tenant_id
    AND ms.empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_ONDA_NAO_ENCONTRADA',
      'mensagem', 'Onda não encontrada nesta empresa.');
  END IF;

  IF v_ms.status NOT IN ('SEPARADO', 'EM_CONFERENCIA') THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_STATUS_ONDA',
      'mensagem', format('Onda #%s está %s e não pode ser conferida.', v_ms.numero_onda, v_ms.status));
  END IF;

  SELECT tt.id INTO v_conf FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = 'SEP-CONF' LIMIT 1;
  SELECT i.ativa, i.modo INTO v_ativa, v_modo FROM public.fn_onda_etapa_info(v_ms.id, v_conf) i;

  IF v_conf IS NULL OR NOT COALESCE(v_ativa, false) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_SEM_CONFERENCIA',
      'mensagem', format('O tipo de saída da onda #%s não realiza conferência.', v_ms.numero_onda));
  END IF;

  v_check := public.fn_onda_usuario_pode_executar(v_ms.id, v_conf, p_usuario_id);
  IF NOT COALESCE((v_check ->> 'permitido')::boolean, false) THEN
    v_cod := v_check ->> 'codigo';
    RETURN jsonb_build_object('permitido', false,
      'codigo', CASE v_cod WHEN 'ETAPA_JA_ASSUMIDA' THEN 'CONF_ONDA_RESERVADA'
                           WHEN 'SEM_TAREFAS_DISPONIVEIS' THEN 'CONF_SEM_TAREFAS'
                           ELSE 'CONF_' || v_cod END,
      'mensagem', format('Onda #%s: %s', v_ms.numero_onda, v_check ->> 'mensagem'));
  END IF;

  v_docs_sem_nf := public.fn_conferencia_docs_sem_nf(p_tenant_id, v_ms.id);
  IF v_docs_sem_nf > 0 THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_AGUARDANDO_NF',
      'mensagem', format('Onda #%s aguardando faturamento: %s pedido(s) sem NF autorizada.', v_ms.numero_onda, v_docs_sem_nf),
      'docs_sem_nf', v_docs_sem_nf);
  END IF;

  SELECT array_agg(ac.tipo_agrupamento::text ORDER BY ac.sequencia)
    INTO v_agrupamento
  FROM agrupamento_conferencia ac
  WHERE ac.tenant_id = p_tenant_id AND ac.empresa_id = p_empresa_id;

  RETURN jsonb_build_object('permitido', true, 'codigo', 'OK',
    'mensagem', 'Onda disponível para conferência.',
    'reserva_movimento', v_modo = 'EXCLUSIVA',
    'modo', v_modo,
    'convocado_pelo_gestor', COALESCE((v_check ->> 'convocado_pelo_gestor')::boolean, false),
    'unidade_conferencia', 'ONDA',
    'agrupamento_roteiro', to_jsonb(COALESCE(v_agrupamento, ARRAY[]::text[])));
END;
$$;

-- 3. Tarefas de conferência do operador
CREATE OR REPLACE FUNCTION public.conferencia_buscar_tarefas(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid)
RETURNS TABLE(id uuid, tarefa_id uuid, produto_id uuid, ordem_tarefa integer, sku text, descricao text,
              fator_caixa numeric, quantidade_requerida numeric, conferido numeric, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
-- v3 (2026-11-11): convocação híbrida. Aplica a convocação do gestor; autoconvoca só tarefas livres.
DECLARE
  v_conf       uuid;
  v_validacao  jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL OR p_usuario_id IS NULL OR p_movimento_saida_id IS NULL THEN
    RAISE EXCEPTION 'CONF_PARAMETROS: tenant, empresa, usuário e onda são obrigatórios.';
  END IF;
  PERFORM public.assert_usuario_sessao(p_usuario_id);

  PERFORM 1 FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id
  FOR UPDATE;

  SELECT tt.id INTO v_conf FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = 'SEP-CONF' LIMIT 1;
  PERFORM public.fn_onda_aplicar_responsaveis(p_movimento_saida_id, v_conf);

  v_validacao := public.fn_conferencia_validar_onda(p_tenant_id, p_empresa_id, p_usuario_id, p_movimento_saida_id);
  IF NOT (v_validacao ->> 'permitido')::boolean THEN
    RAISE EXCEPTION '%: %', v_validacao ->> 'codigo', v_validacao ->> 'mensagem';
  END IF;

  PERFORM public._fn_onda_assumir(p_movimento_saida_id, v_conf, p_usuario_id, 'AUTO_CONVOCADO');

  IF NOT EXISTS (
    SELECT 1
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.usuario_id = p_usuario_id AND ta.liberado_em IS NULL
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND t.tenant_id = p_tenant_id
      AND t.tipo_tarefa_id = v_conf
      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
  ) THEN
    RAISE EXCEPTION 'CONF_SEM_TAREFAS: Nenhuma tarefa de conferência disponível para você nesta onda.';
  END IF;

  UPDATE movimento_saida ms
  SET status = 'EM_CONFERENCIA'::enum_status_onda_carregamento
  WHERE ms.id = p_movimento_saida_id
    AND ms.tenant_id = p_tenant_id
    AND ms.status = 'SEPARADO'::enum_status_onda_carregamento;

  RETURN QUERY
  SELECT
      t.id,
      t.id AS tarefa_id,
      t.produto_id,
      t.ordem_tarefa::integer,
      p.sku,
      p.descricao,
      p.fator_caixa::numeric,
      t.quantidade_requerida::numeric,
      COALESCE(t.quantidade_executada, 0)::numeric AS conferido,
      t.status::text
  FROM tarefa t
  JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
  JOIN produto p ON p.id = t.produto_id
  JOIN tarefa_atribuicao ta2 ON ta2.tarefa_id = t.id AND ta2.usuario_id = p_usuario_id AND ta2.liberado_em IS NULL
  WHERE msi.movimento_saida_id = p_movimento_saida_id
    AND t.tenant_id = p_tenant_id
    AND t.tipo_tarefa_id = v_conf
    AND t.status IN ('CRIADA'::enum_status_tarefa, 'ATRIBUIDA'::enum_status_tarefa,
                     'EM_ANDAMENTO'::enum_status_tarefa, 'PAUSADA'::enum_status_tarefa)
  ORDER BY t.ordem_tarefa;
END;
$$;

-- 4. Ondas disponíveis para separação
CREATE OR REPLACE FUNCTION public.separacao_buscar_ondas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
RETURNS TABLE(movimento_saida_id uuid, numero_onda bigint, pedidos text, tipo_venda text, prioridade text,
              status text, exibe_parceiro boolean, parceiro_nome text, atribuida_ao_usuario boolean,
              operador_nome text, qtd_operadores integer, exibe_vendedor boolean, vendedor_nome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
-- v4 (2026-11-11): convocação híbrida. Mostra só ondas que o operador pode pegar
--   (convocado pelo gestor, ou etapa livre); as que já são dele aparecem primeiro.
DECLARE
  v_sep uuid;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);

  SELECT tt.id INTO v_sep FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = 'SEP' LIMIT 1;

  RETURN QUERY
  WITH elegiveis AS (
    SELECT ms.id
    FROM movimento_saida ms
    WHERE ms.tenant_id = p_tenant_id
      AND ms.empresa_id = p_empresa_id
      AND ms.status IN ('LIBERADO', 'EM_PICKING')
      AND (public.fn_onda_usuario_pode_executar(ms.id, v_sep, p_usuario_id) ->> 'permitido')::boolean
  ), ondas AS (
    SELECT
        ms.id,
        ms.numero_onda,
        string_agg(DISTINCT ds.numero_pedido::text, ', ') AS pedidos,
        ts.descricao AS tipo_venda,
        ms.prioridade::text AS prioridade,
        ms.status::text AS status,
        COALESCE(bool_and(ts.exibe_parceiro_separacao), true) AS exibe_parceiro,
        CASE WHEN COALESCE(bool_and(ts.exibe_parceiro_separacao), true) THEN
                string_agg(DISTINCT COALESCE(NULLIF(trim(p.nome_fantasia), ''), p.razaosocial), ' / ')::text
             ELSE NULL END AS parceiro_nome,
        COALESCE(bool_and(ts.exibe_vendedor_separacao), false) AS exibe_vendedor,
        CASE WHEN COALESCE(bool_and(ts.exibe_vendedor_separacao), false) THEN
                string_agg(DISTINCT NULLIF(btrim(ds.vendedor), ''), ' / ')::text
             ELSE NULL END AS vendedor_nome
    FROM elegiveis el
    JOIN movimento_saida ms ON ms.id = el.id
    JOIN movimento_saida_documento msd ON msd.movimento_saida_id = ms.id
    JOIN documento_saida ds ON ds.id = msd.documento_saida_id
    JOIN tipo_saida ts ON ts.id = ds.tipo_pedido_id
    LEFT JOIN parceiro p ON p.id = ds.parceiro_id
    GROUP BY ms.id, ms.numero_onda, ts.descricao, ms.prioridade, ms.status
  )
  SELECT o.id, o.numero_onda, o.pedidos, o.tipo_venda, o.prioridade, o.status,
         o.exibe_parceiro, o.parceiro_nome,
         COALESCE(a.atribuida_ao_usuario, false), a.operador_nome, COALESCE(a.qtd_operadores, 0),
         o.exibe_vendedor, o.vendedor_nome
  FROM ondas o
  LEFT JOIN LATERAL (
      SELECT bool_or(ta.usuario_id = p_usuario_id) AS atribuida_ao_usuario,
             string_agg(DISTINCT u.nome, ' / ')    AS operador_nome,
             COUNT(DISTINCT ta.usuario_id)::int    AS qtd_operadores
      FROM movimento_saida_item msi
      JOIN tarefa t             ON t.id_documento_origem = msi.id AND t.tipo_tarefa_id = v_sep
      JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
      JOIN usuario u            ON u.id = ta.usuario_id
      WHERE msi.movimento_saida_id = o.id
  ) a ON true
  ORDER BY COALESCE(a.atribuida_ao_usuario, false) DESC, o.prioridade DESC, o.numero_onda;
END;
$$;

-- 5. Tarefas de separação do operador
CREATE OR REPLACE FUNCTION public.separacao_buscar_tarefas(
  p_tenant_id uuid, p_empresa_id uuid, p_movimento_saida_id uuid, p_usuario_id uuid)
RETURNS TABLE(tarefa_id uuid, ordem_tarefa numeric, armazem text, setor text, endereco text, endereco_id uuid,
              sku text, produto text, fator_caixa numeric, quantidade_requerida numeric, separado numeric,
              status text, saldo_endereco numeric, produto_id uuid, tipo_endereco text, situacao_saldo text,
              motivo_pendencia text, sem_saldo_na_liberacao boolean, saldo_pulmao numeric, abastecimento_pendente boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
-- v5 (2026-11-11): convocação híbrida. Aplica a convocação do gestor; quando a etapa está
--   livre, autoconvoca (EXCLUSIVA leva tudo; COMPARTILHADA uma por vez; zona só por roteiro).
-- v4 (2026-10-20): realoca tarefas sem saldo/sem endereço antes de atribuir.
DECLARE
  v_sep   uuid;
  v_check jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);

  PERFORM public.fn_realocar_tarefas_pendentes_picking(p_tenant_id, p_movimento_saida_id);

  SELECT tt.id INTO v_sep FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = 'SEP' LIMIT 1;

  PERFORM 1 FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id
  FOR UPDATE;

  PERFORM public.fn_onda_aplicar_responsaveis(p_movimento_saida_id, v_sep);

  v_check := public.fn_onda_usuario_pode_executar(p_movimento_saida_id, v_sep, p_usuario_id);
  IF COALESCE((v_check ->> 'permitido')::boolean, false) THEN
    PERFORM public._fn_onda_assumir(p_movimento_saida_id, v_sep, p_usuario_id, 'AUTO_CONVOCADO');
  END IF;

  UPDATE movimento_saida ms
  SET status = 'EM_PICKING'::enum_status_onda_carregamento
  WHERE ms.id = p_movimento_saida_id
    AND ms.status = 'LIBERADO'::enum_status_onda_carregamento
    AND EXISTS (SELECT 1 FROM tarefa t
                JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
                JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
                                         AND ta.usuario_id = p_usuario_id
                WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tipo_tarefa_id = v_sep);

  RETURN QUERY
  SELECT
      t.id AS tarefa_id,
      t.ordem_tarefa::numeric,
      a.descricao AS armazem,
      s.descricao AS setor,
      e.descricao AS endereco,
      e.id AS endereco_id,
      p.sku,
      p.descricao AS produto,
      p.fator_caixa::numeric,
      t.quantidade_requerida,
      COALESCE(t.quantidade_executada, 0)::numeric AS separado,
      t.status::text,
      COALESCE(eg.saldo_total, 0)::numeric AS saldo_endereco,
      t.produto_id,
      e.tipo_endereco::text,
      CASE
        WHEN t.id_local_origem IS NULL THEN 'SEM_PICKING_MAPEADO'
        WHEN COALESCE(eg.saldo_total, 0) <= 0 AND e.tipo_endereco::text = 'PICKING' THEN 'SEM_SALDO_PICKING'
        WHEN COALESCE(eg.saldo_total, 0) <= 0 THEN 'SEM_SALDO_ENDERECO'
        ELSE 'OK'
      END AS situacao_saldo,
      t.motivo_pendencia,
      t.sem_saldo_na_liberacao,
      COALESCE(pul.saldo, 0)::numeric AS saldo_pulmao,
      EXISTS (
        SELECT 1 FROM tarefa ab JOIN tipo_tarefa tab ON tab.id = ab.tipo_tarefa_id
        WHERE tab.codigo = 'ABAST' AND ab.tenant_id = p_tenant_id
          AND ab.produto_id = t.produto_id
          AND ab.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO')
          AND (t.id_local_origem IS NULL OR ab.id_local_destino = t.id_local_origem)
      ) AS abastecimento_pendente
  FROM tarefa t
  JOIN tarefa_atribuicao ta
      ON ta.tarefa_id = t.id AND ta.usuario_id = p_usuario_id AND ta.liberado_em IS NULL
  JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
  LEFT JOIN endereco e ON e.id = t.id_local_origem
  LEFT JOIN armazem a ON a.id = e.armazem_id
  LEFT JOIN setor s ON s.id = e.setor_id
  JOIN produto p ON p.id = t.produto_id
  LEFT JOIN LATERAL (
      SELECT SUM(eg2.quantidade_disponivel) AS saldo_total
      FROM estoque_geral eg2
      WHERE eg2.produto_id = t.produto_id AND eg2.endereco_id = t.id_local_origem
  ) eg ON true
  LEFT JOIN LATERAL (
      SELECT SUM(eg3.quantidade_disponivel) AS saldo
      FROM estoque_geral eg3 JOIN endereco e3 ON e3.id = eg3.endereco_id
      WHERE eg3.produto_id = t.produto_id AND eg3.tenant_id = p_tenant_id
        AND eg3.quantidade_disponivel > 0 AND e3.tipo_endereco = 'PULMAO'
        AND e3.situacao NOT IN ('BLOQUEADO', 'BLOQUEADO_INVENTARIO')
  ) pul ON true
  WHERE msi.movimento_saida_id = p_movimento_saida_id
    AND t.tipo_tarefa_id = v_sep
    AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
  ORDER BY
    (t.id_local_origem IS NULL OR COALESCE(eg.saldo_total, 0) <= 0),
    t.ordem_tarefa;
END;
$$;

-- 6. Coletor: resumo da onda sem reservar nada (R1.1)
CREATE OR REPLACE FUNCTION public.rpc_coletor_onda_resumo(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid, p_etapa text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_numero bigint; v_status text; v_tipo uuid; v_check jsonb; v_modo text;
  v_totais jsonb; v_operadores jsonb; v_pedidos text; v_minhas integer;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);

  SELECT ms.numero_onda, ms.status::text INTO v_numero, v_status
  FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id;
  IF v_numero IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_NAO_ENCONTRADA', 'mensagem', 'Onda não encontrada.');
  END IF;

  SELECT tt.id INTO v_tipo FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = p_etapa;
  IF v_tipo IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ETAPA_INVALIDA', 'mensagem', 'Etapa inválida.');
  END IF;

  SELECT i.modo INTO v_modo FROM public.fn_onda_etapa_info(p_movimento_saida_id, v_tipo) i;
  IF p_etapa = 'SEP-CONF' THEN
    v_check := public.fn_conferencia_validar_onda(p_tenant_id, p_empresa_id, p_usuario_id, p_movimento_saida_id);
  ELSE
    v_check := public.fn_onda_usuario_pode_executar(p_movimento_saida_id, v_tipo, p_usuario_id);
  END IF;

  SELECT jsonb_build_object(
           'tarefas_abertas', count(*),
           'tarefas_livres', count(*) FILTER (WHERE ta.id IS NULL),
           'minhas_tarefas', count(*) FILTER (WHERE ta.usuario_id = p_usuario_id),
           'itens', count(DISTINCT t.produto_id),
           'enderecos', count(DISTINCT t.id_local_origem),
           'quantidade_pendente', COALESCE(sum(t.quantidade_requerida - COALESCE(t.quantidade_executada, 0)), 0)),
         count(*) FILTER (WHERE ta.usuario_id = p_usuario_id)
    INTO v_totais, v_minhas
  FROM tarefa t
  JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
  LEFT JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
  WHERE msi.movimento_saida_id = p_movimento_saida_id
    AND t.tenant_id = p_tenant_id
    AND t.tipo_tarefa_id = v_tipo
    AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
    AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', x.nome, 'tarefas', x.n, 'origem', x.origem) ORDER BY x.nome), '[]'::jsonb)
    INTO v_operadores
  FROM (
    SELECT u.nome, count(*) AS n,
           CASE WHEN bool_or(ta.tipo_convocacao = 'CONVOCACAO_GESTOR') THEN 'GESTOR' ELSE 'COLETOR' END AS origem
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
    JOIN usuario u ON u.id = ta.usuario_id
    WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tipo_tarefa_id = v_tipo
      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
    GROUP BY u.nome) x;

  SELECT string_agg(DISTINCT ds.numero_pedido::text, ', ') INTO v_pedidos
  FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
  WHERE msd.movimento_saida_id = p_movimento_saida_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'onda', jsonb_build_object('id', p_movimento_saida_id, 'numero_onda', v_numero, 'status', v_status, 'pedidos', v_pedidos),
    'etapa', jsonb_build_object('codigo', p_etapa, 'modo', v_modo),
    'pode_assumir', COALESCE((v_check ->> 'permitido')::boolean, false),
    'ja_e_meu', v_minhas > 0,
    'convocado_pelo_gestor', COALESCE((v_check ->> 'convocado_pelo_gestor')::boolean, false),
    'codigo', v_check ->> 'codigo',
    'mensagem', v_check ->> 'mensagem',
    'totais', v_totais,
    'operadores', v_operadores);
END $$;

-- 7. Coletor: assumir a etapa (autoconvocação explícita)
CREATE OR REPLACE FUNCTION public.rpc_coletor_assumir_etapa(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid, p_etapa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_tipo uuid; v_check jsonb; v_n integer; v_minhas integer; v_modo text;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);

  SELECT ms.status::text INTO v_status
  FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id
  FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_NAO_ENCONTRADA', 'mensagem', 'Onda não encontrada.');
  END IF;

  SELECT tt.id INTO v_tipo FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = p_etapa;
  IF v_tipo IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ETAPA_INVALIDA', 'mensagem', 'Etapa inválida.');
  END IF;

  IF p_etapa = 'SEP' THEN
    IF v_status NOT IN ('LIBERADO', 'EM_PICKING') THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_STATUS_INVALIDO',
        'mensagem', format('A onda está %s e não aceita separação.', v_status));
    END IF;
    PERFORM public.fn_realocar_tarefas_pendentes_picking(p_tenant_id, p_movimento_saida_id);
  END IF;

  PERFORM public.fn_onda_aplicar_responsaveis(p_movimento_saida_id, v_tipo);

  IF p_etapa = 'SEP-CONF' THEN
    v_check := public.fn_conferencia_validar_onda(p_tenant_id, p_empresa_id, p_usuario_id, p_movimento_saida_id);
  ELSE
    v_check := public.fn_onda_usuario_pode_executar(p_movimento_saida_id, v_tipo, p_usuario_id);
  END IF;
  IF NOT COALESCE((v_check ->> 'permitido')::boolean, false) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', v_check ->> 'codigo', 'mensagem', v_check ->> 'mensagem');
  END IF;

  v_n := public._fn_onda_assumir(p_movimento_saida_id, v_tipo, p_usuario_id, 'AUTO_CONVOCADO');

  SELECT count(*) INTO v_minhas
  FROM tarefa t
  JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
  JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL AND ta.usuario_id = p_usuario_id
  WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tipo_tarefa_id = v_tipo
    AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA');

  IF v_minhas = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_TAREFAS_DISPONIVEIS',
      'mensagem', 'Não há tarefas disponíveis para você nesta etapa da onda.');
  END IF;

  IF p_etapa = 'SEP' THEN
    UPDATE movimento_saida SET status = 'EM_PICKING'
     WHERE id = p_movimento_saida_id AND status = 'LIBERADO';
  ELSIF p_etapa = 'SEP-CONF' THEN
    UPDATE movimento_saida SET status = 'EM_CONFERENCIA'
     WHERE id = p_movimento_saida_id AND status = 'SEPARADO';
  END IF;

  SELECT i.modo INTO v_modo FROM public.fn_onda_etapa_info(p_movimento_saida_id, v_tipo) i;
  RETURN jsonb_build_object('sucesso', true,
    'codigo', CASE WHEN v_n > 0 THEN 'ETAPA_ASSUMIDA' ELSE 'JA_ASSUMIDA' END,
    'mensagem', CASE WHEN v_n > 0 THEN format('%s tarefa(s) atribuída(s) a você.', v_n)
                     ELSE 'Você já está nesta etapa.' END,
    'modo', v_modo, 'tarefas_atribuidas', v_n, 'minhas_tarefas', v_minhas);
END $$;

-- 8. Coletor: sair de uma etapa que o próprio operador assumiu (D8)
CREATE OR REPLACE FUNCTION public.rpc_coletor_sair_etapa(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid, p_etapa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_numero bigint; v_tipo uuid; r record; v_n integer := 0;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);

  SELECT ms.numero_onda INTO v_numero
  FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id
  FOR UPDATE;
  IF v_numero IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_NAO_ENCONTRADA', 'mensagem', 'Onda não encontrada.');
  END IF;

  SELECT tt.id INTO v_tipo FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = p_etapa;
  IF v_tipo IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ETAPA_INVALIDA', 'mensagem', 'Etapa inválida.');
  END IF;

  IF EXISTS (SELECT 1 FROM movimento_saida_responsavel r2
             WHERE r2.movimento_saida_id = p_movimento_saida_id AND r2.tipo_tarefa_id = v_tipo
               AND r2.usuario_id = p_usuario_id AND r2.ativo)
     OR EXISTS (SELECT 1 FROM tarefa t
                JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
                JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
                                         AND ta.usuario_id = p_usuario_id
                WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tipo_tarefa_id = v_tipo
                  AND ta.tipo_convocacao = 'CONVOCACAO_GESTOR') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ATRIBUICAO_DO_GESTOR',
      'mensagem', 'Esta etapa foi designada pelo gestor. Peça a ele para liberar.');
  END IF;

  FOR r IN
    SELECT t.id AS tarefa_id, ta.id AS atr_id, COALESCE(t.quantidade_executada, 0) > 0 AS progresso
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL AND ta.usuario_id = p_usuario_id
    WHERE msi.movimento_saida_id = p_movimento_saida_id AND t.tipo_tarefa_id = v_tipo
      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
    FOR UPDATE OF t
  LOOP
    UPDATE tarefa_atribuicao
       SET status = 'LIBERADA', liberado_em = now(), liberado_por = p_usuario_id, motivo_liberacao = 'DEVOLUCAO_FILA'
     WHERE id = r.atr_id;
    UPDATE tarefa SET status = 'CRIADA' WHERE id = r.tarefa_id AND status = 'ATRIBUIDA';
    INSERT INTO tarefa_evento_execucao (tenant_id, tarefa_id, tipo_evento, carga_util, created_by)
    VALUES (p_tenant_id, r.tarefa_id, 'REATRIBUICAO',
            jsonb_build_object('origem', 'OPERADOR', 'acao', 'SAIR_ETAPA', 'de', p_usuario_id, 'para', NULL,
                               'movimento_saida_id', p_movimento_saida_id, 'numero_onda', v_numero,
                               'etapa', p_etapa, 'com_progresso', r.progresso),
            p_usuario_id);
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'NADA_A_DEVOLVER',
      'mensagem', 'Você não tem tarefas abertas nesta etapa.');
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ETAPA_DEVOLVIDA',
    'mensagem', format('%s tarefa(s) devolvida(s) para a fila.', v_n), 'tarefas_devolvidas', v_n);
END $$;

-- 9. Permissões
REVOKE ALL ON FUNCTION public.rpc_coletor_onda_resumo(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_coletor_assumir_etapa(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_coletor_sair_etapa(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_onda_resumo(uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_assumir_etapa(uuid, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_sair_etapa(uuid, uuid, uuid, uuid, text) TO authenticated;
