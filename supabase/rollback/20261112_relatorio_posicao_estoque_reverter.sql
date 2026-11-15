-- =============================================================================
-- REVERSÃO — Relatório Posição de Estoque via RPC (migration 20261112170618)
-- NÃO é migration automática: rodar manualmente, só com aprovação, e SÓ depois de
-- voltar o front-end para a versão anterior (o front novo chama a RPC removida aqui).
-- Sem efeito em dados: a RPC é somente leitura e não há índice novo.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_relatorio_posicao_estoque(
  uuid, uuid, uuid, text, uuid, uuid, numeric, integer, integer, integer, integer,
  uuid, uuid, text, uuid, text, text, boolean, boolean, integer, integer, integer, text
);

COMMIT;
