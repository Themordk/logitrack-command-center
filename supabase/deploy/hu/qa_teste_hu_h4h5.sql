-- Bateria da H4 (etiqueta da HU com dados do servidor) e H5 (tela da HU) — SÓ QA. Tudo é desfeito no fim.
-- Uso: SELECT qa.fn_teste_hu_h4h5();   → {ok, falhas, casos[]} (esperado: 8 ok, 0 falhas)

CREATE SCHEMA IF NOT EXISTS qa;

CREATE OR REPLACE FUNCTION qa.fn_teste_hu_h4h5()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_res jsonb := '[]'::jsonb;
  t uuid; emp uuid; arm uuid; conf uuid; mov uuid; prod uuid; val date; nfs text;
  ua uuid; ua_auth uuid; ub_auth uuid := gen_random_uuid(); tb uuid; eb uuid;
  h1 uuid; c1 text; imp uuid; tpl uuid; job uuid; ex uuid;
  r jsonb; d jsonb; ok boolean;
BEGIN
  BEGIN
    SELECT tc.id, tc.tenant_id, me.empresa_id, me.armazem_id, me.id, tc.produto_id INTO conf, t, emp, arm, mov, prod
      FROM tarefa tc
      JOIN tipo_tarefa tt ON tt.id = tc.tipo_tarefa_id AND tt.codigo = 'ENTR-CONF'
      JOIN movimento_entrada_item mei ON mei.id = tc.id_documento_origem
      JOIN movimento_entrada me ON me.id = mei.movimento_entrada_id
     WHERE tc.status <> 'CANCELADA'
       AND EXISTS (SELECT 1 FROM movimento_entrada_documento med WHERE med.movimento_entrada_id = me.id)
     ORDER BY tc.id LIMIT 1;
    IF conf IS NULL THEN RAISE EXCEPTION 'QA: sem conferência de entrada com NF'; END IF;
    val := CASE WHEN (SELECT tipo_controle::text FROM produto WHERE id = prod) = 'VALIDADE' THEN current_date + 3650 END;
    SELECT string_agg(DISTINCT de.numero_nota::text, ', ') INTO nfs
      FROM movimento_entrada_documento med JOIN documento_entrada de ON de.id = med.documento_entrada_id
     WHERE med.movimento_entrada_id = mov;

    SELECT u.id, u.auth_user_id INTO ua, ua_auth FROM usuario u
     WHERE u.tenant_id = t AND u.auth_user_id IS NOT NULL
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.hus', 'READ')
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.hus', 'CREATE')
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.hus', 'UPDATE')
       AND fn_usuario_tem_permissao(u.id, 'coletor.recebimento', 'EXECUTE')
     LIMIT 1;
    IF ua IS NULL THEN RAISE EXCEPTION 'QA: sem usuário com permissão em HU'; END IF;
    INSERT INTO tenant (nome, slug) VALUES ('QA tenant B', 'qa-tenant-b-' || substr(md5(random()::text), 1, 8)) RETURNING id INTO tb;
    INSERT INTO empresa (tenant_id, razaosocial, cnpj) VALUES (tb, 'QA EMPRESA B', lpad((floor(random()*1e13))::bigint::text, 14, '0')) RETURNING id INTO eb;
    INSERT INTO usuario (tenant_id, empresa_id, login, nome, tipo_operacao, auth_user_id)
    SELECT tb, eb, 'qa.tenant.b.' || substr(md5(random()::text), 1, 6), 'QA B', u.tipo_operacao, ub_auth FROM usuario u WHERE u.id = ua;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua_auth, 'role', 'authenticated')::text, true);
    r := rpc_hu_gerar(1, 'PALLET', 'M', emp, arm);
    h1 := (r->'hus'->0->>'hu_id')::uuid; c1 := r->'hus'->0->>'codigo_hu';
    r := finalizar_conferencia_entrada_item(conf, ua, 3, 'QA-H4', val, NULL, h1);
    ex := (r->'dados'->>'execucao_id')::uuid;
    IF NOT (r->>'sucesso')::boolean THEN RAISE EXCEPTION 'QA: conferência na HU falhou: %', r; END IF;

    -- E01 dados da etiqueta: todas as NFs do recebimento, totais e SKU
    SELECT x.dados INTO d FROM _fn_etiqueta_hu_dados(t, ARRAY[h1]) x;
    v_res := v_res || jsonb_build_object('caso', 'E01 dados da etiqueta no servidor (NFs, totais, SKU)',
      'ok', d->>'codigo_hu' = c1 AND d->>'numero_nota' = nfs AND d->>'total_quantidade' = '3' AND d->>'total_itens' = '1'
            AND d->>'sku' = (SELECT sku FROM produto WHERE id = prod) AND d->>'numero_movimento' <> '',
      'retorno', d->>'numero_nota');

    -- E02 job de HU sai com dados do servidor, mesmo se o navegador mandar outros; evento IMPRESSA
    SELECT id INTO imp FROM impressora WHERE tenant_id = t LIMIT 1;
    SELECT id INTO tpl FROM etiqueta_template WHERE tenant_id = t AND tipo = 'HU' LIMIT 1;
    IF imp IS NULL THEN
      INSERT INTO impressora (tenant_id, empresa_id, armazem_id, nome, codigo) VALUES (t, emp, arm, 'QA IMPRESSORA', 'QA-IMP') RETURNING id INTO imp;
    END IF;
    IF tpl IS NULL THEN
      INSERT INTO etiqueta_template (tenant_id, tipo, nome) VALUES (t, 'HU', 'QA HU') RETURNING id INTO tpl;
    END IF;
    INSERT INTO fila_impressao (tenant_id, empresa_id, armazem_id, impressora_id, template_id, dados, origem,
                                documento_origem_id, tipo_documento_origem)
    VALUES (t, emp, arm, imp, tpl, jsonb_build_object('codigo_hu', 'FALSO', 'parceiro_nome', 'NAVEGADOR'), 'QA',
            h1, 'hu') RETURNING id, dados INTO job, d;
    v_res := v_res || jsonb_build_object('caso', 'E02 job de HU com dados do servidor e evento IMPRESSA',
      'ok', d->>'codigo_hu' = c1 AND d->>'parceiro_nome' <> 'NAVEGADOR' AND (d->>'_dados_servidor')::boolean
            AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h1 AND evento = 'IMPRESSA' AND dados->>'fila_impressao_id' = job::text),
      'retorno', d->>'parceiro_nome');

    -- E03 prévia (dados_etiqueta_hu) usa a mesma fonte
    r := dados_etiqueta_hu(t, ARRAY[h1]);
    v_res := v_res || jsonb_build_object('caso', 'E03 prévia com a mesma fonte e itens',
      'ok', r->0->>'numero_nota' = nfs AND jsonb_array_length(r->0->'itens') = 1, 'retorno', r->0->>'numero_nota');

    -- T01 lista: HU aparece aguardando armazenagem; card conta; filtro por situação e por SKU
    r := rpc_hus_listar(emp, jsonb_build_object('busca', c1), 1, 50);
    ok := (r->'dados'->>'total')::int = 1 AND (r->'dados'->'linhas'->0->>'aguardando_armazenagem')::boolean
      AND (r->'dados'->'linhas'->0->>'etiqueta_impressoes')::int = 1 AND (r->'dados'->'resumo'->>'aguardando_armazenagem')::int >= 1;
    r := rpc_hus_listar(emp, jsonb_build_object('situacao', 'AGUARDANDO_ARMAZENAGEM', 'sku', (SELECT sku FROM produto WHERE id = prod)), 1, 500);
    ok := ok AND EXISTS (SELECT 1 FROM jsonb_array_elements(r->'dados'->'linhas') l WHERE l->>'id' = h1::text);
    v_res := v_res || jsonb_build_object('caso', 'T01 lista, cards e filtros', 'ok', ok);

    -- T02 detalhe com itens, eventos, impressões e ações
    r := rpc_hu_detalhe(h1);
    v_res := v_res || jsonb_build_object('caso', 'T02 detalhe completo',
      'ok', jsonb_array_length(r->'dados'->'itens') = 1 AND jsonb_array_length(r->'dados'->'impressoes') = 1
            AND jsonb_array_length(r->'dados'->'eventos') >= 3 AND (r->'dados'->'acoes'->>'desmontar')::boolean
            AND NOT (r->'dados'->'acoes'->>'descartar')::boolean);

    -- T03 outro tenant não vê
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ub_auth, 'role', 'authenticated')::text, true);
    r := rpc_hu_detalhe(h1);
    v_res := v_res || jsonb_build_object('caso', 'T03 tenant B não vê a HU', 'ok', r->>'codigo' IN ('NAO_ENCONTRADO', 'SEM_PERMISSAO'), 'retorno', r->>'codigo');
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua_auth, 'role', 'authenticated')::text, true);

    -- T04 desmontar exige motivo; desmonta e solta a execução
    r := rpc_hu_desmontar(h1, '');
    ok := r->>'codigo' = 'MOTIVO_OBRIGATORIO';
    r := rpc_hu_desmontar(h1, 'QA: pallet refeito');
    ok := ok AND (r->>'sucesso')::boolean AND (SELECT status::text FROM hu WHERE id = h1) = 'DESMONTADA'
      AND NOT EXISTS (SELECT 1 FROM hu_item WHERE hu_id = h1)
      AND (SELECT hu FROM tarefa_execucao WHERE id = ex) IS NULL;
    v_res := v_res || jsonb_build_object('caso', 'T04 desmontar com motivo', 'ok', ok, 'retorno', r->>'mensagem');

    -- T05 encerrada sai da lista padrão e aparece filtrando o status
    r := rpc_hus_listar(emp, jsonb_build_object('busca', c1), 1, 50);
    r := r || jsonb_build_object('_d', rpc_hus_listar(emp, jsonb_build_object('busca', c1, 'status', 'DESMONTADA'), 1, 50));
    v_res := v_res || jsonb_build_object('caso', 'T05 encerrada fora da lista padrão',
      'ok', (r->'dados'->>'total')::int = 0 AND (r->'_d'->'dados'->>'total')::int = 1);

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

REVOKE ALL ON FUNCTION qa.fn_teste_hu_h4h5() FROM PUBLIC, anon, authenticated;
