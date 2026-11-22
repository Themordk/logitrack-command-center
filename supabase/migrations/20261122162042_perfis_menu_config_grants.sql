-- Perfis de Acesso v2: a tabela nova precisa de privilégios para o role authenticated
-- (a RLS tenant_full_access continua restringindo ao tenant atual).
grant select, insert, update, delete on table public.perfil_menu_config to authenticated;
revoke all on table public.perfil_menu_config from anon;
