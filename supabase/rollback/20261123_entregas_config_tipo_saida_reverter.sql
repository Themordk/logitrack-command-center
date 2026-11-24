-- Reverte 20261123170000_entregas_config_tipo_saida.sql.
-- Atenção: leituras de volume (entrega_volume) são descartadas. Depois de rodar,
-- reaplique as definições anteriores de _fn_entrega_gerar, _fn_trg_carga_entrega,
-- _fn_entrega_json, entrega_parada_confirmar, entrega_carga_detalhe e
-- entrega_gerar_manual a partir de 20261123120100 / 20261123140000 / 20261123150000.
DROP TRIGGER IF EXISTS trg_carga_documento_entrega ON public.carga_documento;
DROP FUNCTION IF EXISTS public._fn_trg_carga_documento_entrega();
DROP TRIGGER IF EXISTS trg_carga_entrega_gerar ON public.carga;
CREATE TRIGGER trg_carga_entrega_gerar AFTER UPDATE OF status ON public.carga
  FOR EACH ROW WHEN (NEW.status = 'FECHADA' AND OLD.status IS DISTINCT FROM 'FECHADA' AND NEW.modalidade = 'PROPRIA')
  EXECUTE FUNCTION public._fn_trg_carga_entrega();
DROP FUNCTION IF EXISTS public.entrega_parada_conferir_volume(uuid, uuid, uuid, text, boolean, numeric, numeric);
DROP FUNCTION IF EXISTS public._fn_entrega_motivo_sem_entrega(uuid);
DROP TABLE IF EXISTS public.entrega_volume;
ALTER TABLE public.entrega_parada DROP COLUMN IF EXISTS confere_volume;  -- _fn_entrega_json/_fn_entrega_inserir_paradas precisam ser reaplicadas antes
ALTER TABLE public.tipo_saida DROP CONSTRAINT IF EXISTS ck_tipo_saida_entrega_gerar_em;
ALTER TABLE public.tipo_saida DROP COLUMN IF EXISTS realiza_entrega,
  DROP COLUMN IF EXISTS entrega_gerar_em, DROP COLUMN IF EXISTS entrega_confere_volume;
