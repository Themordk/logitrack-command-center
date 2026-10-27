-- 2026-10-27: realoca tarefas SEP cuja origem perdeu saldo após a liberação
-- (antes só tarefas com sem_saldo_na_liberacao = true). Caso JRLUB mov. 2166.

-- Backup da versão atual
DO $$
BEGIN
  IF to_regprocedure('public.fn_realocar_tarefas_pendentes_picking_bkp_20261027(uuid,uuid)') IS NULL THEN
    EXECUTE replace(
      pg_get_functiondef('public.fn_realocar_tarefas_pendentes_picking(uuid,uuid)'::regprocedure),
      'public.fn_realocar_tarefas_pendentes_picking(',
      'public.fn_realocar_tarefas_pendentes_picking_bkp_20261027(');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_realocar_tarefas_pendentes_picking(p_tenant_id uuid, p_movimento_saida_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v2 (2026-10-27): removido filtro sem_saldo_na_liberacao. Toda tarefa SEP não iniciada
--   cuja origem está sem saldo disponível é realocada (saldo consumido por outra tarefa,
--   inventário, transferência etc.). sem_saldo_na_liberacao permanece apenas como histórico.
DECLARE
  v_empresa_id               uuid;
  v_separa_pulmao            boolean := false;
  v_endereco_cancelamento_id uuid;
  v_armazem_id               uuid;
  v_segregados               uuid[] := '{}'::uuid[];
  v_t                        RECORD;
  v_dest                     RECORD;
  v_realocadas               integer := 0;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT ms.empresa_id, COALESCE(ts.separa_pulmao, false)
    INTO v_empresa_id, v_separa_pulmao
  FROM movimento_saida ms
  LEFT JOIN tipo_saida ts ON ts.id = ms.tipo_saida
  WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id;

  IF v_empresa_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT ac.endereco_cancelamento_id, ac.armazem_id,
         array_remove(ARRAY[ac.endereco_avaria_id, ac.endereco_quarentena_id], NULL)
    INTO v_endereco_cancelamento_id, v_armazem_id, v_segregados
  FROM armazem_config ac
  WHERE ac.tenant_id = p_tenant_id AND ac.empresa_id = v_empresa_id AND ac.ativo = true
  LIMIT 1;
  v_segregados := COALESCE(v_segregados, '{}'::uuid[]);

  FOR v_t IN
    SELECT t.id, t.produto_id, t.quantidade_requerida, t.empresa_id, COALESCE(p.usa_picking, false) AS usa_picking
    FROM tarefa t
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    JOIN produto p ON p.id = t.produto_id
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND t.tenant_id = p_tenant_id
      AND t.status IN ('CRIADA', 'ATRIBUIDA')
      AND COALESCE(t.quantidade_executada, 0) = 0
      AND (
        t.id_local_origem IS NULL
        OR NOT EXISTS (SELECT 1 FROM estoque_geral eg
                       WHERE eg.produto_id = t.produto_id AND eg.endereco_id = t.id_local_origem
                         AND eg.quantidade_disponivel > 0))
    FOR UPDATE OF t SKIP LOCKED
  LOOP
    SELECT eg.endereco_id, SUM(eg.quantidade_disponivel) AS saldo, e.rua, e.predio, e.nivel, e.apto
      INTO v_dest
    FROM estoque_geral eg
    JOIN endereco e ON e.id = eg.endereco_id
    LEFT JOIN picking_produto pp
      ON pp.produto_id = v_t.produto_id AND pp.endereco_id = eg.endereco_id
     AND pp.ativo = true AND pp.tenant_id = p_tenant_id
    WHERE eg.produto_id = v_t.produto_id
      AND eg.tenant_id = p_tenant_id
      AND eg.quantidade_disponivel > 0
      AND e.situacao NOT IN ('BLOQUEADO', 'BLOQUEADO_INVENTARIO')
      AND eg.endereco_id <> ALL (v_segregados)
      AND (
        (v_endereco_cancelamento_id IS NOT NULL AND eg.endereco_id = v_endereco_cancelamento_id)
        OR (v_t.usa_picking = false AND e.tipo_endereco = 'PULMAO')
        OR (v_t.usa_picking = true AND e.tipo_endereco = 'PICKING')
        OR (v_t.usa_picking = true AND v_separa_pulmao = true AND e.tipo_endereco = 'PULMAO'
            AND NOT EXISTS (
              SELECT 1 FROM estoque_geral eg2 JOIN endereco e2 ON e2.id = eg2.endereco_id
              WHERE eg2.produto_id = v_t.produto_id AND eg2.quantidade_disponivel > 0
                AND e2.tipo_endereco = 'PICKING'
                AND e2.situacao NOT IN ('BLOQUEADO', 'BLOQUEADO_INVENTARIO')
                AND eg2.endereco_id <> ALL (v_segregados))))
    GROUP BY eg.endereco_id, e.rua, e.predio, e.nivel, e.apto, pp.id, e.tipo_endereco
    ORDER BY
      (SUM(eg.quantidade_disponivel) >= v_t.quantidade_requerida) DESC,
      CASE
        WHEN v_endereco_cancelamento_id IS NOT NULL AND eg.endereco_id = v_endereco_cancelamento_id THEN 0
        WHEN pp.id IS NOT NULL THEN 1
        WHEN e.tipo_endereco = 'PICKING' THEN 2
        ELSE 3
      END,
      MIN(eg.data_validade) ASC NULLS LAST,
      MIN(eg.atualizado_em) ASC NULLS LAST
    LIMIT 1;

    CONTINUE WHEN v_dest.endereco_id IS NULL;

    UPDATE tarefa
       SET id_local_origem  = v_dest.endereco_id,
           motivo_pendencia = NULL,
           ordem_tarefa     = (
             COALESCE((SELECT oe.sequencia FROM ordem_expedicao oe
                       WHERE oe.rua = v_dest.rua AND oe.tenant_id = p_tenant_id
                         AND oe.empresa_id = v_t.empresa_id
                         AND (oe.armazem_id IS NULL OR oe.armazem_id = v_armazem_id)
                       LIMIT 1), 999) * 1000000
             + COALESCE(v_dest.predio, 0) * 10000
             + COALESCE(v_dest.nivel, 0) * 100
             + COALESCE(v_dest.apto, 0))::numeric
     WHERE id = v_t.id;

    v_realocadas := v_realocadas + 1;
  END LOOP;

  RETURN v_realocadas;
END;
$function$;
