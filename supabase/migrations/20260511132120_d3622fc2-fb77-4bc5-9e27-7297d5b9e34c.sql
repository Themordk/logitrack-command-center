
GRANT ALL ON middleware.omie_config   TO service_role;
GRANT ALL ON middleware.id_map        TO service_role;
GRANT ALL ON middleware.sync_config   TO service_role;
GRANT ALL ON middleware.sync_log      TO service_role;
GRANT ALL ON middleware.sync_queue    TO service_role;
GRANT ALL ON middleware.return_queue  TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA middleware TO service_role;

DROP VIEW IF EXISTS middleware.omie_config_public;
CREATE VIEW middleware.omie_config_public AS
  SELECT id, tenant_id, empresa_id, app_key, omie_base_url, ativo,
         (app_secret IS NOT NULL AND length(app_secret) > 0) AS has_secret,
         created_at, updated_at
  FROM middleware.omie_config
  WHERE public.user_has_empresa_access(tenant_id, empresa_id);

GRANT SELECT ON middleware.omie_config_public TO authenticated;

NOTIFY pgrst, 'reload config';
