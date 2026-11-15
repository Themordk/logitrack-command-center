-- Fluxo de Expedição — endurecimento de permissões · 2026-11-12
-- Funções de trigger e internas não devem ser chamáveis pela API.
REVOKE EXECUTE ON FUNCTION public.tg_roteiro_saida_validar() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_roteiro_sync_legado() FROM PUBLIC, anon, authenticated;
-- preparar_dados_agrupamento só é chamada por gerar_onda_separacao (SECURITY DEFINER); o frontend não a usa.
REVOKE EXECUTE ON FUNCTION public.preparar_dados_agrupamento(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_dados_agrupamento(uuid, uuid, uuid[]) TO service_role;
