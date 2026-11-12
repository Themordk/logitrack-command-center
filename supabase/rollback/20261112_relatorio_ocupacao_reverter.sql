-- Rollback de 20261112200121_rpc_relatorio_ocupacao: remove as RPCs.
-- A tela antiga (ocupacao.service com fetchAllSelectRows) precisa voltar junto (git revert do PR).
DROP FUNCTION IF EXISTS public.rpc_relatorio_ocupacao_enderecos(uuid, uuid, uuid, text, text, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.rpc_relatorio_ocupacao_resumo(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_ocupacao_base(uuid, uuid, uuid, text);
NOTIFY pgrst, 'reload schema';
