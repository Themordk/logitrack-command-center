
-- FASE 1: Desacoplar usuario.id de auth.users

-- 1.1 Adicionar coluna auth_user_id (vínculo opcional com Auth)
ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- 1.2 Migrar dados existentes: todos os IDs atuais são auth.users IDs
UPDATE public.usuario SET auth_user_id = id WHERE auth_user_id IS NULL;

-- 1.3 Adicionar default gen_random_uuid() ao id para novos cadastros operacionais
ALTER TABLE public.usuario ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- FASE 3.2: Atualizar funções RLS para usar auth_user_id

CREATE OR REPLACE FUNCTION public.get_current_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.usuario
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.usuario
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;
