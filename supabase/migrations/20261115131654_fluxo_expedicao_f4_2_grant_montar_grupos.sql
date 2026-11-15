-- Fluxo de Expedição — F4.2 · 2026-11-12
-- liberar_onda_separacao é SECURITY INVOKER e chama fn_montar_grupos_separacao, que havia sido
-- revogada de authenticated (erro 42501 ao liberar onda). A função é SECURITY DEFINER, valida o
-- tenant (assert_tenant_access) e é idempotente.
-- Reversão: REVOKE EXECUTE ON FUNCTION public.fn_montar_grupos_separacao(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_montar_grupos_separacao(uuid, uuid) TO authenticated;
