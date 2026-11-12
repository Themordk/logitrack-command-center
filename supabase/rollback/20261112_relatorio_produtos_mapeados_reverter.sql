-- =============================================================================
-- REVERSÃO — Relatório Produtos Mapeados em Picking via RPC (migration 20261112163310)
-- NÃO é migration automática: rodar manualmente, só com aprovação, e SÓ depois de
-- voltar o front-end para a versão anterior (o front novo chama a RPC removida aqui).
-- Sem efeito em dados: a RPC é somente leitura e não há índice novo.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_relatorio_produtos_mapeados(
  uuid, uuid, uuid, text, text, uuid, date, date, integer, integer, integer, integer, integer, integer, text
);

COMMIT;
