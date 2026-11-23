-- =====================================================================
-- Status S2 · 3/5 — Carga inicial da situação dos pedidos · 2026-11-23
-- Recalcula TODOS os pedidos (produção tem ~7,4 mil; os antigos ficariam com o padrão
-- "aguardando_onda", o que seria falso). trg_tocar_updated_at fica desligado só durante a
-- carga para não marcar os pedidos como "alterados agora". O resumo das ondas sai junto.
-- =====================================================================
ALTER TABLE public.documento_saida DISABLE TRIGGER trg_tocar_updated_at;

DO $carga$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT ds.id FROM public.documento_saida ds LOOP
    PERFORM public._fn_pedido_situacao_recalcular(r.id);
  END LOOP;
END
$carga$;

ALTER TABLE public.documento_saida ENABLE TRIGGER trg_tocar_updated_at;
