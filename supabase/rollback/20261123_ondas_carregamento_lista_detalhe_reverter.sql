-- =============================================================================
-- REVERSÃO — Ondas de Carregamento: lista e detalhe numa RPC (migration 20261123020000)
-- NÃO é migration automática: rodar manualmente, só com aprovação, e SÓ depois de
-- voltar o front-end para a versão anterior (o front novo chama as RPCs removidas).
--
-- O que volta:  nada a restaurar — a tela antiga usa listar_ondas_carregamento,
--               buscar_itens_onda_carregamento e as views vw_movimento_saida_*,
--               que esta migration não alterou.
-- O que sai:    rpc_ondas_carregamento_lista e rpc_onda_carregamento_detalhe.
-- Sem efeito em dados: as duas RPCs são somente leitura.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_ondas_carregamento_lista(uuid, text, date, date, bigint, bigint, uuid, text, text, text, integer, integer, text, text);
DROP FUNCTION IF EXISTS public.rpc_onda_carregamento_detalhe(uuid, text);

COMMIT;
