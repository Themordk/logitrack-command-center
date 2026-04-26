-- 1) View com security_invoker (respeita RLS de quem chama)
DROP VIEW IF EXISTS public.vw_tenant_resumo;
CREATE VIEW public.vw_tenant_resumo
WITH (security_invoker = on) AS
SELECT
  t.id,
  t.nome,
  t.ativo,
  t.created_at,
  (SELECT count(*) FROM public.empresa  WHERE tenant_id = t.id) AS total_empresas,
  (SELECT count(*) FROM public.usuario  WHERE tenant_id = t.id) AS total_usuarios,
  (SELECT count(*) FROM public.produto  WHERE tenant_id = t.id) AS total_produtos,
  (SELECT count(*) FROM public.estoque_movimento WHERE tenant_id = t.id) AS total_movimentos,
  (SELECT count(*) FROM public.movimento_entrada WHERE tenant_id = t.id) AS total_entradas,
  (SELECT count(*) FROM public.movimento_saida   WHERE tenant_id = t.id) AS total_ondas
FROM public.tenant t;

-- Bloquear acesso anon/authenticated à view; somente service_role pode ler
REVOKE ALL ON public.vw_tenant_resumo FROM anon, authenticated;

-- 2) Política de "negar tudo" para platform_support_user (defesa em profundidade)
DROP POLICY IF EXISTS platform_support_no_access ON public.platform_support_user;
CREATE POLICY platform_support_no_access ON public.platform_support_user
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- 3) Política de "negar update/delete" no support_chamado para clientes
DROP POLICY IF EXISTS chamado_no_update ON public.support_chamado;
CREATE POLICY chamado_no_update ON public.support_chamado
  FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS chamado_no_delete ON public.support_chamado;
CREATE POLICY chamado_no_delete ON public.support_chamado
  FOR DELETE TO anon, authenticated
  USING (false);