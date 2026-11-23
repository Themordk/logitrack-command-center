-- Copiada de produção (schema_migrations, versão 20261109175149): estava aplicada em produção e faltava no repositório.
DO $mig$
DECLARE
  v_def   text;
  v_new   text;
  v_old1  text := $r$    IF v_total_itens_movimento = 1 AND NOT EXISTS ($r$;
  v_new1  text := $r$    -- fix 2026-11-09: corte total conclui a onda independente da quantidade de itens
    IF NOT EXISTS ($r$;
  v_old2  text := $r$      UPDATE movimento_saida SET status = 'CONCLUIDA'
      WHERE id = v_movimento_saida_id AND tenant_id = p_tenant_id;$r$;
  v_new2  text := $r$      UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now()
      WHERE id = v_movimento_saida_id AND tenant_id = p_tenant_id;$r$;
  v_old3  text := $r$  IF v_total_criadas = 0 THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'JA_EXISTE',$r$;
  v_new3  text := $r$  IF v_total_criadas = 0 THEN
    -- fix 2026-11-09: onda 100% cortada (nada separado, nada a conferir) => conclui sem conferencia
    IF EXISTS (SELECT 1 FROM movimento_saida_item mi
                WHERE mi.movimento_saida_id = p_movimento_saida_id AND mi.tenant_id = p_tenant_id)
       AND NOT EXISTS (SELECT 1 FROM movimento_saida_item mi
                WHERE mi.movimento_saida_id = p_movimento_saida_id AND mi.tenant_id = p_tenant_id
                  AND mi.status NOT IN ('CORTE_TOTAL'::enum_status_item_onda, 'CANCELADO'::enum_status_item_onda))
       AND NOT EXISTS (SELECT 1 FROM tarefa tc JOIN movimento_saida_item mi ON mi.id = tc.id_documento_origem
                WHERE mi.movimento_saida_id = p_movimento_saida_id AND tc.tenant_id = p_tenant_id
                  AND (tc.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa)
                       OR (tc.status <> 'CANCELADA'::enum_status_tarefa AND COALESCE(tc.quantidade_executada, 0) > 0)))
    THEN
      UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now()
       WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';
      RETURN jsonb_build_object('sucesso', true, 'codigo', 'CONCLUIDA_CORTE_TOTAL',
        'mensagem', 'Todos os itens foram cortados; movimento concluído sem conferência.');
    END IF;
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'JA_EXISTE',$r$;
BEGIN
  -- 1) _fn_cortar_item_separacao_core
  SELECT pg_get_functiondef('public._fn_cortar_item_separacao_core(uuid,uuid,uuid,text,text)'::regprocedure) INTO v_def;
  IF position(v_old1 in v_def) = 0 OR position(v_old2 in v_def) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado não encontrado em _fn_cortar_item_separacao_core';
  END IF;
  EXECUTE replace(v_def, 'public._fn_cortar_item_separacao_core(', 'public._fn_cortar_item_separacao_core_bkp_20261109(');
  v_new := replace(replace(v_def, v_old1, v_new1), v_old2, v_new2);
  EXECUTE v_new;

  -- 2) fn_gerar_conferencia_saida
  SELECT pg_get_functiondef('public.fn_gerar_conferencia_saida(uuid,uuid)'::regprocedure) INTO v_def;
  IF position(v_old3 in v_def) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado não encontrado em fn_gerar_conferencia_saida';
  END IF;
  EXECUTE replace(v_def, 'public.fn_gerar_conferencia_saida(', 'public.fn_gerar_conferencia_saida_bkp_20261109(');
  EXECUTE replace(v_def, v_old3, v_new3);
END
$mig$;;
