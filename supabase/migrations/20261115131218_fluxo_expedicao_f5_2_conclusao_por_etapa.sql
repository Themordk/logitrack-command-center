-- =====================================================================
-- Fluxo de Expedição — F5.2 Conclusão por etapa · 2026-11-12
-- ---------------------------------------------------------------------
-- O tipo de saída decide em que etapa a onda fica CONCLUIDA:
--   só separação           -> conclui no fim da separação
--   + conferência          -> conclui no fim da conferência
--   + embarque             -> conclui no fim do embarque (tarefas EMB chegam na F6)
--
-- 1. tipo_saida.realiza_embarque (novo) + tipo_saida.etapa_conclusao (gerada, só leitura).
-- 2. Tipo de tarefa EMB (etapa_onda_ordem = 3) para cada tenant + provisionamento de novos tenants.
-- 3. _fn_onda_etapa_calcular v3: etapa EMB ativa conforme realiza_embarque dos pedidos da onda.
-- 4. fn_onda_concluir_etapa: regra única de fim de etapa.
--      fim da separação   -> (já em SEPARADO)  -> CONCLUIDA se não houver etapa ativa depois
--      fim da conferência -> CONFERIDO          -> CONCLUIDA se não houver etapa ativa depois
--      fim do embarque    -> CONCLUIDA
--    Passar por CONFERIDO dispara o evento saida.conferencia_finalizada (retorno ao ERP).
-- 5. fn_gerar_conferencia_saida e conferencia_saida_confirmacao (2 versões) passam a usá-la.
-- Reversão: 20261112_fluxo_expedicao_f5_2_down.sql
-- =====================================================================

-- ---------- 1. tipo de saída ----------
ALTER TABLE public.tipo_saida
  ADD COLUMN IF NOT EXISTS realiza_embarque boolean NOT NULL DEFAULT false;

ALTER TABLE public.tipo_saida
  ADD COLUMN IF NOT EXISTS etapa_conclusao text
  GENERATED ALWAYS AS (
    CASE WHEN realiza_embarque THEN 'EMBARQUE'
         WHEN COALESCE(realiza_conferencia, false) THEN 'CONFERENCIA'
         ELSE 'SEPARACAO' END) STORED;

COMMENT ON COLUMN public.tipo_saida.realiza_embarque IS
  'Fluxo de Expedição: a onda passa pela etapa de embarque (carga) antes de concluir.';
COMMENT ON COLUMN public.tipo_saida.etapa_conclusao IS
  'Somente leitura: etapa em que a onda fica CONCLUIDA (última etapa ligada).';

-- ---------- backups ----------
DO $$
DECLARE r record; v_def text;
BEGIN
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('fn_gerar_conferencia_saida','conferencia_saida_confirmacao','_fn_onda_etapa_calcular',
                                'tg_tipo_tarefa_etapa_onda_padrao','fn_provisionar_tenant_completo')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'FUNCTION public.' || r.proname || '(', 'FUNCTION public.' || r.proname || '_bkp_f52(');
    EXECUTE v_def;
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname || '_bkp_f52', pg_get_function_identity_arguments(r.oid));
  END LOOP;
END $$;

-- ---------- 2. tipo de tarefa EMB ----------
CREATE OR REPLACE FUNCTION public.tg_tipo_tarefa_etapa_onda_padrao()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.etapa_onda_ordem IS NULL THEN
    NEW.etapa_onda_ordem := CASE NEW.codigo WHEN 'SEP' THEN 1 WHEN 'SEP-CONF' THEN 2 WHEN 'EMB' THEN 3 END;
  END IF;
  RETURN NEW;
END $$;

INSERT INTO public.tipo_tarefa (tenant_id, codigo, descricao, categoria, prioridade_padrao, tempo_estimado_segundos,
                                gera_movimento_estoque, bloqueia_estoque, exige_conferencia, tipo_movimento, ativo,
                                peso_produtividade, etapa_onda_ordem)
SELECT tt.tenant_id, 'EMB', 'EMBARQUE', 'EXPEDICAO', 3, 60, false, false, false, NULL, true, 1.0, 3
  FROM public.tipo_tarefa tt
 WHERE tt.codigo = 'SEP-CONF'
ON CONFLICT (tenant_id, codigo) DO NOTHING;

DO $$
DECLARE v_def text; v_old text; v_n int;
BEGIN
  v_def := pg_get_functiondef('public.fn_provisionar_tenant_completo'::regproc);
  v_old := $q$(p_tenant_id, 'SEP-CONF', 'CONFERÊNCIA DE ONDA', 'CONFERENCIA', 3, 120, false, false, false, null, true, '1.0'),$q$;
  v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_n <> 1 THEN RAISE EXCEPTION 'F5.2: trecho SEP-CONF do provisionamento encontrado % vezes (esperado 1).', v_n; END IF;
  IF position($q$'EMB', 'EMBARQUE'$q$ IN v_def) = 0 THEN
    v_def := replace(v_def, v_old, v_old || E'\n    ' ||
      $q$(p_tenant_id, 'EMB', 'EMBARQUE', 'EXPEDICAO', 3, 60, false, false, false, null, true, '1.0'),$q$);
    EXECUTE v_def;
  END IF;
END $$;

-- ---------- 3. cálculo da etapa ----------
CREATE OR REPLACE FUNCTION public._fn_onda_etapa_calcular(p_movimento_saida_id uuid, p_tipo_tarefa_id uuid)
 RETURNS TABLE(modo text, ativa boolean, por_zona boolean, permite_mesmo_operador boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- v2 (2026-11-12) Fluxo de Expedição F4: zona lida de roteiro_saida_criterio (SEPARACAO);
--   onda com 2+ grupos de separação é COMPARTILHADA (cada operador assume um grupo).
-- v3 (2026-11-12) F5.2: etapa EMB ativa conforme tipo_saida.realiza_embarque dos pedidos da onda.
DECLARE
  v_tenant uuid; v_empresa uuid; v_tipo_saida uuid; v_codigo text;
  v_res_sep boolean; v_res_conf boolean; v_realiza_ts boolean; v_permite boolean;
  v_zona boolean; v_realiza_docs boolean; v_grupos integer; v_emb_ts boolean; v_emb_docs boolean;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id, ms.tipo_saida INTO v_tenant, v_empresa, v_tipo_saida
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt
  WHERE tt.id = p_tipo_tarefa_id AND tt.tenant_id = v_tenant;

  SELECT ts.reserva_separacao_movimento, ts.reserva_conferencia_movimento,
         ts.realiza_conferencia, ts.permite_mesmo_operador_sep_conf, ts.realiza_embarque
    INTO v_res_sep, v_res_conf, v_realiza_ts, v_permite, v_emb_ts
  FROM tipo_saida ts WHERE ts.id = v_tipo_saida;

  v_zona := EXISTS (SELECT 1 FROM roteiro_saida_criterio rc
                    WHERE rc.tenant_id = v_tenant AND rc.empresa_id = v_empresa
                      AND rc.nivel = 'SEPARACAO' AND rc.criterio = 'ZONA_ATIVIDADE')
         OR EXISTS (SELECT 1 FROM agrupamento_separacao a
                    WHERE a.tenant_id = v_tenant
                      AND (a.empresa_id IS NULL OR a.empresa_id = v_empresa)
                      AND a.tipo_agrupamento = 'ZONA_ATIVIDADE');

  IF v_codigo = 'SEP' THEN
    SELECT COUNT(*) INTO v_grupos FROM grupo_separacao g WHERE g.movimento_saida_id = p_movimento_saida_id;
    RETURN QUERY SELECT
      CASE WHEN v_zona OR v_grupos > 1 OR NOT COALESCE(v_res_sep, true) THEN 'COMPARTILHADA' ELSE 'EXCLUSIVA' END,
      true, v_zona, true;
  ELSIF v_codigo = 'SEP-CONF' THEN
    SELECT bool_or(ts.realiza_conferencia) INTO v_realiza_docs
    FROM movimento_saida_documento msd
    JOIN documento_saida ds ON ds.id = msd.documento_saida_id
    JOIN tipo_saida ts      ON ts.id = ds.tipo_pedido_id
    WHERE msd.movimento_saida_id = p_movimento_saida_id;
    RETURN QUERY SELECT
      CASE WHEN COALESCE(v_res_conf, true) THEN 'EXCLUSIVA' ELSE 'COMPARTILHADA' END,
      COALESCE(v_realiza_docs, v_realiza_ts, true), false, COALESCE(v_permite, true);
  ELSIF v_codigo = 'EMB' THEN
    SELECT bool_or(ts.realiza_embarque) INTO v_emb_docs
    FROM movimento_saida_documento msd
    JOIN documento_saida ds ON ds.id = msd.documento_saida_id
    JOIN tipo_saida ts      ON ts.id = ds.tipo_pedido_id
    WHERE msd.movimento_saida_id = p_movimento_saida_id;
    RETURN QUERY SELECT 'EXCLUSIVA'::text, COALESCE(v_emb_docs, v_emb_ts, false), false, true;
  ELSE
    RETURN QUERY SELECT 'EXCLUSIVA'::text, true, false, true;
  END IF;
END $function$;

-- ---------- 4. regra única de fim de etapa ----------
CREATE OR REPLACE FUNCTION public.fn_onda_concluir_etapa(p_tenant_id uuid, p_movimento_saida_id uuid, p_ordem integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
-- Chamada pelas rotinas do backend quando uma etapa da onda termina (p_ordem = etapa_onda_ordem
-- da etapa encerrada: 1 separação, 2 conferência, 3 embarque). Não é exposta ao coletor.
DECLARE
  v_status   text;
  v_proxima  text;
  v_novo     text;
BEGIN
  IF p_ordem NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'ETAPA_ORDEM_INVALIDA: ordem % não existe.', p_ordem USING ERRCODE = 'P0001';
  END IF;

  SELECT ms.status::text INTO v_status FROM movimento_saida ms
   WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id
   FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_NAO_ENCONTRADA');
  END IF;
  IF v_status IN ('CONCLUIDA', 'CANCELADA', 'EXPORTADA_ERP') THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'ONDA_JA_ENCERRADA', 'status', v_status);
  END IF;

  -- próxima etapa ligada na foto da onda (ou calculada, se a onda não tiver foto)
  SELECT tt.codigo INTO v_proxima
    FROM tipo_tarefa tt
    CROSS JOIN LATERAL public.fn_onda_etapa_info(p_movimento_saida_id, tt.id) i
   WHERE tt.tenant_id = p_tenant_id AND tt.etapa_onda_ordem > p_ordem
     AND COALESCE(i.ativa, false)
   ORDER BY tt.etapa_onda_ordem
   LIMIT 1;

  -- status de fim da etapa encerrada
  IF p_ordem = 2 AND v_status <> 'CONFERIDO' THEN
    UPDATE movimento_saida SET status = 'CONFERIDO'
     WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id;
    v_status := 'CONFERIDO';
  END IF;

  IF p_ordem = 3 OR v_proxima IS NULL THEN
    UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now()
     WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id;
    v_novo := 'CONCLUIDA';
  ELSE
    v_novo := v_status;
  END IF;

  RETURN jsonb_build_object('sucesso', true,
    'codigo', CASE WHEN v_novo = 'CONCLUIDA' THEN 'ONDA_CONCLUIDA' ELSE 'AGUARDANDO_' || v_proxima END,
    'status', v_novo, 'proxima_etapa', v_proxima);
END $$;
REVOKE ALL ON FUNCTION public.fn_onda_concluir_etapa(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_onda_concluir_etapa(uuid, uuid, integer) TO service_role;

-- ---------- 5. rotinas que encerram etapa passam a usar a regra ----------
DO $$
DECLARE
  r record; v_def text; v_new text; v_n int;
BEGIN
  -- 5a. fn_gerar_conferencia_saida: conferência desligada
  v_def := pg_get_functiondef('public.fn_gerar_conferencia_saida(uuid,uuid)'::regprocedure);
  v_new := regexp_replace(v_def,
    $re$UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now\(\)\s+WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';\s+RETURN jsonb_build_object\('sucesso', true, 'codigo', 'CONCLUIDA_SEM_CONFERENCIA',\s+'mensagem', 'Tipo de saída sem conferência: onda concluída ao fim da separação.'\);$re$,
    $rp$v_fim := public.fn_onda_concluir_etapa(p_tenant_id, p_movimento_saida_id, 1);
      IF v_fim ->> 'status' = 'CONCLUIDA' THEN
        RETURN jsonb_build_object('sucesso', true, 'codigo', 'CONCLUIDA_SEM_CONFERENCIA',
          'mensagem', 'Tipo de saída sem conferência: onda concluída ao fim da separação.');
      END IF;
      RETURN jsonb_build_object('sucesso', true, 'codigo', v_fim ->> 'codigo',
        'mensagem', 'Tipo de saída sem conferência: onda separada aguardando a próxima etapa.', 'dados', v_fim);$rp$);
  IF v_new = v_def THEN RAISE EXCEPTION 'F5.2: trecho de conclusão não encontrado em fn_gerar_conferencia_saida.'; END IF;
  v_def := v_new;
  v_new := regexp_replace(v_def, '(\n\s*v_ativa\s+boolean;)', E'\\1\n  v_fim jsonb;');
  IF v_new = v_def THEN RAISE EXCEPTION 'F5.2: declaração v_ativa não encontrada em fn_gerar_conferencia_saida.'; END IF;
  v_new := regexp_replace(v_new, '(AS \$function\$\n)', E'\\1-- v6 (2026-11-12) F5.2: conferência desligada encerra a etapa pela regra única (fn_onda_concluir_etapa).\n');
  EXECUTE v_new;

  -- 5b. conferencia_saida_confirmacao (as duas versões)
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'conferencia_saida_confirmacao' LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def,
      $re$UPDATE movimento_saida\s+SET status = 'CONCLUIDA', finalizado_em = now\(\)\s+WHERE id = v_movimento_saida_id\s+AND tenant_id = p_tenant_id\s+AND status <> 'CONCLUIDA';$re$,
      $rp$PERFORM public.fn_onda_concluir_etapa(p_tenant_id, v_movimento_saida_id, 2);  -- F5.2: CONFERIDO -> (CONCLUIDA se for a última etapa)$rp$);
    IF v_new = v_def THEN
      RAISE EXCEPTION 'F5.2: trecho de conclusão não encontrado em conferencia_saida_confirmacao(%).', pg_get_function_identity_arguments(r.oid);
    END IF;
    SELECT count(*) INTO v_n FROM regexp_matches(v_new, 'fn_onda_concluir_etapa', 'g');
    IF v_n <> 1 THEN RAISE EXCEPTION 'F5.2: % substituições em conferencia_saida_confirmacao (esperado 1).', v_n; END IF;
    EXECUTE v_new;
  END LOOP;
END $$;
