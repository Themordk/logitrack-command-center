-- =====================================================================
-- Teste (desfeito no final) · 20261123010000_movimento_entrada_detalhe_rpc
-- Ambiente: branch-qa. Roda como role authenticated com request.jwt.claims
-- (RLS ativo nas consultas antigas usadas como referência).
--
-- Verifica, para TODOS os movimentos do tenant do usuário:
--   1. paridade da seção itens com buscar_itens_movimento_entrada + alertas
--      calculados como a tela antiga (picking ativo / embalagem ativa)
--   2. paridade de conferencia / armazenagem / informacoes com as views
--   3. contagens = nº de linhas das abas
--   4. seção inválida, sessão sem tenant e movimento de outro tenant recusados
--   5. anon sem EXECUTE
-- Resultado na mensagem de erro "TESTE OK/FALHOU (desfeito): ...".
-- =====================================================================
DO $$
DECLARE
  v_uid    uuid;
  v_tenant uuid;
  log text := ''; falhas int := 0;
  m record; r jsonb; n_old int; n_new int; dif int; s text;
BEGIN
  SELECT auth_user_id, tenant_id INTO v_uid, v_tenant
    FROM usuario WHERE auth_user_id IS NOT NULL AND ativo ORDER BY created_at LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  FOR m IN SELECT id, numero_movimento FROM movimento_entrada ORDER BY numero_movimento LOOP
    -- 1. itens
    r := rpc_movimento_entrada_detalhe(m.id, 'itens');
    WITH novo AS (
      SELECT (e->>'movimento_item_id')::uuid id, e->>'sku' sku,
             (e->>'qtd_esperada')::numeric esp, (e->>'qtd_conferida')::numeric conf,
             (e->>'qtd_armazenada')::numeric armz, e->>'status_item_movimento' st,
             (e->>'sem_picking')::boolean sp, (e->>'sem_ean')::boolean se
        FROM jsonb_array_elements(r->'itens') e),
    antigo AS (
      SELECT b.movimento_item_id id, b.sku, b.qtd_esperada esp, b.qtd_conferida conf,
             b.qtd_armazenada armz, b.status_item_movimento st,
             NOT EXISTS (SELECT 1 FROM picking_produto pp WHERE pp.produto_id = mei.produto_id AND pp.ativo) sp,
             NOT EXISTS (SELECT 1 FROM produto_embalagem pe WHERE pe.produto_id = mei.produto_id AND pe.ativo) se
        FROM buscar_itens_movimento_entrada(v_tenant, m.id) b
        JOIN movimento_entrada_item mei ON mei.id = b.movimento_item_id)
    SELECT count(*) INTO dif FROM (
      (SELECT * FROM novo EXCEPT SELECT * FROM antigo)
      UNION ALL
      (SELECT * FROM antigo EXCEPT SELECT * FROM novo)) d;
    log := log || E'\nMOV-' || m.numero_movimento || ' itens=' || jsonb_array_length(r->'itens') || ' dif=' || dif;
    IF dif <> 0 THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;
    IF r->'cabecalho'->>'status' IS DISTINCT FROM (SELECT status::text FROM movimento_entrada WHERE id = m.id) THEN
      falhas := falhas + 1; log := log || ' status<<FALHA';
    END IF;

    -- 2/3. conferencia
    SELECT count(*) INTO n_old FROM vw_movimento_entrada_conferencia_detalhe WHERE movimento_id = m.id;
    n_new := jsonb_array_length(rpc_movimento_entrada_detalhe(m.id, 'conferencia')->'conferencia');
    SELECT count(*) INTO dif FROM (
      (SELECT tarefa_execucao_id, sku, quantidade_executada, lote, status::text FROM vw_movimento_entrada_conferencia_detalhe WHERE movimento_id = m.id
       EXCEPT
       SELECT (e->>'tarefa_execucao_id')::uuid, e->>'sku', (e->>'quantidade_executada')::numeric, e->>'lote', e->>'status'
         FROM jsonb_array_elements(rpc_movimento_entrada_detalhe(m.id, 'conferencia')->'conferencia') e)) d;
    log := log || ' conf=' || n_new || '/' || n_old || ' dif=' || dif;
    IF n_new <> n_old OR dif <> 0 OR (r->'contagens'->>'conferencias')::int <> n_new THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

    -- armazenagem
    SELECT count(*) INTO n_old FROM vw_movimento_entrada_armazenagem_detalhe WHERE movimento_entrada_id = m.id;
    n_new := jsonb_array_length(rpc_movimento_entrada_detalhe(m.id, 'armazenagem')->'armazenagem');
    SELECT count(*) INTO dif FROM (
      (SELECT sku, quantidade_executada, endereco, login FROM vw_movimento_entrada_armazenagem_detalhe WHERE movimento_entrada_id = m.id
       EXCEPT
       SELECT e->>'sku', (e->>'quantidade_executada')::numeric, e->>'endereco', e->>'login'
         FROM jsonb_array_elements(rpc_movimento_entrada_detalhe(m.id, 'armazenagem')->'armazenagem') e)) d;
    log := log || ' armz=' || n_new || '/' || n_old || ' dif=' || dif;
    IF n_new <> n_old OR dif <> 0 OR (r->'contagens'->>'armazenagens')::int <> n_new THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

    -- informacoes
    r := rpc_movimento_entrada_detalhe(m.id, 'informacoes');
    SELECT count(*) INTO n_old FROM vw_movimento_entrada_docs_vinculados WHERE movimento_entrada_id = m.id;
    SELECT count(*) INTO dif FROM vw_movimento_entrada_info i
     WHERE i.movimento_id = m.id
       AND (i.status::text IS DISTINCT FROM r->'informacoes'->>'status'
         OR i.tipo_entrada_descricao IS DISTINCT FROM r->'informacoes'->>'tipo_entrada_descricao'
         OR i.armazem_descricao IS DISTINCT FROM r->'informacoes'->>'armazem_descricao'
         OR i.box_descricao IS DISTINCT FROM r->'informacoes'->>'box_descricao'
         OR i.placa_veiculo::text IS DISTINCT FROM r->'informacoes'->>'placa_veiculo');
    SELECT dif + count(*) INTO dif FROM (
      SELECT documento_entrada_id, numero_nota::text, total_skus FROM vw_movimento_entrada_docs_vinculados WHERE movimento_entrada_id = m.id
      EXCEPT
      SELECT (e->>'documento_entrada_id')::uuid, e->>'numero_nota', (e->>'total_skus')::bigint
        FROM jsonb_array_elements(r->'documentos') e) d;
    log := log || ' docs=' || jsonb_array_length(r->'documentos') || '/' || n_old || ' dif=' || dif;
    IF jsonb_array_length(r->'documentos') <> n_old OR dif <> 0 THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;
  END LOOP;

  -- 4. recusas
  BEGIN
    PERFORM rpc_movimento_entrada_detalhe((SELECT id FROM movimento_entrada LIMIT 1), 'xpto');
    falhas := falhas + 1; log := log || E'\nseção inválida aceita <<FALHA';
  EXCEPTION WHEN OTHERS THEN
    log := log || E'\nseção inválida: ' || (SQLERRM::jsonb->>'codigo');
    IF SQLERRM::jsonb->>'codigo' <> 'SECAO_INVALIDA' THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;
  END;

  RESET ROLE;
  SELECT id INTO m FROM movimento_entrada ORDER BY numero_movimento LIMIT 1;
  UPDATE movimento_entrada SET tenant_id = '0b000000-0000-4000-a000-000000000001' WHERE id = m.id;
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM rpc_movimento_entrada_detalhe(m.id, 'itens');
    falhas := falhas + 1; log := log || E'\nmovimento de outro tenant devolvido <<FALHA';
  EXCEPTION WHEN OTHERS THEN
    log := log || E'\noutro tenant: ' || (SQLERRM::jsonb->>'codigo');
    IF SQLERRM::jsonb->>'codigo' <> 'MOVIMENTO_NAO_ENCONTRADO' THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;
  END;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM rpc_movimento_entrada_detalhe(m.id, 'itens');
    falhas := falhas + 1; log := log || E'\nsessão sem tenant aceita <<FALHA';
  EXCEPTION WHEN OTHERS THEN
    log := log || E'\nsem tenant: ' || (SQLERRM::jsonb->>'codigo');
    IF SQLERRM::jsonb->>'codigo' <> 'SESSAO_SEM_TENANT' THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;
  END;

  -- 5. anon
  RESET ROLE;
  s := has_function_privilege('anon', 'public.rpc_movimento_entrada_detalhe(uuid,text)', 'EXECUTE')::text
    || '/' || has_function_privilege('authenticated', 'public.rpc_movimento_entrada_detalhe(uuid,text)', 'EXECUTE')::text;
  log := log || E'\nEXECUTE anon/authenticated => false/true : ' || s;
  IF s <> 'false/true' THEN falhas := falhas + 1; log := log || ' <<FALHA'; END IF;

  IF falhas = 0 THEN
    RAISE EXCEPTION 'TESTE OK (desfeito):%', log;
  ELSE
    RAISE EXCEPTION 'TESTE FALHOU (desfeito): % falha(s)%', falhas, log;
  END IF;
END $$;
