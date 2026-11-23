-- =====================================================================
-- Módulo de Entregas · 2026-11-23 — leitura das tabelas para usuários logados
-- ---------------------------------------------------------------------
-- O projeto não concede privilégios padrão a tabelas novas. Sem SELECT,
-- o Realtime (alerta de aceite, RN17) não entrega as mudanças de `entrega`.
-- A RLS (tenant_id = get_current_tenant()) continua filtrando as linhas;
-- gravação segue só pelas RPCs.
-- Reversão: supabase/rollback/20261123_entregas_reverter.sql (as tabelas saem).
-- =====================================================================
GRANT SELECT ON public.entrega, public.entrega_parada, public.entrega_evento TO authenticated;
