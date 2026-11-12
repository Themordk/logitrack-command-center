-- =============================================================================
-- REVERSÃO — Relatório Validade & Lote via RPC (migration 20261112150602)
-- NÃO é migration automática: rodar manualmente, só com aprovação, e SÓ depois de
-- voltar o front-end para a versão anterior (o front novo chama a RPC removida aqui).
--
-- O que volta:  nada a restaurar — o relatório antigo lia estoque_geral direto.
-- O que sai:    rpc_relatorio_validade_lote e o índice parcial idx_produto_controle_validade.
-- Sem efeito em dados: a RPC e o índice são somente leitura.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_relatorio_validade_lote(
  uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, text, date, text, integer, integer, integer, integer, text
);

DROP INDEX IF EXISTS public.idx_produto_controle_validade;

COMMIT;
