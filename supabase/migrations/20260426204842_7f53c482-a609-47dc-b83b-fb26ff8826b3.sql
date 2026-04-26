-- 1) Coluna slug em tenant
ALTER TABLE public.tenant ADD COLUMN IF NOT EXISTS slug text;

-- Backfill: lowercase + remove tudo que não for [a-z0-9]
UPDATE public.tenant
SET slug = regexp_replace(lower(nome), '[^a-z0-9]', '', 'g')
WHERE slug IS NULL OR slug = '';

ALTER TABLE public.tenant ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_slug ON public.tenant(lower(slug));

-- 2) Função pública para resolver tenant pelo slug (subdomínio)
CREATE OR REPLACE FUNCTION public.fn_resolve_tenant_by_slug(p_slug text)
RETURNS TABLE (id uuid, nome text, slug text, ativo boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.nome, t.slug, t.ativo
  FROM public.tenant t
  WHERE lower(t.slug) = lower(coalesce(p_slug, ''))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.fn_resolve_tenant_by_slug(text) TO anon, authenticated;

-- 3) Reforça fn_buscar_email_por_login para travar pelo tenant do subdomínio
DROP FUNCTION IF EXISTS public.fn_buscar_email_por_login(text);
DROP FUNCTION IF EXISTS public.fn_buscar_email_por_login(text, uuid);

CREATE OR REPLACE FUNCTION public.fn_buscar_email_por_login(
  p_login text,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_tenant_ativo boolean;
BEGIN
  SELECT au.email, t.ativo
    INTO v_email, v_tenant_ativo
  FROM public.usuario u
  JOIN auth.users au ON au.id = u.auth_user_id
  LEFT JOIN public.tenant t ON t.id = u.tenant_id
  WHERE lower(u.login) = lower(p_login)
    AND u.ativo = true
    AND (p_tenant_id IS NULL OR u.tenant_id = p_tenant_id)
  LIMIT 1;

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_tenant_ativo IS DISTINCT FROM TRUE THEN
    RETURN NULL;
  END IF;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_buscar_email_por_login(text, uuid) TO anon, authenticated;

-- 4) Validação pós-login: usuário pertence ao tenant?
CREATE OR REPLACE FUNCTION public.fn_user_belongs_to_tenant(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario u
    WHERE u.auth_user_id = auth.uid()
      AND u.tenant_id = p_tenant_id
      AND u.ativo = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_user_belongs_to_tenant(uuid) TO authenticated;