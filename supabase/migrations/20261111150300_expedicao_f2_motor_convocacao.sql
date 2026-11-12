-- =============================================================================
-- Expedição por etapas — Fase 2: motor da convocação híbrida (R1, R1.1, R3, R5, R6, R9)
--   Convocação híbrida = autoconvocação pelo operador + convocação manual pelo gestor.
--   * assert_usuario_sessao            -> o usuário informado precisa ser o da sessão
--   * fn_onda_usuario_pode_executar    -> pode pegar tarefas desta etapa? por quê?
--   * _fn_onda_assumir                 -> autoconvocação (EXCLUSIVA leva tudo; COMPARTILHADA uma por vez)
--   * fn_onda_aplicar_responsaveis     -> aplica a convocação do gestor às tarefas abertas
--   * gatilho na onda (liberação)      -> grava o modo das etapas e aplica a convocação da separação
--   * gatilho em tarefa_execucao       -> só o dono registra coleta/conferência (TAREFA_REATRIBUIDA)
-- Reversão: DROP dos gatilhos trg_a_mov_saida_etapas e trg_tarefa_execucao_valida_dono e das funções.
-- =============================================================================

-- 1. O usuário informado pelo coletor precisa ser o da sessão (chamadas internas passam)
CREATE OR REPLACE FUNCTION public.assert_usuario_sessao(p_usuario_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
BEGIN
  IF v_role IS NULL OR v_role = 'service_role' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM usuario u WHERE u.id = p_usuario_id AND u.auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'USUARIO_SESSAO_INVALIDO: O usuário informado não corresponde à sessão.' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_usuario_sessao(uuid) FROM PUBLIC, anon, authenticated;

-- 2. Pode este usuário pegar tarefas desta etapa da onda?
CREATE OR REPLACE FUNCTION public.fn_onda_usuario_pode_executar(
  p_movimento_saida_id uuid, p_tipo_tarefa_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_codigo text;
  v_modo text; v_ativa boolean; v_por_zona boolean; v_permite boolean;
  v_designados uuid[]; v_nomes text; v_outro_nome text; v_tem_outro boolean := false; v_zona uuid;
BEGIN
  SELECT ms.tenant_id INTO v_tenant FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'ONDA_NAO_ENCONTRADA', 'mensagem', 'Onda não encontrada.');
  END IF;

  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt WHERE tt.id = p_tipo_tarefa_id AND tt.tenant_id = v_tenant;
  SELECT i.modo, i.ativa, i.por_zona, i.permite_mesmo_operador INTO v_modo, v_ativa, v_por_zona, v_permite
  FROM public.fn_onda_etapa_info(p_movimento_saida_id, p_tipo_tarefa_id) i;

  IF v_codigo IS NULL OR NOT COALESCE(v_ativa, false) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'ETAPA_INATIVA', 'mensagem', 'Esta etapa não se aplica a esta onda.');
  END IF;

  -- Convocação manual do gestor tem precedência
  SELECT array_agg(r.usuario_id), string_agg(u.nome, ', ' ORDER BY u.nome)
    INTO v_designados, v_nomes
  FROM movimento_saida_responsavel r JOIN usuario u ON u.id = r.usuario_id
  WHERE r.movimento_saida_id = p_movimento_saida_id AND r.tipo_tarefa_id = p_tipo_tarefa_id AND r.ativo;

  IF v_designados IS NOT NULL AND NOT (p_usuario_id = ANY (v_designados)) THEN
    IF v_modo = 'EXCLUSIVA' THEN
      RETURN jsonb_build_object('permitido', false, 'codigo', 'ONDA_DESIGNADA', 'modo', v_modo,
        'mensagem', format('Onda designada para %s pelo gestor.', v_nomes));
    END IF;
    RETURN jsonb_build_object('permitido', false, 'codigo', 'FORA_DA_EQUIPE', 'modo', v_modo,
      'mensagem', 'Você não está na equipe desta etapa da onda.');
  END IF;

  -- Etapa livre e exclusiva: se outro operador já assumiu, ela não está disponível
  IF v_designados IS NULL AND v_modo = 'EXCLUSIVA' THEN
    SELECT true, u.nome INTO v_tem_outro, v_outro_nome
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    JOIN tarefa_atribuicao ta     ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
    LEFT JOIN usuario u           ON u.id = ta.usuario_id
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND t.tenant_id = v_tenant
      AND t.tipo_tarefa_id = p_tipo_tarefa_id
      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
      AND ta.usuario_id <> p_usuario_id
    LIMIT 1;
    IF COALESCE(v_tem_outro, false) THEN
      RETURN jsonb_build_object('permitido', false, 'codigo', 'ETAPA_JA_ASSUMIDA', 'modo', v_modo,
        'mensagem', format('Esta etapa já está com %s.', COALESCE(v_outro_nome, 'outro operador')));
    END IF;
  END IF;

  -- R9: quem separou não confere, quando o tipo de saída proíbe
  IF v_codigo = 'SEP-CONF' AND NOT COALESCE(v_permite, true) AND (
       EXISTS (SELECT 1 FROM tarefa_execucao te
               JOIN tarefa t ON t.id = te.tarefa_id
               JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
               JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
               WHERE msi.movimento_saida_id = p_movimento_saida_id
                 AND te.usuario_id = p_usuario_id AND te.status = 'CONCLUIDA')
    OR EXISTS (SELECT 1 FROM movimento_saida_responsavel r
               JOIN tipo_tarefa tt ON tt.id = r.tipo_tarefa_id AND tt.codigo = 'SEP'
               WHERE r.movimento_saida_id = p_movimento_saida_id AND r.usuario_id = p_usuario_id AND r.ativo)) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'MESMO_OPERADOR_SEPARACAO', 'modo', v_modo,
      'mensagem', 'Quem separou esta onda não pode conferi-la.');
  END IF;

  -- R3: separação por zona exige zona no cadastro
  IF v_por_zona THEN
    SELECT u.zona_atividade_separacao INTO v_zona FROM usuario u WHERE u.id = p_usuario_id;
    IF v_zona IS NULL THEN
      RETURN jsonb_build_object('permitido', false, 'codigo', 'SEM_ZONA_CADASTRADA', 'modo', v_modo,
        'mensagem', 'Esta onda separa por zona e seu usuário não tem zona cadastrada.');
    END IF;
  END IF;

  -- Há trabalho livre (ou já dele) nesta etapa?
  IF NOT EXISTS (
    SELECT 1
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    LEFT JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND t.tenant_id = v_tenant
      AND t.tipo_tarefa_id = p_tipo_tarefa_id
      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
      AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
      AND (ta.id IS NULL OR ta.usuario_id = p_usuario_id)
      AND (NOT v_por_zona OR t.id_local_origem IS NULL OR EXISTS (
            SELECT 1 FROM endereco_zona_atividade eza
            WHERE eza.endereco_id = t.id_local_origem AND eza.tenant_id = v_tenant
              AND eza.zona_atividade_id = v_zona))
  ) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'SEM_TAREFAS_DISPONIVEIS', 'modo', v_modo,
      'mensagem', 'Não há tarefas disponíveis para você nesta etapa da onda.');
  END IF;

  RETURN jsonb_build_object('permitido', true, 'codigo', 'OK', 'modo', v_modo, 'por_zona', v_por_zona,
    'convocado_pelo_gestor', v_designados IS NOT NULL, 'mensagem', 'Disponível.');
END $$;
REVOKE ALL ON FUNCTION public.fn_onda_usuario_pode_executar(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3. Autoconvocação: o operador assume tarefas livres da etapa.
--    Chamar com a onda travada (FOR UPDATE) e depois de fn_onda_usuario_pode_executar.
CREATE OR REPLACE FUNCTION public._fn_onda_assumir(
  p_movimento_saida_id uuid, p_tipo_tarefa_id uuid, p_usuario_id uuid,
  p_tipo_convocacao public.enum_tipo_convocacao DEFAULT 'AUTO_CONVOCADO')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_empresa uuid; v_modo text; v_por_zona boolean; v_zona uuid;
  v_ids uuid[]; v_n integer := 0;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id INTO v_tenant, v_empresa
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  SELECT i.modo, i.por_zona INTO v_modo, v_por_zona
  FROM public.fn_onda_etapa_info(p_movimento_saida_id, p_tipo_tarefa_id) i;
  SELECT u.zona_atividade_separacao INTO v_zona FROM usuario u WHERE u.id = p_usuario_id;

  IF v_modo = 'EXCLUSIVA' THEN
    -- Reserva total: todas as tarefas livres da etapa (zona não se aplica)
    SELECT array_agg(s.id) INTO v_ids FROM (
      SELECT t.id
      FROM tarefa t
      JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
      WHERE msi.movimento_saida_id = p_movimento_saida_id
        AND t.tenant_id = v_tenant
        AND t.tipo_tarefa_id = p_tipo_tarefa_id
        AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
        AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
        AND NOT EXISTS (SELECT 1 FROM tarefa_atribuicao ta WHERE ta.tarefa_id = t.id AND ta.liberado_em IS NULL)
      ORDER BY t.ordem_tarefa
      FOR UPDATE OF t SKIP LOCKED) s;
  ELSE
    -- Compartilhada: uma tarefa por vez
    IF EXISTS (SELECT 1 FROM tarefa t
               JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
               JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
                                        AND ta.usuario_id = p_usuario_id
               WHERE msi.movimento_saida_id = p_movimento_saida_id
                 AND t.tipo_tarefa_id = p_tipo_tarefa_id
                 AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
                 AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)) THEN
      RETURN 0;
    END IF;
    SELECT array_agg(s.id) INTO v_ids FROM (
      SELECT t.id
      FROM tarefa t
      JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
      WHERE msi.movimento_saida_id = p_movimento_saida_id
        AND t.tenant_id = v_tenant
        AND t.tipo_tarefa_id = p_tipo_tarefa_id
        AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
        AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
        AND NOT EXISTS (SELECT 1 FROM tarefa_atribuicao ta WHERE ta.tarefa_id = t.id AND ta.liberado_em IS NULL)
        AND (NOT COALESCE(v_por_zona, false) OR t.id_local_origem IS NULL OR EXISTS (
              SELECT 1 FROM endereco_zona_atividade eza
              WHERE eza.endereco_id = t.id_local_origem AND eza.tenant_id = v_tenant
                AND eza.zona_atividade_id = v_zona))
      ORDER BY t.ordem_tarefa
      FOR UPDATE OF t SKIP LOCKED
      LIMIT 1) s;
  END IF;

  IF v_ids IS NULL THEN RETURN 0; END IF;

  WITH ins AS (
    INSERT INTO tarefa_atribuicao (tenant_id, empresa_id, tarefa_id, usuario_id, tipo_convocacao, status, atribuido_em, created_by)
    SELECT v_tenant, v_empresa, x.id, p_usuario_id, p_tipo_convocacao, 'ATRIBUIDA', now(), p_usuario_id
    FROM unnest(v_ids) AS x(id)
    ON CONFLICT (tarefa_id) WHERE liberado_em IS NULL DO NOTHING
    RETURNING tarefa_id
  ), upd AS (
    UPDATE tarefa t SET status = 'ATRIBUIDA'
    FROM ins WHERE t.id = ins.tarefa_id AND t.status = 'CRIADA'
    RETURNING t.id
  )
  SELECT count(*) INTO v_n FROM ins;

  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public._fn_onda_assumir(uuid, uuid, uuid, public.enum_tipo_convocacao) FROM PUBLIC, anon, authenticated;

-- 4. Convocação manual: aplica os convocados pelo gestor às tarefas abertas da etapa.
--    EXCLUSIVA: todas as tarefas abertas passam ao convocado.
--    COMPARTILHADA: tarefas de quem está fora da equipe voltam para a fila.
--    Tarefas com progresso só mudam de dono com p_confirmar_progresso (continuam de onde pararam).
CREATE OR REPLACE FUNCTION public.fn_onda_aplicar_responsaveis(
  p_movimento_saida_id uuid, p_tipo_tarefa_id uuid,
  p_gestor_id uuid DEFAULT NULL, p_confirmar_progresso boolean DEFAULT false,
  p_motivo text DEFAULT NULL, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_empresa uuid; v_numero bigint; v_codigo text;
  v_modo text; v_ativa boolean;
  v_designados uuid[]; v_dest uuid; r record;
  v_movidas integer := 0; v_novas integer := 0; v_devolvidas integer := 0;
  v_com_progresso integer := 0; v_bloqueadas integer := 0;
  v_de uuid[] := '{}';
  v_de_json jsonb;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id, ms.numero_onda INTO v_tenant, v_empresa, v_numero
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt WHERE tt.id = p_tipo_tarefa_id;
  SELECT i.modo, i.ativa INTO v_modo, v_ativa FROM public.fn_onda_etapa_info(p_movimento_saida_id, p_tipo_tarefa_id) i;

  IF v_tenant IS NULL OR NOT COALESCE(v_ativa, false) THEN
    RETURN jsonb_build_object('aplicado', false, 'motivo', 'ETAPA_INATIVA');
  END IF;

  SELECT array_agg(r2.usuario_id ORDER BY r2.definido_em) INTO v_designados
  FROM movimento_saida_responsavel r2
  WHERE r2.movimento_saida_id = p_movimento_saida_id AND r2.tipo_tarefa_id = p_tipo_tarefa_id AND r2.ativo;

  IF v_designados IS NULL THEN
    RETURN jsonb_build_object('aplicado', false, 'motivo', 'SEM_CONVOCACAO', 'modo', v_modo);
  END IF;

  FOR r IN
    SELECT t.id, COALESCE(t.quantidade_executada, 0) > 0 AS progresso,
           ta.id AS atr_id, ta.usuario_id AS dono
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    LEFT JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND t.tenant_id = v_tenant
      AND t.tipo_tarefa_id = p_tipo_tarefa_id
      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
      AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
    ORDER BY t.ordem_tarefa
    FOR UPDATE OF t
  LOOP
    IF v_modo = 'EXCLUSIVA' THEN
      v_dest := v_designados[1];
      CONTINUE WHEN r.dono IS NOT DISTINCT FROM v_dest;

      IF r.dono IS NOT NULL THEN
        IF r.progresso AND NOT p_confirmar_progresso THEN
          v_bloqueadas := v_bloqueadas + 1;
          CONTINUE;
        END IF;
        v_movidas := v_movidas + 1;
        v_de := v_de || r.dono;
        IF r.progresso THEN v_com_progresso := v_com_progresso + 1; END IF;
        IF NOT p_simular THEN
          UPDATE tarefa_atribuicao
             SET status = 'LIBERADA', liberado_em = now(), liberado_por = p_gestor_id,
                 motivo_liberacao = 'REATRIBUICAO', observacao = COALESCE(p_motivo, observacao)
           WHERE id = r.atr_id;
        END IF;
      ELSE
        v_novas := v_novas + 1;
      END IF;

      IF NOT p_simular THEN
        INSERT INTO tarefa_atribuicao (tenant_id, empresa_id, tarefa_id, usuario_id, tipo_convocacao,
                                       status, atribuido_em, created_by, observacao)
        VALUES (v_tenant, v_empresa, r.id, v_dest, 'CONVOCACAO_GESTOR', 'ATRIBUIDA', now(), p_gestor_id, p_motivo);
        UPDATE tarefa SET status = 'ATRIBUIDA' WHERE id = r.id AND status = 'CRIADA';
        INSERT INTO tarefa_evento_execucao (tenant_id, tarefa_id, tipo_evento, carga_util, created_by)
        VALUES (v_tenant, r.id,
                (CASE WHEN r.dono IS NULL THEN 'ATRIBUICAO' ELSE 'REATRIBUICAO' END)::public.enum_tipo_evento_execucao,
                jsonb_build_object('origem', 'GESTOR', 'de', r.dono, 'para', v_dest,
                                   'movimento_saida_id', p_movimento_saida_id, 'numero_onda', v_numero,
                                   'etapa', v_codigo, 'com_progresso', r.progresso, 'motivo', p_motivo),
                p_gestor_id);
      END IF;

    ELSE -- COMPARTILHADA
      CONTINUE WHEN r.dono IS NULL OR r.dono = ANY (v_designados);
      IF r.progresso AND NOT p_confirmar_progresso THEN
        v_bloqueadas := v_bloqueadas + 1;
        CONTINUE;
      END IF;
      v_devolvidas := v_devolvidas + 1;
      v_de := v_de || r.dono;
      IF r.progresso THEN v_com_progresso := v_com_progresso + 1; END IF;
      IF NOT p_simular THEN
        UPDATE tarefa_atribuicao
           SET status = 'LIBERADA', liberado_em = now(), liberado_por = p_gestor_id,
               motivo_liberacao = 'DEVOLUCAO_FILA', observacao = COALESCE(p_motivo, observacao)
         WHERE id = r.atr_id;
        UPDATE tarefa SET status = 'CRIADA' WHERE id = r.id AND status = 'ATRIBUIDA';
        INSERT INTO tarefa_evento_execucao (tenant_id, tarefa_id, tipo_evento, carga_util, created_by)
        VALUES (v_tenant, r.id, 'REATRIBUICAO',
                jsonb_build_object('origem', 'GESTOR', 'acao', 'DEVOLUCAO_FILA', 'de', r.dono, 'para', NULL,
                                   'movimento_saida_id', p_movimento_saida_id, 'numero_onda', v_numero,
                                   'etapa', v_codigo, 'com_progresso', r.progresso, 'motivo', p_motivo),
                p_gestor_id);
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('usuario_id', d.uid, 'nome', u.nome, 'tarefas', d.n) ORDER BY u.nome), '[]'::jsonb)
    INTO v_de_json
  FROM (SELECT x AS uid, count(*) AS n FROM unnest(v_de) x GROUP BY x) d
  JOIN usuario u ON u.id = d.uid;

  RETURN jsonb_build_object(
    'aplicado', true, 'simulado', p_simular, 'modo', v_modo, 'etapa', v_codigo,
    'tarefas_movidas', v_movidas, 'tarefas_novas', v_novas, 'tarefas_devolvidas', v_devolvidas,
    'com_progresso', v_com_progresso, 'bloqueadas_por_progresso', v_bloqueadas,
    'de', v_de_json, 'para', to_jsonb(v_designados));
END $$;
REVOKE ALL ON FUNCTION public.fn_onda_aplicar_responsaveis(uuid, uuid, uuid, boolean, text, boolean) FROM PUBLIC, anon, authenticated;

-- 5. Liberação da onda: grava o modo das etapas e aplica a convocação da separação.
--    Nome começa com "trg_a_" para rodar antes de trg_mov_saida_conferencia (ordem alfabética).
CREATE OR REPLACE FUNCTION public.tg_mov_saida_etapas_liberacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sep uuid;
BEGIN
  IF OLD.status = 'CRIADA' AND NEW.status IN ('LIBERADO', 'EM_PICKING', 'SEPARADO') THEN
    PERFORM public.fn_onda_snapshot_etapas(NEW.id);
    SELECT tt.id INTO v_sep FROM tipo_tarefa tt WHERE tt.tenant_id = NEW.tenant_id AND tt.codigo = 'SEP' LIMIT 1;
    IF v_sep IS NOT NULL THEN
      PERFORM public.fn_onda_aplicar_responsaveis(NEW.id, v_sep);
    END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tg_mov_saida_etapas_liberacao() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_a_mov_saida_etapas
  AFTER UPDATE OF status ON public.movimento_saida
  FOR EACH ROW EXECUTE FUNCTION public.tg_mov_saida_etapas_liberacao();

-- 6. R6: coleta/conferência só por quem tem a atribuição aberta da tarefa
CREATE OR REPLACE FUNCTION public.tg_tarefa_execucao_valida_dono()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dono uuid; v_nome text;
BEGIN
  SELECT ta.usuario_id, u.nome INTO v_dono, v_nome
  FROM tarefa_atribuicao ta
  JOIN tarefa t       ON t.id = ta.tarefa_id
  JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.etapa_onda_ordem IS NOT NULL
  LEFT JOIN usuario u ON u.id = ta.usuario_id
  WHERE ta.tarefa_id = NEW.tarefa_id AND ta.liberado_em IS NULL
  LIMIT 1;

  IF v_dono IS NOT NULL AND v_dono IS DISTINCT FROM NEW.usuario_id THEN
    RAISE EXCEPTION 'TAREFA_REATRIBUIDA: Esta tarefa foi passada para %. A lista será atualizada.', COALESCE(v_nome, 'outro operador')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_tarefa_execucao_valida_dono() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tarefa_execucao_valida_dono
  BEFORE INSERT ON public.tarefa_execucao
  FOR EACH ROW EXECUTE FUNCTION public.tg_tarefa_execucao_valida_dono();
