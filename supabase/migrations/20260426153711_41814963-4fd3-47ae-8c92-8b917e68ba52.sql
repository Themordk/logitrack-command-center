-- 1) Tabela de usuários de suporte da plataforma
CREATE TABLE IF NOT EXISTS public.platform_support_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_support_user ENABLE ROW LEVEL SECURITY;

-- Sem políticas: somente service_role consegue acessar.

-- 2) Função utilitária para verificar suporte
CREATE OR REPLACE FUNCTION public.is_platform_support(p_auth_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_support_user
    WHERE auth_user_id = p_auth_user_id AND ativo = true
  );
$$;

-- 3) View agregada de tenants
CREATE OR REPLACE VIEW public.vw_tenant_resumo AS
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

-- 4) Tabela de chamados
CREATE TABLE IF NOT EXISTS public.support_chamado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'ABERTO',
  prioridade text NOT NULL DEFAULT 'NORMAL',
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atendido_por uuid,
  atendido_em timestamptz,
  resposta text
);
ALTER TABLE public.support_chamado ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_support_chamado_tenant ON public.support_chamado(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_chamado_status ON public.support_chamado(status);

-- Cliente final: vê / cria chamados do seu tenant
DROP POLICY IF EXISTS chamado_tenant_select ON public.support_chamado;
CREATE POLICY chamado_tenant_select ON public.support_chamado
  FOR SELECT USING (tenant_id = get_current_tenant());

DROP POLICY IF EXISTS chamado_tenant_insert ON public.support_chamado;
CREATE POLICY chamado_tenant_insert ON public.support_chamado
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant());

-- 5) Bloquear login quando tenant inativo
CREATE OR REPLACE FUNCTION public.fn_buscar_email_por_login(p_login text)
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
  LIMIT 1;

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_tenant_ativo IS DISTINCT FROM TRUE THEN
    -- Tenant desativado: não retorna e-mail (login será rejeitado)
    RETURN NULL;
  END IF;

  RETURN v_email;
END;
$$;