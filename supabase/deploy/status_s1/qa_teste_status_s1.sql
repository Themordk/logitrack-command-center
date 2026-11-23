-- Bateria do S1 (status de integração) — SÓ QA. Cria tudo dentro de uma subtransação e desfaz no fim.
-- Simula o retorno-dispatcher chamando as mesmas RPCs de serviço (svc_atualizar_documento, svc_concluir).
-- Os gatilhos do S1 são "no fim da transação": a bateria força a execução com SET CONSTRAINTS ALL IMMEDIATE
-- logo depois de cada passo (como aconteceria no commit de cada chamada do dispatcher). Como tudo roda numa
-- transação só (now() igual), a hora de término da última execução é afastada com clock_timestamp().
-- Uso: SELECT qa.fn_teste_status_s1();

CREATE SCHEMA IF NOT EXISTS qa;

CREATE OR REPLACE FUNCTION qa.fn_teste_status_s1()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_res     jsonb := '[]'::jsonb;
  v_ok      int := 0;
  v_falhas  int := 0;
  t uuid; emp uuid;
  onda uuid; doc_a uuid; doc_b uuid; doc_c uuid; doc_d uuid;
  f1 uuid; f2 uuid; f3 uuid;
  x uuid; lote uuid;
  me uuid; de uuid;
  v_txt text; v_n int;
  r record;

BEGIN
  BEGIN
    SET CONSTRAINTS ALL DEFERRED;

    -- Massa: onda CONCLUIDA com o pedido A + pedido B ligado só neste teste ---------------------
    SELECT ms.id, ms.tenant_id, ms.empresa_id, msd.documento_saida_id
      INTO onda, t, emp, doc_a
      FROM movimento_saida ms
      JOIN movimento_saida_documento msd ON msd.movimento_saida_id = ms.id
      JOIN documento_saida ds ON ds.id = msd.documento_saida_id AND ds.status NOT IN (9, 99)
     WHERE ms.status = 'CONCLUIDA'
     ORDER BY ms.created_at DESC LIMIT 1;
    IF onda IS NULL THEN RAISE EXCEPTION 'QA: sem onda CONCLUIDA'; END IF;

    SELECT ds.id INTO doc_b FROM documento_saida ds
     WHERE ds.tenant_id = t AND ds.empresa_id = emp AND ds.status NOT IN (9, 99) AND ds.id <> doc_a
       AND NOT EXISTS (SELECT 1 FROM movimento_saida_documento m WHERE m.documento_saida_id = ds.id)
     LIMIT 1;
    SELECT ds.id INTO doc_c FROM documento_saida ds
     WHERE ds.tenant_id = t AND ds.empresa_id = emp AND ds.status NOT IN (9, 99) AND ds.id NOT IN (doc_a, doc_b) LIMIT 1;
    SELECT ds.id INTO doc_d FROM documento_saida ds
     WHERE ds.tenant_id = t AND ds.empresa_id = emp AND ds.status NOT IN (9, 99) AND ds.id NOT IN (doc_a, doc_b, doc_c) LIMIT 1;
    INSERT INTO movimento_saida_documento (tenant_id, movimento_saida_id, documento_saida_id, ordem)
    VALUES (t, onda, doc_b, 99);

    -- Limpa execuções antigas dos documentos da massa (só nesta subtransação)
    DELETE FROM integracao.retorno_execucao WHERE documento_id IN (doc_a, doc_b, doc_c, doc_d);
    UPDATE documento_saida SET integracao_estado = 'nao_integra', integracao_evento = NULL, integracao_em = NULL,
           integracao_erro = NULL, integracao_execucao_id = NULL, integracao_erros_outros = 0
     WHERE id IN (doc_a, doc_b, doc_c, doc_d);
    UPDATE movimento_saida SET integracao_resumo = 'nao_integra' WHERE id = onda;

    INSERT INTO integracao.retorno_fluxo (tenant_id, empresa_id, nome, evento, ativo)
    VALUES (t, emp, 'QA S1 expedição', 'saida.expedido', false) RETURNING id INTO f1;
    INSERT INTO integracao.retorno_fluxo (tenant_id, empresa_id, nome, evento, ativo)
    VALUES (t, emp, 'QA S1 separação', 'saida.separacao_finalizada', false) RETURNING id INTO f2;
    INSERT INTO integracao.retorno_fluxo (tenant_id, empresa_id, nome, evento, ativo)
    VALUES (t, emp, 'QA S1 lote', 'saida.expedido', false) RETURNING id INTO f3;

    -- 1) Execução pendente → pedido Aguardando; onda Aguardando ----------------------------------
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f1, 'saida.expedido', 'documento_saida', doc_a, 'automatico', 'pendente') RETURNING id INTO x;
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f1, 'saida.expedido', 'documento_saida', doc_b, 'automatico', 'pendente');
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado INTO v_txt FROM documento_saida WHERE id = doc_a;
    v_res := v_res || jsonb_build_object('caso', '01 pendente → Aguardando', 'ok', v_txt = 'pendente', 'obtido', v_txt);
    SELECT integracao_resumo INTO v_txt FROM movimento_saida WHERE id = onda;
    v_res := v_res || jsonb_build_object('caso', '02 onda com pendente → Aguardando', 'ok', v_txt = 'pendente', 'obtido', v_txt);

    -- 2) A conclui com envio OK e "marcar exportado"; B ainda pendente → onda não exporta --------
    UPDATE integracao.retorno_execucao SET status = 'executando' WHERE id = x;
    PERFORM integracao_retorno_svc_atualizar_documento(x, 'retornado', true);
    PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'sucesso', 'passos', jsonb_build_array(
      jsonb_build_object('no_id', 'h1', 'no_tipo', 'acao.http', 'status', 'sucesso'),
      jsonb_build_object('no_id', 'a1', 'no_tipo', 'acao.atualizar_documento', 'status', 'sucesso'))));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado || '|' || integracao_evento INTO v_txt FROM documento_saida WHERE id = doc_a;
    v_res := v_res || jsonb_build_object('caso', '03 sucesso com envio → Integrado · Expedição', 'ok', v_txt = 'integrado|saida.expedido', 'obtido', v_txt);
    SELECT status::text || '|' || integracao_resumo INTO v_txt FROM movimento_saida WHERE id = onda;
    v_res := v_res || jsonb_build_object('caso', '04 outro pedido pendente → onda NÃO exporta', 'ok', v_txt = 'CONCLUIDA|pendente', 'obtido', v_txt);

    -- 3) B termina com erro → B Erro com a mensagem; onda Erro ------------------------------------
    SELECT id INTO x FROM integracao.retorno_execucao WHERE documento_id = doc_b AND fluxo_id = f1;
    UPDATE integracao.retorno_execucao SET status = 'executando' WHERE id = x;
    PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'erro', 'erro', 'HTTP 500: Omie indisponível',
      'passos', jsonb_build_array(jsonb_build_object('no_id', 'h1', 'no_tipo', 'acao.http', 'status', 'erro'))));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado || '|' || coalesce(integracao_erro, '') INTO v_txt FROM documento_saida WHERE id = doc_b;
    v_res := v_res || jsonb_build_object('caso', '05 execução com erro → Erro com mensagem', 'ok', v_txt = 'erro|HTTP 500: Omie indisponível', 'obtido', v_txt);
    SELECT status::text || '|' || integracao_resumo INTO v_txt FROM movimento_saida WHERE id = onda;
    v_res := v_res || jsonb_build_object('caso', '06 onda com pedido em erro → resumo Erro, não exporta', 'ok', v_txt = 'CONCLUIDA|erro', 'obtido', v_txt);

    -- 4) Reenvio manual de B: nó declara Integrado + marcar exportado → B Integrado; onda exporta --
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f1, 'saida.expedido', 'documento_saida', doc_b, 'manual', 'pendente') RETURNING id INTO x;
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado INTO v_txt FROM documento_saida WHERE id = doc_b;
    v_res := v_res || jsonb_build_object('caso', '07 reenvio na fila → Aguardando', 'ok', v_txt = 'pendente', 'obtido', v_txt);
    UPDATE integracao.retorno_execucao SET status = 'executando' WHERE id = x;
    PERFORM integracao_retorno_svc_atualizar_documento(x, 'retornado', true, 'integrado', NULL);
    PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'sucesso', 'passos', '[]'::jsonb));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado INTO v_txt FROM documento_saida WHERE id = doc_b;
    v_res := v_res || jsonb_build_object('caso', '08 nó declara Integrado → Integrado', 'ok', v_txt = 'integrado', 'obtido', v_txt);
    SELECT status::text || '|' || integracao_resumo INTO v_txt FROM movimento_saida WHERE id = onda;
    v_res := v_res || jsonb_build_object('caso', '09 todos integrados + marcar exportado → EXPORTADA_ERP', 'ok', v_txt = 'EXPORTADA_ERP|integrado', 'obtido', v_txt);

    -- 5) Outra regra (separação) passa pelo caminho "bloqueado": nó declara Ignorado → A continua Integrado (Expedição)
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f2, 'saida.separacao_finalizada', 'documento_saida', doc_a, 'automatico', 'executando') RETURNING id INTO x;
    PERFORM integracao_retorno_svc_atualizar_documento(x, 'retornado', false, 'ignorado', NULL);
    PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'sucesso', 'passos', '[]'::jsonb));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado || '|' || integracao_evento INTO v_txt FROM documento_saida WHERE id = doc_a;
    v_res := v_res || jsonb_build_object('caso', '10 caminho "não precisou enviar" não apaga o Integrado', 'ok', v_txt = 'integrado|saida.expedido', 'obtido', v_txt);

    -- 6) Erro de negócio declarado pelo nó (execução termina com sucesso) → Erro com a mensagem do nó
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f2, 'saida.separacao_finalizada', 'documento_saida', doc_a, 'automatico', 'executando') RETURNING id INTO x;
    PERFORM integracao_retorno_svc_atualizar_documento(x, 'retornado', false, 'erro', '  Pedido bloqueado no ERP  ');
    PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'sucesso', 'passos', '[]'::jsonb));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado || '|' || integracao_evento || '|' || coalesce(integracao_erro, '') INTO v_txt FROM documento_saida WHERE id = doc_a;
    v_res := v_res || jsonb_build_object('caso', '11 erro de negócio do nó → Erro (mensagem do nó)', 'ok', v_txt = 'erro|saida.separacao_finalizada|Pedido bloqueado no ERP', 'obtido', v_txt);
    SELECT integracao_resumo INTO v_txt FROM movimento_saida WHERE id = onda;
    v_res := v_res || jsonb_build_object('caso', '12 resumo da onda acompanha → Erro', 'ok', v_txt = 'erro', 'obtido', v_txt);

    -- 7) A regra de separação roda de novo e envia → A Integrado (Separação), sem aviso de erro anterior
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f2, 'saida.separacao_finalizada', 'documento_saida', doc_a, 'manual', 'executando') RETURNING id INTO x;
    PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'sucesso', 'passos', jsonb_build_array(
      jsonb_build_object('no_id', 'p1', 'no_tipo', 'acao.provedor', 'status', 'sucesso'))));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado || '|' || integracao_evento || '|' || integracao_erros_outros INTO v_txt FROM documento_saida WHERE id = doc_a;
    v_res := v_res || jsonb_build_object('caso', '13 reenvio corrige → Integrado, 0 erros anteriores', 'ok', v_txt = 'integrado|saida.separacao_finalizada|0', 'obtido', v_txt);

    -- 8) Regra de expedição falha depois de a separação ter dado certo → vale o mais recente (Erro);
    --    e quando a separação dá certo depois, fica Integrado com aviso de 1 regra em erro
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f1, 'saida.expedido', 'documento_saida', doc_a, 'manual', 'executando') RETURNING id INTO x;
    PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'erro', 'erro', 'Timeout', 'passos', '[]'::jsonb));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado || '|' || integracao_evento INTO v_txt FROM documento_saida WHERE id = doc_a;
    v_res := v_res || jsonb_build_object('caso', '14 o mais recente vence (Erro · Expedição)', 'ok', v_txt = 'erro|saida.expedido', 'obtido', v_txt);
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f2, 'saida.separacao_finalizada', 'documento_saida', doc_a, 'manual', 'executando') RETURNING id INTO x;
    PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'sucesso', 'passos', jsonb_build_array(
      jsonb_build_object('no_id', 'p1', 'no_tipo', 'acao.provedor', 'status', 'sucesso'))));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado || '|' || integracao_erros_outros INTO v_txt FROM documento_saida WHERE id = doc_a;
    v_res := v_res || jsonb_build_object('caso', '15 Integrado com aviso de 1 retorno com erro', 'ok', v_txt = 'integrado|1', 'obtido', v_txt);

    -- 9) Sucesso sem envio e sem declaração → Ignorado; só filtrado → Ignorado ------------------
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status, finalizado_em)
    VALUES (t, emp, f1, 'saida.expedido', 'documento_saida', doc_c, 'automatico', 'filtrado', now());
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado INTO v_txt FROM documento_saida WHERE id = doc_c;
    v_res := v_res || jsonb_build_object('caso', '16 só filtrado → Ignorado', 'ok', v_txt = 'ignorado', 'obtido', v_txt);
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f2, 'saida.separacao_finalizada', 'documento_saida', doc_c, 'automatico', 'executando') RETURNING id INTO x;
    PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'sucesso', 'passos', jsonb_build_array(
      jsonb_build_object('no_id', 'c1', 'no_tipo', 'logica.condicao', 'status', 'sucesso'))));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado INTO v_txt FROM documento_saida WHERE id = doc_c;
    v_res := v_res || jsonb_build_object('caso', '17 sucesso sem nenhum envio → Ignorado', 'ok', v_txt = 'ignorado', 'obtido', v_txt);

    -- 10) Teste e simulação não mudam nada ------------------------------------------------------
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f1, 'saida.expedido', 'documento_saida', doc_d, 'teste', 'erro');
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
    VALUES (t, emp, f1, 'saida.expedido', 'documento_saida', doc_d, 'simulacao', 'pendente');
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado INTO v_txt FROM documento_saida WHERE id = doc_d;
    v_res := v_res || jsonb_build_object('caso', '18 teste/simulação não contam → Não integra', 'ok', v_txt = 'nao_integra', 'obtido', v_txt);

    -- 11) Lote: o nó declara no envelope; os membros recebem o resultado -------------------------
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, modo, status)
    VALUES (t, emp, f3, 'saida.expedido', 'documento_saida', 'lote', 'executando') RETURNING id INTO lote;
    INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status, lote_execucao_id)
    VALUES (t, emp, f3, 'saida.expedido', 'documento_saida', doc_d, 'automatico', 'agrupado', lote);
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado INTO v_txt FROM documento_saida WHERE id = doc_d;
    v_res := v_res || jsonb_build_object('caso', '19a membro de lote na fila → Aguardando', 'ok', v_txt = 'pendente', 'obtido', v_txt);
    PERFORM integracao_retorno_svc_atualizar_documento(lote, 'retornado_lote', false, 'integrado', NULL);
    PERFORM integracao_retorno_svc_concluir(lote, jsonb_build_object('status', 'sucesso', 'passos', '[]'::jsonb));
    UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT integracao_estado || '|' || status_integracao INTO v_txt FROM documento_saida WHERE id = doc_d;
    v_res := v_res || jsonb_build_object('caso', '19b lote → membro Integrado + marcador', 'ok', v_txt = 'integrado|retornado_lote', 'obtido', v_txt);

    -- 12) Resultado inválido é recusado ----------------------------------------------------------
    BEGIN
      PERFORM integracao_retorno_svc_atualizar_documento(lote, 'x', false, 'talvez', NULL);
      v_res := v_res || jsonb_build_object('caso', '20 resultado inválido recusado', 'ok', false, 'obtido', 'aceitou');
    EXCEPTION WHEN others THEN
      v_res := v_res || jsonb_build_object('caso', '20 resultado inválido recusado', 'ok', SQLERRM LIKE 'RETORNO_RESULTADO_INVALIDO%', 'obtido', SQLERRM);
    END;

    -- 13) Entrada: recebimento ARMAZENADO exporta com "marcar exportado" ------------------------
    SELECT m.id, med.documento_entrada_id INTO me, de
      FROM movimento_entrada m
      JOIN movimento_entrada_documento med ON med.movimento_entrada_id = m.id
      JOIN documento_entrada d ON d.id = med.documento_entrada_id AND d.status NOT IN (8, 9, 99)
     WHERE m.status = 'ARMAZENADO' AND m.tenant_id = t
       AND (SELECT count(*) FROM movimento_entrada_documento z WHERE z.movimento_entrada_id = m.id) = 1
     LIMIT 1;
    IF me IS NOT NULL THEN
      DELETE FROM integracao.retorno_execucao WHERE documento_id = de;
      INSERT INTO integracao.retorno_execucao (tenant_id, empresa_id, fluxo_id, evento, entidade, documento_id, modo, status)
      SELECT t, d.empresa_id, f1, 'entrada.armazenagem_finalizada', 'documento_entrada', de, 'automatico', 'executando'
        FROM documento_entrada d WHERE d.id = de RETURNING id INTO x;
      PERFORM integracao_retorno_svc_atualizar_documento(x, 'retornado_erp', true);
      PERFORM integracao_retorno_svc_concluir(x, jsonb_build_object('status', 'sucesso', 'passos', jsonb_build_array(
        jsonb_build_object('no_id', 'p1', 'no_tipo', 'acao.provedor', 'status', 'sucesso'))));
      UPDATE integracao.retorno_execucao SET finalizado_em = clock_timestamp() WHERE id = x AND finalizado_em IS NOT NULL; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
      SELECT d.integracao_estado || '|' || m.status::text || '|' || m.integracao_resumo INTO v_txt
        FROM documento_entrada d, movimento_entrada m WHERE d.id = de AND m.id = me;
      v_res := v_res || jsonb_build_object('caso', '21 entrada integrada → recebimento EXPORTADO', 'ok', v_txt = 'integrado|EXPORTADO|integrado', 'obtido', v_txt);
    ELSE
      v_res := v_res || jsonb_build_object('caso', '21 entrada integrada → recebimento EXPORTADO', 'ok', false, 'obtido', 'sem massa');
    END IF;

    -- 14) Linha do tempo devolve documento.integracao ------------------------------------------
    SELECT integracao.fn_documento_integracao_json('documento_saida', doc_a) ->> 'estado' INTO v_txt;
    v_res := v_res || jsonb_build_object('caso', '22 leitura para a tela (fn_documento_integracao_json)', 'ok', v_txt = 'integrado', 'obtido', v_txt);
    SELECT count(*) INTO v_n FROM pg_proc p WHERE p.proname = 'integracao_documento_eventos'
       AND pg_get_functiondef(p.oid) LIKE '%fn_documento_integracao_json%';
    v_res := v_res || jsonb_build_object('caso', '23 integracao_documento_eventos inclui o status', 'ok', v_n = 1, 'obtido', v_n);

    RAISE EXCEPTION 'QA_ROLLBACK';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'QA_ROLLBACK' THEN
      v_res := v_res || jsonb_build_object('caso', 'ERRO NA BATERIA', 'ok', false, 'obtido', SQLERRM);
    END IF;
  END;

  FOR r IN SELECT e FROM jsonb_array_elements(v_res) e LOOP
    IF (r.e->>'ok')::boolean THEN v_ok := v_ok + 1; ELSE v_falhas := v_falhas + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', v_ok, 'falhas', v_falhas, 'casos', v_res);
END;
$function$;

REVOKE ALL ON FUNCTION qa.fn_teste_status_s1() FROM PUBLIC, anon, authenticated;
