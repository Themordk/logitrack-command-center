-- Bateria da H7 (SSCC), H8 (consulta/verificação/contagem por HU) e H9 (dividir/juntar) — SÓ QA. Tudo é desfeito no fim.
-- Uso: SELECT qa.fn_teste_hu_h7h9();   → {ok, falhas, casos[]} (esperado: 12 ok, 0 falhas)

CREATE SCHEMA IF NOT EXISTS qa;

CREATE OR REPLACE FUNCTION qa.fn_teste_hu_h7h9()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_res jsonb := '[]'::jsonb;
  t uuid; emp uuid; arm uuid; conf uuid; mov uuid; prod uuid; val date; armz uuid; endp uuid; endp2 uuid; tinv uuid; tt_inv uuid;
  ua uuid; ua_auth uuid; h1 uuid; h2 uuid; h3 uuid; c1 text; c2 text; cod text; it uuid;
  r jsonb; ok boolean;
BEGIN
  BEGIN
    SELECT ta.id, ta.tenant_id, ta.empresa_id, me.armazem_id, me.id, ta.produto_id,
           (SELECT tc.id FROM tarefa tc JOIN tipo_tarefa x ON x.id = tc.tipo_tarefa_id AND x.codigo = 'ENTR-CONF'
             WHERE tc.id_documento_origem = ta.id_documento_origem AND tc.status <> 'CANCELADA' LIMIT 1)
      INTO armz, t, emp, arm, mov, prod, conf
      FROM tarefa ta
      JOIN tipo_tarefa tt ON tt.id = ta.tipo_tarefa_id AND tt.codigo = 'ENTR-ARMZ'
      JOIN movimento_entrada_item mei ON mei.id = ta.id_documento_origem
      JOIN movimento_entrada me ON me.id = mei.movimento_entrada_id
     WHERE ta.status IN ('CRIADA', 'EM_ANDAMENTO') AND ta.quantidade_requerida - COALESCE(ta.quantidade_executada, 0) >= 6
       AND EXISTS (SELECT 1 FROM tarefa tc JOIN tipo_tarefa x ON x.id = tc.tipo_tarefa_id AND x.codigo = 'ENTR-CONF'
                    WHERE tc.id_documento_origem = ta.id_documento_origem AND tc.status <> 'CANCELADA')
       AND NOT EXISTS (SELECT 1 FROM tarefa tc2 JOIN tarefa_execucao te2 ON te2.tarefa_id = tc2.id
                        JOIN hu_item hi2 ON hi2.tarefa_execucao_id = te2.id WHERE tc2.id_documento_origem = ta.id_documento_origem)
     ORDER BY ta.id LIMIT 1;
    IF armz IS NULL THEN RAISE EXCEPTION 'QA: sem tarefa de armazenagem pendente com conferência'; END IF;
    val := CASE WHEN (SELECT tipo_controle::text FROM produto WHERE id = prod) = 'VALIDADE' THEN current_date + 3650 END;
    SELECT e.id INTO endp FROM endereco e WHERE e.tenant_id = t AND e.armazem_id = arm AND e.tipo_endereco = 'PULMAO'
       AND e.situacao::text NOT LIKE 'BLOQ%' ORDER BY e.id LIMIT 1;
    SELECT e.id INTO endp2 FROM endereco e WHERE e.tenant_id = t AND e.armazem_id = arm AND e.id <> endp ORDER BY e.id LIMIT 1;
    SELECT u.id, u.auth_user_id INTO ua, ua_auth FROM usuario u
     WHERE u.tenant_id = t AND u.auth_user_id IS NOT NULL
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.hus', 'CREATE') AND fn_usuario_tem_permissao(u.id, 'web.atividades.hus', 'UPDATE')
       AND fn_usuario_tem_permissao(u.id, 'coletor.armazenagem', 'EXECUTE') AND fn_usuario_tem_permissao(u.id, 'coletor.recebimento', 'EXECUTE')
       AND fn_usuario_tem_permissao(u.id, 'coletor.inventario', 'EXECUTE')
     LIMIT 1;
    IF ua IS NULL THEN RAISE EXCEPTION 'QA: sem usuário com as permissões de HU, recebimento, armazenagem e inventário'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua_auth, 'role', 'authenticated')::text, true);

    -- S01 dígito GS1 e normalização da leitura
    v_res := v_res || jsonb_build_object('caso', 'S01 SSCC válido, dígito e leitura (00)/]C1',
      'ok', _fn_sscc_valido('106141411234567897') AND NOT _fn_sscc_valido('106141411234567890')
            AND _fn_hu_normalizar_codigo(']C100106141411234567897') = '106141411234567897'
            AND _fn_hu_normalizar_codigo('(00) 106141411234567897') = '106141411234567897'
            AND _fn_hu_normalizar_codigo(' hu-000000012 ') = 'HU-000000012');

    -- S02 empresa em SSCC: código de 18 dígitos válido, com o prefixo
    UPDATE empresa SET hu_formato_codigo = 'SSCC', gs1_prefixo = '7891234', gs1_digito_extensao = 3 WHERE id = emp;
    r := rpc_hu_gerar(2, 'PALLET', 'M', emp, arm);
    h1 := (r->'hus'->0->>'hu_id')::uuid; c1 := r->'hus'->0->>'codigo_hu';
    h2 := (r->'hus'->1->>'hu_id')::uuid; c2 := r->'hus'->1->>'codigo_hu';
    v_res := v_res || jsonb_build_object('caso', 'S02 gerar HU com SSCC da empresa',
      'ok', _fn_sscc_valido(c1) AND c1 LIKE '37891234%' AND c1 <> c2, 'retorno', c1);

    -- S03 leitura com (00) encontra a HU; etiqueta traz o código legível
    r := buscar_hu_por_codigo(t, '(00)' || c1);
    ok := (r->>'hu_id')::uuid = h1;
    SELECT x.dados INTO r FROM _fn_etiqueta_hu_dados(t, ARRAY[h1]) x;
    v_res := v_res || jsonb_build_object('caso', 'S03 leitura (00)+SSCC e etiqueta com código legível',
      'ok', ok AND r->>'sscc' = c1 AND r->>'codigo_hu_legivel' = '(00) ' || c1, 'retorno', r->>'codigo_hu_legivel');

    -- S04 SSCC do fornecedor: aceita válido, recusa inválido e repetido
    r := criar_hu_recebimento(t, NULL, NULL, 'PALLET', 'M', mov, NULL, '(00)106141411234567897');
    ok := (r->>'sucesso')::boolean AND r->>'codigo_hu' = '106141411234567897' AND (r->>'sscc_fornecedor')::boolean;
    h3 := (r->>'hu_id')::uuid;
    r := criar_hu_recebimento(t, NULL, NULL, 'PALLET', 'M', mov, NULL, '106141411234567890');
    ok := ok AND r->>'codigo' = 'SSCC_INVALIDO';
    r := criar_hu_recebimento(t, NULL, NULL, 'PALLET', 'M', mov, NULL, '106141411234567897');
    v_res := v_res || jsonb_build_object('caso', 'S04 SSCC do fornecedor: válido, inválido, repetido',
      'ok', ok AND r->>'codigo' = 'SSCC_JA_USADO', 'retorno', r->>'codigo');
    UPDATE empresa SET hu_formato_codigo = 'PADRAO' WHERE id = emp;

    -- Massa: h1 com 6 unidades
    r := finalizar_conferencia_entrada_item(conf, ua, 6, 'QA-H9', val, NULL, h1);
    IF NOT (r->>'sucesso')::boolean THEN RAISE EXCEPTION 'QA: conferência na HU falhou: %', r; END IF;
    SELECT id INTO it FROM hu_item WHERE hu_id = h1;

    -- D01 dividir: recusa tudo/zero; divide 2 de 6 numa HU nova
    r := rpc_hu_dividir(h1, jsonb_build_array(jsonb_build_object('hu_item_id', it, 'quantidade', 6)), 'QA');
    ok := r->>'codigo' = 'DIVISAO_TOTAL';
    r := rpc_hu_dividir(h1, jsonb_build_array(jsonb_build_object('hu_item_id', it, 'quantidade', 0)), 'QA');
    ok := ok AND r->>'codigo' = 'QUANTIDADE_INVALIDA';
    r := rpc_hu_dividir(h1, jsonb_build_array(jsonb_build_object('hu_item_id', it, 'quantidade', 2)), 'QA: pallet alto demais');
    cod := r->>'codigo_hu';
    ok := ok AND (r->>'sucesso')::boolean AND (SELECT quantidade FROM hu_item WHERE id = it) = 4
      AND (SELECT sum(quantidade) FROM hu_item WHERE hu_id = (r->>'hu_id')::uuid) = 2
      AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h1 AND evento = 'DIVIDIDA');
    v_res := v_res || jsonb_build_object('caso', 'D01 dividir 2 de 6 numa HU nova', 'ok', ok, 'retorno', cod);

    -- D02 as duas metades armazenam juntas a execução repartida (cada HU inteira)
    r := rpc_coletor_armazenar_hu(h1, endp);
    ok := (r->>'sucesso')::boolean;
    r := rpc_coletor_armazenar_hu((SELECT id FROM hu WHERE codigo_hu = cod AND tenant_id = t), endp);
    ok := ok AND (r->>'sucesso')::boolean
      AND (SELECT sum(quantidade_total) FROM estoque_geral WHERE hu_id = h1) = 4
      AND (SELECT sum(quantidade_total) FROM estoque_geral WHERE hu_id = (SELECT id FROM hu WHERE codigo_hu = cod AND tenant_id = t)) = 2;
    v_res := v_res || jsonb_build_object('caso', 'D02 armazenar as duas HUs da divisão', 'ok', ok, 'retorno', COALESCE(r->>'mensagem', r::text));

    -- D03 dividir/juntar HU armazenada recusa
    r := rpc_hu_dividir(h1, jsonb_build_array(jsonb_build_object('hu_item_id', it, 'quantidade', 1)), 'QA');
    v_res := v_res || jsonb_build_object('caso', 'D03 dividir HU armazenada recusa', 'ok', r->>'codigo' = 'HU_JA_ARMAZENADA', 'retorno', r->>'codigo');

    -- V01 consulta e verificação de local (confere e diverge)
    r := rpc_coletor_hu_consulta(c1);
    ok := (r->>'sucesso')::boolean AND jsonb_array_length(r->'dados'->'estoque') = 1;
    r := rpc_coletor_hu_verificar_local(h1, endp);
    ok := ok AND (r->>'confere')::boolean;
    r := rpc_coletor_hu_verificar_local(h1, endp2);
    ok := ok AND NOT (r->>'confere')::boolean AND (rpc_coletor_hu_consulta(c1)->'dados'->'ultima_verificacao'->>'confere')::boolean = false;
    v_res := v_res || jsonb_build_object('caso', 'V01 consulta e verificação de local', 'ok', ok, 'retorno', r->>'mensagem');

    -- I01 contagem por HU no inventário: quantidade da HU para o produto/endereço da tarefa
    SELECT id INTO tt_inv FROM tipo_tarefa WHERE tenant_id = t AND codigo ILIKE 'INV%' LIMIT 1;
    INSERT INTO tarefa (tenant_id, empresa_id, armazem_id, tipo_tarefa_id, tipo_documento_origem, id_documento_origem,
                        id_local_origem, produto_id, quantidade_requerida, status, contagem_inventario)
    VALUES (t, emp, arm, tt_inv, 'INVENTARIO', gen_random_uuid(), endp, prod, 4, 'CRIADA', 1) RETURNING id INTO tinv;
    r := rpc_coletor_inventario_hu('(00)' || c1, tinv);
    ok := (r->>'sucesso')::boolean AND (r->>'quantidade')::numeric = 4;
    UPDATE tarefa SET id_local_origem = endp2 WHERE id = tinv;
    r := rpc_coletor_inventario_hu(c1, tinv);
    v_res := v_res || jsonb_build_object('caso', 'I01 contagem por HU (quantidade e HU em outro endereço)',
      'ok', ok AND r->>'codigo' = 'HU_OUTRO_ENDERECO', 'retorno', r->>'codigo');

    -- J01 juntar: h3 (SSCC do fornecedor, mesmo recebimento) recebe item e é juntada em h2
    r := finalizar_conferencia_entrada_item(conf, ua, 1, 'QA-H9', val, NULL, h3);
    r := rpc_hu_juntar(h3, c2, '');
    ok := r->>'codigo' = 'MOTIVO_OBRIGATORIO';
    r := rpc_hu_juntar(h3, c2, 'QA: consolidar pallets');
    ok := ok AND (r->>'sucesso')::boolean AND (SELECT status::text FROM hu WHERE id = h3) = 'DESMONTADA'
      AND (SELECT count(*) FROM hu_item WHERE hu_id = h2) = 1 AND NOT EXISTS (SELECT 1 FROM hu_item WHERE hu_id = h3)
      AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h2 AND evento = 'JUNTADA');
    v_res := v_res || jsonb_build_object('caso', 'J01 juntar HU em outra', 'ok', ok, 'retorno', r->>'mensagem');

    -- J02 juntar com a mesma HU / com armazenada recusa
    r := rpc_hu_juntar(h2, c2, 'QA');
    ok := r->>'codigo' = 'MESMA_HU';
    r := rpc_hu_juntar(h2, c1, 'QA');
    v_res := v_res || jsonb_build_object('caso', 'J02 juntar na mesma HU ou em armazenada recusa',
      'ok', ok AND r->>'codigo' = 'HU_JA_ARMAZENADA', 'retorno', r->>'codigo');

    -- J03 detalhe mostra ações dividir/juntar
    r := rpc_hu_detalhe(h2);
    v_res := v_res || jsonb_build_object('caso', 'J03 detalhe com ações dividir e juntar',
      'ok', (r->'dados'->'acoes' ? 'dividir') AND (r->'dados'->'acoes'->>'juntar')::boolean);

    RAISE EXCEPTION 'QA_ROLLBACK';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'QA_ROLLBACK' THEN
        v_res := v_res || jsonb_build_object('caso', 'ERRO', 'ok', false, 'retorno', SQLERRM);
      END IF;
    WHEN OTHERS THEN
      v_res := v_res || jsonb_build_object('caso', 'ERRO', 'ok', false, 'retorno', SQLSTATE || ' ' || SQLERRM);
  END;

  PERFORM set_config('request.jwt.claims', '', true);
  RETURN jsonb_build_object(
    'ok',     (SELECT count(*) FROM jsonb_array_elements(v_res) x WHERE COALESCE((x->>'ok')::boolean, false)),
    'falhas', (SELECT count(*) FROM jsonb_array_elements(v_res) x WHERE NOT COALESCE((x->>'ok')::boolean, false)),
    'casos',  v_res);
END;
$function$;

REVOKE ALL ON FUNCTION qa.fn_teste_hu_h7h9() FROM PUBLIC, anon, authenticated;
