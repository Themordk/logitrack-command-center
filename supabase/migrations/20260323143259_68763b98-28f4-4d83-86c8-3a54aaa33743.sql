-- Drop the FK constraint blocking user creation
ALTER TABLE public.usuario DROP CONSTRAINT IF EXISTS fk_usuario_auth;

-- Create function to look up email by login (for login flow)
CREATE OR REPLACE FUNCTION public.fn_buscar_email_por_login(p_login text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.usuario WHERE login = p_login AND ativo = true LIMIT 1;
$$;

-- Grant anon access so unauthenticated users can call it
GRANT EXECUTE ON FUNCTION public.fn_buscar_email_por_login(text) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_buscar_email_por_login(text) TO authenticated;