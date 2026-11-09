-- =====================================================================
-- 2026-11-09 · Ledger · Padroniza o saldo do endereço gravado em três pontos
-- de cancelamento/estorno
--
-- Padrão do ledger (fn_pme_capturar_saldos_anteriores): saldo TOTAL do SKU
-- no endereço (todos os lotes/HUs), anterior e posterior ao movimento.
--
-- 1. _fn_remocao_doc_saida_core — estorno (99) ao endereço de cancelamento
--    gravado SEM saldo. Passa a gravar saldo anterior/posterior do destino
--    (lido antes do crédito em estoque_geral).
-- 2. separacao_confirmar_entrega_cancelamento (caminho legado v1) — gravava
--    só o saldo POSTERIOR do destino, e calculado a partir do disponível de
--    UMA linha de estoque (LIMIT 1). Passa a gravar anterior e posterior com
--    o total do endereço.
-- 3. fn_cancelar_documento_entrada — gravava o saldo de ORIGEM a partir do
--    disponível do lote. Passa a gravar o total do SKU no endereço. O saldo
--    de destino continua nulo: nesse fluxo o endereço de cancelamento só é
--    creditado quando a tarefa PED-CAN é entregue.
--
-- O ledger antigo NÃO é alterado. Técnica igual à de 20261109182344:
-- substituição cirúrgica do trecho sobre a definição instalada, com backup
-- em integracao.bkp_funcao_definicao e falha se o trecho não for encontrado
-- exatamente uma vez (nada é alterado nesse caso).
-- =====================================================================

CREATE OR REPLACE FUNCTION pg_temp.fn_patch_funcao(
  p_funcao regprocedure, p_trecho_antigo text, p_trecho_novo text, p_motivo text
) RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_def  text := replace(pg_get_functiondef(p_funcao), E'\r\n', E'\n');
  v_qtd  int;
BEGIN
  v_qtd := (length(v_def) - length(replace(v_def, p_trecho_antigo, ''))) / NULLIF(length(p_trecho_antigo), 0);
  IF v_qtd IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Patch % abortado: trecho encontrado % vez(es) (esperado 1).', p_funcao, COALESCE(v_qtd, 0);
  END IF;

  INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
  VALUES (gen_random_uuid(), p_funcao::text, pg_get_functiondef(p_funcao), p_motivo, now());

  EXECUTE replace(v_def, p_trecho_antigo, p_trecho_novo);
END;
$patch$;

-- 1. Remoção de documento de saída ------------------------------------------
SELECT pg_temp.fn_patch_funcao(
  'public._fn_remocao_doc_saida_core(uuid,uuid,uuid,uuid,uuid,uuid,text,text,boolean)'::regprocedure,
$antigo$        INSERT INTO estoque_movimento (tenant_id, empresa_id, produto_id, quantidade, endereco_destino_id, hu_id,
          lote, data_validade, data_fabricacao, numero_serie, tipo_movimento, usuario_id, tarefa_execucao_id,
          estorno_da_execucao_id, documento_origem_id, tipo_documento_origem)
        VALUES (p_tenant_id, p_empresa_id, e.produto_id, e.quantidade, v_end_cancel, e.hu_id,
          e.lote, e.data_validade, e.data_fabricacao, e.numero_serie, 99, p_usuario_id, NULL,
          e.te_id, v_remocao_id::text, 'REMOCAO_DOCUMENTO');$antigo$,
$novo$        -- Saldo do endereço de cancelamento lido ANTES do crédito (20261109182426)
        INSERT INTO estoque_movimento (tenant_id, empresa_id, produto_id, quantidade, endereco_destino_id, hu_id,
          lote, data_validade, data_fabricacao, numero_serie, tipo_movimento, usuario_id, tarefa_execucao_id,
          estorno_da_execucao_id, documento_origem_id, tipo_documento_origem,
          saldo_anterior_destino, saldo_posterior_destino)
        SELECT p_tenant_id, p_empresa_id, e.produto_id, e.quantidade, v_end_cancel, e.hu_id,
          e.lote, e.data_validade, e.data_fabricacao, e.numero_serie, 99, p_usuario_id, NULL,
          e.te_id, v_remocao_id::text, 'REMOCAO_DOCUMENTO',
          s.saldo, s.saldo + e.quantidade
        FROM (
          SELECT COALESCE(SUM(eg.quantidade_total), 0) AS saldo
          FROM estoque_geral eg
          WHERE eg.tenant_id = p_tenant_id AND eg.empresa_id = p_empresa_id
            AND eg.produto_id = e.produto_id AND eg.endereco_id = v_end_cancel
        ) s;$novo$,
  'Antes de 20261109182426_padroniza_saldo_ledger_cancelamentos'
);

-- 2. Entrega no endereço de cancelamento (legado v1) ----------------------------
SELECT pg_temp.fn_patch_funcao(
  'public.separacao_confirmar_entrega_cancelamento(uuid,uuid,uuid,uuid)'::regprocedure,
$antigo$      SELECT COALESCE(eg.quantidade_disponivel, 0) INTO v_saldo_destino FROM estoque_geral eg
       WHERE eg.tenant_id = p_tenant_id AND eg.empresa_id = v_empresa_id
         AND eg.produto_id = v_tarefa.produto_id AND eg.endereco_id = v_endereco_cancel_id
       LIMIT 1;
      v_saldo_destino := COALESCE(v_saldo_destino, 0);

      INSERT INTO estoque_movimento (tenant_id, empresa_id, produto_id, endereco_origem_id, endereco_destino_id,
        tipo_movimento, quantidade, tarefa_execucao_id, documento_origem_id, tipo_documento_origem, usuario_id,
        saldo_posterior_destino)
      VALUES (p_tenant_id, v_empresa_id, v_tarefa.produto_id, v_tarefa.endereco_origem_id, v_endereco_cancel_id,
        3, v_tarefa.quantidade_requerida, v_execucao_id, v_tarefa.msi_id, 'MOVIMENTO_SAIDA_ITEM', p_usuario_id,
        v_saldo_destino + v_tarefa.quantidade_requerida);$antigo$,
$novo$      -- Saldo TOTAL do SKU no endereço de cancelamento (20261109182426)
      SELECT COALESCE(SUM(eg.quantidade_total), 0) INTO v_saldo_destino FROM estoque_geral eg
       WHERE eg.tenant_id = p_tenant_id AND eg.empresa_id = v_empresa_id
         AND eg.produto_id = v_tarefa.produto_id AND eg.endereco_id = v_endereco_cancel_id;
      v_saldo_destino := COALESCE(v_saldo_destino, 0);

      INSERT INTO estoque_movimento (tenant_id, empresa_id, produto_id, endereco_origem_id, endereco_destino_id,
        tipo_movimento, quantidade, tarefa_execucao_id, documento_origem_id, tipo_documento_origem, usuario_id,
        saldo_anterior_destino, saldo_posterior_destino)
      VALUES (p_tenant_id, v_empresa_id, v_tarefa.produto_id, v_tarefa.endereco_origem_id, v_endereco_cancel_id,
        3, v_tarefa.quantidade_requerida, v_execucao_id, v_tarefa.msi_id, 'MOVIMENTO_SAIDA_ITEM', p_usuario_id,
        v_saldo_destino, v_saldo_destino + v_tarefa.quantidade_requerida);$novo$,
  'Antes de 20261109182426_padroniza_saldo_ledger_cancelamentos'
);

-- 3. Cancelamento de documento de entrada ---------------------------------------
--    O UPDATE da origem acontece ANTES do INSERT: o total lido já é o
--    posterior; o anterior = posterior + quantidade estornada.
SELECT pg_temp.fn_patch_funcao(
  'public.fn_cancelar_documento_entrada(uuid,uuid,uuid,text,text,text)'::regprocedure,
$antigo$          v_estoque_record.mei_id::text, 'CANCELAMENTO_ENTRADA', NULL,
          v_estoque_record.qtd_disponivel, v_estoque_record.qtd_disponivel - v_estoque_record.qtd_estornar);$antigo$,
$novo$          v_estoque_record.mei_id::text, 'CANCELAMENTO_ENTRADA', NULL,
          -- Saldo TOTAL do SKU no endereço de origem (20261109182426)
          (SELECT COALESCE(SUM(eg2.quantidade_total), 0) FROM estoque_geral eg2
            WHERE eg2.tenant_id = p_tenant_id AND eg2.empresa_id = p_empresa_id
              AND eg2.produto_id = v_estoque_record.produto_id
              AND eg2.endereco_id = v_estoque_record.endereco_destino_id) + v_estoque_record.qtd_estornar,
          (SELECT COALESCE(SUM(eg2.quantidade_total), 0) FROM estoque_geral eg2
            WHERE eg2.tenant_id = p_tenant_id AND eg2.empresa_id = p_empresa_id
              AND eg2.produto_id = v_estoque_record.produto_id
              AND eg2.endereco_id = v_estoque_record.endereco_destino_id));$novo$,
  'Antes de 20261109182426_padroniza_saldo_ledger_cancelamentos'
);
