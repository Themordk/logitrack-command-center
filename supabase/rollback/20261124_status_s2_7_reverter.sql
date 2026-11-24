-- Reverte a S2.7 (integração por documento em Movimentos de Entrada).
DO $rb$
DECLARE
  v_sig  text := 'public.listar_movimentos_entrada(uuid,uuid,text,date,date,numeric,text,uuid,text,uuid,text,integer,integer,text)';
  v_def text; v_novo text;
BEGIN
  v_def := pg_get_functiondef('public.rpc_movimento_entrada_detalhe(uuid,text)'::regprocedure);
  IF position('fn_documento_integracao_json' in v_def) > 0 THEN
    v_novo := replace(v_def, '
             integracao.fn_documento_integracao_json(''documento_entrada'', de.id) as integracao,', '');
    IF position('fn_documento_integracao_json' in v_novo) > 0 THEN RAISE EXCEPTION 'S2.7 rollback: detalhe'; END IF;
    EXECUTE v_novo;
  END IF;

  v_def := pg_get_functiondef(v_sig::regprocedure);
  IF position('integracao_docs_erro' in v_def) > 0 THEN
    v_novo := replace(v_def, ', integracao_resumo text, integracao_docs_erro integer)', ')');
    v_novo := regexp_replace(v_novo, '\(SELECT total FROM contagem\),\s*\(SELECT me_i\.integracao_resumo.*?integracao_estado = ''erro''\)', '(SELECT total FROM contagem)', 's');
    IF position('integracao_docs_erro' in v_novo) > 0 OR position('me_i.' in v_novo) > 0 THEN RAISE EXCEPTION 'S2.7 rollback: lista'; END IF;
    EXECUTE 'DROP FUNCTION ' || v_sig;
    EXECUTE v_novo;
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_sig || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_sig || ' TO authenticated, service_role';
  END IF;
END
$rb$;
