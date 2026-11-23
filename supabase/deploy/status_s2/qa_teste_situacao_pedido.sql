-- Bateria do S2 (situação do pedido: etapa + entrega) — SÓ QA. Usa massa real do QA, muda os estados
-- direto nas tabelas (os gatilhos de entrega, carga e retorno rodam de verdade) e desfaz tudo no fim.
-- Os gatilhos do S2 são de fim de transação: a bateria força com SET CONSTRAINTS ALL IMMEDIATE a cada passo.
-- Uso: SELECT qa.fn_teste_situacao_pedido();

CREATE SCHEMA IF NOT EXISTS qa;

CREATE OR REPLACE FUNCTION qa.fn_teste_situacao_pedido()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_res jsonb := '[]'::jsonb;
  v_ok int := 0; v_falhas int := 0;
  r record;
  t uuid; emp uuid;
  dx uuid; dy uuid; dz uuid;
  ox uuid; oy uuid;
  veic uuid;
  cx uuid; cy uuid; cz uuid;
  ent uuid; par uuid;
  v_txt text;
BEGIN
  BEGIN
    SET CONSTRAINTS ALL DEFERRED;

    -- massa: dois pedidos em onda LIBERADO de tipo com entrega na carga montada; veículo com entregador
    SELECT ds.id, ds.tenant_id, ds.empresa_id, ms.id INTO dx, t, emp, ox
      FROM documento_saida ds
      JOIN movimento_saida_documento msd ON msd.documento_saida_id = ds.id
      JOIN movimento_saida ms ON ms.id = msd.movimento_saida_id
      JOIN tipo_saida ts ON ts.id = coalesce(ds.tipo_pedido_id, ms.tipo_saida)
     WHERE ds.status = 1 AND ms.status::text IN ('CRIADA', 'LIBERADO') AND ts.realiza_entrega AND ts.entrega_gerar_em = 'MONTADA'
       AND NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.documento_saida_id = ds.id)
     ORDER BY ms.numero_onda LIMIT 1;
    SELECT ds.id, ms.id INTO dy, oy
      FROM documento_saida ds
      JOIN movimento_saida_documento msd ON msd.documento_saida_id = ds.id
      JOIN movimento_saida ms ON ms.id = msd.movimento_saida_id
     WHERE ds.status = 1 AND ms.status::text IN ('CRIADA', 'LIBERADO') AND ds.tenant_id = t AND ds.id <> dx AND ms.id <> ox
       AND NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.documento_saida_id = ds.id)
     LIMIT 1;
    SELECT ds.id INTO dz FROM documento_saida ds WHERE ds.tenant_id = t AND ds.status = 0 LIMIT 1;
    SELECT v.id INTO veic FROM veiculos v WHERE v.tenant_id = t AND v.usuario_id IS NOT NULL LIMIT 1;
    IF dx IS NULL OR dy IS NULL OR veic IS NULL THEN RAISE EXCEPTION 'QA: massa insuficiente (dx %, dy %, veículo %)', dx, dy, veic; END IF;

    -- 1) etapas da onda
    UPDATE movimento_saida SET status = 'EM_PICKING' WHERE id = ox;
    SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT etapa || '|' || entrega_status INTO v_txt FROM documento_saida WHERE id = dx;
    v_res := v_res || jsonb_build_object('caso', '01 onda em picking → Em separação · Aguardando expedição', 'ok', v_txt = 'em_separacao|aguardando_expedicao', 'obtido', v_txt);
    UPDATE movimento_saida SET status = 'CONFERIDO' WHERE id = ox;
    SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT etapa INTO v_txt FROM documento_saida WHERE id = dx;
    v_res := v_res || jsonb_build_object('caso', '02 onda conferida → Conferido', 'ok', v_txt = 'conferido', 'obtido', v_txt);

    -- 2) carga de veículo próprio
    INSERT INTO carga (tenant_id, empresa_id, status, modalidade, veiculo_id, motorista)
    VALUES (t, emp, 'EM_MONTAGEM', 'PROPRIA', veic, 'QA S2') RETURNING id INTO cx;
    INSERT INTO carga_documento (tenant_id, empresa_id, carga_id, movimento_saida_id, documento_saida_id, sequencia, ativo)
    VALUES (t, emp, cx, ox, dx, 1, true);
    SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT etapa || '|' || entrega_status || '|' || coalesce(etapa_carga_numero::text, '') INTO v_txt FROM documento_saida WHERE id = dx;
    v_res := v_res || jsonb_build_object('caso', '03 em carga em montagem → Em carga · Aguardando expedição · nº da carga', 'ok',
      v_txt = 'em_carga|aguardando_expedicao|' || (SELECT numero_carga FROM carga WHERE id = cx), 'obtido', v_txt);

    UPDATE carga SET status = 'LIBERADA', liberada_em = now() WHERE id = cx;
    SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT e.id INTO ent FROM entrega e WHERE e.carga_id = cx AND e.status <> 'CANCELADA';
    SELECT etapa || '|' || entrega_status INTO v_txt FROM documento_saida WHERE id = dx;
    v_res := v_res || jsonb_build_object('caso', '04 carga liberada (entrega na montada) → entrega gerada · Aguardando saída', 'ok',
      ent IS NOT NULL AND v_txt = 'em_carga|aguardando_saida', 'obtido', v_txt || '|entrega=' || coalesce(ent::text, 'nenhuma'));

    IF ent IS NOT NULL THEN
      UPDATE entrega SET status = 'EM_ROTA', aceita_em = now() WHERE id = ent;
      SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
      SELECT entrega_status INTO v_txt FROM documento_saida WHERE id = dx;
      v_res := v_res || jsonb_build_object('caso', '05 entregador aceitou → Em rota', 'ok', v_txt = 'em_rota', 'obtido', v_txt);
    END IF;

    UPDATE carga_documento SET embarcado_em = now() WHERE carga_id = cx AND documento_saida_id = dx;
    SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT etapa INTO v_txt FROM documento_saida WHERE id = dx;
    v_res := v_res || jsonb_build_object('caso', '06 volumes no veículo → Embarcado', 'ok', v_txt = 'embarcado', 'obtido', v_txt);

    -- 3) tentativas: não entregue (fecha a carga pela entrega), estorno, entregue
    IF ent IS NOT NULL THEN
      SELECT p.id INTO par FROM entrega_parada p WHERE p.entrega_id = ent AND p.documento_saida_id = dx;
      UPDATE entrega_parada SET status = 'NAO_ENTREGUE', finalizada_em = now() WHERE id = par;
      SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
      SELECT etapa || '|' || entrega_status || '|' || entrega_tentativas INTO v_txt FROM documento_saida WHERE id = dx;
      v_res := v_res || jsonb_build_object('caso', '07 não entregue → Não entregue, 1 tentativa; carga fecha pela entrega → Expedido', 'ok',
        v_txt = 'expedido|nao_entregue|1', 'obtido', v_txt);
      SELECT entrega_resumo || '|' || entrega_total || '|' || entrega_nao_entregues INTO v_txt FROM movimento_saida WHERE id = ox;
      v_res := v_res || jsonb_build_object('caso', '08 resumo da onda → Não entregue (1 de 1)', 'ok', v_txt = 'nao_entregue|1|1', 'obtido', v_txt);

      PERFORM set_config('logitrack.entrega_motivo_estorno', 'QA estorno', true);
      UPDATE entrega_parada SET status = 'PENDENTE', finalizada_em = NULL WHERE id = par;
      SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
      SELECT entrega_status || '|' || entrega_tentativas INTO v_txt FROM documento_saida WHERE id = dx;
      v_res := v_res || jsonb_build_object('caso', '09 estorno → volta a Em rota, 0 tentativas válidas', 'ok', v_txt = 'em_rota|0', 'obtido', v_txt);

      UPDATE entrega_parada SET status = 'ENTREGUE', entregue_em = now(), finalizada_em = now(), recebedor_nome = 'QA' WHERE id = par;
      SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
      SELECT entrega_status || '|' || entrega_tentativas || '|' || (entrega_em IS NOT NULL) INTO v_txt FROM documento_saida WHERE id = dx;
      v_res := v_res || jsonb_build_object('caso', '10 canhoto registrado → Entregue com hora', 'ok', v_txt = 'entregue|1|true', 'obtido', v_txt);
      SELECT entrega_resumo || '|' || entrega_entregues INTO v_txt FROM movimento_saida WHERE id = ox;
      v_res := v_res || jsonb_build_object('caso', '11 resumo da onda → Entregue (1)', 'ok', v_txt = 'entregue|1', 'obtido', v_txt);
    END IF;

    -- 4) carga de transportadora
    UPDATE movimento_saida SET status = 'CONFERIDO' WHERE id = oy;
    INSERT INTO carga (tenant_id, empresa_id, status, modalidade, placa, motorista)
    VALUES (t, emp, 'EM_MONTAGEM', 'TERCEIRO', 'QAS2T00', 'QA') RETURNING id INTO cy;
    INSERT INTO carga_documento (tenant_id, empresa_id, carga_id, movimento_saida_id, documento_saida_id, sequencia, ativo)
    VALUES (t, emp, cy, oy, dy, 1, true);
    UPDATE carga SET status = 'FECHADA', liberada_em = now(), fechada_em = now() WHERE id = cy;
    SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT etapa || '|' || entrega_status INTO v_txt FROM documento_saida WHERE id = dy;
    v_res := v_res || jsonb_build_object('caso', '12 carga de transportadora fechada → Expedido · Com transportadora', 'ok',
      v_txt = 'expedido|com_transportadora', 'obtido', v_txt);

    -- 5) carga própria sem veículo: entrega não gerada com motivo
    UPDATE carga_documento SET ativo = false WHERE carga_id = cy;
    UPDATE movimento_saida SET status = 'CONFERIDO' WHERE id = oy;
    INSERT INTO carga (tenant_id, empresa_id, status, modalidade, motorista)
    VALUES (t, emp, 'EM_MONTAGEM', 'PROPRIA', 'QA') RETURNING id INTO cz;
    INSERT INTO carga_documento (tenant_id, empresa_id, carga_id, movimento_saida_id, documento_saida_id, sequencia, ativo)
    VALUES (t, emp, cz, oy, dy, 1, true);
    UPDATE carga SET status = 'LIBERADA', liberada_em = now() WHERE id = cz;
    SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT entrega_status || '|' || coalesce(entrega_motivo, '') INTO v_txt FROM documento_saida WHERE id = dy;
    v_res := v_res || jsonb_build_object('caso', '13 carga própria sem veículo → Entrega não gerada com motivo', 'ok',
      v_txt LIKE 'entrega_nao_gerada|%veículo%', 'obtido', v_txt);

    -- 6) pedido retirado da carga volta para a etapa da onda
    UPDATE carga_documento SET ativo = false WHERE carga_id = cz;
    SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT etapa || '|' || entrega_status || '|' || coalesce(etapa_carga_numero::text, '-') INTO v_txt FROM documento_saida WHERE id = dy;
    v_res := v_res || jsonb_build_object('caso', '14 retirado da carga → Conferido · Aguardando expedição, sem carga', 'ok',
      v_txt = 'conferido|aguardando_expedicao|-', 'obtido', v_txt);

    -- 7) cancelamento e pedido sem onda
    UPDATE documento_saida SET status = 9 WHERE id = dy;
    SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
    SELECT etapa || '|' || entrega_status INTO v_txt FROM documento_saida WHERE id = dy;
    v_res := v_res || jsonb_build_object('caso', '15 pedido cancelado → Cancelado · Não se aplica', 'ok', v_txt = 'cancelado|nao_se_aplica', 'obtido', v_txt);
    IF dz IS NOT NULL THEN
      SELECT etapa INTO v_txt FROM documento_saida WHERE id = dz;
      v_res := v_res || jsonb_build_object('caso', '16 pedido em 0 → Aguardando onda', 'ok', v_txt = 'aguardando_onda', 'obtido', v_txt);
    END IF;

    -- 8) "marcar exportado" não muda mais o status da onda
    PERFORM integracao._fn_movimento_integracao_resumo('movimento_saida', ox, true);
    SELECT status::text INTO v_txt FROM movimento_saida WHERE id = ox;
    v_res := v_res || jsonb_build_object('caso', '17 marcar exportado não troca CONCLUIDA por EXPORTADA_ERP', 'ok', v_txt = 'CONCLUIDA', 'obtido', v_txt);

    -- 9) leituras e funções ajustadas
    SELECT count(*)::text INTO v_txt FROM pg_proc p WHERE p.proname = 'rpc_painel_tv_operacional'
       AND pg_get_functiondef(p.oid) LIKE $q$%status IN ('CONCLUIDA', 'EXPORTADA_ERP')%$q$;
    v_res := v_res || jsonb_build_object('caso', '18 painel de TV conta EXPORTADA_ERP como expedida', 'ok', v_txt = '1', 'obtido', v_txt);
    SELECT count(*)::text INTO v_txt FROM pg_proc p WHERE p.proname = 'fn_cancelar_documento_entrada'
       AND pg_get_functiondef(p.oid) LIKE '%entrada.armazenagem_finalizada%';
    v_res := v_res || jsonb_build_object('caso', '19 cancelamento de NF de entrada lê a integração da armazenagem', 'ok', v_txt = '1', 'obtido', v_txt);
    IF ent IS NOT NULL THEN
      SELECT (public._fn_entrega_json(ent) -> 'paradas' -> 0 -> 'situacao' ->> 'entrega_status') INTO v_txt;
      v_res := v_res || jsonb_build_object('caso', '20 entrega da carga traz a situação por parada', 'ok', v_txt = 'entregue', 'obtido', v_txt);
    END IF;

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

REVOKE ALL ON FUNCTION qa.fn_teste_situacao_pedido() FROM PUBLIC, anon, authenticated;
