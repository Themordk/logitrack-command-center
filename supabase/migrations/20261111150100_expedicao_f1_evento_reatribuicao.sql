-- Expedição por etapas — Fase 1: novo tipo de evento para trocas de dono feitas pelo gestor.
-- Separada das demais porque um valor novo de enum só pode ser usado depois do commit.
ALTER TYPE public.enum_tipo_evento_execucao ADD VALUE IF NOT EXISTS 'REATRIBUICAO';
