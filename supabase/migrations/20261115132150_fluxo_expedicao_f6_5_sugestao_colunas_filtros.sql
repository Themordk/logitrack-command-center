-- F6.5 · 2026-11-12: grid de ondas da Montagem de Carga com pedidos, rota (onda ou parceiro), cidade, bairro e id do tipo de saída
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.carga_sugerir(uuid,uuid)'::regprocedure);
  n := replace(d, 'LEFT JOIN parceiro p ON p.id = ds.parceiro_id WHERE msd.movimento_saida_id = e.id) AS parceiros',
'LEFT JOIN parceiro p ON p.id = ds.parceiro_id WHERE msd.movimento_saida_id = e.id) AS parceiros,
           e.tipo_saida AS tipo_saida_id,
           (SELECT string_agg(ds.numero_pedido::text, '', '' ORDER BY ds.numero_pedido)
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
             WHERE msd.movimento_saida_id = e.id) AS pedidos,
           (SELECT string_agg(DISTINCT NULLIF(btrim(p.cidade), '''') || COALESCE(''/'' || NULLIF(btrim(p.estado), ''''), ''''), '', '')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              JOIN parceiro p ON p.id = ds.parceiro_id WHERE msd.movimento_saida_id = e.id) AS cidades,
           (SELECT string_agg(DISTINCT NULLIF(btrim(p.bairro), ''''), '', '')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              JOIN parceiro p ON p.id = ds.parceiro_id WHERE msd.movimento_saida_id = e.id) AS bairros,
           (SELECT string_agg(DISTINCT rp.descricao, '', '')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              JOIN parceiro p ON p.id = ds.parceiro_id JOIN rotas rp ON rp.id = p.rota_id
             WHERE msd.movimento_saida_id = e.id) AS rotas_parceiros');
  n := replace(n, '''rota'', rota, ''tipo_saida'', tipo_saida, ''parceiros'', parceiros,',
                  '''rota'', COALESCE(rota, rotas_parceiros), ''tipo_saida'', tipo_saida, ''tipo_saida_id'', tipo_saida_id, ''parceiros'', parceiros,
           ''pedidos'', pedidos, ''cidades'', cidades, ''bairros'', bairros,');
  IF position('rotas_parceiros' IN n) = 0 OR position('''bairros'', bairros' IN n) = 0 THEN RAISE EXCEPTION 'carga_sugerir: padrão não encontrado'; END IF;
  EXECUTE n;
END $$;