-- Loop robusto para inserir o guard logo após "BEGIN" (qualquer formato)
DO $migrate$
DECLARE
  rec RECORD;
  v_def text;
  v_new_sql text;
  v_count int;
BEGIN
  FOR rec IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'fn_seed_rbac_para_tenant',
        'fn_gerar_abastecimento',
        'gerar_tarefas_conferencia_entrada',
        'rpc_coletor_armazenagem_execucao',
        'separacao_executar_coleta'
      )
  LOOP
    v_def := pg_get_functiondef(rec.oid);

    IF v_def ILIKE '%assert_tenant_match(p_tenant_id)%' THEN
      CONTINUE;
    END IF;

    -- Casa "BEGIN" sozinho em uma linha (com espaços/tabs antes), case-insensitive
    -- e injeta o PERFORM logo após
    v_new_sql := regexp_replace(
      v_def,
      '(^|[\r\n])([ \t]*)(BEGIN)([\s;])',
      E'\\1\\2\\3\n  PERFORM public.assert_tenant_match(p_tenant_id);\\4',
      'i'
    );

    -- Se nada mudou, tenta padrão sem newline (BEGIN colado em $function$)
    IF v_new_sql = v_def THEN
      v_new_sql := regexp_replace(
        v_def,
        '(\$function\$)([\s]*)(DECLARE[\s\S]*?\n)(BEGIN)',
        E'\\1\\2\\3\\4\n  PERFORM public.assert_tenant_match(p_tenant_id);',
        'i'
      );
    END IF;

    -- Última tentativa: AS $function$BEGIN
    IF v_new_sql = v_def THEN
      v_new_sql := regexp_replace(
        v_def,
        '(\$function\$)([\s]*)(BEGIN)',
        E'\\1\\2\\3\n  PERFORM public.assert_tenant_match(p_tenant_id);',
        'i'
      );
    END IF;

    IF v_new_sql <> v_def THEN
      EXECUTE v_new_sql;
      RAISE NOTICE 'Guard injetado em %(%)', rec.proname, rec.args;
    ELSE
      RAISE WARNING 'NÃO foi possível injetar guard em %(%)', rec.proname, rec.args;
    END IF;
  END LOOP;
END;
$migrate$;