-- =====================================================================
-- 2026-10-18 · Armazenagem do coletor · Etapa 1 · A2
-- Corrige rpc_coletor_armazenagem_execucao (mesma assinatura e retorno).
-- Base: definição viva da produção em 18/10/2026 (a do repositório estava defasada).
--
-- Defeito: total_a_armazenar usava SUM(DISTINCT t.quantidade_requerida) sobre
-- um LEFT JOIN com tarefa_execucao. Duas tarefas do mesmo produto com a mesma
-- quantidade contavam uma vez só.
-- Correção: requerido somado por tarefa; executado somado em consulta separada.
-- Segurança e demais filtros sem alteração.
-- =====================================================================

INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(),
       'public.rpc_coletor_armazenagem_execucao(uuid,uuid,uuid)',
       pg_get_functiondef('public.rpc_coletor_armazenagem_execucao(uuid,uuid,uuid)'::regprocedure),
       'Antes de 20261018200100_fix_rpc_coletor_armazenagem_execucao_soma',
       now();

CREATE OR REPLACE FUNCTION public.rpc_coletor_armazenagem_execucao(
  p_tenant_id  uuid,
  p_empresa_id uuid,
  p_produto_id uuid
)
RETURNS TABLE(
  estoque_pulmao    numeric,
  estoque_picking   numeric,
  total_a_armazenar numeric,
  total_armazenado  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);
  v_tenant_id := public.get_current_tenant();

  RETURN QUERY
  WITH tarefas AS (
    SELECT t.id, t.quantidade_requerida
    FROM tarefa t
    WHERE t.tipo_tarefa_id = (
            SELECT id FROM tipo_tarefa
            WHERE codigo = 'ENTR-ARMZ' AND tenant_id = p_tenant_id
            LIMIT 1
          )
      AND t.tenant_id  = v_tenant_id
      AND t.empresa_id = p_empresa_id
      AND t.produto_id = p_produto_id
      AND t.status IN ('CRIADA', 'EM_ANDAMENTO')
  ),
  totais AS (
    SELECT
      COALESCE((SELECT SUM(quantidade_requerida) FROM tarefas), 0) AS total_a_armazenar,
      COALESCE((SELECT SUM(te.quantidade_executada)
                FROM tarefa_execucao te
                WHERE te.tarefa_id IN (SELECT id FROM tarefas)), 0) AS total_armazenado
  ),
  estoque AS (
    SELECT
      COALESCE(SUM(CASE WHEN e.tipo_endereco = 'PULMAO'  THEN eg.quantidade_disponivel ELSE 0 END), 0) AS estoque_pulmao,
      COALESCE(SUM(CASE WHEN e.tipo_endereco = 'PICKING' THEN eg.quantidade_disponivel ELSE 0 END), 0) AS estoque_picking
    FROM estoque_geral eg
    LEFT JOIN endereco e ON eg.endereco_id = e.id
    WHERE eg.tenant_id  = v_tenant_id
      AND eg.empresa_id = p_empresa_id
      AND eg.produto_id = p_produto_id
  )
  SELECT e.estoque_pulmao, e.estoque_picking, t.total_a_armazenar, t.total_armazenado
  FROM estoque e, totais t;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_coletor_armazenagem_execucao(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_armazenagem_execucao(uuid,uuid,uuid) TO authenticated, service_role;
