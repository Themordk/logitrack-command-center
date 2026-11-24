-- Plano de status · S2.7 (24/11/2026) — Movimentos de Entrada: integração por documento (igual às Ondas, S2.6).
-- 1) listar_movimentos_entrada ganha integracao_resumo e integracao_docs_erro (NFs do recebimento com
--    integracao_estado = 'erro'); a tela deixa de ler movimento_entrada direto para o resumo.
-- 2) rpc_movimento_entrada_detalhe, seção informacoes: cada documento vinculado ganha 'integracao'
--    (integracao.fn_documento_integracao_json('documento_entrada', id)).
DO $mig$
DECLARE
  v_sig  text := 'public.listar_movimentos_entrada(uuid,uuid,text,date,date,numeric,text,uuid,text,uuid,text,integer,integer,text)';
  v_def  text;
  v_novo text;
BEGIN
  -- 1) Lista ---------------------------------------------------------------------------------
  v_def := pg_get_functiondef(v_sig::regprocedure);
  IF position('integracao_docs_erro' in v_def) = 0 THEN
    IF position('total_registros bigint)' in v_def) = 0
       OR (SELECT count(*) FROM regexp_matches(v_def, '\(SELECT total FROM contagem\)', 'g')) <> 1 THEN
      RAISE EXCEPTION 'S2.7: âncora de listar_movimentos_entrada não encontrada';
    END IF;
    v_novo := replace(v_def, 'total_registros bigint)',
                      'total_registros bigint, integracao_resumo text, integracao_docs_erro integer)');
    v_novo := replace(v_novo, '(SELECT total FROM contagem)',
      '(SELECT total FROM contagem),
    (SELECT me_i.integracao_resumo FROM public.movimento_entrada me_i WHERE me_i.id = pg.id),
    (SELECT count(*)::integer
       FROM public.movimento_entrada_documento med_e
       JOIN public.documento_entrada de_e
         ON de_e.id = med_e.documento_entrada_id
        AND de_e.tenant_id = p_tenant_id
      WHERE med_e.movimento_entrada_id = pg.id
        AND de_e.integracao_estado = ''erro'')');
    EXECUTE 'DROP FUNCTION ' || v_sig;
    EXECUTE v_novo;
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_sig || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_sig || ' TO authenticated, service_role';
  END IF;

  -- 2) Detalhe · informações --------------------------------------------------------------------
  v_def := pg_get_functiondef('public.rpc_movimento_entrada_detalhe(uuid,text)'::regprocedure);
  IF position('fn_documento_integracao_json' in v_def) = 0 THEN
    IF (SELECT count(*) FROM regexp_matches(v_def, 'de\.qtd_volume,', 'g')) <> 1 THEN
      RAISE EXCEPTION 'S2.7: âncora de rpc_movimento_entrada_detalhe não encontrada';
    END IF;
    v_novo := replace(v_def, 'de.qtd_volume,',
      'de.qtd_volume,
             integracao.fn_documento_integracao_json(''documento_entrada'', de.id) as integracao,');
    EXECUTE v_novo;
  END IF;
END
$mig$;
