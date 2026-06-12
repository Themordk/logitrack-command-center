DROP FUNCTION IF EXISTS public.conferencia_buscar_tarefas(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.conferencia_buscar_tarefas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid)
 RETURNS TABLE(id uuid, tarefa_id uuid, produto_id uuid, ordem_tarefa integer, sku text, descricao text, fator_caixa numeric, quantidade_requerida numeric, conferido numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório';
  END IF;

  WITH tarefas_disponiveis AS (
      SELECT t.id
      FROM tarefa t
      JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
      JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
      WHERE tt.codigo = 'SEP-CONF'
        AND t.tenant_id = p_tenant_id
        AND t.status IN ('CRIADA'::enum_status_tarefa,'ATRIBUIDA'::enum_status_tarefa,'EM_ANDAMENTO'::enum_status_tarefa)
        AND msi.movimento_saida_id = p_movimento_saida_id
        AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
      ORDER BY t.ordem_tarefa
  ),
  tarefas_atribuidas AS (
      INSERT INTO tarefa_atribuicao (tenant_id, empresa_id, tarefa_id, usuario_id, tipo_convocacao, status)
      SELECT p_tenant_id, p_empresa_id, td.id, p_usuario_id, 'AUTO_CONVOCADO', 'ATRIBUIDA'
      FROM tarefas_disponiveis td
      ON CONFLICT (tarefa_id, usuario_id) DO NOTHING
      RETURNING tarefa_id
  )
  UPDATE tarefa t
  SET status = 'ATRIBUIDA'
  FROM tarefas_atribuidas ta
  WHERE t.id = ta.tarefa_id
    AND t.tenant_id = p_tenant_id
    AND t.status = 'CRIADA';

  UPDATE movimento_saida ms
  SET status = 'EM_CONFERENCIA'::enum_status_onda_carregamento
  WHERE ms.id = p_movimento_saida_id
    AND ms.tenant_id = p_tenant_id;

  RETURN QUERY
  SELECT
      t.id,
      t.id AS tarefa_id,
      t.produto_id,
      t.ordem_tarefa::integer,
      p.sku,
      p.descricao,
      p.fator_caixa::numeric,
      t.quantidade_requerida::numeric,
      COALESCE(t.quantidade_executada, 0)::numeric AS conferido,
      t.status::text
  FROM tarefa t
  JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
  JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
  JOIN produto p ON p.id = t.produto_id
  WHERE msi.movimento_saida_id = p_movimento_saida_id
    AND t.tenant_id = p_tenant_id
    AND t.status IN ('CRIADA'::enum_status_tarefa,'ATRIBUIDA'::enum_status_tarefa,'EM_ANDAMENTO'::enum_status_tarefa)
    AND EXISTS (
        SELECT 1 FROM tarefa_atribuicao ta
        WHERE ta.tarefa_id = t.id
          AND ta.usuario_id = p_usuario_id
          AND ta.status = 'ATRIBUIDA'
          AND ta.tenant_id = p_tenant_id
    )
  ORDER BY t.ordem_tarefa;
END;
$function$;