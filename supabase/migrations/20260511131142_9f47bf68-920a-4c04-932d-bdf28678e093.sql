
-- 1. Expose middleware schema
GRANT USAGE ON SCHEMA middleware TO anon, authenticated, service_role;

-- Helper: current user's tenant + company access
CREATE OR REPLACE FUNCTION public.user_has_empresa_access(_tenant uuid, _empresa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario u
    WHERE u.auth_user_id = auth.uid()
      AND u.tenant_id = _tenant
      AND u.empresa_id = _empresa
      AND u.ativo = true
  );
$$;

-- 2. RLS on middleware tables
ALTER TABLE middleware.omie_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE middleware.sync_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE middleware.sync_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE middleware.sync_queue    ENABLE ROW LEVEL SECURITY;
ALTER TABLE middleware.return_queue  ENABLE ROW LEVEL SECURITY;
ALTER TABLE middleware.id_map        ENABLE ROW LEVEL SECURITY;

-- omie_config: deny all direct access from clients (handled via edge functions / view)
DROP POLICY IF EXISTS "omie_config_no_direct_access" ON middleware.omie_config;
CREATE POLICY "omie_config_no_direct_access" ON middleware.omie_config
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- sync_config
DROP POLICY IF EXISTS "sync_config_select" ON middleware.sync_config;
CREATE POLICY "sync_config_select" ON middleware.sync_config
  FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(tenant_id, empresa_id));
DROP POLICY IF EXISTS "sync_config_insert" ON middleware.sync_config;
CREATE POLICY "sync_config_insert" ON middleware.sync_config
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_empresa_access(tenant_id, empresa_id));
DROP POLICY IF EXISTS "sync_config_update" ON middleware.sync_config;
CREATE POLICY "sync_config_update" ON middleware.sync_config
  FOR UPDATE TO authenticated
  USING (public.user_has_empresa_access(tenant_id, empresa_id))
  WITH CHECK (public.user_has_empresa_access(tenant_id, empresa_id));

-- sync_log (read-only para usuários)
DROP POLICY IF EXISTS "sync_log_select" ON middleware.sync_log;
CREATE POLICY "sync_log_select" ON middleware.sync_log
  FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(tenant_id, empresa_id));

-- sync_queue / return_queue (read + update para reprocess/discard)
DROP POLICY IF EXISTS "sync_queue_select" ON middleware.sync_queue;
CREATE POLICY "sync_queue_select" ON middleware.sync_queue
  FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(tenant_id, empresa_id));
DROP POLICY IF EXISTS "sync_queue_update" ON middleware.sync_queue;
CREATE POLICY "sync_queue_update" ON middleware.sync_queue
  FOR UPDATE TO authenticated
  USING (public.user_has_empresa_access(tenant_id, empresa_id))
  WITH CHECK (public.user_has_empresa_access(tenant_id, empresa_id));

DROP POLICY IF EXISTS "return_queue_select" ON middleware.return_queue;
CREATE POLICY "return_queue_select" ON middleware.return_queue
  FOR SELECT TO authenticated
  USING (public.user_has_empresa_access(tenant_id, empresa_id));
DROP POLICY IF EXISTS "return_queue_update" ON middleware.return_queue;
CREATE POLICY "return_queue_update" ON middleware.return_queue
  FOR UPDATE TO authenticated
  USING (public.user_has_empresa_access(tenant_id, empresa_id))
  WITH CHECK (public.user_has_empresa_access(tenant_id, empresa_id));

-- id_map: bloquear cliente (uso interno)
DROP POLICY IF EXISTS "id_map_no_direct_access" ON middleware.id_map;
CREATE POLICY "id_map_no_direct_access" ON middleware.id_map
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Privilégios
GRANT SELECT, INSERT, UPDATE ON middleware.sync_config  TO authenticated;
GRANT SELECT                  ON middleware.sync_log    TO authenticated;
GRANT SELECT, UPDATE          ON middleware.sync_queue  TO authenticated;
GRANT SELECT, UPDATE          ON middleware.return_queue TO authenticated;

-- 3. View pública para credenciais (sem secret)
CREATE OR REPLACE VIEW middleware.omie_config_public
WITH (security_invoker = on) AS
  SELECT id, tenant_id, empresa_id, app_key, omie_base_url, ativo,
         (app_secret IS NOT NULL AND length(app_secret) > 0) AS has_secret,
         created_at, updated_at
  FROM middleware.omie_config
  WHERE public.user_has_empresa_access(tenant_id, empresa_id);
GRANT SELECT ON middleware.omie_config_public TO authenticated;

-- 4. Expor schema middleware na API REST (PostgREST)
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, middleware';
NOTIFY pgrst, 'reload config';
