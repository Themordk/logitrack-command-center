-- 2026-11-06 · Retorno ao ERP: envio manual com tratamento de bloqueios de fila
--
-- Problema: o envio manual ("Enviar ao ERP") usa a mesma chave_ordenacao das execuções
-- automáticas do mesmo fluxo/documento. Se existir uma execução anterior em
-- pendente/executando/aguardando_retry/erro, a nova fica eternamente em "pendente"
-- (integracao_retorno_svc_reservar não a reserva) e o usuário não é avisado.
--
-- Solução:
--  1. integracao.fn_retorno_bloqueios_envio  → lista as execuções que bloqueiam a fila.
--  2. integracao_retorno_verificar_envio     → pré-checagem para o frontend (bloqueios +
--     status atual do movimento x evento do gatilho, apenas informativo).
--  3. integracao_retorno_executar            → novo parâmetro p_descartar_bloqueios.
--     No modo manual, havendo bloqueio:
--       - execução em andamento ('executando')  → RETORNO_ENVIO_EM_ANDAMENTO (nunca descarta);
--       - demais e p_descartar_bloqueios=false  → RETORNO_DOCUMENTO_BLOQUEADO;
--       - demais e p_descartar_bloqueios=true   → marca como 'descartado' com motivo auditável.
--     Modos teste/simulação não usam a fila e seguem inalterados.
--
-- Índice usado: idx_retorno_exec_ordem (chave_ordenacao, created_at) — mesmo predicado.

BEGIN;

-- 1. Helper interno -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION integracao.fn_retorno_bloqueios_envio(p_tenant_id uuid, p_chave text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'integracao'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'status', e.status,
           'modo', e.modo,
           'fluxo_versao', e.fluxo_versao,
           'erro', e.erro,
           'erro_http_status', e.erro_http_status,
           'created_at', e.created_at,
           'pode_descartar', e.status <> 'executando'
         ) ORDER BY e.created_at), '[]'::jsonb)
  FROM integracao.retorno_execucao e
  WHERE e.tenant_id = p_tenant_id
    AND e.chave_ordenacao = p_chave
    AND e.status IN ('pendente', 'executando', 'aguardando_retry', 'erro')
    AND e.modo NOT IN ('teste', 'simulacao');
$function$;

REVOKE ALL ON FUNCTION integracao.fn_retorno_bloqueios_envio(uuid, text) FROM PUBLIC, anon, authenticated;

-- 2. Pré-checagem para o frontend ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.integracao_retorno_verificar_envio(p_fluxo_id uuid, p_documento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  f          integracao.retorno_fluxo;
  v_val      jsonb;
  v_evento   text;
  v_entidade text;
  v_ctx      jsonb;
  v_bloq     jsonb;
BEGIN
  f := integracao.fn_retorno_fluxo_autorizado(p_fluxo_id, 'READ');
  PERFORM integracao.fn_retorno_autorizar(f.tenant_id, f.empresa_id, 'READ');

  IF f.definicao_publicada IS NULL THEN
    RAISE EXCEPTION 'RETORNO_FLUXO_NAO_PUBLICADO' USING ERRCODE = '22023';
  END IF;
  v_val      := integracao.fn_retorno_validar_definicao(f.definicao_publicada, f.tenant_id, f.empresa_id);
  v_evento   := v_val #>> '{gatilho,evento}';
  v_entidade := v_val #>> '{gatilho,entidade}';

  IF (v_entidade = 'documento_saida' AND NOT EXISTS (SELECT 1 FROM documento_saida WHERE id = p_documento_id AND tenant_id = f.tenant_id AND empresa_id = f.empresa_id))
     OR (v_entidade = 'documento_entrada' AND NOT EXISTS (SELECT 1 FROM documento_entrada WHERE id = p_documento_id AND tenant_id = f.tenant_id AND empresa_id = f.empresa_id)) THEN
    RAISE EXCEPTION 'RETORNO_DOCUMENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  v_ctx  := integracao.fn_retorno_contexto(v_entidade, p_documento_id, v_evento, NULL);
  v_bloq := integracao.fn_retorno_bloqueios_envio(f.tenant_id, f.id || ':' || v_entidade || ':' || p_documento_id);

  RETURN jsonb_build_object(
    'fluxo_id', f.id,
    'fluxo_versao', f.versao_publicada,
    'evento', v_evento,
    'entidade', v_entidade,
    'movimento_status', v_ctx #>> '{movimento,status}',
    'documento_status_wms', v_ctx #>> '{documento,status_wms}',
    'bloqueios', v_bloq,
    'em_andamento', EXISTS (SELECT 1 FROM jsonb_array_elements(v_bloq) b WHERE b->>'status' = 'executando')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.integracao_retorno_verificar_envio(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_verificar_envio(uuid, uuid) TO authenticated, service_role;

-- 3. Execução com descarte opcional de bloqueios ------------------------------------
DROP FUNCTION IF EXISTS public.integracao_retorno_executar(uuid, uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.integracao_retorno_executar(
  p_fluxo_id uuid,
  p_documento_id uuid,
  p_modo text DEFAULT 'manual'::text,
  p_usar_rascunho boolean DEFAULT false,
  p_descartar_bloqueios boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  f            integracao.retorno_fluxo;
  v_usuario    uuid;
  v_def        jsonb;
  v_val        jsonb;
  v_gat        jsonb;
  v_evento     text;
  v_entidade   text;
  v_ctx        jsonb;
  v_ok         boolean;
  v_id         uuid;
  v_status     text;
  v_chave      text;
  v_bloq       jsonb;
  v_descartadas uuid[] := '{}';
BEGIN
  IF p_modo NOT IN ('manual', 'teste', 'simulacao') THEN
    RAISE EXCEPTION 'RETORNO_MODO_INVALIDO' USING ERRCODE = '22023';
  END IF;
  f := integracao.fn_retorno_fluxo_autorizado(p_fluxo_id, CASE WHEN p_modo = 'simulacao' THEN 'READ' ELSE 'UPDATE' END);
  v_usuario := integracao.fn_retorno_autorizar(f.tenant_id, f.empresa_id, CASE WHEN p_modo = 'simulacao' THEN 'READ' ELSE 'UPDATE' END);

  IF p_modo = 'manual' AND p_usar_rascunho THEN
    RAISE EXCEPTION 'RETORNO_MANUAL_RASCUNHO: execução manual usa a versão publicada; use teste ou simulação para o rascunho' USING ERRCODE = '22023';
  END IF;
  v_def := CASE WHEN p_usar_rascunho THEN f.definicao_rascunho ELSE f.definicao_publicada END;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'RETORNO_FLUXO_NAO_PUBLICADO' USING ERRCODE = '22023';
  END IF;
  v_val := integracao.fn_retorno_validar_definicao(v_def, f.tenant_id, f.empresa_id);
  IF NOT (v_val->>'valido')::boolean THEN
    RAISE EXCEPTION 'RETORNO_FLUXO_INVALIDO: %', v_val->'erros' USING ERRCODE = '22023', DETAIL = v_val::text;
  END IF;
  v_evento   := v_val #>> '{gatilho,evento}';
  v_entidade := v_val #>> '{gatilho,entidade}';
  v_gat      := integracao.fn_retorno_no_gatilho(v_def);

  IF (v_entidade = 'documento_saida' AND NOT EXISTS (SELECT 1 FROM documento_saida WHERE id = p_documento_id AND tenant_id = f.tenant_id AND empresa_id = f.empresa_id))
     OR (v_entidade = 'documento_entrada' AND NOT EXISTS (SELECT 1 FROM documento_entrada WHERE id = p_documento_id AND tenant_id = f.tenant_id AND empresa_id = f.empresa_id)) THEN
    RAISE EXCEPTION 'RETORNO_DOCUMENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  v_ctx := integracao.fn_retorno_contexto(v_entidade, p_documento_id, v_evento, NULL);
  v_ok  := integracao.fn_retorno_avaliar_filtros(v_ctx, v_gat #> '{config,filtros}', v_gat #>> '{config,combinador}');
  v_status := CASE WHEN v_ok THEN 'pendente' ELSE 'filtrado' END;

  -- Fila por documento (só modo manual compartilha a chave com o automático).
  -- Documento barrado pelos filtros não entra na fila: não exige nem descarta bloqueios.
  IF p_modo = 'manual' THEN
    v_chave := f.id || ':' || v_entidade || ':' || p_documento_id;
  END IF;
  IF p_modo = 'manual' AND v_ok THEN

    -- trava as linhas bloqueadoras para evitar corrida com o agendador
    PERFORM 1 FROM integracao.retorno_execucao e
     WHERE e.tenant_id = f.tenant_id AND e.chave_ordenacao = v_chave
       AND e.status IN ('pendente', 'executando', 'aguardando_retry', 'erro')
       AND e.modo NOT IN ('teste', 'simulacao')
     FOR UPDATE;

    v_bloq := integracao.fn_retorno_bloqueios_envio(f.tenant_id, v_chave);

    IF jsonb_array_length(v_bloq) > 0 THEN
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_bloq) b WHERE b->>'status' = 'executando') THEN
        RAISE EXCEPTION 'RETORNO_ENVIO_EM_ANDAMENTO: há um retorno deste documento sendo enviado agora'
          USING ERRCODE = '55P03', DETAIL = v_bloq::text;
      END IF;
      IF NOT coalesce(p_descartar_bloqueios, false) THEN
        RAISE EXCEPTION 'RETORNO_DOCUMENTO_BLOQUEADO: existe retorno anterior pendente ou com erro para este documento'
          USING ERRCODE = '22023', DETAIL = v_bloq::text;
      END IF;

      WITH d AS (
        UPDATE integracao.retorno_execucao x SET
          status = 'descartado',
          finalizado_em = now(),
          reservado_ate = NULL,
          erro = 'Substituído por envio manual (v' || coalesce(f.versao_publicada::text, '?') || ')'
                 || CASE WHEN x.erro IS NOT NULL THEN '. Erro original: ' || x.erro ELSE '' END,
          disparado_por = 'user:' || coalesce(v_usuario::text, 'suporte')
        WHERE x.tenant_id = f.tenant_id AND x.chave_ordenacao = v_chave
          AND x.status IN ('pendente', 'aguardando_retry', 'erro')
          AND x.modo NOT IN ('teste', 'simulacao')
        RETURNING x.id
      )
      SELECT coalesce(array_agg(id), '{}') INTO v_descartadas FROM d;
    END IF;
  END IF;

  INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, fluxo_versao, definicao_teste, evento, entidade,
    documento_id, documento_numero, chave_ordenacao, contexto, modo, status, proximo_no, finalizado_em, erro, disparado_por)
  VALUES (f.tenant_id, f.empresa_id, f.id, CASE WHEN p_usar_rascunho THEN NULL ELSE f.versao_publicada END,
    CASE WHEN p_usar_rascunho THEN v_def END, v_evento, v_entidade, p_documento_id, v_ctx #>> '{documento,numero}',
    CASE WHEN p_modo = 'manual' THEN v_chave ELSE p_modo || ':' || gen_random_uuid() END,
    v_ctx, p_modo, v_status, v_gat->>'id',
    CASE WHEN NOT v_ok THEN now() END, CASE WHEN NOT v_ok THEN 'Barrado pelos filtros do gatilho' END,
    'user:' || coalesce(v_usuario::text, 'suporte'))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('execucao_id', v_id, 'status', v_status, 'modo', p_modo, 'evento', v_evento,
                            'descartadas', to_jsonb(v_descartadas));
END;
$function$;

REVOKE ALL ON FUNCTION public.integracao_retorno_executar(uuid, uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_executar(uuid, uuid, text, boolean, boolean) TO authenticated, service_role;

COMMIT;
