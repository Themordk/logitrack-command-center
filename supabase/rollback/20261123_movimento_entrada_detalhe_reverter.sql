-- =============================================================================
-- REVERSÃO — Detalhe do Movimento de Entrada numa RPC (migration 20261123010000)
-- NÃO é migration automática: rodar manualmente, só com aprovação, e SÓ depois de
-- voltar o front-end para a versão anterior (o front novo chama a RPC removida aqui).
--
-- O que volta:  nada a restaurar — a tela antiga usa buscar_itens_movimento_entrada
--               e as views vw_movimento_entrada_*, que esta migration não alterou.
-- O que sai:    rpc_movimento_entrada_detalhe.
-- Sem efeito em dados: a RPC é somente leitura.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_movimento_entrada_detalhe(uuid, text);

COMMIT;
