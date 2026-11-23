-- =====================================================================
-- Módulo de Entregas (E1) · 2026-11-23 — etapa ENTREGA nas ocorrências
-- ---------------------------------------------------------------------
-- Migration separada porque um valor novo de enum só pode ser usado depois
-- do COMMIT da transação que o criou (a migration seguinte já usa 'ENTREGA').
-- Reversão: supabase/rollback/20261123_entregas_reverter.sql (o valor do enum
-- fica: o Postgres não remove valor de enum e ele é inofensivo sem uso).
-- =====================================================================
ALTER TYPE public.enum_etapa_ocorrencia ADD VALUE IF NOT EXISTS 'ENTREGA';
