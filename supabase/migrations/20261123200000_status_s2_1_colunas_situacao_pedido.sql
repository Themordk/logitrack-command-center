-- =====================================================================
-- Status S2 · 1/5 — Situação do pedido: colunas (só acréscimos) · 2026-11-23
-- Plano "Status operacional, de entrega e de integração" (aprovado em 23/11).
--
-- documento_saida
--   etapa               aguardando_onda | em_onda | em_separacao | separado | em_conferencia | conferido
--                       | em_carga | em_carregamento | embarcado | expedido | cancelado | excluido
--   etapa_em            quando a etapa começou (melhor hora conhecida)
--   etapa_onda_numero   onda atual do pedido
--   etapa_carga_numero  carga atual do pedido
--   entrega_status      nao_se_aplica | aguardando_expedicao | entrega_nao_gerada | com_transportadora
--                       | aguardando_saida | em_rota | entregue | nao_entregue
--   entrega_em          hora do estado de entrega (aceite, entrega, tentativa, fechamento da carga)
--   entrega_motivo      motivo (não entregue / entrega não gerada)
--   entrega_tentativas  tentativas válidas (não estornadas)
-- movimento_saida
--   entrega_resumo      pior caso dos pedidos ativos
--   entrega_total / entrega_entregues / entrega_nao_entregues   pedidos com entrega própria
--
-- Os códigos de documento_saida.status (0/1/9/99) NÃO mudam: a API depende deles.
-- Valores calculados só no banco (public._fn_pedido_situacao_recalcular). Não gravar pela aplicação.
-- Reversão: supabase/rollback/20261123_status_s2_reverter.sql
-- =====================================================================

ALTER TABLE public.documento_saida
  ADD COLUMN IF NOT EXISTS etapa text NOT NULL DEFAULT 'aguardando_onda',
  ADD COLUMN IF NOT EXISTS etapa_em timestamptz,
  ADD COLUMN IF NOT EXISTS etapa_onda_numero bigint,
  ADD COLUMN IF NOT EXISTS etapa_carga_numero bigint,
  ADD COLUMN IF NOT EXISTS entrega_status text NOT NULL DEFAULT 'nao_se_aplica',
  ADD COLUMN IF NOT EXISTS entrega_em timestamptz,
  ADD COLUMN IF NOT EXISTS entrega_motivo text,
  ADD COLUMN IF NOT EXISTS entrega_tentativas integer NOT NULL DEFAULT 0;

ALTER TABLE public.movimento_saida
  ADD COLUMN IF NOT EXISTS entrega_resumo text NOT NULL DEFAULT 'nao_se_aplica',
  ADD COLUMN IF NOT EXISTS entrega_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrega_entregues integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entrega_nao_entregues integer NOT NULL DEFAULT 0;

ALTER TABLE public.documento_saida DROP CONSTRAINT IF EXISTS documento_saida_etapa_chk;
ALTER TABLE public.documento_saida ADD CONSTRAINT documento_saida_etapa_chk CHECK (etapa IN (
  'aguardando_onda', 'em_onda', 'em_separacao', 'separado', 'em_conferencia', 'conferido',
  'em_carga', 'em_carregamento', 'embarcado', 'expedido', 'cancelado', 'excluido'));
ALTER TABLE public.documento_saida DROP CONSTRAINT IF EXISTS documento_saida_entrega_status_chk;
ALTER TABLE public.documento_saida ADD CONSTRAINT documento_saida_entrega_status_chk CHECK (entrega_status IN (
  'nao_se_aplica', 'aguardando_expedicao', 'entrega_nao_gerada', 'com_transportadora',
  'aguardando_saida', 'em_rota', 'entregue', 'nao_entregue'));
ALTER TABLE public.movimento_saida DROP CONSTRAINT IF EXISTS movimento_saida_entrega_resumo_chk;
ALTER TABLE public.movimento_saida ADD CONSTRAINT movimento_saida_entrega_resumo_chk CHECK (entrega_resumo IN (
  'nao_se_aplica', 'aguardando_expedicao', 'entrega_nao_gerada', 'com_transportadora',
  'aguardando_saida', 'em_rota', 'entregue', 'nao_entregue'));

-- Acompanhamento de Pedidos (filtros por etapa / entrega / integração)
CREATE INDEX IF NOT EXISTS idx_documento_saida_situacao
  ON public.documento_saida (tenant_id, empresa_id, etapa, entrega_status);
CREATE INDEX IF NOT EXISTS idx_documento_saida_entrega_pendencia
  ON public.documento_saida (tenant_id, empresa_id, entrega_status)
  WHERE entrega_status IN ('nao_entregue', 'entrega_nao_gerada', 'em_rota', 'aguardando_saida');

COMMENT ON COLUMN public.documento_saida.etapa IS 'S2: etapa operacional do pedido (onda, carga, embarque). Calculada por public._fn_pedido_situacao_recalcular; não gravar pela aplicação.';
COMMENT ON COLUMN public.documento_saida.entrega_status IS 'S2: situação da entrega do pedido (entrega, parada, tentativas, carga). Calculada por public._fn_pedido_situacao_recalcular; não gravar pela aplicação.';
COMMENT ON COLUMN public.movimento_saida.entrega_resumo IS 'S2: pior situação de entrega dos pedidos ativos da onda.';
