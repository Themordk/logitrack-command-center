-- Migration: 20261116120000_hu_h0a_status_desmontada.sql
-- Plano HU — preparação da H1: novo status DESMONTADA (decisão D5).
-- Separada porque um valor novo de enum não pode ser usado na mesma transação.
-- Risco: baixo (aditiva). Rollback: não há DROP VALUE em enum; o valor fica sem uso.
ALTER TYPE public.enum_status_hu ADD VALUE IF NOT EXISTS 'DESMONTADA';
