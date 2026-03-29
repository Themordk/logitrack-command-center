
-- =============================================
-- RBAC: Enums, Tables, Functions, RLS, Seed
-- =============================================

-- 1. Enums
CREATE TYPE public.enum_ambiente_modulo AS ENUM ('WEB', 'COLETOR', 'AMBOS');
CREATE TYPE public.enum_acao_permissao AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE');

-- 2. Tables

-- modulo: system modules/routes
CREATE TABLE public.modulo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenant(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text NOT NULL,
  ambiente public.enum_ambiente_modulo NOT NULL DEFAULT 'WEB',
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE(tenant_id, codigo)
);

-- perfil: roles per tenant
CREATE TABLE public.perfil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenant(id) ON DELETE CASCADE NOT NULL,
  nome text NOT NULL,
  descricao text,
  sistema boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  UNIQUE(tenant_id, nome)
);

-- permissao: granular permissions per module
CREATE TABLE public.permissao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenant(id) ON DELETE CASCADE,
  modulo_id uuid REFERENCES public.modulo(id) ON DELETE CASCADE NOT NULL,
  acao public.enum_acao_permissao NOT NULL,
  descricao text,
  UNIQUE(tenant_id, modulo_id, acao)
);

-- perfil_permissao: N:N role <-> permission
CREATE TABLE public.perfil_permissao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenant(id) ON DELETE CASCADE NOT NULL,
  perfil_id uuid REFERENCES public.perfil(id) ON DELETE CASCADE NOT NULL,
  permissao_id uuid REFERENCES public.permissao(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(tenant_id, perfil_id, permissao_id)
);

-- usuario_perfil: N:N user <-> role
CREATE TABLE public.usuario_perfil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenant(id) ON DELETE CASCADE NOT NULL,
  usuario_id uuid REFERENCES public.usuario(id) ON DELETE CASCADE NOT NULL,
  perfil_id uuid REFERENCES public.perfil(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(tenant_id, usuario_id, perfil_id)
);

-- 3. RLS
ALTER TABLE public.modulo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_permissao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_full_access" ON public.modulo FOR ALL USING (tenant_id = get_current_tenant()) WITH CHECK (tenant_id = get_current_tenant());
CREATE POLICY "tenant_full_access" ON public.perfil FOR ALL USING (tenant_id = get_current_tenant()) WITH CHECK (tenant_id = get_current_tenant());
CREATE POLICY "tenant_full_access" ON public.permissao FOR ALL USING (tenant_id = get_current_tenant()) WITH CHECK (tenant_id = get_current_tenant());
CREATE POLICY "tenant_full_access" ON public.perfil_permissao FOR ALL USING (tenant_id = get_current_tenant()) WITH CHECK (tenant_id = get_current_tenant());
CREATE POLICY "tenant_full_access" ON public.usuario_perfil FOR ALL USING (tenant_id = get_current_tenant()) WITH CHECK (tenant_id = get_current_tenant());

-- 4. Security definer functions

CREATE OR REPLACE FUNCTION public.fn_usuario_tem_permissao(
  p_usuario_id uuid, p_modulo_codigo text, p_acao text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM usuario_perfil up
    JOIN perfil_permissao pp ON pp.perfil_id = up.perfil_id AND pp.tenant_id = up.tenant_id
    JOIN permissao p ON p.id = pp.permissao_id
    JOIN modulo m ON m.id = p.modulo_id
    WHERE up.usuario_id = p_usuario_id
      AND m.codigo = p_modulo_codigo
      AND p.acao::text = p_acao
      AND m.ativo = true
  )
$$;

CREATE OR REPLACE FUNCTION public.fn_usuario_permissoes(p_usuario_id uuid)
RETURNS TABLE(modulo_codigo text, acao text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT m.codigo, p.acao::text
  FROM usuario_perfil up
  JOIN perfil per ON per.id = up.perfil_id AND per.ativo = true
  JOIN perfil_permissao pp ON pp.perfil_id = up.perfil_id AND pp.tenant_id = up.tenant_id
  JOIN permissao p ON p.id = pp.permissao_id
  JOIN modulo m ON m.id = p.modulo_id AND m.ativo = true
  WHERE up.usuario_id = p_usuario_id
$$;
