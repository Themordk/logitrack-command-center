-- Plano de status · S2.6 (23/11/2026) — Ondas de Carregamento: integração por documento.
-- 1) rpc_ondas_carregamento_lista ganha integracao_docs_erro (pedidos da onda com integracao_estado = 'erro').
-- 2) rpc_onda_carregamento_detalhe, seção informacoes: cada documento vinculado ganha 'integracao'
--    (integracao.fn_documento_integracao_json). Splices com conferência de âncora.
DO $mig$
DECLARE
  v_def  text;
  v_novo text;
BEGIN
  -- 1) Lista ---------------------------------------------------------------------------------
  v_def := pg_get_functiondef('public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text)'::regprocedure);
  IF position('integracao_docs_erro' in v_def) = 0 THEN
    IF position('entrega_nao_entregues integer)' in v_def) = 0
       OR v_def !~* 'ms\.entrega_resumo, ms\.entrega_total, ms\.entrega_entregues, ms\.entrega_nao_entregues' THEN
      RAISE EXCEPTION 'S2.6: âncora da rpc_ondas_carregamento_lista não encontrada';
    END IF;
    v_novo := replace(v_def, 'entrega_nao_entregues integer)', 'entrega_nao_entregues integer, integracao_docs_erro integer)');
    v_novo := regexp_replace(v_novo,
      'ms\.entrega_resumo, ms\.entrega_total, ms\.entrega_entregues, ms\.entrega_nao_entregues',
      'ms.entrega_resumo, ms.entrega_total, ms.entrega_entregues, ms.entrega_nao_entregues,
         (select count(*)::integer
            from public.movimento_saida_documento msd
            join public.documento_saida ds
              on ds.id = msd.documento_saida_id
             and ds.tenant_id = v_tenant
           where msd.movimento_saida_id = b.id
             and ds.integracao_estado = ''erro'') as integracao_docs_erro', 'i');
    DROP FUNCTION public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text);
    EXECUTE v_novo;
    REVOKE ALL ON FUNCTION public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text) TO authenticated, service_role;
  END IF;

  -- 2) Detalhe · informações --------------------------------------------------------------------
  v_def := pg_get_functiondef('public.rpc_onda_carregamento_detalhe(uuid,text)'::regprocedure);
  IF position('fn_documento_integracao_json' in v_def) = 0 THEN
    IF v_def !~* 'jsonb_agg\(to_jsonb\(v\) order by v\.ordem, v\.documento_saida_id\)' THEN
      RAISE EXCEPTION 'S2.6: âncora da rpc_onda_carregamento_detalhe não encontrada';
    END IF;
    v_novo := regexp_replace(v_def,
      'jsonb_agg\(to_jsonb\(v\) order by v\.ordem, v\.documento_saida_id\)',
      'jsonb_agg(to_jsonb(v) || jsonb_build_object(''integracao'', integracao.fn_documento_integracao_json(''documento_saida'', v.documento_saida_id)) order by v.ordem, v.documento_saida_id)', 'i');
    EXECUTE v_novo;
  END IF;
END
$mig$;
