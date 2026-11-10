-- =====================================================================
-- 2026-11-10 · Conferência de saída · expiração da reserva de onda
--
-- Contexto: 20261110202246 corrigiu a regra de reserva (a lista filtrava
-- tarefa_atribuicao.status = 'ATIVO', valor nunca gravado para SEP-CONF).
-- Com a regra correta, reservas abandonadas passaram a prender a onda para
-- sempre. Esta migration faz a reserva expirar por inatividade.
--
-- Regra
--   * Atividade do operador na onda = maior entre a última atribuição dele
--     (tarefa_atribuicao.atribuido_em) e a última conferência registrada por
--     ele (tarefa_execucao.concluido_em) nas tarefas SEP-CONF da onda.
--   * Sem atividade há mais de armazem_config.conferencia_reserva_expira_min
--     minutos (padrão 240 = 4h; 0 = nunca expira) a reserva deixa de valer.
--   * Lista do coletor: onda com reserva expirada volta a aparecer para todos.
--   * Início da conferência: as atribuições expiradas de OUTROS operadores são
--     liberadas (status LIBERADA, liberado_em, observacao) e as tarefas voltam
--     para CRIADA, mantendo quantidade_executada (o novo operador confere só o
--     saldo restante).
--   * movimento_saida não tem armazém: o prazo vem da configuração ativa da
--     empresa (primeira por created_at), como fn_cancelar_saida_por_nf_cancelada.
--
-- Também corrige: a re-atribuição usava ON CONFLICT DO NOTHING; uma
-- atribuição LIBERADA do mesmo operador impedia que ele retomasse a tarefa.
-- =====================================================================

-- 0. Backups ----------------------------------------------------------
INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(), f, pg_get_functiondef(f::regprocedure),
       'Antes de 20261110213000_conferencia_reserva_expiracao', now()
FROM unnest(ARRAY[
  'public.fn_conferencia_validar_onda(uuid,uuid,uuid,uuid)',
  'public.conferencia_buscar_tarefas(uuid,uuid,uuid,uuid)'
]) AS f;

-- 1. Configuração -----------------------------------------------------
ALTER TABLE public.armazem_config
  ADD COLUMN IF NOT EXISTS conferencia_reserva_expira_min integer NOT NULL DEFAULT 240;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_armazem_config_conf_reserva_expira_min') THEN
    ALTER TABLE public.armazem_config
      ADD CONSTRAINT ck_armazem_config_conf_reserva_expira_min
      CHECK (conferencia_reserva_expira_min BETWEEN 0 AND 10080);
  END IF;
END $$;

COMMENT ON COLUMN public.armazem_config.conferencia_reserva_expira_min IS
  'Conferência de saída: minutos sem atividade do operador para a reserva da onda expirar (0 = nunca expira). Padrão 240.';

CREATE OR REPLACE FUNCTION public.fn_conferencia_reserva_expira_min(p_tenant_id uuid, p_empresa_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT ac.conferencia_reserva_expira_min
    FROM armazem_config ac
    WHERE ac.tenant_id = p_tenant_id AND ac.empresa_id = p_empresa_id AND ac.ativo = true
    ORDER BY ac.created_at
    LIMIT 1
  ), 240);
$function$;

REVOKE ALL ON FUNCTION public.fn_conferencia_reserva_expira_min(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_reserva_expira_min(uuid, uuid) TO service_role;

-- 2. Reservas vigentes de uma onda ------------------------------------
CREATE OR REPLACE FUNCTION public.fn_conferencia_reservas_onda(p_tenant_id uuid, p_movimento_saida_id uuid, p_expira_min integer)
RETURNS TABLE(usuario_id uuid, usuario_nome text, ultima_atividade timestamptz, expirada boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH tarefas_onda AS (
    SELECT t.id, t.status
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    WHERE msi.movimento_saida_id = p_movimento_saida_id
  ), reservas AS (
    SELECT ta.usuario_id, max(ta.atribuido_em) AS ult_atrib
    FROM tarefas_onda tk
    JOIN tarefa_atribuicao ta ON ta.tarefa_id = tk.id AND ta.status = 'ATRIBUIDA'
    WHERE tk.status IN ('ATRIBUIDA', 'EM_ANDAMENTO')
    GROUP BY ta.usuario_id
  )
  SELECT r.usuario_id,
         u.nome::text,
         x.ultima,
         (COALESCE(p_expira_min, 0) > 0
          AND x.ultima < now() - make_interval(mins => p_expira_min)) AS expirada
  FROM reservas r
  LEFT JOIN usuario u ON u.id = r.usuario_id
  CROSS JOIN LATERAL (
    SELECT GREATEST(r.ult_atrib, (
      SELECT max(te.concluido_em)
      FROM tarefa_execucao te
      WHERE te.usuario_id = r.usuario_id
        AND te.tarefa_id IN (SELECT id FROM tarefas_onda)
    )) AS ultima
  ) x;
$function$;

REVOKE ALL ON FUNCTION public.fn_conferencia_reservas_onda(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_reservas_onda(uuid, uuid, integer) TO service_role;

-- 3. Liberação das reservas expiradas ---------------------------------
-- p_usuario_excecao: operador que está iniciando (nunca libera as dele).
CREATE OR REPLACE FUNCTION public.fn_conferencia_liberar_reservas_expiradas(
  p_tenant_id uuid, p_movimento_saida_id uuid, p_usuario_excecao uuid, p_expira_min integer, p_origem text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r          record;
  v_qtd      integer;
  v_total    integer := 0;
BEGIN
  IF COALESCE(p_expira_min, 0) <= 0 THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT * FROM public.fn_conferencia_reservas_onda(p_tenant_id, p_movimento_saida_id, p_expira_min)
    WHERE expirada AND usuario_id IS DISTINCT FROM p_usuario_excecao
  LOOP
    UPDATE tarefa_atribuicao ta
       SET status      = 'LIBERADA',
           liberado_em = now(),
           observacao  = concat_ws(' | ', NULLIF(ta.observacao, ''),
                           format('Reserva de conferência expirada (%s): sem atividade desde %s, limite %s min.',
                                  p_origem, to_char(r.ultima_atividade AT TIME ZONE 'America/Fortaleza', 'DD/MM/YYYY HH24:MI'), p_expira_min))
     WHERE ta.status = 'ATRIBUIDA'
       AND ta.usuario_id = r.usuario_id
       AND ta.tenant_id = p_tenant_id
       AND ta.tarefa_id IN (
         SELECT t.id
         FROM movimento_saida_item msi
         JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
         JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
         WHERE msi.movimento_saida_id = p_movimento_saida_id
           AND t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO')
       );
    GET DIAGNOSTICS v_qtd = ROW_COUNT;
    v_total := v_total + v_qtd;
  END LOOP;

  IF v_total > 0 THEN
    -- Tarefa sem ninguém atribuído volta para a fila (saldo executado é mantido)
    UPDATE tarefa t
       SET status = 'CRIADA'::enum_status_tarefa
      FROM movimento_saida_item msi, tipo_tarefa tt
     WHERE msi.id = t.id_documento_origem
       AND tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
       AND msi.movimento_saida_id = p_movimento_saida_id
       AND t.tenant_id = p_tenant_id
       AND t.status IN ('ATRIBUIDA'::enum_status_tarefa, 'EM_ANDAMENTO'::enum_status_tarefa)
       AND NOT EXISTS (
         SELECT 1 FROM tarefa_atribuicao ta
         WHERE ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA'
       );
  END IF;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conferencia_liberar_reservas_expiradas(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_liberar_reservas_expiradas(uuid, uuid, uuid, integer, text) TO service_role;

-- 4. Validador (mesma assinatura; reserva considera expiração) --------
CREATE OR REPLACE FUNCTION public.fn_conferencia_validar_onda(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ms            record;
  v_realiza       boolean;
  v_reserva_mov   boolean;
  v_zona_usuario  uuid;
  v_outro_nome    text;
  v_docs_sem_nf   integer;
  v_agrupamento   text[];
  v_expira_min    integer;
  v_vivos         uuid[];
  v_expiradas     integer;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT ms.id, ms.numero_onda, ms.status::text AS status, ms.tipo_saida
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

  SELECT bool_or(ts.realiza_conferencia)
    INTO v_realiza
  FROM movimento_saida_documento msd
  JOIN documento_saida ds ON ds.id = msd.documento_saida_id
  JOIN tipo_saida ts      ON ts.id = ds.tipo_pedido_id
  WHERE msd.movimento_saida_id = v_ms.id AND msd.tenant_id = p_tenant_id;

  IF NOT COALESCE(v_realiza, false) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_SEM_CONFERENCIA',
      'mensagem', format('O tipo de saída da onda #%s não realiza conferência.', v_ms.numero_onda));
  END IF;

  SELECT COALESCE(ts_mov.reserva_conferencia_movimento, true)
    INTO v_reserva_mov
  FROM (SELECT 1) x
  LEFT JOIN tipo_saida ts_mov ON ts_mov.id = v_ms.tipo_saida;

  -- Reservas de OUTROS operadores: vigentes x expiradas
  v_expira_min := public.fn_conferencia_reserva_expira_min(p_tenant_id, p_empresa_id);

  SELECT array_agg(r.usuario_id) FILTER (WHERE NOT r.expirada),
         count(*) FILTER (WHERE r.expirada)::integer,
         min(r.usuario_nome) FILTER (WHERE NOT r.expirada)
    INTO v_vivos, v_expiradas, v_outro_nome
  FROM public.fn_conferencia_reservas_onda(p_tenant_id, v_ms.id, v_expira_min) r
  WHERE r.usuario_id <> p_usuario_id;

  v_vivos := COALESCE(v_vivos, ARRAY[]::uuid[]);

  IF v_reserva_mov AND cardinality(v_vivos) > 0 THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_ONDA_RESERVADA',
      'mensagem', format('Onda #%s já está em conferência com %s.', v_ms.numero_onda, COALESCE(v_outro_nome, 'outro operador')));
  END IF;

  -- Existe trabalho para ESTE operador? (tarefa livre, minha, ou presa só a reserva expirada)
  IF NOT EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    WHERE msi.movimento_saida_id = v_ms.id
      AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
      AND (
        t.status = 'CRIADA'
        OR (t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO') AND NOT EXISTS (
              SELECT 1 FROM tarefa_atribuicao ta
              WHERE ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA'
                AND ta.usuario_id = ANY (v_vivos)
        ))
      )
  ) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_SEM_TAREFAS',
      'mensagem', format('Onda #%s não tem tarefas de conferência disponíveis para você.', v_ms.numero_onda));
  END IF;

  -- Zona de atividade (zona de separação do operador)
  SELECT u.zona_atividade_separacao INTO v_zona_usuario
  FROM usuario u WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id;

  IF v_zona_usuario IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    JOIN endereco_zona_atividade eza
      ON eza.endereco_id = t.id_local_origem AND eza.tenant_id = p_tenant_id
    WHERE msi.movimento_saida_id = v_ms.id
      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO')
      AND eza.zona_atividade_id = v_zona_usuario
  ) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_FORA_DA_ZONA',
      'mensagem', format('Onda #%s não tem itens na sua zona de atividade.', v_ms.numero_onda));
  END IF;

  -- Modo de conferência (sempre por último)
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
    'reserva_movimento', v_reserva_mov,
    'reserva_expira_min', v_expira_min,
    'reservas_expiradas', COALESCE(v_expiradas, 0),
    'unidade_conferencia', 'ONDA',
    'agrupamento_roteiro', to_jsonb(COALESCE(v_agrupamento, ARRAY[]::text[])));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conferencia_validar_onda(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_validar_onda(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- 5. Início da conferência: libera expiradas antes de atribuir ---------
CREATE OR REPLACE FUNCTION public.conferencia_buscar_tarefas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid)
RETURNS TABLE(id uuid, tarefa_id uuid, produto_id uuid, ordem_tarefa integer, sku text, descricao text, fator_caixa numeric, quantidade_requerida numeric, conferido numeric, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tarefa_ids    uuid[];
  v_reserva_mov   boolean;
  v_zona_usuario  uuid;
  v_validacao     jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL OR p_usuario_id IS NULL OR p_movimento_saida_id IS NULL THEN
    RAISE EXCEPTION 'CONF_PARAMETROS: tenant, empresa, usuário e onda são obrigatórios.';
  END IF;

  -- Serializa inícios simultâneos da mesma onda
  PERFORM 1 FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id
  FOR UPDATE;

  v_validacao := public.fn_conferencia_validar_onda(p_tenant_id, p_empresa_id, p_usuario_id, p_movimento_saida_id);
  IF NOT (v_validacao ->> 'permitido')::boolean THEN
    RAISE EXCEPTION '%: %', v_validacao ->> 'codigo', v_validacao ->> 'mensagem';
  END IF;

  -- Reservas abandonadas de outros operadores voltam para a fila
  IF COALESCE((v_validacao ->> 'reservas_expiradas')::integer, 0) > 0 THEN
    PERFORM public.fn_conferencia_liberar_reservas_expiradas(
      p_tenant_id, p_movimento_saida_id, p_usuario_id,
      (v_validacao ->> 'reserva_expira_min')::integer, 'COLETOR_INICIO');
  END IF;

  v_reserva_mov := COALESCE((v_validacao ->> 'reserva_movimento')::boolean, true);

  SELECT u.zona_atividade_separacao INTO v_zona_usuario
  FROM usuario u WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id;

  IF v_reserva_mov THEN
    -- MODO MOVIMENTO: atribuir todas as tarefas pendentes (da zona do operador)
    SELECT array_agg(t.id ORDER BY t.ordem_tarefa)
      INTO v_tarefa_ids
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
    WHERE tt.codigo = 'SEP-CONF'
      AND t.tenant_id = p_tenant_id
      AND t.status IN ('CRIADA'::enum_status_tarefa, 'ATRIBUIDA'::enum_status_tarefa, 'EM_ANDAMENTO'::enum_status_tarefa)
      AND msi.movimento_saida_id = p_movimento_saida_id
      AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
      AND (
          v_zona_usuario IS NULL
          OR EXISTS (
              SELECT 1 FROM endereco_zona_atividade eza
              WHERE eza.endereco_id = t.id_local_origem
                AND eza.zona_atividade_id = v_zona_usuario
                AND eza.tenant_id = p_tenant_id
          )
      );
  ELSE
    -- MODO TAREFA: 1 tarefa livre
    SELECT array_agg(sub.id)
      INTO v_tarefa_ids
    FROM (
        SELECT t.id
        FROM tarefa t
        JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
        JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
        WHERE tt.codigo = 'SEP-CONF'
          AND t.tenant_id = p_tenant_id
          AND t.status = 'CRIADA'::enum_status_tarefa
          AND msi.movimento_saida_id = p_movimento_saida_id
          AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
          AND NOT EXISTS (
              SELECT 1 FROM tarefa_atribuicao ta
              WHERE ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA'
          )
          AND (
              v_zona_usuario IS NULL
              OR EXISTS (
                  SELECT 1 FROM endereco_zona_atividade eza
                  WHERE eza.endereco_id = t.id_local_origem
                    AND eza.zona_atividade_id = v_zona_usuario
                    AND eza.tenant_id = p_tenant_id
              )
          )
        ORDER BY t.ordem_tarefa
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    ) sub;
  END IF;

  IF v_tarefa_ids IS NOT NULL THEN
    -- Reativa atribuição LIBERADA do mesmo operador (unique tarefa_id + usuario_id)
    INSERT INTO tarefa_atribuicao (tenant_id, empresa_id, tarefa_id, usuario_id, tipo_convocacao, status)
    SELECT p_tenant_id, p_empresa_id, unnest(v_tarefa_ids), p_usuario_id, 'AUTO_CONVOCADO', 'ATRIBUIDA'
    ON CONFLICT ON CONSTRAINT uq_tarefa_atribuicao_tarefa_usuario DO UPDATE
      SET status = 'ATRIBUIDA', atribuido_em = now(), liberado_em = NULL
      WHERE tarefa_atribuicao.status <> 'ATRIBUIDA';

    UPDATE tarefa t
    SET status = 'ATRIBUIDA'
    WHERE t.id = ANY(v_tarefa_ids)
      AND t.tenant_id = p_tenant_id
      AND t.status = 'CRIADA'::enum_status_tarefa;
  END IF;

  -- Nada atribuído agora e nada já meu -> não mexe no status da onda
  IF NOT EXISTS (
    SELECT 1
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.usuario_id = p_usuario_id
                             AND ta.status = 'ATRIBUIDA' AND ta.tenant_id = p_tenant_id
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND t.tenant_id = p_tenant_id
      AND t.status IN ('ATRIBUIDA'::enum_status_tarefa, 'EM_ANDAMENTO'::enum_status_tarefa)
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
  JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
  JOIN produto p ON p.id = t.produto_id
  WHERE msi.movimento_saida_id = p_movimento_saida_id
    AND t.tenant_id = p_tenant_id
    AND t.status IN ('CRIADA'::enum_status_tarefa, 'ATRIBUIDA'::enum_status_tarefa, 'EM_ANDAMENTO'::enum_status_tarefa)
    AND EXISTS (
        SELECT 1 FROM tarefa_atribuicao ta2
        WHERE ta2.tarefa_id = t.id
          AND ta2.usuario_id = p_usuario_id
          AND ta2.status = 'ATRIBUIDA'
          AND ta2.tenant_id = p_tenant_id
    )
  ORDER BY t.ordem_tarefa;
END;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_buscar_tarefas(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_buscar_tarefas(uuid, uuid, uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
