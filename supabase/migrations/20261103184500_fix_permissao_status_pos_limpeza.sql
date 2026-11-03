-- 20261103184500_fix_permissao_status_pos_limpeza (já aplicada em produção)
-- As RPCs de limpeza são SECURITY INVOKER: o helper precisa ser executável pelo papel authenticated.
-- Validação de tenant adicionada no próprio helper para uso seguro via API.
CREATE OR REPLACE FUNCTION public._fn_mov_saida_status_pos_limpeza(
  p_tenant_id uuid, p_movimento_saida_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_atual    text;
  v_novo     text;
  v_sep_pend boolean;
  v_sep_exec boolean;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT status::text INTO v_atual
  FROM movimento_saida
  WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_atual IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = msi.tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND msi.tenant_id = p_tenant_id
      AND t.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa)
  ) INTO v_sep_pend;

  IF v_sep_pend THEN
    SELECT EXISTS (
      SELECT 1
      FROM movimento_saida_item msi
      JOIN tarefa t           ON t.id_documento_origem = msi.id AND t.tenant_id = msi.tenant_id
      JOIN tipo_tarefa tt     ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
      JOIN tarefa_execucao te ON te.tarefa_id = t.id AND te.tenant_id = t.tenant_id
      WHERE msi.movimento_saida_id = p_movimento_saida_id
        AND msi.tenant_id = p_tenant_id
        AND t.status <> 'CANCELADA'::enum_status_tarefa
        AND te.status <> 'CANCELADA'::enum_status_execucao_tarefa
    ) INTO v_sep_exec;
    v_novo := CASE WHEN v_sep_exec THEN 'EM_PICKING' ELSE 'LIBERADO' END;
  ELSE
    v_novo := 'EM_CONFERENCIA';
  END IF;

  IF v_novo IS DISTINCT FROM v_atual THEN
    UPDATE movimento_saida
    SET status        = v_novo::enum_status_onda_carregamento,
        finalizado_em = CASE WHEN v_atual = 'CONCLUIDA' THEN NULL ELSE finalizado_em END
    WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id;
  END IF;

  RETURN v_novo;
END;
$$;

REVOKE ALL ON FUNCTION public._fn_mov_saida_status_pos_limpeza(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_mov_saida_status_pos_limpeza(uuid, uuid) TO authenticated;
