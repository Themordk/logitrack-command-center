-- Perfis de Acesso v2: a função do gatilho não deve ser chamável pela API.
revoke execute on function public.tg_permissao_conceder_acesso_total() from public, anon, authenticated;
