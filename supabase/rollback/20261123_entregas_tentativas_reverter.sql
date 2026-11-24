-- =============================================================================
-- REVERSÃO — tentativas de entrega (migrations 20261123150000 e 20261123150100)
-- Rodar manualmente, só com aprovação. ATENÇÃO: apaga entrega_tentativa (histórico de
-- tentativas); os eventos em entrega_evento continuam e permitem reconstruir.
-- entrega_parada_estornar e entrega_carga_detalhe voltam à versão de 20261123120100.
-- =============================================================================
BEGIN;
DROP TRIGGER IF EXISTS trg_entrega_parada_tentativa ON public.entrega_parada;
DROP FUNCTION IF EXISTS public._fn_trg_entrega_parada_tentativa();
DROP FUNCTION IF EXISTS public._fn_entrega_tentativa_registrar(public.entrega_parada,uuid,timestamptz,text,text,boolean,numeric,numeric,text,uuid,uuid);
DROP FUNCTION IF EXISTS public._fn_entrega_tentativa_estornar(uuid,uuid,text,timestamptz);
DROP FUNCTION IF EXISTS public._fn_entrega_tentativas_json(uuid);
ALTER TABLE public.entrega_tentativa DISABLE TRIGGER trg_entrega_tentativa_proteger;
DROP TABLE IF EXISTS public.entrega_tentativa;
DROP FUNCTION IF EXISTS public._fn_entrega_tentativa_proteger();
-- seq pode ficar (inofensiva). Reaplicar aqui as versões de entrega_parada_estornar e
-- entrega_carga_detalhe de 20261123120100_entregas_e1_e3_estrutura_rpcs.sql.
COMMIT;
