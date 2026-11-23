-- =====================================================================
-- Teste (desfeito no final) · 20261123020000_ondas_carregamento_lista_detalhe_rpc
-- Ambiente: branch-qa. Roda como role authenticated com request.jwt.claims.
--   1. lista: mesmas ondas/ordem/totais de listar_ondas_carregamento; tipo de saída
--      do movimento; integração; pendências e aguardando NF iguais às funções
--   2. detalhe: itens = buscar_itens_onda_carregamento; abas = views; contagens
--   3. recusas: seção inválida, onda de outro tenant, sessão sem tenant
--   4. anon sem EXECUTE
-- (Paridade dos operadores foi conferida em produção, só leitura, em 300 ondas: 0 diferenças.)
-- =====================================================================
DO $$
DECLARE
  v_uid uuid; v_tenant uuid; log text := ''; falhas int := 0;
  m record; r jsonb; n_old int; n_new int; dif int; s text;
BEGIN
  SELECT auth_user_id, tenant_id INTO v_uid, v_tenant FROM usuario WHERE auth_user_id IS NOT NULL AND ativo ORDER BY created_at LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. lista
  SELECT count(*) INTO dif FROM (
    (SELECT id, numero_onda, status, total_itens, total_esperado, total_registros
       FROM listar_ondas_carregamento(v_tenant, NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,50,NULL,NULL)
     EXCEPT
     SELECT id, numero_onda, status, total_itens, total_esperado, total_registros
       FROM rpc_ondas_carregamento_lista(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,50,NULL,NULL))
    UNION ALL
    (SELECT id, numero_onda, status, total_itens, total_esperado, total_registros
       FROM rpc_ondas_carregamento_lista(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,50,NULL,NULL)
     EXCEPT
     SELECT id, numero_onda, status, total_itens, total_esperado, total_registros
       FROM listar_ondas_carregamento(v_tenant, NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,50,NULL,NULL))) d;
  SELECT count(*) INTO n_new FROM rpc_ondas_carregamento_lista(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,50,NULL,NULL);
  log := log || E'\nlista: ondas=' || n_new || ' dif=' || dif;
  IF dif <> 0 THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

  SELECT count(*) INTO dif
    FROM rpc_ondas_carregamento_lista(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,50,NULL,NULL) l
    JOIN movimento_saida ms ON ms.id = l.id
    LEFT JOIN tipo_saida ts ON ts.id = ms.tipo_saida
   WHERE l.tipo_saida_descricao IS DISTINCT FROM ts.descricao
      OR l.integracao_resumo IS DISTINCT FROM ms.integracao_resumo
      OR jsonb_typeof(l.operadores) <> 'array';
  log := log || ' tipo/integracao/operadores dif=' || dif;
  IF dif <> 0 THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

  -- 2. detalhe
  FOR m IN SELECT id, numero_onda FROM movimento_saida ORDER BY numero_onda DESC LIMIT 20 LOOP
    r := rpc_onda_carregamento_detalhe(m.id, 'itens');
    SELECT count(*) INTO dif FROM (
      (SELECT id, sku, qtd_esperada, qtd_separada, qtd_conferida, status FROM buscar_itens_onda_carregamento(v_tenant, m.id)
       EXCEPT
       SELECT (e->>'id')::uuid, e->>'sku', (e->>'qtd_esperada')::numeric, (e->>'qtd_separada')::numeric, (e->>'qtd_conferida')::numeric, e->>'status'
         FROM jsonb_array_elements(r->'itens') e)) d;
    log := log || E'\nOnda ' || m.numero_onda || ' itens=' || jsonb_array_length(r->'itens') || ' dif=' || dif;
    IF dif <> 0 OR jsonb_array_length(r->'itens') <> (SELECT count(*) FROM buscar_itens_onda_carregamento(v_tenant, m.id)) THEN
      falhas := falhas + 1; log := log || ' <<FALHA';
    END IF;

    SELECT count(*) INTO n_old FROM vw_movimento_saida_separacao_detalhe WHERE movimento_id = m.id;
    n_new := jsonb_array_length(rpc_onda_carregamento_detalhe(m.id, 'separacao')->'separacao');
    log := log || ' sep=' || n_new || '/' || n_old;
    IF n_new <> n_old OR (r->'contagens'->>'separacao')::int <> n_old THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

    SELECT count(*) INTO n_old FROM vw_movimento_saida_conferencia_detalhe WHERE movimento_saida_id = m.id;
    n_new := jsonb_array_length(rpc_onda_carregamento_detalhe(m.id, 'conferencia')->'conferencia');
    log := log || ' conf=' || n_new || '/' || n_old;
    IF n_new <> n_old OR (r->'contagens'->>'conferencia')::int <> n_old THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

    SELECT count(*) INTO n_old FROM vw_movimento_saida_docs_vinculados WHERE movimento_saida_id = m.id;
    n_new := jsonb_array_length(rpc_onda_carregamento_detalhe(m.id, 'informacoes')->'documentos');
    log := log || ' docs=' || n_new || '/' || n_old;
    IF n_new <> n_old OR (r->'contagens'->>'documentos')::int <> n_old THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

    IF r->'cabecalho'->>'status' IS DISTINCT FROM (SELECT status::text FROM movimento_saida WHERE id = m.id) THEN
      falhas := falhas + 1; log := log || ' status<<FALHA';
    END IF;
  END LOOP;

  -- 3. recusas
  BEGIN
    PERFORM rpc_onda_carregamento_detalhe((SELECT id FROM movimento_saida LIMIT 1), 'xpto');
    falhas := falhas + 1; log := log || E'\nseção inválida aceita <<FALHA';
  EXCEPTION WHEN OTHERS THEN
    log := log || E'\nseção inválida: ' || (SQLERRM::jsonb->>'codigo');
    IF SQLERRM::jsonb->>'codigo' <> 'SECAO_INVALIDA' THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;
  END;

  RESET ROLE;
  SELECT id INTO m FROM movimento_saida ORDER BY numero_onda DESC LIMIT 1;
  UPDATE movimento_saida SET tenant_id = '0b000000-0000-4000-a000-000000000001' WHERE id = m.id;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM rpc_onda_carregamento_detalhe(m.id, 'itens');
    falhas := falhas + 1; log := log || E'\nonda de outro tenant devolvida <<FALHA';
  EXCEPTION WHEN OTHERS THEN
    log := log || E'\noutro tenant: ' || (SQLERRM::jsonb->>'codigo');
    IF SQLERRM::jsonb->>'codigo' <> 'ONDA_NAO_ENCONTRADA' THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;
  END;
  SELECT count(*) INTO n_new FROM rpc_ondas_carregamento_lista(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,50,NULL,NULL) WHERE id = m.id;
  log := log || ' | lista mostra onda de outro tenant? ' || (n_new > 0);
  IF n_new > 0 THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM 1 FROM rpc_ondas_carregamento_lista(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,50,NULL,NULL);
    falhas := falhas + 1; log := log || E'\nsessão sem tenant aceita <<FALHA';
  EXCEPTION WHEN OTHERS THEN
    log := log || E'\nsem tenant: ' || (SQLERRM::jsonb->>'codigo');
    IF SQLERRM::jsonb->>'codigo' <> 'SESSAO_SEM_TENANT' THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;
  END;

  -- 4. anon
  RESET ROLE;
  s := has_function_privilege('anon', 'public.rpc_onda_carregamento_detalhe(uuid,text)', 'EXECUTE')::text || '/'
    || has_function_privilege('anon', 'public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text)', 'EXECUTE')::text || '/'
    || has_function_privilege('authenticated', 'public.rpc_onda_carregamento_detalhe(uuid,text)', 'EXECUTE')::text;
  log := log || E'\nEXECUTE anon(det)/anon(lista)/authenticated => false/false/true : ' || s;
  IF s <> 'false/false/true' THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

  IF falhas = 0 THEN RAISE EXCEPTION 'TESTE OK (desfeito):%', log;
  ELSE RAISE EXCEPTION 'TESTE FALHOU (desfeito): % falha(s)%', falhas, log; END IF;
END $$;
