-- =============================================================================
-- Conferência + Armazenagem simultâneas no Recebimento
-- -----------------------------------------------------------------------------
-- Problema: entrada_conferencia_buscar_tarefas grava EM_CONFERENCIA sem olhar o
-- status atual. Ela é chamada ao INICIAR a conferência e após CADA bipagem
-- (RecebimentoExecucaoPage.refreshTarefas). Um movimento em LIB_ARMAZENAGEM /
-- ARMAZENAGEM_PARCIAL volta para EM_CONFERENCIA e some da lista de armazenagem.
--
-- Princípios do ajuste:
--   1. O status do movimento nunca "regride" de uma fase de armazenagem para
--      uma fase de conferência.
--   2. Cada lista do coletor se baseia em TAREFAS PENDENTES do seu tipo, não
--      em um único status — as duas rotinas ficam independentes.
--   3. O movimento só vai para ARMAZENADO (que dispara o retorno ao ERP,
--      etapa 80) quando não há mais nada em conferência.
--
-- Aplicar primeiro em um branch/staging. Os blocos 1, 2, 3 e 5 usam
-- substituição de trecho com verificação: se o trecho não for encontrado a
-- migration aborta (nada é alterado).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.patch_fn(p_sig regprocedure, p_old text, p_new text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_def text := pg_get_functiondef(p_sig);
BEGIN
  IF (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old) <> 1 THEN
    RAISE EXCEPTION 'patch_fn: trecho não encontrado (ou não único) em %: %', p_sig, p_old;
  END IF;
  EXECUTE replace(v_def, p_old, p_new);
END $$;

-- -----------------------------------------------------------------------------
-- 1. entrada_conferencia_buscar_tarefas
--    Só muda para EM_CONFERENCIA a partir de LIBERADO / DIVERGENCIA (como
--    antes). Se o movimento já estiver em fase de armazenagem, mantém.
-- -----------------------------------------------------------------------------
SELECT pg_temp.patch_fn(
  'public.entrada_conferencia_buscar_tarefas(uuid,uuid,uuid,uuid)',
  'where ms.id = p_movimento_entrada_id;',
  'where ms.id = p_movimento_entrada_id
  and ms.tenant_id = p_tenant_id
  -- v-conf-armz-simultanea (2026-10-23): não regride LIB_ARMAZENAGEM /
  -- ARMAZENAGEM_PARCIAL / CONFERIDO para EM_CONFERENCIA
  and ms.status in (''LIBERADO''::enum_status_mov_entrada, ''DIVERGENCIA''::enum_status_mov_entrada);'
);

-- -----------------------------------------------------------------------------
-- 2. recebimento_buscar_movimentos (lista "Selecionar Movimento" do coletor)
--    Inclui LIB_ARMAZENAGEM. O filtro qtd_itens_pendentes > 0 continua
--    garantindo que só aparece se ainda houver item para conferir.
-- -----------------------------------------------------------------------------
SELECT pg_temp.patch_fn(
  'public.recebimento_buscar_movimentos(uuid,uuid,uuid,uuid)',
  'AND me.status IN (''LIBERADO'', ''EM_CONFERENCIA'', ''DIVERGENCIA'', ''ARMAZENAGEM_PARCIAL'')',
  'AND me.status IN (''LIBERADO'', ''EM_CONFERENCIA'', ''DIVERGENCIA'', ''LIB_ARMAZENAGEM'', ''ARMAZENAGEM_PARCIAL'')'
);

-- -----------------------------------------------------------------------------
-- 3. rpc_coletor_armazenagem_listar_movimentos (lista da Armazenagem)
--    Passa a considerar qualquer status "vivo" do recebimento. O filtro
--    tp.itens_pend > 0 (tarefas ENTR-ARMZ pendentes) é quem decide.
--    Rede de segurança: mesmo que algum fluxo grave EM_CONFERENCIA,
--    DIVERGENCIA ou CONFERIDO, a armazenagem não some.
-- -----------------------------------------------------------------------------
SELECT pg_temp.patch_fn(
  'public.rpc_coletor_armazenagem_listar_movimentos(uuid,uuid,uuid)',
  'me.status IN (''LIB_ARMAZENAGEM'', ''ARMAZENAGEM_PARCIAL'')',
  'me.status IN (''LIB_ARMAZENAGEM'', ''ARMAZENAGEM_PARCIAL'', ''LIBERADO'', ''EM_CONFERENCIA'', ''DIVERGENCIA'', ''CONFERIDO'')'
);

-- -----------------------------------------------------------------------------
-- 4. finalizar_conferencia_entrada_movimento
--    - Não reclassifica itens que já têm tarefa de armazenagem (antes,
--      itens ARMAZENADO voltavam para CONFERIDO e o movimento nunca
--      chegava a ARMAZENADO).
--    - Itens CANCELADO não contam como divergência.
--    - Se a armazenagem já começou, calcula o status pela situação real.
--    - Armazenagem automática só para itens ainda não liberados.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalizar_conferencia_entrada_movimento(p_tenant_id uuid, p_movimento_entrada_id uuid, p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_existem_pendentes      boolean;
    v_armazenagem_automatica boolean;
    v_resultado_armz         jsonb;
    v_resultado_codigo       text;
    v_status_atual           enum_status_mov_entrada;
    v_tipo_armz_id           uuid;
    v_tem_armz               boolean := false;
    v_conferidos_sem_armz    boolean := false;
    v_armz_pendente          boolean := false;
    v_novo_status            enum_status_mov_entrada;
BEGIN

  PERFORM public.assert_tenant_match(p_tenant_id);

  ------------------------------------------------------------
  -- LOCK DO MOVIMENTO (com tenant)
  ------------------------------------------------------------
  SELECT me.status
    INTO v_status_atual
  FROM movimento_entrada me
  WHERE me.id        = p_movimento_entrada_id
    AND me.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'codigo', 'MOVIMENTO_NAO_ENCONTRADO',
      'mensagem', 'Movimento de entrada não encontrado.'
    );
  END IF;

  SELECT tt.id INTO v_tipo_armz_id
  FROM tipo_tarefa tt
  WHERE tt.tenant_id = p_tenant_id
    AND tt.codigo    = 'ENTR-ARMZ'
  LIMIT 1;

  -- Armazenagem já liberada para algum item durante a conferência?
  SELECT EXISTS (
    SELECT 1
    FROM tarefa t
    JOIN movimento_entrada_item mei ON mei.id = t.id_documento_origem
    WHERE mei.movimento_entrada_id = p_movimento_entrada_id
      AND t.tenant_id              = p_tenant_id
      AND t.tipo_tarefa_id         = v_tipo_armz_id
      AND t.status                <> 'CANCELADA'::enum_status_tarefa
  ) INTO v_tem_armz;

  ------------------------------------------------------------
  -- 1. ATUALIZAR STATUS DAS TAREFAS DE CONFERÊNCIA
  ------------------------------------------------------------
  UPDATE tarefa t
  SET status = CASE
      WHEN COALESCE(t.quantidade_executada, 0) = t.quantidade_requerida
          THEN 'CONCLUIDA'::enum_status_tarefa
      ELSE 'DIVERGENTE'::enum_status_tarefa
  END
  FROM movimento_entrada_item mei,
       tipo_tarefa tt
  WHERE t.id_documento_origem    = mei.id
    AND tt.id                    = t.tipo_tarefa_id
    AND mei.movimento_entrada_id = p_movimento_entrada_id
    AND tt.codigo                = 'ENTR-CONF'
    AND t.tenant_id              = p_tenant_id
    AND t.status IN (
        'CRIADA'::enum_status_tarefa,
        'EM_ANDAMENTO'::enum_status_tarefa,
        'ATRIBUIDA'::enum_status_tarefa
    );

  ------------------------------------------------------------
  -- 2. ATUALIZAR QUANTIDADE CONFERIDA
  --    (somente itens ainda não liberados para armazenagem)
  ------------------------------------------------------------
  UPDATE movimento_entrada_item mei
  SET qtd_conferida = COALESCE(x.qtd_exec, 0)
  FROM (
      SELECT
          mei2.id,
          SUM(COALESCE(t.quantidade_executada, 0)) AS qtd_exec
      FROM movimento_entrada_item mei2
      JOIN tarefa t       ON t.id_documento_origem = mei2.id
      JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
      WHERE mei2.movimento_entrada_id = p_movimento_entrada_id
        AND mei2.tenant_id            = p_tenant_id
        AND tt.codigo                 = 'ENTR-CONF'
      GROUP BY mei2.id
  ) x
  WHERE mei.id        = x.id
    AND mei.tenant_id = p_tenant_id
    AND mei.status_item_movimento NOT IN ('ARMAZENADO'::enum_status_item_movimento,
                                          'CANCELADO'::enum_status_item_movimento)
    AND NOT EXISTS (
      SELECT 1 FROM tarefa ta
      WHERE ta.id_documento_origem = mei.id
        AND ta.tenant_id           = p_tenant_id
        AND ta.tipo_tarefa_id      = v_tipo_armz_id
        AND ta.status             <> 'CANCELADA'::enum_status_tarefa
    );

  ------------------------------------------------------------
  -- 3. CLASSIFICAR STATUS DO ITEM
  --    (não mexe em item já liberado/armazenado/cancelado)
  ------------------------------------------------------------
  UPDATE movimento_entrada_item mei
  SET status_item_movimento = CASE
      WHEN mei.qtd_conferida = mei.qtd_esperada
          THEN 'CONFERIDO'::enum_status_item_movimento
      ELSE 'DIVERGENTE'::enum_status_item_movimento
  END
  WHERE mei.movimento_entrada_id = p_movimento_entrada_id
    AND mei.tenant_id            = p_tenant_id
    AND mei.status_item_movimento NOT IN ('ARMAZENADO'::enum_status_item_movimento,
                                          'CANCELADO'::enum_status_item_movimento)
    AND NOT EXISTS (
      SELECT 1 FROM tarefa ta
      WHERE ta.id_documento_origem = mei.id
        AND ta.tenant_id           = p_tenant_id
        AND ta.tipo_tarefa_id      = v_tipo_armz_id
        AND ta.status             <> 'CANCELADA'::enum_status_tarefa
    );

  ------------------------------------------------------------
  -- 4. VERIFICAR DIVERGÊNCIA / SITUAÇÃO DA ARMAZENAGEM
  ------------------------------------------------------------
  SELECT EXISTS (
      SELECT 1
      FROM movimento_entrada_item mei
      WHERE mei.movimento_entrada_id = p_movimento_entrada_id
        AND mei.tenant_id            = p_tenant_id
        AND mei.status_item_movimento NOT IN ('CONFERIDO'::enum_status_item_movimento,
                                              'ARMAZENADO'::enum_status_item_movimento,
                                              'CANCELADO'::enum_status_item_movimento)
        AND NOT EXISTS (
          SELECT 1 FROM tarefa ta
          WHERE ta.id_documento_origem = mei.id
            AND ta.tenant_id           = p_tenant_id
            AND ta.tipo_tarefa_id      = v_tipo_armz_id
            AND ta.status             <> 'CANCELADA'::enum_status_tarefa
        )
  ) INTO v_existem_pendentes;

  IF v_tem_armz THEN
    SELECT EXISTS (
        SELECT 1
        FROM movimento_entrada_item mei
        WHERE mei.movimento_entrada_id = p_movimento_entrada_id
          AND mei.tenant_id            = p_tenant_id
          AND mei.status_item_movimento = 'CONFERIDO'::enum_status_item_movimento
          AND mei.qtd_conferida > 0
          AND NOT EXISTS (
            SELECT 1 FROM tarefa ta
            WHERE ta.id_documento_origem = mei.id
              AND ta.tenant_id           = p_tenant_id
              AND ta.tipo_tarefa_id      = v_tipo_armz_id
              AND ta.status             <> 'CANCELADA'::enum_status_tarefa
          )
    ) INTO v_conferidos_sem_armz;

    SELECT EXISTS (
        SELECT 1
        FROM tarefa t
        JOIN movimento_entrada_item mei ON mei.id = t.id_documento_origem
        WHERE mei.movimento_entrada_id = p_movimento_entrada_id
          AND t.tenant_id              = p_tenant_id
          AND t.tipo_tarefa_id         = v_tipo_armz_id
          AND t.status IN ('CRIADA'::enum_status_tarefa, 'ATRIBUIDA'::enum_status_tarefa,
                           'EM_ANDAMENTO'::enum_status_tarefa, 'PAUSADA'::enum_status_tarefa)
    ) INTO v_armz_pendente;
  END IF;

  ------------------------------------------------------------
  -- 5. FINALIZAR MOVIMENTO
  ------------------------------------------------------------
  IF NOT v_tem_armz THEN
    -- Fluxo original (armazenagem ainda não iniciada)
    v_novo_status := CASE WHEN v_existem_pendentes THEN 'DIVERGENCIA'::enum_status_mov_entrada
                          ELSE 'CONFERIDO'::enum_status_mov_entrada END;
  ELSE
    -- Conferência e armazenagem simultâneas
    v_novo_status := CASE
      WHEN v_existem_pendentes    THEN 'DIVERGENCIA'::enum_status_mov_entrada  -- supervisor trata; armazenagem segue visível (bloco 3)
      WHEN v_conferidos_sem_armz  THEN 'CONFERIDO'::enum_status_mov_entrada    -- falta liberar o restante
      WHEN v_armz_pendente        THEN CASE WHEN v_status_atual IN ('LIB_ARMAZENAGEM','ARMAZENAGEM_PARCIAL')
                                            THEN v_status_atual
                                            ELSE 'ARMAZENAGEM_PARCIAL'::enum_status_mov_entrada END
      ELSE 'ARMAZENADO'::enum_status_mov_entrada                               -- tudo já foi armazenado durante a conferência
    END;
  END IF;

  UPDATE movimento_entrada
  SET
      conferencia_finalizada_em  = now(),
      conferencia_finalizada_por = p_usuario,
      status                     = v_novo_status,
      finalizado_em              = CASE WHEN v_novo_status = 'ARMAZENADO' THEN now() ELSE finalizado_em END
  WHERE id        = p_movimento_entrada_id
    AND tenant_id = p_tenant_id;

  ------------------------------------------------------------
  -- 6. ARMAZENAGEM AUTOMÁTICA (só se há itens conferidos ainda não liberados)
  ------------------------------------------------------------
  IF NOT v_existem_pendentes AND (NOT v_tem_armz OR v_conferidos_sem_armz) THEN

    SELECT te.armazenagem_automatica
    INTO v_armazenagem_automatica
    FROM public.tipo_entrada te
    INNER JOIN public.documento_entrada de
      ON de.tipo_entrada_id = te.id
    INNER JOIN public.movimento_entrada_documento med
      ON med.documento_entrada_id = de.id
      AND med.tenant_id = de.tenant_id
    WHERE med.movimento_entrada_id = p_movimento_entrada_id
      AND med.tenant_id = p_tenant_id
    LIMIT 1;

    IF COALESCE(v_armazenagem_automatica, false) THEN

      SELECT public.liberar_armazenagem(
        p_movimento_entrada_id := p_movimento_entrada_id,
        p_tenant_id := p_tenant_id,
        p_usuario_id := p_usuario,
        p_modo := 'TODOS',
        p_itens_divergentes := '[]'::jsonb,
        p_item_ids := NULL
      )
      INTO v_resultado_armz;

      RETURN jsonb_build_object(
        'sucesso', true,
        'codigo', 'CONFERENCIA_FINALIZADA_ARMAZENAGEM_AUTOMATICA',
        'mensagem', 'Conferência finalizada com armazenagem automática iniciada.',
        'dados', jsonb_build_object(
          'tem_divergencia', false,
          'armazenagem_automatica', true
        )
      );

    END IF;

  END IF;

  ------------------------------------------------------------
  -- 7. RETORNO
  ------------------------------------------------------------
  IF v_existem_pendentes THEN
    v_resultado_codigo := 'CONFERENCIA_FINALIZADA_COM_DIVERGENCIA';
  ELSE
    v_resultado_codigo := 'CONFERENCIA_FINALIZADA_OK';
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', v_resultado_codigo,
    'mensagem', CASE
      WHEN v_existem_pendentes THEN 'Conferência finalizada com divergências identificadas.'
      ELSE 'Conferência finalizada com sucesso.'
    END,
    'dados', jsonb_build_object(
      'tem_divergencia', v_existem_pendentes,
      'armazenagem_automatica', false,
      'status_movimento', v_novo_status
    )
  );

END;
$function$;

-- -----------------------------------------------------------------------------
-- 5. finalizar_armazenagem
--    a) Item ainda em conferência (tarefa ENTR-CONF aberta ou divergente) conta
--       como "não finalizado" — impede ARMAZENADO prematuro e o retorno ao ERP
--       (trg_mov_entrada_retorno_armazenado, etapa 80) com conferência aberta.
--    b) Não sobrescreve DIVERGENCIA / CONFERIDO com ARMAZENAGEM_PARCIAL: são
--       sinais para o supervisor ainda liberar/tratar itens.
-- -----------------------------------------------------------------------------
SELECT pg_temp.patch_fn(
  'public.finalizar_armazenagem(uuid,uuid,uuid,uuid,numeric,uuid,text,date,date,uuid,enum_tipo_picking,numeric,numeric)',
  'AND COALESCE(mei.qtd_conferida, 0) > 0',
  'AND ( COALESCE(mei.qtd_conferida, 0) > 0
            -- v-conf-armz-simultanea (2026-10-23): item ainda em conferência
            OR EXISTS (
              SELECT 1
              FROM tarefa tc
              JOIN tipo_tarefa ttc ON ttc.id = tc.tipo_tarefa_id
              WHERE tc.id_documento_origem = mei.id
                AND tc.tenant_id           = p_tenant_id
                AND ttc.codigo             = ''ENTR-CONF''
                AND tc.status IN (''CRIADA'', ''ATRIBUIDA'', ''EM_ANDAMENTO'', ''PAUSADA'', ''DIVERGENTE'')
            ) )'
);

SELECT pg_temp.patch_fn(
  'public.finalizar_armazenagem(uuid,uuid,uuid,uuid,numeric,uuid,text,date,date,uuid,enum_tipo_picking,numeric,numeric)',
  'SET status = ''ARMAZENAGEM_PARCIAL''::enum_status_mov_entrada',
  'SET status = CASE WHEN status IN (''DIVERGENCIA''::enum_status_mov_entrada, ''CONFERIDO''::enum_status_mov_entrada)
                       THEN status
                       ELSE ''ARMAZENAGEM_PARCIAL''::enum_status_mov_entrada END'
);

COMMIT;
