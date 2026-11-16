-- Bateria de regressão da HU (H0/H1) — SÓ QA. Tudo roda numa subtransação e é desfeito no fim.
-- Cobre: privilégios de API, permissão por ação, isolamento entre tenants, código único pela sequência,
-- ciclo de vida (Aberta → Fechada → Aberta, Descartada), conferência de entrada com HU (status, movimento),
-- limpeza da conferência e histórico de eventos.
-- Uso: SELECT qa.fn_teste_hu();   → {ok, falhas, casos[]} (esperado: 17 ok, 0 falhas)

CREATE SCHEMA IF NOT EXISTS qa;

CREATE OR REPLACE FUNCTION qa.fn_teste_hu()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_res jsonb := '[]'::jsonb;
  t uuid; emp uuid; arm uuid; tar1 uuid; tar2 uuid; mov1 uuid; mov2 uuid;
  ua uuid; ua_auth uuid; un_auth uuid := gen_random_uuid();
  tb uuid; eb uuid; ub_auth uuid := gen_random_uuid();
  r jsonb; r2 jsonb; h1 uuid; h2 uuid; h3 uuid; c1 text; c2 text; c3 text;
  v_n int; v_n2 int; v_txt text; ok boolean; ex uuid;
BEGIN
  BEGIN
    -- Massa: duas tarefas de conferência de entrada de movimentos diferentes, no mesmo tenant ---------
    SELECT t1.id, t1.tenant_id, me.id, me.empresa_id, me.armazem_id INTO tar1, t, mov1, emp, arm
      FROM tarefa t1
      JOIN tipo_tarefa tt ON tt.id = t1.tipo_tarefa_id AND tt.codigo = 'ENTR-CONF'
      JOIN movimento_entrada_item mei ON mei.id = t1.id_documento_origem
      JOIN movimento_entrada me ON me.id = mei.movimento_entrada_id
     WHERE t1.status <> 'CANCELADA' AND t1.produto_id IS NOT NULL
       AND (SELECT p.tipo_controle::text FROM produto p WHERE p.id = t1.produto_id) IS DISTINCT FROM 'VALIDADE'
     ORDER BY (t1.status = 'CRIADA') DESC, t1.id LIMIT 1;
    IF tar1 IS NULL THEN RAISE EXCEPTION 'QA: sem tarefa de conferência de entrada'; END IF;
    SELECT t2.id, me.id INTO tar2, mov2
      FROM tarefa t2
      JOIN tipo_tarefa tt ON tt.id = t2.tipo_tarefa_id AND tt.codigo = 'ENTR-CONF'
      JOIN movimento_entrada_item mei ON mei.id = t2.id_documento_origem
      JOIN movimento_entrada me ON me.id = mei.movimento_entrada_id
     WHERE t2.tenant_id = t AND me.id <> mov1 AND me.empresa_id = emp AND t2.status <> 'CANCELADA'
       AND (SELECT p.tipo_controle::text FROM produto p WHERE p.id = t2.produto_id) IS DISTINCT FROM 'VALIDADE'
     LIMIT 1;
    IF tar2 IS NULL THEN RAISE EXCEPTION 'QA: sem segunda tarefa de outro movimento'; END IF;

    SELECT u.id, u.auth_user_id INTO ua, ua_auth FROM usuario u
     WHERE u.tenant_id = t AND u.auth_user_id IS NOT NULL
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.hus', 'CREATE')
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.hus', 'UPDATE')
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.hus', 'DELETE')
       AND fn_usuario_tem_permissao(u.id, 'coletor.recebimento', 'EXECUTE')
     LIMIT 1;
    IF ua IS NULL THEN RAISE EXCEPTION 'QA: sem usuário com permissão total em HU e recebimento'; END IF;

    -- Usuário sem perfil no tenant A
    INSERT INTO usuario (tenant_id, empresa_id, login, nome, tipo_operacao, auth_user_id)
    SELECT t, emp, 'qa.sem.perfil.' || substr(md5(random()::text), 1, 6), 'QA sem perfil', u.tipo_operacao, un_auth
      FROM usuario u WHERE u.id = ua;
    -- Tenant B (só isolamento)
    INSERT INTO tenant (nome, slug) VALUES ('QA tenant B', 'qa-tenant-b-' || substr(md5(random()::text), 1, 8)) RETURNING id INTO tb;
    INSERT INTO empresa (tenant_id, razaosocial, cnpj) VALUES (tb, 'QA EMPRESA B', lpad((floor(random()*1e13))::bigint::text, 14, '0')) RETURNING id INTO eb;
    INSERT INTO usuario (tenant_id, empresa_id, login, nome, tipo_operacao, auth_user_id)
    SELECT tb, eb, 'qa.tenant.b.' || substr(md5(random()::text), 1, 6), 'QA B', u.tipo_operacao, ub_auth FROM usuario u WHERE u.id = ua;

    -- T01 privilégios de API ----------------------------------------------------------------------
    ok := NOT has_table_privilege('authenticated', 'public.hu', 'INSERT')
      AND NOT has_table_privilege('authenticated', 'public.hu', 'UPDATE')
      AND NOT has_table_privilege('authenticated', 'public.hu', 'DELETE')
      AND NOT has_table_privilege('authenticated', 'public.hu_item', 'INSERT')
      AND NOT has_table_privilege('authenticated', 'public.hu_item', 'DELETE')
      AND NOT has_table_privilege('anon', 'public.hu', 'SELECT')
      AND NOT has_table_privilege('anon', 'public.hu_item', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.hu_evento', 'INSERT')
      AND has_table_privilege('authenticated', 'public.hu', 'SELECT')
      AND NOT has_function_privilege('authenticated', 'public._fn_hu_evento(uuid,uuid,text,text,text,uuid,text,jsonb,uuid)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public._fn_hu_proximo_codigo(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public._fn_hu_contexto(text[])', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_hu_gerar(int,text,text,uuid,uuid,numeric,numeric,numeric)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.criar_hu_recebimento(uuid,uuid,uuid,text,text,uuid,uuid)', 'EXECUTE');
    v_res := v_res || jsonb_build_object('caso', 'T01 privilégios de API', 'ok', ok);

    -- T02 escrita direta recusada como authenticated
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua_auth, 'role', 'authenticated')::text, true);
    v_txt := 'gravou';
    BEGIN
      EXECUTE 'SET LOCAL ROLE authenticated';
      INSERT INTO hu (tenant_id, empresa_id, codigo_hu) VALUES (t, emp, 'QA-DIRETO');
      EXECUTE 'RESET ROLE';
    EXCEPTION WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE'; v_txt := 'recusado';
    END;
    v_res := v_res || jsonb_build_object('caso', 'T02 INSERT direto em hu recusado', 'ok', v_txt = 'recusado', 'retorno', v_txt);

    -- T03 gerar 3 HUs com antecedência
    r := rpc_hu_gerar(3, 'PALLET', 'M', emp, arm);
    h1 := (r->'hus'->0->>'hu_id')::uuid; c1 := r->'hus'->0->>'codigo_hu';
    h2 := (r->'hus'->1->>'hu_id')::uuid; c2 := r->'hus'->1->>'codigo_hu';
    h3 := (r->'hus'->2->>'hu_id')::uuid; c3 := r->'hus'->2->>'codigo_hu';
    SELECT count(*) INTO v_n FROM hu_evento WHERE hu_id IN (h1, h2, h3) AND evento = 'CRIADA';
    v_res := v_res || jsonb_build_object('caso', 'T03 gerar 3 HUs (códigos distintos, 3 eventos)',
      'ok', (r->>'sucesso')::boolean AND c1 < c2 AND c2 < c3 AND v_n = 3, 'retorno', c1 || ' ' || c2 || ' ' || c3);

    -- T04 criar no recebimento continua a sequência e herda empresa do movimento
    r := criar_hu_recebimento(t, NULL, NULL, 'PALLET', 'M', mov1, NULL);
    SELECT count(*) INTO v_n FROM hu WHERE id = (r->>'hu_id')::uuid AND empresa_id = emp AND movimento_entrada_id = mov1
      AND created_by = ua;
    v_res := v_res || jsonb_build_object('caso', 'T04 criar_hu_recebimento: código seguinte, empresa do movimento, autor da sessão',
      'ok', (r->>'sucesso')::boolean AND r->>'codigo_hu' > c3 AND v_n = 1, 'retorno', r->>'codigo_hu');

    -- T05 sem permissão
    PERFORM set_config('request.jwt.claims', json_build_object('sub', un_auth, 'role', 'authenticated')::text, true);
    r := rpc_hu_gerar(1, 'PALLET', 'M', emp, arm);
    r2 := rpc_hu_descartar(h3, 'teste');
    v_res := v_res || jsonb_build_object('caso', 'T05 usuário sem perfil: gerar e descartar recusados',
      'ok', r->>'codigo' = 'SEM_PERMISSAO' AND r2->>'codigo' = 'SEM_PERMISSAO', 'retorno', (r->>'codigo') || ' / ' || (r2->>'codigo'));

    -- T06 tenant B não enxerga HU do tenant A
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ub_auth, 'role', 'authenticated')::text, true);
    r := rpc_hu_fechar(h1);
    r2 := rpc_hu_eventos(h1);
    v_txt := 'leu';
    BEGIN
      PERFORM buscar_hu_por_codigo(t, c1);
    EXCEPTION WHEN OTHERS THEN v_txt := 'recusado';
    END;
    v_res := v_res || jsonb_build_object('caso', 'T06 isolamento entre tenants',
      'ok', r->>'codigo' IN ('NAO_ENCONTRADO','SEM_PERMISSAO') AND COALESCE(jsonb_array_length(r2->'eventos'), 0) = 0 AND v_txt = 'recusado',
      'retorno', (r->>'codigo') || ' / ' || v_txt);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua_auth, 'role', 'authenticated')::text, true);

    -- T07 fechar HU vazia recusa
    r := rpc_hu_fechar(h1);
    v_res := v_res || jsonb_build_object('caso', 'T07 fechar HU vazia recusa', 'ok', r->>'codigo' = 'HU_VAZIA', 'retorno', r->>'codigo');

    -- T08 conferência com HU grava item, reserva e liga ao movimento
    r := finalizar_conferencia_entrada_item(tar1, ua, 1, 'QA-LOTE', NULL, NULL, h1);
    ex := (r->'dados'->>'execucao_id')::uuid;
    SELECT count(*) INTO v_n FROM hu_item WHERE hu_id = h1 AND tarefa_execucao_id = ex AND created_by = ua;
    SELECT count(*) INTO v_n2 FROM hu WHERE id = h1 AND disponibilidade = 'RESERVADA' AND movimento_entrada_id = mov1;
    ok := (r->>'sucesso')::boolean AND v_n = 1 AND v_n2 = 1
      AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h1 AND evento = 'ITEM_ADICIONADO');
    v_res := v_res || jsonb_build_object('caso', 'T08 conferência com HU grava item e evento', 'ok', ok, 'retorno', r->>'codigo');

    -- T09 uma HU por movimento (D3)
    SELECT count(*) INTO v_n FROM tarefa_execucao WHERE tarefa_id = tar2;
    r := finalizar_conferencia_entrada_item(tar2, ua, 1, 'QA-LOTE', NULL, NULL, h1);
    SELECT count(*) INTO v_n2 FROM tarefa_execucao WHERE tarefa_id = tar2;
    v_res := v_res || jsonb_build_object('caso', 'T09 item de outro movimento recusado sem registrar execução',
      'ok', r->>'codigo' = 'HU_OUTRO_MOVIMENTO' AND v_n = v_n2, 'retorno', r->>'codigo');

    -- T10 fechar com item; conferência em HU fechada recusa sem registrar execução
    r := rpc_hu_fechar(h1);
    SELECT count(*) INTO v_n FROM tarefa_execucao WHERE tarefa_id = tar1;
    r2 := finalizar_conferencia_entrada_item(tar1, ua, 1, 'QA-LOTE', NULL, NULL, h1);
    SELECT count(*) INTO v_n2 FROM tarefa_execucao WHERE tarefa_id = tar1;
    v_res := v_res || jsonb_build_object('caso', 'T10 fechar e recusar item em HU fechada',
      'ok', (r->>'sucesso')::boolean AND (SELECT status::text FROM hu WHERE id = h1) = 'FECHADA'
            AND r2->>'codigo' = 'HU_NAO_ABERTA' AND v_n = v_n2,
      'retorno', (r->>'mensagem') || ' / ' || (r2->>'codigo'));

    -- T11 busca por código: fechada é disponível mas não aceita itens
    r := buscar_hu_por_codigo(t, c1);
    v_res := v_res || jsonb_build_object('caso', 'T11 busca: HU fechada disponível sem aceitar itens',
      'ok', (r->>'disponivel')::boolean AND NOT (r->>'aceita_itens')::boolean, 'retorno', r->>'status');

    -- T12 desvincular em HU fechada / sem motivo recusa; reabrir exige motivo
    r := desvincular_item_hu(t, (SELECT id FROM hu_item WHERE hu_id = h1 LIMIT 1), NULL, 'teste');
    r2 := rpc_hu_reabrir(h1, '');
    v_txt := (r->>'codigo') || ' / ' || (r2->>'codigo');
    r2 := rpc_hu_reabrir(h1, 'QA: faltou item');
    r := desvincular_item_hu(t, (SELECT id FROM hu_item WHERE hu_id = h1 LIMIT 1), NULL, NULL);
    v_res := v_res || jsonb_build_object('caso', 'T12 desvincular/reabrir exigem status e motivo',
      'ok', v_txt = 'HU_NAO_ABERTA / MOTIVO_OBRIGATORIO' AND (r2->>'sucesso')::boolean AND r->>'codigo' = 'MOTIVO_OBRIGATORIO'
            AND (SELECT status::text FROM hu WHERE id = h1) = 'ABERTA',
      'retorno', v_txt || ' / ' || (r->>'codigo'));

    -- T13 limpar conferência quando a HU já foi armazenada: recusa
    UPDATE hu SET status = 'ARMAZENADA' WHERE id = h1;
    v_txt := 'limpou';
    BEGIN
      PERFORM fn_limpar_conferencia_entrada(ex, tar1, 1, t);
    EXCEPTION WHEN raise_exception THEN v_txt := 'recusado';
    END;
    UPDATE hu SET status = 'ABERTA' WHERE id = h1;
    v_res := v_res || jsonb_build_object('caso', 'T13 limpar conferência com HU armazenada recusa', 'ok', v_txt = 'recusado', 'retorno', v_txt);

    -- T14 limpar conferência retira o item e libera a HU
    PERFORM fn_limpar_conferencia_entrada(ex, tar1, 1, t);
    ok := NOT EXISTS (SELECT 1 FROM hu_item WHERE hu_id = h1)
      AND (SELECT disponibilidade::text FROM hu WHERE id = h1) = 'DISPONIVEL'
      AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h1 AND evento = 'ITEM_REMOVIDO');
    v_res := v_res || jsonb_build_object('caso', 'T14 limpar conferência retira o item da HU', 'ok', ok);

    -- T15 editar só cadastro; valor negativo recusa
    r := rpc_hu_editar(h2, 'PALLET', 'G', 120.5, 1.2, 1.6);
    r2 := rpc_hu_editar(h2, 'PALLET', 'G', -1, NULL, NULL);
    v_res := v_res || jsonb_build_object('caso', 'T15 editar peso/medidas e recusar negativo',
      'ok', (r->>'sucesso')::boolean AND (SELECT peso_bruto FROM hu WHERE id = h2) = 120.5 AND r2->>'codigo' = 'VALOR_INVALIDO'
            AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h2 AND evento = 'EDITADA'),
      'retorno', r2->>'codigo');

    -- T16 descartar: com item recusa; vazia descarta; busca e conferência recusam a descartada
    PERFORM finalizar_conferencia_entrada_item(tar2, ua, 1, 'QA-LOTE', NULL, NULL, h3);
    r := rpc_hu_descartar(h3, 'QA');
    r2 := rpc_hu_descartar(h2, 'QA: etiqueta danificada');
    v_txt := (r->>'codigo') || ' / ' || COALESCE(r2->>'codigo', 'ok');
    r := buscar_hu_por_codigo(t, c2);
    r2 := finalizar_conferencia_entrada_item(tar2, ua, 1, 'QA-LOTE', NULL, NULL, h2);
    v_res := v_res || jsonb_build_object('caso', 'T16 descartar só HU vazia; descartada não é usada',
      'ok', v_txt = 'HU_NAO_VAZIA / ok' AND NOT (r->>'disponivel')::boolean AND r2->>'codigo' = 'HU_INVALIDA',
      'retorno', v_txt || ' / ' || (r2->>'codigo'));

    -- T17 histórico completo da HU 1
    r := rpc_hu_eventos(h1);
    SELECT string_agg(e->>'evento', ',' ORDER BY (e->>'created_at')) INTO v_txt FROM jsonb_array_elements(r->'eventos') e;
    v_res := v_res || jsonb_build_object('caso', 'T17 histórico da HU',
      'ok', v_txt LIKE 'CRIADA%' AND v_txt LIKE '%ITEM_ADICIONADO%' AND v_txt LIKE '%FECHADA%' AND v_txt LIKE '%REABERTA%'
            AND v_txt LIKE '%ITEM_REMOVIDO%',
      'retorno', v_txt);

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

REVOKE ALL ON FUNCTION qa.fn_teste_hu() FROM PUBLIC, anon, authenticated;
