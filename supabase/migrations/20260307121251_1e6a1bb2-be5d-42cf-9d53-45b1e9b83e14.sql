REVOKE ALL ON FUNCTION public.rpc_coletor_armazenagem_execucao(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_armazenagem_execucao(uuid, uuid, uuid) TO authenticated;