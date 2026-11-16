-- Bateria da H2 (armazenagem da HU inteira e estoque por HU) — SÓ QA. Tudo é desfeito no fim.
-- Uso: SELECT qa.fn_teste_hu_h2();   → {ok, falhas, casos[]} (esperado: 9 ok, 0 falhas)

CREATE SCHEMA IF NOT EXISTS qa;

CREATE OR REPLACE FUNCTION qa.fn_teste_hu_h2()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_res jsonb := '[]'::jsonb;
  t uuid; emp uuid; arm uuid; armz uuid; conf uuid; mov uuid; rest numeric; prod uuid; val date;
  ua uuid; ua_auth uuid; endp uuid; endp2 uuid; h1 uuid; h2 uuid; c1 text;
  r jsonb; v_n numeric; v_txt text; ok boolean; exec_antes numeric;
BEGIN
  BEGIN
    SELECT ta.id, ta.tenant_id, ta.empresa_id, me.armazem_id, me.id, ta.quantidade_requerida - COALESCE(ta.quantidade_executada, 0), ta.produto_id,
           (SELECT tc.id FROM tarefa tc JOIN tipo_tarefa x ON x.id = tc.tipo_tarefa_id AND x.codigo = 'ENTR-CONF'
             WHERE tc.id_documento_origem = ta.id_documento_origem AND tc.status <> 'CANCELADA' LIMIT 1)
      INTO armz, t, emp, arm, mov, rest, prod, conf
      FROM tarefa ta
      JOIN tipo_tarefa tt ON tt.id = ta.tipo_tarefa_id AND tt.codigo = 'ENTR-ARMZ'
      JOIN movimento_entrada_item mei ON mei.id = ta.id_documento_origem
      JOIN movimento_entrada me ON me.id = mei.movimento_entrada_id
     WHERE ta.status IN ('CRIADA', 'EM_ANDAMENTO')
       AND ta.quantidade_requerida - COALESCE(ta.quantidade_executada, 0) >= 3
       AND EXISTS (SELECT 1 FROM tarefa tc JOIN tipo_tarefa x ON x.id = tc.tipo_tarefa_id AND x.codigo = 'ENTR-CONF'
                    WHERE tc.id_documento_origem = ta.id_documento_origem AND tc.status <> 'CANCELADA')
       AND NOT EXISTS (SELECT 1 FROM tarefa tc2 JOIN tarefa_execucao te2 ON te2.tarefa_id = tc2.id
                        JOIN hu_item hi2 ON hi2.tarefa_execucao_id = te2.id
                        WHERE tc2.id_documento_origem = ta.id_documento_origem)
     ORDER BY ta.id LIMIT 1;
    IF armz IS NULL THEN RAISE EXCEPTION 'QA: sem tarefa de armazenagem pendente com conferência'; END IF;
    val := CASE WHEN (SELECT tipo_controle::text FROM produto WHERE id = prod) = 'VALIDADE' THEN current_date + 3650 END;

    SELECT e.id INTO endp FROM endereco e
     WHERE e.tenant_id = t AND e.armazem_id = arm AND e.tipo_endereco = 'PULMAO' AND e.situacao::text NOT LIKE 'BLOQ%'
     ORDER BY e.id LIMIT 1;
    IF endp IS NULL THEN RAISE EXCEPTION 'QA: sem endereço de pulmão livre no armazém'; END IF;
    SELECT e.id INTO endp2 FROM endereco e
     WHERE e.tenant_id = t AND e.armazem_id = arm AND e.id <> endp ORDER BY e.id LIMIT 1;

    SELECT u.id, u.auth_user_id INTO ua, ua_auth FROM usuario u
     WHERE u.tenant_id = t AND u.auth_user_id IS NOT NULL
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.hus', 'CREATE')
       AND fn_usuario_tem_permissao(u.id, 'coletor.armazenagem', 'EXECUTE')
       AND fn_usuario_tem_permissao(u.id, 'coletor.recebimento', 'EXECUTE')
     LIMIT 1;
    IF ua IS NULL THEN RAISE EXCEPTION 'QA: sem usuário com permissão em HU, recebimento e armazenagem'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua_auth, 'role', 'authenticated')::text, true);

    -- Massa: HU com 2 unidades do item vindas da conferência
    r := rpc_hu_gerar(2, 'PALLET', 'M', emp, arm);
    h1 := (r->'hus'->0->>'hu_id')::uuid; c1 := r->'hus'->0->>'codigo_hu';
    h2 := (r->'hus'->1->>'hu_id')::uuid;
    r := finalizar_conferencia_entrada_item(conf, ua, 2, 'QA-H2', val, NULL, h1);
    IF NOT (r->>'sucesso')::boolean THEN RAISE EXCEPTION 'QA: conferência na HU falhou: %', r; END IF;

    -- A01 resumo da HU para o coletor
    r := rpc_coletor_hu_armazenagem(c1);
    v_res := v_res || jsonb_build_object('caso', 'A01 resumo: 1 item liberado, pode armazenar',
      'ok', (r->>'pode_armazenar')::boolean AND jsonb_array_length(r->'itens') = 1, 'retorno', COALESCE(r->>'motivo', 'ok'));

    -- A02 avulso não leva a quantidade que está na HU
    r := finalizar_armazenagem(t, armz, mov, ua, rest, endp, 'QA-H2', val, NULL, NULL, NULL, NULL, NULL);
    v_res := v_res || jsonb_build_object('caso', 'A02 avulso com a quantidade da HU recusa (ITEM_EM_HU)',
      'ok', r->>'codigo' = 'ITEM_EM_HU' AND (r->'dados'->>'restante_avulso')::numeric = rest - 2, 'retorno', r->>'codigo');

    -- A03 p_hu direto em finalizar_armazenagem recusa
    r := finalizar_armazenagem(t, armz, mov, ua, 2, endp, 'QA-H2', val, NULL, h1, NULL, NULL, NULL);
    v_res := v_res || jsonb_build_object('caso', 'A03 finalizar_armazenagem com p_hu fora da HU recusa',
      'ok', r->>'codigo' = 'ARMAZENAR_PELA_HU', 'retorno', r->>'codigo');

    -- A04 armazenar a HU inteira no pulmão
    SELECT COALESCE(quantidade_executada, 0) INTO exec_antes FROM tarefa WHERE id = armz;
    r := rpc_coletor_armazenar_hu(h1, endp);
    SELECT COALESCE(sum(quantidade_total), 0) INTO v_n FROM estoque_geral WHERE hu_id = h1 AND endereco_id = endp;
    ok := (r->>'sucesso')::boolean AND r->>'status' = 'ARMAZENADA' AND v_n = 2
      AND (SELECT status::text || '|' || endereco_id::text FROM hu WHERE id = h1) = 'ARMAZENADA|' || endp::text
      AND (SELECT quantidade_executada FROM tarefa WHERE id = armz) = exec_antes + 2
      AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h1 AND evento = 'FECHADA' AND observacao = 'Fechada na armazenagem')
      AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h1 AND evento = 'ARMAZENADA');
    v_res := v_res || jsonb_build_object('caso', 'A04 HU inteira no pulmão: estoque com HU, HU Armazenada no endereço',
      'ok', ok, 'retorno', COALESCE(r->>'mensagem', r::text));

    -- A05 de novo recusa
    r := rpc_coletor_armazenar_hu(h1, endp);
    v_res := v_res || jsonb_build_object('caso', 'A05 armazenar HU já armazenada recusa', 'ok', r->>'codigo' = 'HU_JA_ARMAZENADA', 'retorno', r->>'codigo');

    -- A06 depois da HU armazenada, o avulso volta a valer para o restante
    r := finalizar_armazenagem(t, armz, mov, ua, 1, endp, 'QA-H2', val, NULL, NULL, NULL, NULL, NULL);
    v_res := v_res || jsonb_build_object('caso', 'A06 avulso do restante segue funcionando', 'ok', (r->>'sucesso')::boolean, 'retorno', COALESCE(r->>'codigo', r->>'resultado'));

    -- A07 HU vazia / sem item liberado não armazena
    r := rpc_coletor_armazenar_hu(h2, endp);
    v_res := v_res || jsonb_build_object('caso', 'A07 HU vazia recusa', 'ok', r->>'codigo' = 'HU_VAZIA', 'retorno', r->>'codigo');

    -- A08 saldo da HU todo em outro endereço → endereço da HU atualizado (MOVIDA); esgotado → Desmontada (D5)
    UPDATE estoque_geral SET endereco_id = endp2 WHERE hu_id = h1;
    ok := (SELECT endereco_id FROM hu WHERE id = h1) = endp2 AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h1 AND evento = 'MOVIDA');
    UPDATE estoque_geral SET quantidade_total = 0, quantidade_disponivel = 0 WHERE hu_id = h1;
    ok := ok AND (SELECT status::text FROM hu WHERE id = h1) = 'DESMONTADA'
            AND EXISTS (SELECT 1 FROM hu_evento WHERE hu_id = h1 AND evento = 'DESMONTADA');
    v_res := v_res || jsonb_build_object('caso', 'A08 estoque move → MOVIDA; esgota → Desmontada', 'ok', ok);

    -- A09 armazenagem automática desmonta as HUs do movimento
    r := finalizar_conferencia_entrada_item(conf, ua, 1, 'QA-H2', val, NULL, h2);
    PERFORM _fn_hu_desmontar_movimento_automatico(t, mov, ua);
    v_res := v_res || jsonb_build_object('caso', 'A09 armazenagem automática deixa a HU Desmontada',
      'ok', (SELECT status::text FROM hu WHERE id = h2) = 'DESMONTADA', 'retorno', (SELECT status::text FROM hu WHERE id = h2));

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

REVOKE ALL ON FUNCTION qa.fn_teste_hu_h2() FROM PUBLIC, anon, authenticated;
