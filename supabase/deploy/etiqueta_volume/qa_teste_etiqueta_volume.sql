-- Bateria de regressão da Etiqueta de Volume (A17) — SÓ QA. Tudo roda numa subtransação e é desfeito no fim.
-- Cobre: regras de geração (F2), NF × volumes (F3), conteúdo da etiqueta (F1/F3), tela Volumes (F4),
-- isolamento entre tenants, permissões e a trava contra geração duplicada.
-- Um segundo tenant (B) é criado dentro da subtransação só para os testes de isolamento.
-- Concorrência real (dois toques ao mesmo tempo) precisa de duas sessões; aqui a bateria confere as duas
-- garantias que a sustentam: a checagem VOLUMES_JA_GERADOS (com a onda travada por FOR UPDATE) e o índice
-- único por pedido/número de volume, que recusa a segunda inserção mesmo se a checagem fosse contornada.
-- Só a sequência volume_expedicao_codigo_seq avança (sequências não voltam no rollback): cada execução pula ~5 códigos VOL-.
-- Uso: SELECT qa.fn_teste_etiqueta_volume();   → {ok, falhas, casos[]} (esperado: 21 ok, 0 falhas)

CREATE SCHEMA IF NOT EXISTS qa;

CREATE OR REPLACE FUNCTION qa.fn_teste_etiqueta_volume()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_res    jsonb := '[]'::jsonb;
  t uuid; emp uuid; onda uuid; doc uuid; ts_onda uuid; ts_doc uuid; ped bigint;
  ua uuid; ua_auth uuid; tb uuid; eb uuid; ub_auth uuid := gen_random_uuid();
  r jsonb; v_n int; v_txt text; v_ids uuid[]; v_vol5 uuid;
  d jsonb;
  ok boolean;
BEGIN
  BEGIN
    -- Massa: onda com um único pedido, sem volumes e fora de carga ---------------------------------
    SELECT ms.id, ms.tenant_id, ms.empresa_id, msd.documento_saida_id, ms.tipo_saida, ds.tipo_pedido_id, ds.numero_pedido
      INTO onda, t, emp, doc, ts_onda, ts_doc, ped
      FROM movimento_saida ms
      JOIN movimento_saida_documento msd ON msd.movimento_saida_id = ms.id
      JOIN documento_saida ds ON ds.id = msd.documento_saida_id
     WHERE ms.tipo_saida IS NOT NULL AND ds.tipo_pedido_id IS NOT NULL
       AND (SELECT count(*) FROM movimento_saida_documento x WHERE x.movimento_saida_id = ms.id) = 1
       AND NOT EXISTS (SELECT 1 FROM volume_expedicao v WHERE v.movimento_saida_id = ms.id OR v.documento_saida_id = ds.id)
       AND NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.documento_saida_id = ds.id)
       AND NOT EXISTS (SELECT 1 FROM documento_saida_nf n WHERE n.documento_saida_id = ds.id)
     ORDER BY ms.created_at DESC LIMIT 1;
    IF onda IS NULL THEN RAISE EXCEPTION 'QA: sem onda de um pedido, sem volumes e fora de carga'; END IF;

    SELECT u.id, u.auth_user_id INTO ua, ua_auth FROM usuario u
     WHERE u.tenant_id = t AND u.auth_user_id IS NOT NULL
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.volumes', 'DELETE')
       AND fn_usuario_tem_permissao(u.id, 'web.atividades.volumes', 'CREATE')
     LIMIT 1;
    IF ua IS NULL THEN RAISE EXCEPTION 'QA: sem usuário com permissão total em Volumes'; END IF;

    -- Tenant B (só isolamento)
    INSERT INTO tenant (nome, slug) VALUES ('QA tenant B', 'qa-tenant-b-' || substr(md5(random()::text), 1, 8)) RETURNING id INTO tb;
    INSERT INTO empresa (tenant_id, razaosocial, cnpj) VALUES (tb, 'QA EMPRESA B', lpad((floor(random()*1e13))::bigint::text, 14, '0')) RETURNING id INTO eb;
    INSERT INTO usuario (tenant_id, empresa_id, login, nome, tipo_operacao, auth_user_id)
    SELECT tb, eb, 'qa.tenant.b', 'QA B', u.tipo_operacao, ub_auth FROM usuario u WHERE u.id = ua;

    -- Sessão do usuário A
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ua_auth, 'role', 'authenticated')::text, true);

    -- C01 tipo de saída sem volume
    UPDATE tipo_saida SET gera_volume_etapa = 'NENHUMA' WHERE id IN (ts_onda, ts_doc);
    r := gerar_volumes_expedicao(t, emp, onda, 3, 'CONFERÊNCIA');
    v_res := v_res || jsonb_build_object('caso', 'C01 tipo de saída sem volume recusa', 'ok', r->>'codigo' = 'TIPO_SAIDA_SEM_VOLUME', 'retorno', r->>'codigo');

    -- C02 etapa diferente da configurada
    UPDATE tipo_saida SET realiza_conferencia = true, gera_volume_etapa = 'CONFERÊNCIA', divergencia_volume_nf = 'BLOQUEAR'
     WHERE id IN (ts_onda, ts_doc);
    r := gerar_volumes_expedicao(t, emp, onda, 3, 'SEPARAÇÃO');
    v_res := v_res || jsonb_build_object('caso', 'C02 etapa diferente recusa', 'ok', r->>'codigo' = 'ETAPA_DIFERENTE', 'retorno', r->>'codigo');

    -- C03 quantidade fora de 1..999
    r := gerar_volumes_expedicao(t, emp, onda, 0, 'CONFERÊNCIA');
    v_txt := r->>'codigo';
    r := gerar_volumes_expedicao(t, emp, onda, 1000, 'CONFERÊNCIA');
    v_res := v_res || jsonb_build_object('caso', 'C03 quantidade 0 e 1000 recusadas',
      'ok', v_txt = 'QUANTIDADE_INVALIDA' AND r->>'codigo' = 'QUANTIDADE_INVALIDA', 'retorno', v_txt || ' / ' || (r->>'codigo'));

    -- C04 NF autorizada com 2 volumes, regra BLOQUEAR, gerando 3
    INSERT INTO documento_saida_nf (tenant_id, empresa_id, documento_saida_id, id_externo, numero_nf, serie, situacao, qtd_volumes, especie_volumes, data_emissao)
    VALUES (t, emp, doc, 'QA-NF-' || doc, '987654', '1', 'AUTORIZADA', 2, 'caixa', now());
    r := gerar_volumes_expedicao(t, emp, onda, 3, 'CONFERÊNCIA');
    SELECT count(*) INTO v_n FROM volume_expedicao WHERE movimento_saida_id = onda;
    v_res := v_res || jsonb_build_object('caso', 'C04 divergência com a NF bloqueia sem gerar nada',
      'ok', r->>'codigo' = 'VOLUMES_DIVERGEM_NF' AND v_n = 0, 'retorno', (r->>'codigo') || ' volumes=' || v_n);

    -- C05 regra AVISAR: gera 3 e devolve o aviso no formato {codigo, mensagem}
    UPDATE tipo_saida SET divergencia_volume_nf = 'AVISAR' WHERE id IN (ts_onda, ts_doc);
    r := gerar_volumes_expedicao(t, emp, onda, 3, 'CONFERÊNCIA');
    SELECT count(*) INTO v_n FROM volume_expedicao WHERE movimento_saida_id = onda;
    v_res := v_res || jsonb_build_object('caso', 'C05 AVISAR gera e devolve aviso',
      'ok', (r->>'sucesso')::boolean AND v_n = 3
            AND r->'avisos'->0->>'codigo' = 'VOLUMES_DIVERGEM_NF' AND length(r->'avisos'->0->>'mensagem') > 10,
      'retorno', jsonb_build_object('codigo', r->>'codigo', 'volumes', v_n, 'avisos', r->'avisos'));

    -- C06 numeração 1..3, códigos únicos no formato VOL-000000
    SELECT array_agg(id ORDER BY numero_volume) INTO v_ids FROM volume_expedicao WHERE movimento_saida_id = onda;
    SELECT (array_agg(numero_volume::int ORDER BY numero_volume) = ARRAY[1,2,3])
           AND count(DISTINCT codigo_volume) = 3 AND bool_and(codigo_volume ~ '^VOL-[0-9]{6,}$')
           AND bool_and(status::text = 'ABERTO') AND bool_and(documento_saida_id = doc)
      INTO ok FROM volume_expedicao WHERE movimento_saida_id = onda;
    v_res := v_res || jsonb_build_object('caso', 'C06 numeração e códigos', 'ok', ok);

    -- C07 conteúdo da etiqueta (fonte única)
    SELECT dados INTO d FROM _fn_etiqueta_volume_dados(t, ARRAY[v_ids[1]]);
    v_res := v_res || jsonb_build_object('caso', 'C07 etiqueta do volume 1: identificação, pedido e NF',
      'ok', d->>'identificacao_volume' = '01/03' AND d->>'numero_volume' = '01' AND d->>'total_volumes' = '03'
            AND d->>'pedido' = ped::text AND d->>'nota_fiscal' = '987654-1' AND d->>'nf_qtd_volumes' = '2'
            AND d->>'nf_especie_volumes' = 'CAIXA' AND d ? 'codigo_volume' AND d ? 'data_hora',
      'retorno', d);
    SELECT dados INTO d FROM fn_etiqueta_volume_dados(ARRAY[v_ids[3]]);
    v_res := v_res || jsonb_build_object('caso', 'C08 etiqueta pela função pública (sessão A) do volume 3',
      'ok', d->>'identificacao_volume' = '03/03', 'retorno', d->>'identificacao_volume');

    -- C09 segunda geração (toque duplo) recusada
    r := gerar_volumes_expedicao(t, emp, onda, 3, 'CONFERÊNCIA');
    SELECT count(*) INTO v_n FROM volume_expedicao WHERE movimento_saida_id = onda;
    v_res := v_res || jsonb_build_object('caso', 'C09 segunda geração recusada',
      'ok', r->>'codigo' = 'VOLUMES_JA_GERADOS' AND v_n = 3, 'retorno', (r->>'codigo') || ' volumes=' || v_n);

    -- C10 índice único recusa número repetido no mesmo pedido (garantia contra corrida)
    BEGIN
      INSERT INTO volume_expedicao (tenant_id, empresa_id, movimento_saida_id, documento_saida_id, codigo_volume, numero_volume, status)
      VALUES (t, emp, onda, doc, 'VOL-QA-DUP', 2, 'ABERTO');
      v_res := v_res || jsonb_build_object('caso', 'C10 número repetido recusado pelo índice', 'ok', false, 'retorno', 'inseriu');
    EXCEPTION WHEN unique_violation THEN
      v_res := v_res || jsonb_build_object('caso', 'C10 número repetido recusado pelo índice', 'ok', true);
    END;

    -- C11 acrescentar: motivo curto recusado; 2 volumes continuam a numeração (4 e 5)
    r := rpc_volume_acrescentar(onda, doc, 2, 'abc');
    v_txt := r->>'codigo';
    r := rpc_volume_acrescentar(onda, doc, 2, 'QA acrescentar volumes');
    SELECT array_agg(numero_volume::int ORDER BY numero_volume) = ARRAY[1,2,3,4,5] INTO ok FROM volume_expedicao WHERE movimento_saida_id = onda;
    SELECT id INTO v_vol5 FROM volume_expedicao WHERE movimento_saida_id = onda AND numero_volume = 5;
    SELECT dados INTO d FROM _fn_etiqueta_volume_dados(t, ARRAY[v_vol5]);
    v_res := v_res || jsonb_build_object('caso', 'C11 acrescentar continua a numeração e atualiza o total',
      'ok', v_txt = 'MOTIVO_OBRIGATORIO' AND (r->>'sucesso')::boolean AND ok AND d->>'identificacao_volume' = '05/05'
            AND r->'avisos'->0->>'codigo' = 'VOLUMES_DIVERGEM_NF',
      'retorno', jsonb_build_object('curto', v_txt, 'codigo', r->>'codigo', 'etiqueta5', d->>'identificacao_volume'));

    -- C12 lista filtrando pelo pedido
    r := rpc_volumes_listar(NULL, jsonb_build_object('pedido', ped::text), 1, 50);
    v_res := v_res || jsonb_build_object('caso', 'C12 lista filtra pelo pedido',
      'ok', (r->>'sucesso')::boolean AND (r->'dados'->>'total')::int = 5
            AND (SELECT bool_and((x->>'nf_divergente')::boolean) FROM jsonb_array_elements(r->'dados'->'linhas') x),
      'retorno', r->'dados'->'total');

    -- C13 cancelar: motivo curto recusado; cancelado sai da lista ativa e vai para o arquivo
    r := fn_cancelar_volume_expedicao(v_vol5, 'abc');
    v_txt := r->>'codigo';
    r := fn_cancelar_volume_expedicao(v_vol5, 'QA cancelamento do volume');
    SELECT count(*) INTO v_n FROM volume_expedicao WHERE id = v_vol5;
    ok := v_txt = 'MOTIVO_OBRIGATORIO' AND (r->>'sucesso')::boolean AND v_n = 0
          AND EXISTS (SELECT 1 FROM volume_expedicao_cancelado c WHERE c.id = v_vol5);
    r := rpc_volumes_listar(NULL, jsonb_build_object('status', 'CANCELADO', 'pedido', ped::text), 1, 50);
    ok := ok AND (r->>'sucesso')::boolean AND (r->'dados'->>'total')::int = 1;
    r := rpc_volume_detalhe(v_vol5);
    v_res := v_res || jsonb_build_object('caso', 'C13 cancelar arquiva e o detalhe continua disponível',
      'ok', ok AND (r->>'sucesso')::boolean, 'retorno', jsonb_build_object('curto', v_txt, 'detalhe', r->>'codigo'));

    -- C14 RLS como authenticated (A vê os 4 volumes da onda)
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM volume_expedicao WHERE movimento_saida_id = onda;
    EXECUTE 'RESET ROLE';
    v_res := v_res || jsonb_build_object('caso', 'C14 RLS: usuário A vê os volumes do seu tenant', 'ok', v_n = 4, 'retorno', v_n);

    -- Sessão do usuário B (outro tenant, sem perfil) ------------------------------------------------
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ub_auth, 'role', 'authenticated')::text, true);

    BEGIN
      r := gerar_volumes_expedicao(t, emp, onda, 3, 'CONFERÊNCIA');
      v_res := v_res || jsonb_build_object('caso', 'C15 B não gera volumes no tenant A', 'ok', false, 'retorno', r);
    EXCEPTION WHEN insufficient_privilege THEN
      v_res := v_res || jsonb_build_object('caso', 'C15 B não gera volumes no tenant A', 'ok', true);
    END;

    SELECT count(*) INTO v_n FROM fn_etiqueta_volume_dados(v_ids);
    SELECT v_n + count(*) INTO v_n FROM _fn_etiqueta_volume_dados(tb, v_ids);
    v_res := v_res || jsonb_build_object('caso', 'C16 B não lê dados de etiqueta do tenant A', 'ok', v_n = 0, 'retorno', v_n);

    r := rpc_volume_detalhe(v_ids[1]);
    v_txt := r->>'codigo';
    r := rpc_volumes_listar(NULL, '{}'::jsonb, 1, 50);
    v_res := v_res || jsonb_build_object('caso', 'C17 B sem permissão em Volumes: detalhe e lista recusados',
      'ok', v_txt = 'SEM_PERMISSAO' AND r->>'codigo' = 'SEM_PERMISSAO', 'retorno', v_txt || ' / ' || (r->>'codigo'));

    r := rpc_volume_acrescentar(onda, doc, 1, 'QA tentativa de B');
    v_txt := r->>'codigo';
    r := fn_cancelar_volume_expedicao(v_ids[1], 'QA tentativa de B');
    v_res := v_res || jsonb_build_object('caso', 'C18 B não acrescenta nem cancela volumes do tenant A',
      'ok', v_txt = 'SEM_PERMISSAO' AND r->>'codigo' = 'SEM_PERMISSAO', 'retorno', v_txt || ' / ' || (r->>'codigo'));

    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO v_n FROM volume_expedicao WHERE id = ANY(v_ids);
    SELECT v_n + count(*) INTO v_n FROM vw_volume_expedicao_lista WHERE id = ANY(v_ids);
    SELECT v_n + count(*) INTO v_n FROM volume_expedicao_cancelado WHERE id = v_vol5;
    EXECUTE 'RESET ROLE';
    v_res := v_res || jsonb_build_object('caso', 'C19 RLS: B não vê volumes, lista nem cancelados do tenant A', 'ok', v_n = 0, 'retorno', v_n);

    -- Sem sessão --------------------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claims', '{}', true);
    r := rpc_volumes_listar(NULL, '{}'::jsonb, 1, 50);
    SELECT count(*) INTO v_n FROM fn_etiqueta_volume_dados(v_ids);
    v_res := v_res || jsonb_build_object('caso', 'C20 sem sessão: lista recusada e etiqueta vazia',
      'ok', r->>'codigo' = 'SEM_SESSAO' AND v_n = 0, 'retorno', (r->>'codigo') || ' etiquetas=' || v_n);

    -- C21 privilégios: anon não executa as RPCs; ninguém da API chama as funções internas
    ok := NOT has_function_privilege('anon', 'public.rpc_volumes_listar(uuid, jsonb, integer, integer)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.fn_cancelar_volume_expedicao(uuid, text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_volume_imprimir(uuid[], uuid, uuid, uuid, integer, text)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public._fn_volume_contexto(text)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public._fn_etiqueta_volume_dados(uuid, uuid[])', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.fn_etiqueta_volume_dados(uuid[])', 'EXECUTE')
      AND NOT has_table_privilege('authenticated', 'public.volume_expedicao_cancelado', 'INSERT')
      AND NOT has_table_privilege('authenticated', 'public.volume_expedicao_cancelado', 'DELETE');
    v_res := v_res || jsonb_build_object('caso', 'C21 privilégios de API', 'ok', ok);

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

REVOKE ALL ON FUNCTION qa.fn_teste_etiqueta_volume() FROM PUBLIC, anon, authenticated;
