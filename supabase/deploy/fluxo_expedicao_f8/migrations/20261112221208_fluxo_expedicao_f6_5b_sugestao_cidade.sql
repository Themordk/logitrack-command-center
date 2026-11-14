DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.carga_sugerir(uuid,uuid)'::regprocedure);
  n := replace(d, 'string_agg(DISTINCT NULLIF(btrim(p.cidade), '''') || COALESCE(''/'' || NULLIF(btrim(p.estado), ''''), ''''), '', '')',
                  'string_agg(DISTINCT NULLIF(btrim(p.cidade), ''''), '', '')');
  IF n = d THEN RAISE EXCEPTION 'carga_sugerir: padrão não encontrado'; END IF;
  EXECUTE n;
END $$;