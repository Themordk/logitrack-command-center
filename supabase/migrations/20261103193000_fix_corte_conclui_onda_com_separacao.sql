-- 20261103193000_fix_corte_conclui_onda_com_separacao (já aplicada em produção)
-- Onda #942: 1 item com 2 tarefas SEP. Coleta de 2 na tarefa B + corte do restante; ao cortar
-- a tarefa A (req 1) por último, cortar_item_separacao comparava só o corte DESTA tarefa com o
-- requerido DESTA tarefa e concluía a onda (CONCLUIDA) sem conferência, ignorando as 2 unidades
-- separadas. Correção: onda de 1 item só conclui direto se NADA foi separado em nenhuma tarefa SEP.
DO $fix$
DECLARE
  v_def text;
  r     record;
  de    text := $a$IF v_total_itens_movimento = 1 AND v_quantidade_a_cortar = v_quantidade_requerida THEN$a$;
  para  text := $b$IF v_total_itens_movimento = 1 AND NOT EXISTS (
      SELECT 1
      FROM tarefa tq
      JOIN movimento_saida_item mq ON mq.id = tq.id_documento_origem
      JOIN tipo_tarefa ttq ON ttq.id = tq.tipo_tarefa_id AND ttq.codigo = 'SEP'
      WHERE mq.movimento_saida_id = v_movimento_saida_id
        AND tq.tenant_id = p_tenant_id
        AND tq.status <> 'CANCELADA'::enum_status_tarefa
        AND COALESCE(tq.quantidade_executada, 0) > 0
    ) THEN -- onda de 1 item só conclui se NADA foi separado (fix 2026-11-03)$b$;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cortar_item_separacao'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('(fix 2026-11-03)' IN v_def) > 0 THEN
      CONTINUE;
    END IF;
    IF position(de IN v_def) = 0 THEN
      RAISE EXCEPTION 'Trecho esperado não encontrado em cortar_item_separacao(%)', r.args;
    END IF;
    EXECUTE replace(v_def, 'FUNCTION public.cortar_item_separacao(', 'FUNCTION public.cortar_item_separacao_bkp_20261103(');
    EXECUTE replace(v_def, de, para);
  END LOOP;
  REVOKE ALL ON FUNCTION public.cortar_item_separacao_bkp_20261103(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.cortar_item_separacao_bkp_20261103(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
END
$fix$;
