-- =====================================================================
-- REVERTER · 2026-11-26 · Retorno ao ERP · novos eventos (migrations 20261126190000..190300)
--
-- Reversão FUNCIONAL: desliga a detecção de movimentação interna e o botão
-- configurável, e devolve as funções do motor à versão anterior. Mantém as
-- tabelas novas (movimentacao_interna, retorno_importacao...) e os CHECKs
-- ampliados, que não afetam nada sem os gatilhos; o bloco 5 (comentado) apaga
-- tudo se for mesmo necessário.
-- O front volta a usar só o sync-entidade (integracao_retorno_importacao_disponivel
-- deixa de existir: o hook trata erro como "sem fluxo").
-- =====================================================================

-- ---------- 1. para de gerar eventos ----------
DROP TRIGGER IF EXISTS trg_zz_movimentacao_interna ON public.estoque_movimento;
DROP TRIGGER IF EXISTS trg_zz_retorno_movimentacao_interna ON public.movimentacao_interna;
DROP TRIGGER IF EXISTS trg_zz_retorno_execucao_movimentacao ON integracao.retorno_execucao;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'retorno-interativo-expirar';
  END IF;
END $$;

-- ---------- 2. catálogo: esconde eventos e nós novos; pausa fluxos que os usam ----------
UPDATE integracao.retorno_evento_catalogo SET ativo = false
 WHERE codigo = 'estoque.estrutura_alterada' OR codigo LIKE 'importar.%';
UPDATE integracao.retorno_no_catalogo SET disponivel = false
 WHERE tipo IN ('acao.gravar_logitrack', 'logica.confirmar_usuario');
UPDATE integracao.retorno_fluxo SET ativo = false
 WHERE evento = 'estoque.estrutura_alterada' OR evento LIKE 'importar.%';
UPDATE integracao.retorno_execucao SET status = 'descartado', finalizado_em = now(), reservado_ate = NULL,
       erro = 'Descartado na reversão da release de novos eventos'
 WHERE entidade IN ('movimentacao_interna', 'cadastro_importacao')
   AND status IN ('pendente', 'executando', 'aguardando_retry', 'aguardando_confirmacao', 'agrupando');

-- ---------- 3. RPCs novas ----------
DROP FUNCTION IF EXISTS public.integracao_retorno_importacao_disponivel(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.integracao_retorno_importacao_iniciar(uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.integracao_retorno_importacao_obter(uuid);
DROP FUNCTION IF EXISTS public.integracao_retorno_importacao_confirmar(uuid);
DROP FUNCTION IF EXISTS public.integracao_retorno_importacao_cancelar(uuid);
DROP FUNCTION IF EXISTS public.integracao_retorno_importacao_testar(uuid, jsonb, text, boolean);
DROP FUNCTION IF EXISTS public.integracao_retorno_svc_chave_api(uuid);
DROP FUNCTION IF EXISTS public.integracao_retorno_svc_importacao_registrar(uuid, jsonb);

-- ---------- 4. funções do motor na versão anterior ----------
-- validar_referencias: tira só o nó novo da lista (a versão de produção é mais nova que a do QA)
DO $patch$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('integracao.fn_retorno_validar_referencias(jsonb)'::regprocedure);
  IF position('acao.gravar_logitrack' IN v_def) = 0 THEN RETURN; END IF;
  v_def := replace(v_def, $a$'acao.provedor', 'acao.gravar_logitrack'];$a$, $a$'acao.provedor'];$a$);
  v_def := replace(v_def, 'Webhook, Ação do ERP e Gravar no LogiTrack geram.', 'Webhook e Ação do ERP geram.');
  EXECUTE v_def;
END
$patch$;

CREATE OR REPLACE FUNCTION integracao.fn_retorno_validar_definicao(p_def jsonb, p_tenant_id uuid, p_empresa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v   jsonb;
  ref jsonb;
BEGIN
  v := integracao.fn_retorno_validar_definicao_base(p_def, p_tenant_id, p_empresa_id);
  IF p_def IS NULL OR jsonb_typeof(p_def) <> 'object' THEN
    RETURN v;
  END IF;
  ref := integracao.fn_retorno_validar_referencias(p_def);
  v := jsonb_set(v, '{erros}',  coalesce(v->'erros',  '[]'::jsonb) || coalesce(ref->'erros',  '[]'::jsonb));
  v := jsonb_set(v, '{avisos}', coalesce(v->'avisos', '[]'::jsonb) || coalesce(ref->'avisos', '[]'::jsonb));
  v := jsonb_set(v, '{valido}', to_jsonb(jsonb_array_length(v->'erros') = 0));
  RETURN v;
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_svc_concluir(p_execucao_id uuid, p_resultado jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  e        integracao.retorno_execucao;
  v_status text := p_resultado->>'status';
  v_final  boolean;
BEGIN
  IF v_status NOT IN ('pendente', 'aguardando_retry', 'sucesso', 'erro', 'filtrado') THEN
    RAISE EXCEPTION 'RETORNO_STATUS_INVALIDO: %', v_status USING ERRCODE = '22023';
  END IF;
  v_final := v_status IN ('sucesso', 'erro', 'filtrado');

  UPDATE integracao.retorno_execucao SET
    status = v_status,
    proximo_no = CASE WHEN p_resultado ? 'proximo_no' THEN p_resultado->>'proximo_no' ELSE proximo_no END,
    estado = coalesce(p_resultado->'estado', estado),
    tentativas_no = coalesce((p_resultado->>'tentativas_no')::int, tentativas_no),
    processar_apos = coalesce((p_resultado->>'processar_apos')::timestamptz, now()),
    reservado_ate = NULL,
    finalizado_em = CASE WHEN v_final THEN now() END,
    erro = p_resultado->>'erro',
    erro_http_status = (p_resultado->>'erro_http_status')::int
  WHERE id = p_execucao_id AND status = 'executando'
  RETURNING * INTO e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETORNO_EXECUCAO_NAO_RESERVADA: %', p_execucao_id USING ERRCODE = '22023';
  END IF;

  INSERT INTO integracao.retorno_execucao_passo (tenant_id, execucao_id, no_id, no_tipo, tentativa, status, saida,
    entrada, resultado, request, response, http_status, duracao_ms, erro)
  SELECT e.tenant_id, e.id, x.p->>'no_id', x.p->>'no_tipo', coalesce((x.p->>'tentativa')::int, 1), x.p->>'status', x.p->>'saida',
         x.p->'entrada', x.p->'resultado', x.p->'request', x.p->'response', (x.p->>'http_status')::int, (x.p->>'duracao_ms')::int,
         left(x.p->>'erro', 4000)
  FROM jsonb_array_elements(coalesce(p_resultado->'passos', '[]'::jsonb)) WITH ORDINALITY AS x(p, ord)
  ORDER BY x.ord;

  IF v_final AND e.modo = 'lote' THEN
    UPDATE integracao.retorno_execucao
    SET status = e.status, finalizado_em = now(), erro = e.erro, erro_http_status = e.erro_http_status
    WHERE lote_execucao_id = e.id;
  END IF;

  RETURN jsonb_build_object('id', e.id, 'status', e.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_svc_reservar(p_limite integer DEFAULT 10, p_execucao_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  WITH cand AS (
    SELECT e.id
    FROM integracao.retorno_execucao e
    WHERE (
        (p_execucao_id IS NOT NULL AND e.id = p_execucao_id AND e.status IN ('pendente', 'aguardando_retry'))
        OR (p_execucao_id IS NULL AND (
              (e.status IN ('pendente', 'aguardando_retry') AND e.processar_apos <= now())
              OR (e.status = 'executando' AND e.reservado_ate < now())))
      )
      AND (e.modo IN ('teste', 'simulacao') OR NOT EXISTS (
            SELECT 1 FROM integracao.retorno_execucao p
            WHERE p.chave_ordenacao = e.chave_ordenacao AND p.id <> e.id AND p.created_at < e.created_at
              AND p.status IN ('pendente', 'executando', 'aguardando_retry', 'erro')
              AND p.modo NOT IN ('teste', 'simulacao')))
    ORDER BY e.processar_apos, e.created_at
    LIMIT least(greatest(coalesce(p_limite, 10), 1), 50)
    FOR UPDATE OF e SKIP LOCKED
  ), upd AS (
    UPDATE integracao.retorno_execucao x
    SET status = 'executando', reservado_ate = now() + interval '3 minutes', iniciado_em = coalesce(x.iniciado_em, now())
    FROM cand WHERE x.id = cand.id
    RETURNING x.id
  )
  SELECT array_agg(id) INTO v_ids FROM upd;

  RETURN (SELECT coalesce(jsonb_agg(integracao.fn_retorno_pacote_execucao(i)), '[]'::jsonb) FROM unnest(v_ids) i);
END;
$function$;

CREATE OR REPLACE FUNCTION integracao.fn_retorno_contexto(p_entidade text, p_documento_id uuid, p_evento text, p_movimento_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_base jsonb;
  v_emp  uuid;
BEGIN
  IF p_entidade = 'documento_saida' THEN
    v_base := fn_retorno_contexto_saida(p_documento_id, p_movimento_id);
    IF v_base IS NOT NULL THEN
      v_base := v_base || jsonb_build_object('carga', fn_retorno_contexto_carga(p_documento_id),
                                             'entrega', fn_retorno_contexto_entrega(p_documento_id));
    END IF;
    SELECT empresa_id INTO v_emp FROM documento_saida WHERE id = p_documento_id;
  ELSIF p_entidade = 'documento_entrada' THEN
    v_base := fn_retorno_contexto_entrada(p_documento_id, p_movimento_id);
    SELECT empresa_id INTO v_emp FROM documento_entrada WHERE id = p_documento_id;
  ELSE
    RAISE EXCEPTION 'RETORNO_ENTIDADE_INVALIDA: %', p_entidade USING ERRCODE = '22023';
  END IF;
  IF v_base IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'versao_contexto', 1,
    'evento', p_evento,
    'evento_nome', (SELECT c.nome FROM retorno_evento_catalogo c WHERE c.codigo = p_evento),
    'ocorrido_em', to_char(now() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'),
    'ocorrido_em_utc', now(),
    'empresa', (SELECT jsonb_build_object('id', e.id, 'codigo', e.codigo, 'cnpj', e.cnpj, 'razao_social', e.razaosocial)
                FROM empresa e WHERE e.id = v_emp),
    'operador', (SELECT jsonb_build_object('id', u.id, 'login', u.login, 'nome', u.nome)
                 FROM usuario u WHERE u.auth_user_id = auth.uid() LIMIT 1)
  ) || v_base;
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_svc_atualizar_documento(p_execucao_id uuid, p_status_integracao text, p_marcar_exportado boolean DEFAULT false, p_resultado text DEFAULT NULL::text, p_mensagem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  e      integracao.retorno_execucao;
  v_doc  uuid;
  v_n    int := 0;
BEGIN
  SELECT * INTO e FROM integracao.retorno_execucao WHERE id = p_execucao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETORNO_EXECUCAO_NAO_ENCONTRADA' USING ERRCODE = 'P0002'; END IF;
  IF p_resultado IS NOT NULL AND p_resultado NOT IN ('integrado', 'ignorado', 'erro', 'nao_alterar') THEN
    RAISE EXCEPTION 'RETORNO_RESULTADO_INVALIDO: %', p_resultado USING ERRCODE = '22023';
  END IF;
  IF e.modo IN ('simulacao', 'teste') THEN RETURN jsonb_build_object('documentos', 0, 'simulado', true); END IF;

  -- Resultado e "marcar exportado" ficam na execução; o status do documento e do movimento
  -- é recalculado quando a execução termina (gatilho trg_zz_retorno_execucao_integracao_upd).
  UPDATE integracao.retorno_execucao SET
    integracao_resultado = coalesce(p_resultado, integracao_resultado),
    integracao_mensagem  = CASE WHEN p_resultado IS NOT NULL THEN nullif(btrim(p_mensagem), '') ELSE integracao_mensagem END,
    marcar_exportado     = marcar_exportado OR coalesce(p_marcar_exportado, false)
  WHERE id = e.id;

  FOR v_doc IN
    SELECT e.documento_id WHERE e.documento_id IS NOT NULL
    UNION SELECT m.documento_id FROM integracao.retorno_execucao m WHERE m.lote_execucao_id = e.id AND m.documento_id IS NOT NULL
  LOOP
    IF e.entidade = 'documento_saida' THEN
      UPDATE documento_saida SET status_integracao = coalesce(nullif(p_status_integracao, ''), status_integracao), sincronizado_em = now()
      WHERE id = v_doc AND tenant_id = e.tenant_id AND empresa_id = e.empresa_id;
    ELSE
      UPDATE documento_entrada SET status_integracao = coalesce(nullif(p_status_integracao, ''), status_integracao), sincronizado_em = now()
      WHERE id = v_doc AND tenant_id = e.tenant_id AND empresa_id = e.empresa_id;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('documentos', v_n, 'resultado', p_resultado,
                            'marcar_exportado', coalesce(p_marcar_exportado, false));
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_contexto_documento(p_tenant_id uuid, p_empresa_id uuid, p_entidade text, p_documento_id uuid, p_evento text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
BEGIN
  PERFORM integracao.fn_retorno_autorizar(p_tenant_id, p_empresa_id, 'READ');
  IF (p_entidade = 'documento_saida' AND NOT EXISTS (SELECT 1 FROM documento_saida WHERE id = p_documento_id AND tenant_id = p_tenant_id AND empresa_id = p_empresa_id))
     OR (p_entidade = 'documento_entrada' AND NOT EXISTS (SELECT 1 FROM documento_entrada WHERE id = p_documento_id AND tenant_id = p_tenant_id AND empresa_id = p_empresa_id))
     OR p_entidade NOT IN ('documento_saida', 'documento_entrada') THEN
    RAISE EXCEPTION 'RETORNO_DOCUMENTO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;
  RETURN integracao.fn_retorno_contexto(p_entidade, p_documento_id, coalesce(p_evento, 'manual.' || p_entidade), NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_executar(p_fluxo_id uuid, p_documento_id uuid, p_modo text DEFAULT 'manual'::text, p_usar_rascunho boolean DEFAULT false, p_descartar_bloqueios boolean DEFAULT false)
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

  IF p_modo = 'manual' THEN
    v_chave := f.id || ':' || v_entidade || ':' || p_documento_id;
  END IF;
  IF p_modo = 'manual' AND v_ok THEN
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

CREATE OR REPLACE FUNCTION public.integracao_retorno_documentos_recentes(p_tenant_id uuid, p_empresa_id uuid, p_evento text, p_filtros jsonb DEFAULT NULL::jsonb, p_combinador text DEFAULT 'e'::text, p_limite integer DEFAULT 10, p_busca text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  c        integracao.retorno_evento_catalogo;
  v_lim    int := least(greatest(coalesce(p_limite, 10), 1), 50);
  v_docs   jsonb := '[]'::jsonb;
  r        record;
  v_ctx    jsonb;
  v_regra  jsonb;
  v_motivo text;
BEGIN
  PERFORM integracao.fn_retorno_autorizar(p_tenant_id, p_empresa_id, 'READ');
  SELECT * INTO c FROM integracao.retorno_evento_catalogo WHERE codigo = p_evento;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETORNO_EVENTO_INVALIDO' USING ERRCODE = '22023'; END IF;

  FOR r IN
    SELECT * FROM (
      SELECT ds.id, ms.id AS mov_id, coalesce(ms.finalizado_em, ds.data_emissao) AS quando
      FROM movimento_saida ms
      JOIN movimento_saida_documento msd ON msd.movimento_saida_id = ms.id
      JOIN documento_saida ds ON ds.id = msd.documento_saida_id
      WHERE c.origem_tabela = 'movimento_saida' AND ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id
        AND ms.status::text = c.status_origem
        AND (p_busca IS NULL OR ds.numero_pedido::text = p_busca OR ds.codigo_erp = p_busca)
      UNION ALL
      SELECT de.id, me.id, coalesce(me.finalizado_em, me.created_at)
      FROM movimento_entrada me
      JOIN movimento_entrada_documento med ON med.movimento_entrada_id = me.id
      JOIN documento_entrada de ON de.id = med.documento_entrada_id
      WHERE c.origem_tabela = 'movimento_entrada' AND me.tenant_id = p_tenant_id AND me.empresa_id = p_empresa_id
        AND me.status::text = c.status_origem
        AND (p_busca IS NULL OR de.numero_nota = p_busca OR de.codigo_erp = p_busca)
      UNION ALL
      SELECT ds.id, NULL, coalesce(ds.cancelamento_solicitado_em, ds.data_emissao)
      FROM documento_saida ds
      WHERE ((c.origem_tabela = 'documento_saida' AND ds.status::text = c.status_origem) OR c.codigo = 'manual.documento_saida')
        AND ds.tenant_id = p_tenant_id AND ds.empresa_id = p_empresa_id AND ds.status <> 99
        AND (p_busca IS NULL OR ds.numero_pedido::text = p_busca OR ds.codigo_erp = p_busca)
      UNION ALL
      SELECT de.id, NULL, coalesce(de.cancelamento_solicitado_em, de.data_entrada, de.created_at)
      FROM documento_entrada de
      WHERE ((c.origem_tabela = 'documento_entrada' AND de.status::text = c.status_origem) OR c.codigo = 'manual.documento_entrada')
        AND de.tenant_id = p_tenant_id AND de.empresa_id = p_empresa_id AND de.status <> 99
        AND (p_busca IS NULL OR de.numero_nota = p_busca OR de.codigo_erp = p_busca)
    ) x
    ORDER BY quando DESC NULLS LAST
    LIMIT v_lim
  LOOP
    v_ctx := integracao.fn_retorno_contexto(c.entidade, r.id, p_evento, r.mov_id);
    v_motivo := NULL;
    IF p_filtros IS NOT NULL AND jsonb_typeof(p_filtros) = 'array' THEN
      SELECT x INTO v_regra FROM jsonb_array_elements(p_filtros) x
      WHERE NOT integracao.fn_retorno_avaliar_regra(v_ctx, x) LIMIT 1;
      v_motivo := v_regra->>'campo';
    END IF;
    v_docs := v_docs || jsonb_build_object(
      'documento_id', r.id, 'movimento_id', r.mov_id, 'entidade', c.entidade, 'quando', r.quando,
      'numero', v_ctx #>> '{documento,numero}', 'codigo_erp', v_ctx #>> '{documento,codigo_erp}',
      'tipo', v_ctx #>> '{documento,tipo,descricao}', 'sistema_origem', v_ctx #>> '{documento,sistema_origem}',
      'passa_filtro', CASE WHEN p_filtros IS NULL THEN NULL
                           ELSE integracao.fn_retorno_avaliar_filtros(v_ctx, p_filtros, p_combinador) END,
      'barrado_por', v_motivo,
      'contexto', v_ctx);
  END LOOP;
  RETURN v_docs;
END;
$function$;

CREATE OR REPLACE FUNCTION public.integracao_retorno_reprocessar(p_execucao_id uuid, p_a_partir_no text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE e integracao.retorno_execucao; v_usuario uuid; v_def jsonb; v_no text;
BEGIN
  SELECT * INTO e FROM integracao.retorno_execucao WHERE id = p_execucao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETORNO_EXECUCAO_NAO_ENCONTRADA' USING ERRCODE = 'P0002'; END IF;
  v_usuario := integracao.fn_retorno_autorizar(e.tenant_id, e.empresa_id, 'UPDATE');
  IF e.status IN ('pendente', 'executando', 'agrupando', 'agrupado') THEN
    RAISE EXCEPTION 'RETORNO_EXECUCAO_EM_ANDAMENTO' USING ERRCODE = '22023';
  END IF;
  IF e.status IN ('sucesso', 'filtrado') AND p_a_partir_no IS NULL THEN
    RAISE EXCEPTION 'RETORNO_REPROCESSAR_NO: informe o nó de onde recomeçar' USING ERRCODE = '22023';
  END IF;
  v_def := coalesce(e.definicao_teste,
                    (SELECT definicao FROM integracao.retorno_fluxo_versao WHERE fluxo_id = e.fluxo_id AND versao = e.fluxo_versao));
  v_no := coalesce(p_a_partir_no, e.estado #>> '{erro,no_id}', e.proximo_no, integracao.fn_retorno_no_gatilho(v_def)->>'id');
  IF v_no IS NULL OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_def->'nos') n WHERE n->>'id' = v_no) THEN
    RAISE EXCEPTION 'RETORNO_NO_INEXISTENTE' USING ERRCODE = '22023';
  END IF;
  UPDATE integracao.retorno_execucao SET
    status = 'pendente',
    proximo_no = v_no,
    estado = coalesce(estado, '{}'::jsonb) - 'erro' - 'houve_erro',
    tentativas_no = 0,
    processar_apos = now(),
    reservado_ate = NULL,
    finalizado_em = NULL,
    erro = NULL,
    erro_http_status = NULL,
    disparado_por = 'user:' || coalesce(v_usuario::text, 'suporte')
  WHERE id = e.id RETURNING * INTO e;
  RETURN integracao.fn_retorno_execucao_json(e, false);
END;
$function$;

DROP FUNCTION IF EXISTS integracao.fn_retorno_validar_extensoes(jsonb);
DROP FUNCTION IF EXISTS integracao.fn_retorno_interativo_expirar();
DROP FUNCTION IF EXISTS integracao.trg_movimentacao_interna_registrar();
DROP FUNCTION IF EXISTS integracao.trg_retorno_movimentacao_interna();
DROP FUNCTION IF EXISTS integracao.trg_retorno_execucao_movimentacao();
DROP FUNCTION IF EXISTS integracao.fn_retorno_movimentacao_emitir(uuid, text);

-- ---------- 5. (opcional) apagar tudo ----------
-- Só depois de conferir que ninguém precisa do histórico. Ordem importa por causa das FKs.
-- DELETE FROM integracao.retorno_execucao_passo p USING integracao.retorno_execucao e
--  WHERE p.execucao_id = e.id AND e.entidade IN ('movimentacao_interna', 'cadastro_importacao');
-- UPDATE integracao.retorno_importacao SET execucao_id = NULL;
-- DELETE FROM integracao.retorno_execucao WHERE entidade IN ('movimentacao_interna', 'cadastro_importacao');
-- DELETE FROM integracao.retorno_evento WHERE entidade IN ('movimentacao_interna', 'cadastro_importacao');
-- DROP TABLE IF EXISTS integracao.retorno_importacao;
-- DROP TABLE IF EXISTS integracao.retorno_importacao_recurso CASCADE;
-- DROP TABLE IF EXISTS public.movimentacao_interna_item;
-- DROP TABLE IF EXISTS public.movimentacao_interna;
-- DROP FUNCTION IF EXISTS integracao.fn_retorno_contexto_movimentacao(uuid);
-- DROP FUNCTION IF EXISTS integracao.fn_retorno_lado_estrutura(uuid, uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS integracao._fn_movimentacao_integracao_recalcular(uuid);
-- DROP FUNCTION IF EXISTS integracao.fn_retorno_contexto_importacao(uuid);
-- DROP FUNCTION IF EXISTS integracao.fn_retorno_importacao_autorizar(uuid, uuid, text, text);
-- DROP FUNCTION IF EXISTS integracao.fn_retorno_importacao_execucao(uuid, boolean);
-- DROP FUNCTION IF EXISTS integracao.fn_retorno_importacao_json(integracao.retorno_execucao);
-- DELETE FROM integracao.retorno_no_catalogo WHERE tipo IN ('acao.gravar_logitrack', 'logica.confirmar_usuario');
-- (catálogo de eventos: só depois de apagar fluxos/eventos que apontam para eles)
-- ALTER TABLE public.setor DROP COLUMN IF EXISTS codigo_erp;
