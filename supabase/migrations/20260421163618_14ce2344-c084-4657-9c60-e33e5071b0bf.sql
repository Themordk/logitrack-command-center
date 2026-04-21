-- Drop legacy policies on estoque_geral that rely on outdated auth checks
DROP POLICY IF EXISTS "estoque_geral_select" ON public.estoque_geral;
DROP POLICY IF EXISTS "estoque_geral_insert" ON public.estoque_geral;
DROP POLICY IF EXISTS "estoque_geral_update" ON public.estoque_geral;
DROP POLICY IF EXISTS "estoque_delete" ON public.estoque_geral;
DROP POLICY IF EXISTS "select_estoque_geral_por_tenant" ON public.estoque_geral;
DROP POLICY IF EXISTS "update_estoque_geral_por_tenant" ON public.estoque_geral;

-- Drop legacy policies on estoque_movimento for same reason
DROP POLICY IF EXISTS "estoque_movimento_select" ON public.estoque_movimento;
DROP POLICY IF EXISTS "estoque_movimento_insert" ON public.estoque_movimento;
DROP POLICY IF EXISTS "estoque_movimento_update" ON public.estoque_movimento;
DROP POLICY IF EXISTS "delete_estoque_movimento_por_tenant" ON public.estoque_movimento;
DROP POLICY IF EXISTS "insert_estoque_movimento_por_tenant" ON public.estoque_movimento;
DROP POLICY IF EXISTS "select_estoque_movimento_por_tenant" ON public.estoque_movimento;

-- Create unified tenant-based policies aligned with the rest of the schema
CREATE POLICY "tenant_full_access"
  ON public.estoque_geral
  FOR ALL
  USING (tenant_id = public.get_current_tenant())
  WITH CHECK (tenant_id = public.get_current_tenant());

CREATE POLICY "tenant_full_access"
  ON public.estoque_movimento
  FOR ALL
  USING (tenant_id = public.get_current_tenant())
  WITH CHECK (tenant_id = public.get_current_tenant());