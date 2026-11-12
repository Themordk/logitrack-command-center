-- =============================================================================
-- REVERSÃO — Relatório Acuracidade de Inventário via RPC (migrations 20261112160514 e 20261112161645)
-- NÃO é migration automática: rodar manualmente, só com aprovação, e SÓ depois de
-- voltar o front-end para a versão anterior (o front novo chama a RPC removida aqui).
-- Sem efeito em dados: a RPC é somente leitura e não há índice novo.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_relatorio_inventario(
  uuid, uuid, uuid, uuid, date, date, text, integer, integer, integer, integer, text, text, boolean, integer, integer, text
);
DROP FUNCTION IF EXISTS public.rpc_relatorio_inventario(
  uuid, uuid, uuid, uuid, date, date, text, integer, integer, integer, integer, text, text, boolean, text, integer, integer, text
);

COMMIT;
