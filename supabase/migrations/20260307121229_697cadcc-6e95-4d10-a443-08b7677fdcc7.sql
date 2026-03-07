CREATE OR REPLACE FUNCTION public.rpc_coletor_armazenagem_execucao(
  p_tenant_id uuid,
  p_empresa_id uuid,
  p_produto_id uuid
)
RETURNS TABLE(
  estoque_pulmao numeric,
  estoque_picking numeric,
  total_a_armazenar numeric,
  total_armazenado numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.get_current_tenant();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant associado';
  END IF;

  IF p_tenant_id IS DISTINCT FROM v_tenant_id THEN
    RAISE EXCEPTION 'Tenant inválido para o usuário autenticado';
  END IF;

  IF NOT public.fn_usuario_tem_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa inválida para o usuário autenticado';
  END IF;

  RETURN QUERY
  WITH tarefas AS (
    SELECT
      COALESCE(SUM(DISTINCT t.quantidade_requerida), 0) as total_a_armazenar,
      COALESCE(SUM(te.quantidade_executada), 0) as total_armazenado
    FROM tarefa t
    LEFT JOIN tarefa_execucao te ON te.tarefa_id = t.id
    WHERE t.tipo_tarefa_id = '23f51c39-4d7d-48d7-9c0b-667257458c79'
      AND t.tenant_id = v_tenant_id
      AND t.empresa_id = p_empresa_id
      AND t.produto_id = p_produto_id
      AND t.status IN ('CRIADA', 'EM_ANDAMENTO')
  ),
  estoque AS (
    SELECT
      COALESCE(SUM(
        CASE WHEN e.tipo_endereco = 'PULMAO'
             THEN eg.quantidade_disponivel ELSE 0 END
      ), 0) as estoque_pulmao,
      COALESCE(SUM(
        CASE WHEN e.tipo_endereco = 'PICKING'
             THEN eg.quantidade_disponivel ELSE 0 END
      ), 0) as estoque_picking
    FROM estoque_geral eg
    LEFT JOIN endereco e ON eg.endereco_id = e.id
    WHERE eg.tenant_id = v_tenant_id
      AND eg.empresa_id = p_empresa_id
      AND eg.produto_id = p_produto_id
  )
  SELECT
    e.estoque_pulmao,
    e.estoque_picking,
    t.total_a_armazenar,
    t.total_armazenado
  FROM estoque e, tarefas t;
END;
$function$;