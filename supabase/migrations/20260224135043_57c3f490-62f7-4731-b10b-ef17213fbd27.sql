
-- Table for ERP connection configuration
CREATE TABLE public.integracao_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id),
  armazem_id uuid NOT NULL REFERENCES public.armazem(id),
  host text NOT NULL,
  banco text NOT NULL,
  usuario_bd text NOT NULL,
  senha_criptografada text NOT NULL,
  tipo_banco text NOT NULL CHECK (tipo_banco IN ('SQL Server', 'Oracle', 'MySQL', 'Postgres', 'Firebird')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, armazem_id)
);

ALTER TABLE public.integracao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_full_access" ON public.integracao_config
  FOR ALL USING (tenant_id = get_current_tenant())
  WITH CHECK (tenant_id = get_current_tenant());

-- Table for ERP integration objects mapping
CREATE TABLE public.integracao_objetos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenant(id),
  armazem_id uuid NOT NULL REFERENCES public.armazem(id),
  objeto_sistema text NOT NULL,
  tabela_erp text,
  campo_chave text,
  campo_atualizacao text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, armazem_id, objeto_sistema)
);

ALTER TABLE public.integracao_objetos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_full_access" ON public.integracao_objetos
  FOR ALL USING (tenant_id = get_current_tenant())
  WITH CHECK (tenant_id = get_current_tenant());
