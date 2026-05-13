
DROP POLICY IF EXISTS tenant_full_access ON public.modulo;
CREATE POLICY modulo_select_all ON public.modulo FOR SELECT USING (true);
CREATE POLICY modulo_insert_tenant ON public.modulo FOR INSERT WITH CHECK (tenant_id = get_current_tenant());
CREATE POLICY modulo_update_tenant ON public.modulo FOR UPDATE USING (tenant_id = get_current_tenant()) WITH CHECK (tenant_id = get_current_tenant());
CREATE POLICY modulo_delete_tenant ON public.modulo FOR DELETE USING (tenant_id = get_current_tenant());

DROP POLICY IF EXISTS tenant_full_access ON public.permissao;
CREATE POLICY permissao_select_all ON public.permissao FOR SELECT USING (true);
CREATE POLICY permissao_insert_tenant ON public.permissao FOR INSERT WITH CHECK (tenant_id = get_current_tenant());
CREATE POLICY permissao_update_tenant ON public.permissao FOR UPDATE USING (tenant_id = get_current_tenant()) WITH CHECK (tenant_id = get_current_tenant());
CREATE POLICY permissao_delete_tenant ON public.permissao FOR DELETE USING (tenant_id = get_current_tenant());
