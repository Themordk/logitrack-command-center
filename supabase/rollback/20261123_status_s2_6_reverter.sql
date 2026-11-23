-- Reverte a S2.6 (integração por documento na tela de Ondas). Rodar antes do reverter da S2.
DO $rb$
DECLARE v_def text; v_novo text;
BEGIN
  v_def := pg_get_functiondef('public.rpc_onda_carregamento_detalhe(uuid,text)'::regprocedure);
  IF position('fn_documento_integracao_json' in v_def) > 0 THEN
    v_novo := replace(v_def,
      ' || jsonb_build_object(''integracao'', integracao.fn_documento_integracao_json(''documento_saida'', v.documento_saida_id))', '');
    IF position('fn_documento_integracao_json' in v_novo) > 0 THEN RAISE EXCEPTION 'S2.6 rollback: detalhe não revertido'; END IF;
    EXECUTE v_novo;
  END IF;

  v_def := pg_get_functiondef('public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text)'::regprocedure);
  IF position('integracao_docs_erro' in v_def) > 0 THEN
    v_novo := replace(v_def, ', integracao_docs_erro integer)', ')');
    v_novo := regexp_replace(v_novo, ',\s*\(select count\(\*\)::integer\s+from public\.movimento_saida_documento msd.*?as integracao_docs_erro', '', 's');
    IF position('integracao_docs_erro' in v_novo) > 0 THEN RAISE EXCEPTION 'S2.6 rollback: lista não revertida'; END IF;
    DROP FUNCTION public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text);
    EXECUTE v_novo;
    REVOKE ALL ON FUNCTION public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text) TO authenticated, service_role;
  END IF;
END
$rb$;
