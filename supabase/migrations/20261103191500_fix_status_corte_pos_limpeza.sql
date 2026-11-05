-- 20261103191500_fix_status_corte_pos_limpeza
-- Problema (onda #2243): itens só com CORTE (sem coleta). Ao limpar a separação de um item,
-- o helper não via "coleta ativa" e levava a onda para LIBERADO, status em que a limpeza
-- de separação não era aceita -> demais itens com corte ficavam travados.
-- Correção:
--   1) Corte (tarefa SEP com quantidade_cortada > 0) também conta como atividade de
--      separação -> onda fica EM_PICKING até não restar coleta nem corte.
--   2) separacao_limpar_item / separacao_limpar_total aceitam também LIBERADO
--      (destrava ondas que já ficaram nesse estado; em LIBERADO o coletor ainda não iniciou).

-- 1. Helper de status
CREATE OR REPLACE FUNCTION public._fn_mov_saida_status_pos_limpeza(
  p_tenant_id uuid, p_movimento_saida_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_atual     text;
  v_novo      text;
  v_sep_pend  boolean;
  v_atividade boolean;
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
    -- Atividade de separação = coleta ativa OU corte registrado em tarefa SEP
    SELECT EXISTS (
      SELECT 1
      FROM movimento_saida_item msi
      JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = msi.tenant_id
      JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
      WHERE msi.movimento_saida_id = p_movimento_saida_id
        AND msi.tenant_id = p_tenant_id
        AND t.status <> 'CANCELADA'::enum_status_tarefa
        AND (
          COALESCE(t.quantidade_cortada, 0) > 0
          OR EXISTS (
            SELECT 1 FROM tarefa_execucao te
            WHERE te.tarefa_id = t.id AND te.tenant_id = t.tenant_id
              AND te.status <> 'CANCELADA'::enum_status_execucao_tarefa
          )
        )
    ) INTO v_atividade;
    v_novo := CASE WHEN v_atividade THEN 'EM_PICKING' ELSE 'LIBERADO' END;
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

-- 2. Limpeza de separação aceita LIBERADO (edição pontual da lista de status)
DO $fix$
DECLARE
  v_def  text;
  v_novo text;
  r      record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.separacao_limpar_item(uuid,uuid,uuid,uuid,uuid)',
     $a$IF v_status NOT IN ('SEPARADO', 'EM_PICKING', 'EM_CONFERENCIA') THEN$a$,
     $b$IF v_status NOT IN ('LIBERADO', 'SEPARADO', 'EM_PICKING', 'EM_CONFERENCIA') THEN$b$),
    ('public.separacao_limpar_total(uuid,uuid,uuid,uuid)',
     $a$IF v_status NOT IN ('SEPARADO', 'EM_PICKING', 'EM_CONFERENCIA') THEN$a$,
     $b$IF v_status NOT IN ('LIBERADO', 'SEPARADO', 'EM_PICKING', 'EM_CONFERENCIA') THEN$b$)
  ) AS x(fn, de, para)
  LOOP
    v_def := pg_get_functiondef(r.fn::regprocedure);
    IF position(r.para IN v_def) > 0 THEN
      CONTINUE; -- já aplicado
    END IF;
    IF position(r.de IN v_def) = 0 THEN
      RAISE EXCEPTION 'Trecho esperado não encontrado em %', r.fn;
    END IF;
    v_novo := replace(v_def, r.de, r.para);
    EXECUTE v_novo;
  END LOOP;
END
$fix$;
