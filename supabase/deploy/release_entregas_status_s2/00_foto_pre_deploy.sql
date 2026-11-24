-- Foto da PRODUÇÃO antes do deploy (somente leitura). Guardar o resultado no registro do deploy.
-- Hashes esperados em 24/11/2026 (conferidos): se algum mudar, PARAR e reavaliar o splice.
SELECT f, md5(pg_get_functiondef(f::regprocedure)) AS hash, e AS esperado,
       md5(pg_get_functiondef(f::regprocedure)) = e AS ok
FROM (VALUES
  ('public.fn_gerar_conferencia_saida(uuid,uuid)', '4c57438aa2e8ff14e4f9a57acb0931d3'),
  ('public.listar_movimentos_entrada(uuid,uuid,text,date,date,numeric,text,uuid,text,uuid,text,integer,integer,text)', '38431ef0cb80f221729cd1f3bd7dc885'),
  ('public.rpc_movimento_entrada_detalhe(uuid,text)', 'e918ec11b95d66c7ac69bc0fee981eee'),
  ('public.rpc_onda_carregamento_detalhe(uuid,text)', '202357214fc7a77dfe25b4189ba32523'),
  ('public.rpc_ondas_carregamento_lista(uuid,text,date,date,bigint,bigint,uuid,text,text,text,integer,integer,text,text)', '3d51f41ae2f38384fe9bef1e98c7f989'),
  ('public.rpc_painel_tv_operacional(text)', '7027af4fbdc62fc6156bb43aac5302df'),
  ('public.fn_cancelar_documento_entrada(uuid,uuid,uuid,text,text,text)', 'ad15662d2b0cbb8b6693281550ebd656'),
  ('public.fn_seed_rbac_para_tenant(uuid)', 'f5a92a1fac4fb155e03aaa54f81933dd')
) v(f, e);

SELECT json_build_object(
  'docs_saida', (SELECT count(*) FROM documento_saida),
  'ondas_por_status', (SELECT json_object_agg(status, n) FROM (SELECT status::text, count(*) n FROM movimento_saida GROUP BY 1) x),
  'entradas_por_status', (SELECT json_object_agg(status, n) FROM (SELECT status::text, count(*) n FROM movimento_entrada GROUP BY 1) x),
  'onda_1970', (SELECT status FROM movimento_saida WHERE numero_onda = 1970),
  'cargas_abertas', (SELECT count(*) FROM carga WHERE status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO')),
  'ultima_migration', (SELECT max(version) FROM supabase_migrations.schema_migrations)
);
