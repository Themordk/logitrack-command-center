-- =====================================================================
-- 2026-11-10 · Conferência de saída · Modo de conferência (pré/pós-faturamento)
--             + validador único de elegibilidade da onda
--
-- 1. tipo_saida.momento_conferencia  (UI: "Modo de conferência")
--      PRE_FATURAMENTO (default) -> comportamento atual
--      POS_FATURAMENTO           -> a onda só vai para a conferência quando
--                                   TODOS os pedidos tiverem NF AUTORIZADA
--    Nome da coluna ≠ "modo_conferencia" de propósito: esse nome já existe em
--    tarefa_execucao / conferencia_saida_confirmacao (manual | checkout).
--
-- 2. fn_conferencia_docs_sem_nf      -> nº de pedidos POS_FATURAMENTO da onda
--                                       sem NF AUTORIZADA (0 = liberado)
-- 3. fn_conferencia_validar_onda     -> FONTE ÚNICA das regras de conferência
--                                       (lista do coletor + início + contagem)
-- 4. conferencia_buscar_ondas        -> usa o validador (mesma assinatura)
-- 5. conferencia_buscar_tarefas      -> trava a onda, valida, só muda
--                                       SEPARADO -> EM_CONFERENCIA com tarefa
-- 6. conferencia_contar_aguardando_nf -> contador "aguardando faturamento"
-- 7. conferencia_saida_confirmacao (2 overloads) -> bloqueia se a NF deixou
--    de estar autorizada durante a conferência (divergência => cancelamento
--    da NF => fluxo fn_cancelar_saida_por_nf_cancelada)
--
-- Correções de comportamento incluídas (afetavam todos os tenants):
--   a) buscar_tarefas mudava a onda para EM_CONFERENCIA a partir de QUALQUER
--      status (inclusive CONFERIDO/CANCELADA/EXPORTADA_ERP) e mesmo sem
--      atribuir tarefa;
--   b) buscar_ondas filtrava reserva por tarefa_atribuicao.status = 'ATIVO',
--      valor que nunca é gravado para SEP-CONF (grava 'ATRIBUIDA') -> onda
--      reservada por outro operador continuava aparecendo e podia ser
--      iniciada por dois operadores;
--   c) buscar_tarefas não conferia empresa, status, realiza_conferencia.
--
-- Roteiro de conferência (agrupamento_conferencia): o validador lê e devolve
-- a configuração, mas a unidade de conferência continua sendo a ONDA, porque
-- movimento_saida_item não guarda o documento de origem. Conferência por
-- DOCUMENTO/ROTA/HU/BOX é um épico separado (rateio item x documento).
--
-- Zona de atividade: continua usando usuario.zona_atividade_separacao.
-- =====================================================================

-- 0. Backups ----------------------------------------------------------
INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(), f, pg_get_functiondef(f::regprocedure),
       'Antes de 20261110202246_conferencia_momento_faturamento_validador', now()
FROM unnest(ARRAY[
  'public.conferencia_buscar_ondas(uuid,uuid,uuid)',
  'public.conferencia_buscar_tarefas(uuid,uuid,uuid,uuid)',
  'public.conferencia_saida_confirmacao(uuid,uuid,numeric,uuid)',
  'public.conferencia_saida_confirmacao(uuid,uuid,numeric,uuid,text)'
]) AS f;

-- 1. Configuração -----------------------------------------------------
ALTER TABLE public.tipo_saida
  ADD COLUMN IF NOT EXISTS momento_conferencia text NOT NULL DEFAULT 'PRE_FATURAMENTO';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tipo_saida_momento_conferencia') THEN
    ALTER TABLE public.tipo_saida
      ADD CONSTRAINT ck_tipo_saida_momento_conferencia
      CHECK (momento_conferencia IN ('PRE_FATURAMENTO', 'POS_FATURAMENTO'));
  END IF;
END $$;

COMMENT ON COLUMN public.tipo_saida.momento_conferencia IS
  'Modo de conferência: PRE_FATURAMENTO (confere antes da NF) | POS_FATURAMENTO (onda só vai para conferência com NF AUTORIZADA em todos os pedidos)';

-- 2. Pedidos da onda aguardando NF ------------------------------------
CREATE OR REPLACE FUNCTION public.fn_conferencia_docs_sem_nf(p_tenant_id uuid, p_movimento_saida_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
  FROM movimento_saida_documento msd
  JOIN documento_saida ds ON ds.id = msd.documento_saida_id AND ds.tenant_id = p_tenant_id
  JOIN tipo_saida ts      ON ts.id = ds.tipo_pedido_id
  WHERE msd.movimento_saida_id = p_movimento_saida_id
    AND msd.tenant_id = p_tenant_id
    AND ts.momento_conferencia = 'POS_FATURAMENTO'
    AND NOT EXISTS (
      SELECT 1 FROM documento_saida_nf nf
      WHERE nf.documento_saida_id = ds.id
        AND nf.tenant_id = p_tenant_id
        AND nf.situacao = 'AUTORIZADA'
    );
$function$;

REVOKE ALL ON FUNCTION public.fn_conferencia_docs_sem_nf(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_docs_sem_nf(uuid, uuid) TO service_role;

-- 3. Validador único --------------------------------------------------
-- Ordem das verificações: a NF é a ÚLTIMA, para que CONF_AGUARDANDO_NF
-- signifique "só falta o faturamento" (usado pelo contador do coletor).
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

  -- Reserva: mesma origem da regra antiga (tipo de saída do movimento)
  SELECT COALESCE(ts_mov.reserva_conferencia_movimento, true)
    INTO v_reserva_mov
  FROM (SELECT 1) x
  LEFT JOIN tipo_saida ts_mov ON ts_mov.id = v_ms.tipo_saida;

  IF v_reserva_mov THEN
    SELECT u.nome INTO v_outro_nome
    FROM movimento_saida_item msi
    JOIN tarefa t            ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt      ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA'
    LEFT JOIN usuario u      ON u.id = ta.usuario_id
    WHERE msi.movimento_saida_id = v_ms.id
      AND t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO')
      AND ta.usuario_id <> p_usuario_id
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_ONDA_RESERVADA',
        'mensagem', format('Onda #%s já está em conferência com %s.', v_ms.numero_onda, COALESCE(v_outro_nome, 'outro operador')));
    END IF;
  END IF;

  -- Existe trabalho para ESTE operador?
  IF NOT EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    WHERE msi.movimento_saida_id = v_ms.id
      AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
      AND (
        t.status = 'CRIADA'
        OR (t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO') AND (
              v_reserva_mov
              OR EXISTS (SELECT 1 FROM tarefa_atribuicao ta
                         WHERE ta.tarefa_id = t.id AND ta.usuario_id = p_usuario_id AND ta.status = 'ATRIBUIDA')
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

  -- Roteiro de conferência: informativo até existir rateio item x documento
  SELECT array_agg(ac.tipo_agrupamento::text ORDER BY ac.sequencia)
    INTO v_agrupamento
  FROM agrupamento_conferencia ac
  WHERE ac.tenant_id = p_tenant_id AND ac.empresa_id = p_empresa_id;

  RETURN jsonb_build_object('permitido', true, 'codigo', 'OK',
    'mensagem', 'Onda disponível para conferência.',
    'reserva_movimento', v_reserva_mov,
    'unidade_conferencia', 'ONDA',
    'agrupamento_roteiro', to_jsonb(COALESCE(v_agrupamento, ARRAY[]::text[])));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conferencia_validar_onda(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conferencia_validar_onda(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- 4. Lista de ondas do coletor (mesma assinatura e colunas) -----------
CREATE OR REPLACE FUNCTION public.conferencia_buscar_ondas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
RETURNS TABLE(
  movimento_saida_id uuid, numero_onda bigint, pedidos text, tipo_venda text,
  prioridade text, status text,
  exibe_parceiro boolean, parceiro_nome text,
  exibe_vendedor boolean, vendedor_nome text
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.assert_tenant_access(p_tenant_id);

    RETURN QUERY
    WITH candidatas AS (
        SELECT ms.id
        FROM movimento_saida ms
        WHERE ms.tenant_id = p_tenant_id
          AND ms.empresa_id = p_empresa_id
          AND ms.status IN ('SEPARADO', 'EM_CONFERENCIA')
    ), elegiveis AS (
        SELECT c.id
        FROM candidatas c
        WHERE (public.fn_conferencia_validar_onda(p_tenant_id, p_empresa_id, p_usuario_id, c.id) ->> 'permitido')::boolean
    )
    SELECT
        ms.id,
        ms.numero_onda,
        string_agg(DISTINCT ds.numero_pedido::text, ', ') AS pedidos,
        string_agg(DISTINCT ts.descricao, ' / ')::text AS tipo_venda,
        ms.prioridade::text,
        ms.status::text,
        COALESCE(bool_and(ts.exibe_parceiro_conferencia), false) AS exibe_parceiro,
        CASE
            WHEN COALESCE(bool_and(ts.exibe_parceiro_conferencia), false) THEN
                string_agg(DISTINCT COALESCE(NULLIF(trim(p.nome_fantasia), ''), p.razaosocial), ' / ')::text
            ELSE NULL
        END AS parceiro_nome,
        COALESCE(bool_and(ts.exibe_vendedor_conferencia), false) AS exibe_vendedor,
        CASE
            WHEN COALESCE(bool_and(ts.exibe_vendedor_conferencia), false) THEN
                string_agg(DISTINCT NULLIF(btrim(ds.vendedor), ''), ' / ')::text
            ELSE NULL
        END AS vendedor_nome
    FROM elegiveis e
    JOIN movimento_saida ms ON ms.id = e.id
    JOIN movimento_saida_documento msd ON msd.movimento_saida_id = ms.id
    JOIN documento_saida ds ON ds.id = msd.documento_saida_id
    JOIN tipo_saida ts ON ts.id = ds.tipo_pedido_id
    LEFT JOIN parceiro p ON p.id = ds.parceiro_id
    GROUP BY ms.id, ms.numero_onda, ms.prioridade, ms.status
    ORDER BY ms.prioridade DESC, ms.numero_onda;
END;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_buscar_ondas(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_buscar_ondas(uuid, uuid, uuid) TO authenticated, service_role;

-- 5. Início da conferência --------------------------------------------
-- Recusa com RAISE '<CODIGO>: <mensagem>' (errorMapper reconhece o código).
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
    -- MODO TAREFA: tarefas já minhas + 1 nova livre
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
    INSERT INTO tarefa_atribuicao (tenant_id, empresa_id, tarefa_id, usuario_id, tipo_convocacao, status)
    SELECT p_tenant_id, p_empresa_id, unnest(v_tarefa_ids), p_usuario_id, 'AUTO_CONVOCADO', 'ATRIBUIDA'
    ON CONFLICT ON CONSTRAINT uq_tarefa_atribuicao_tarefa_usuario DO NOTHING;

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

-- 6. Contador "aguardando faturamento" -------------------------------
CREATE OR REPLACE FUNCTION public.conferencia_contar_aguardando_nf(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_total integer;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT count(*)::integer INTO v_total
  FROM movimento_saida ms
  WHERE ms.tenant_id = p_tenant_id
    AND ms.empresa_id = p_empresa_id
    AND ms.status IN ('SEPARADO', 'EM_CONFERENCIA')
    AND public.fn_conferencia_validar_onda(p_tenant_id, p_empresa_id, p_usuario_id, ms.id) ->> 'codigo' = 'CONF_AGUARDANDO_NF';

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_contar_aguardando_nf(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_contar_aguardando_nf(uuid, uuid, uuid) TO authenticated, service_role;

-- 7. Confirmação: trava se a NF deixou de estar autorizada ------------
CREATE OR REPLACE FUNCTION public.conferencia_saida_confirmacao(p_tenant_id uuid, p_tarefa_id uuid, p_quantidade numeric, p_usuario_id uuid, p_modo_conferencia text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_execucao_id           uuid;
  v_qtd_requerida         numeric;
  v_qtd_executada         numeric;
  v_movimento_saida_id    uuid;
  v_movimento_saida_item_id uuid;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  IF p_modo_conferencia NOT IN ('manual', 'checkout') THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'MODO_CONFERENCIA_INVALIDO',
      'mensagem', format('modo_conferencia inválido: %s. Valores aceitos: manual, checkout.', p_modo_conferencia)
    );
  END IF;

  SELECT
    t.quantidade_requerida,
    COALESCE(t.quantidade_executada, 0),
    ms.id,
    msi.id
  INTO
    v_qtd_requerida,
    v_qtd_executada,
    v_movimento_saida_id,
    v_movimento_saida_item_id
  FROM tarefa t
  JOIN movimento_saida_item msi ON t.id_documento_origem = msi.id
  JOIN movimento_saida ms      ON ms.id = msi.movimento_saida_id
  WHERE t.id = p_tarefa_id
    AND t.tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_qtd_requerida IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'TAREFA_NAO_ENCONTRADA',
      'mensagem', 'Tarefa não encontrada.'
    );
  END IF;

  -- 2026-11-10: modo pós-faturamento — NF cancelada/ausente bloqueia a conferência
  IF public.fn_conferencia_docs_sem_nf(p_tenant_id, v_movimento_saida_id) > 0 THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'CONF_NF_NAO_AUTORIZADA',
      'mensagem', 'A NF de um ou mais pedidos desta onda não está mais autorizada. Conferência bloqueada até o cancelamento/refaturamento do pedido.'
    );
  END IF;

  IF (v_qtd_executada + p_quantidade) > v_qtd_requerida THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'QUANTIDADE_EXCEDE_SALDO',
      'mensagem', format('Quantidade excede o saldo da tarefa. Restante permitido: %s', (v_qtd_requerida - v_qtd_executada)),
      'dados', jsonb_build_object(
        'restante', (v_qtd_requerida - v_qtd_executada)
      )
    );
  END IF;

  INSERT INTO tarefa_execucao (
    tenant_id, tarefa_id, usuario_id, status,
    atribuido_em, iniciado_em, concluido_em,
    quantidade_executada, modo_conferencia
  ) VALUES (
    p_tenant_id, p_tarefa_id, p_usuario_id, 'CONCLUIDA',
    COALESCE((SELECT ta.atribuido_em::timestamptz FROM tarefa_atribuicao ta WHERE ta.tarefa_id = p_tarefa_id ORDER BY ta.atribuido_em DESC LIMIT 1), now()),
    COALESCE((SELECT MIN(te.iniciado_em) FROM tarefa_execucao te WHERE te.tarefa_id = p_tarefa_id AND te.status = 'CONCLUIDA'), now()),
    now(),
    p_quantidade, p_modo_conferencia
  )
  RETURNING id INTO v_execucao_id;

  UPDATE tarefa
    SET quantidade_executada = quantidade_executada + p_quantidade
  WHERE id = p_tarefa_id
    AND tenant_id = p_tenant_id
  RETURNING quantidade_executada INTO v_qtd_executada;

  UPDATE movimento_saida_item
    SET status = 'EM_CONFERENCIA'
  WHERE id = v_movimento_saida_item_id;

  IF v_qtd_executada < v_qtd_requerida THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'codigo', 'CONFERENCIA_REGISTRADA',
      'mensagem', 'Conferência registrada com sucesso.',
      'dados', jsonb_build_object(
        'execucao_id', v_execucao_id,
        'tarefa_concluida', false
      )
    );
  END IF;

  UPDATE tarefa
    SET status = 'CONCLUIDA', concluido_em = now()
  WHERE id = p_tarefa_id
    AND tenant_id = p_tenant_id
    AND status <> 'CONCLUIDA';

  UPDATE movimento_saida_item
    SET status = 'CONFERIDO'
  WHERE id = v_movimento_saida_item_id;

  PERFORM 1
  FROM movimento_saida
  WHERE id = v_movimento_saida_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM tarefa t
    JOIN movimento_saida_item msi ON t.id_documento_origem = msi.id
    WHERE msi.movimento_saida_id = v_movimento_saida_id
      AND t.tenant_id = p_tenant_id
      AND t.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa)
  ) THEN
    UPDATE movimento_saida
      SET status = 'CONCLUIDA', finalizado_em = now()
    WHERE id = v_movimento_saida_id
      AND tenant_id = p_tenant_id
      AND status <> 'CONCLUIDA';
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', 'CONFERENCIA_REGISTRADA',
    'mensagem', 'Conferência registrada e tarefa concluída.',
    'dados', jsonb_build_object(
      'execucao_id', v_execucao_id,
      'tarefa_concluida', true
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.conferencia_saida_confirmacao(p_tenant_id uuid, p_tarefa_id uuid, p_quantidade numeric, p_usuario_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_execucao_id uuid;
  v_qtd_requerida numeric;
  v_qtd_executada numeric;
  v_movimento_saida_id uuid;
  v_movimento_saida_item_id uuid;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  SELECT t.quantidade_requerida, COALESCE(t.quantidade_executada,0), ms.id, msi.id
    INTO v_qtd_requerida, v_qtd_executada, v_movimento_saida_id, v_movimento_saida_item_id
  FROM tarefa t
  JOIN movimento_saida_item msi ON t.id_documento_origem = msi.id
  JOIN movimento_saida ms ON ms.id = msi.movimento_saida_id
  WHERE t.id = p_tarefa_id AND t.tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_qtd_requerida IS NULL THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'TAREFA_NAO_ENCONTRADA',
      'mensagem', 'Tarefa não encontrada.'
    );
  END IF;

  -- 2026-11-10: modo pós-faturamento — NF cancelada/ausente bloqueia a conferência
  IF public.fn_conferencia_docs_sem_nf(p_tenant_id, v_movimento_saida_id) > 0 THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'CONF_NF_NAO_AUTORIZADA',
      'mensagem', 'A NF de um ou mais pedidos desta onda não está mais autorizada. Conferência bloqueada até o cancelamento/refaturamento do pedido.'
    );
  END IF;

  IF (v_qtd_executada + p_quantidade) > v_qtd_requerida THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'QUANTIDADE_EXCEDE_SALDO',
      'mensagem', format('Quantidade excede o saldo da tarefa. Restante permitido: %s', (v_qtd_requerida - v_qtd_executada)),
      'dados', jsonb_build_object(
        'restante', (v_qtd_requerida - v_qtd_executada)
      )
    );
  END IF;

  INSERT INTO tarefa_execucao (
    tenant_id, tarefa_id, usuario_id, status,
    atribuido_em, iniciado_em, concluido_em,
    quantidade_executada
  ) VALUES (
    p_tenant_id, p_tarefa_id, p_usuario_id, 'CONCLUIDA',
    COALESCE((SELECT ta.atribuido_em::timestamptz FROM tarefa_atribuicao ta WHERE ta.tarefa_id = p_tarefa_id ORDER BY ta.atribuido_em DESC LIMIT 1), now()),
    COALESCE((SELECT MIN(te.iniciado_em) FROM tarefa_execucao te WHERE te.tarefa_id = p_tarefa_id AND te.status = 'CONCLUIDA'), now()),
    now(),
    p_quantidade
  )
  RETURNING id INTO v_execucao_id;

  UPDATE tarefa SET quantidade_executada = quantidade_executada + p_quantidade
  WHERE id = p_tarefa_id AND tenant_id = p_tenant_id
  RETURNING quantidade_executada INTO v_qtd_executada;

  UPDATE movimento_saida_item SET status='EM_CONFERENCIA' WHERE id = v_movimento_saida_item_id;

  IF v_qtd_executada < v_qtd_requerida THEN
    RETURN jsonb_build_object(
      'sucesso', true,
      'codigo', 'CONFERENCIA_REGISTRADA',
      'mensagem', 'Conferência registrada com sucesso.',
      'dados', jsonb_build_object(
        'execucao_id', v_execucao_id,
        'tarefa_concluida', false
      )
    );
  END IF;

  UPDATE tarefa SET status = 'CONCLUIDA', concluido_em = now()
  WHERE id = p_tarefa_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';

  UPDATE movimento_saida_item SET status='CONFERIDO' WHERE id = v_movimento_saida_item_id;

  PERFORM 1 FROM movimento_saida WHERE id = v_movimento_saida_id AND tenant_id = p_tenant_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM tarefa t
    JOIN movimento_saida_item msi ON t.id_documento_origem = msi.id
    WHERE msi.movimento_saida_id = v_movimento_saida_id
      AND t.tenant_id = p_tenant_id
      AND t.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa)
  ) THEN
    UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now()
    WHERE id = v_movimento_saida_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', 'CONFERENCIA_REGISTRADA',
    'mensagem', 'Conferência registrada e tarefa concluída.',
    'dados', jsonb_build_object(
      'execucao_id', v_execucao_id,
      'tarefa_concluida', true
    )
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
