-- F6.1b · 2026-11-12: parceiro é transportador quando eh_transportador OU tipo_parceiro = TRANSPORTADOR
-- (o cadastro web grava só tipo_parceiro; a sincronização do ERP grava os dois).
-- Reversão: trocar de volta o trecho nas 3 funções (ou reaplicar a F6.1).
DO $$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public._fn_carga_doc_transportadora(uuid)',
                           'public.carga_transportadoras(uuid,uuid)',
                           'public.carga_montar(uuid,uuid,uuid,uuid,uuid[],uuid,uuid,text,text,text,uuid,text,text)'] LOOP
    d := pg_get_functiondef(f::regprocedure);
    IF position('p.eh_transportador' IN d) = 0 THEN RAISE EXCEPTION 'padrão não encontrado em %', f; END IF;
    d := replace(d, 'p.eh_transportador', '(p.eh_transportador OR p.tipo_parceiro::text = ''TRANSPORTADOR'')');
    EXECUTE d;
  END LOOP;
END $$;
