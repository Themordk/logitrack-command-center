-- Reverte 20261123180000_entregas_fechamento_carga.sql (não reabre cargas já fechadas pela entrega).
DROP TRIGGER IF EXISTS trg_entrega_parada_fechar_carga ON public.entrega_parada;
DROP TRIGGER IF EXISTS trg_entrega_concluida_tarefas ON public.entrega;
DROP FUNCTION IF EXISTS public._fn_trg_entrega_parada_fechar_carga();
DROP FUNCTION IF EXISTS public._fn_trg_entrega_concluida_tarefas();
DROP FUNCTION IF EXISTS public._fn_carga_fechar_pela_entrega(uuid, uuid, uuid, uuid);
-- reaplique entrega_parada_conferir_volume de 20261123170000 (sem a confirmação do embarque) antes de remover:
-- DROP FUNCTION IF EXISTS public._fn_carga_unidade_confirmar_entrega(uuid, uuid, uuid);
