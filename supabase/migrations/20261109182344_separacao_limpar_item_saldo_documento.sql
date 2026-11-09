-- =====================================================================
-- 2026-11-09 · Separação · Limpeza de item: estorno (tipo 99) com saldo e documento
--
-- Problema: separacao_limpar_item devolve a quantidade separada ao endereço
-- de cancelamento gravando o estorno (tipo 99) SEM:
--   • saldo anterior/posterior do endereço de cancelamento;
--   • documento de origem (impossível saber de qual onda/item voltou).
-- Em produção havia 161 estornos nessa situação (09/11/2026).
--
-- Correção (daqui para frente — o ledger antigo NÃO é alterado):
--   • saldo_anterior_destino = saldo total do SKU no endereço de cancelamento
--     ANTES do crédito; saldo_posterior_destino = anterior + quantidade;
--   • tipo_documento_origem = 'LIMPEZA_SEPARACAO_ITEM';
--   • documento_origem_id   = id do movimento_saida_item limpo.
--   O histórico antigo é exibido no relatório como LIMPEZA_SEPARACAO_ITEM
--   (ver 20261109182332_rpc_historico_movimento_saldo_global).
--
-- Técnica: a função é alterada por SUBSTITUIÇÃO CIRÚRGICA do trecho do
-- INSERT no ledger sobre a definição que estiver instalada no banco. Assim a
-- correção vale tanto para a versão do branch-qa quanto para a de produção
-- (que têm outras diferenças entre si) sem regredir nenhuma delas.
-- A migration falha (e nada é alterado) se o trecho não for encontrado
-- exatamente uma vez.
--
-- Reversão: recriar a definição salva em integracao.bkp_funcao_definicao.
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

SELECT pg_temp.fn_patch_funcao(
  'public.separacao_limpar_item(uuid,uuid,uuid,uuid,uuid)'::regprocedure,
$antigo$        INSERT INTO estoque_movimento (
          tenant_id, empresa_id, produto_id, quantidade,
          endereco_destino_id, hu_id, lote, data_validade, data_fabricacao,
          tipo_movimento, usuario_id, tarefa_execucao_id, estorno_da_execucao_id
        ) VALUES (
          r_exec.tenant_id, p_empresa_id, r_exec.produto_id, r_exec.quantidade,
          v_endereco_cancelamento, r_exec.hu_id, r_exec.lote, r_exec.data_validade,
          r_exec.data_fabricacao, 99, p_usuario_id, NULL, r_exec.tarefa_execucao_id
        );$antigo$,
$novo$        -- Estorno com saldo do endereço de cancelamento e documento de origem
        -- (20261109182344). O saldo é lido ANTES do crédito em estoque_geral.
        INSERT INTO estoque_movimento (
          tenant_id, empresa_id, produto_id, quantidade,
          endereco_destino_id, hu_id, lote, data_validade, data_fabricacao,
          tipo_movimento, usuario_id, tarefa_execucao_id, estorno_da_execucao_id,
          documento_origem_id, tipo_documento_origem,
          saldo_anterior_destino, saldo_posterior_destino
        )
        SELECT
          r_exec.tenant_id, p_empresa_id, r_exec.produto_id, r_exec.quantidade,
          v_endereco_cancelamento, r_exec.hu_id, r_exec.lote, r_exec.data_validade,
          r_exec.data_fabricacao, 99, p_usuario_id, NULL, r_exec.tarefa_execucao_id,
          v_movimento_saida_item_id::text, 'LIMPEZA_SEPARACAO_ITEM',
          s.saldo, s.saldo + r_exec.quantidade
        FROM (
          SELECT COALESCE(SUM(eg.quantidade_total), 0) AS saldo
          FROM estoque_geral eg
          WHERE eg.tenant_id   = p_tenant_id
            AND eg.empresa_id  = p_empresa_id
            AND eg.produto_id  = r_exec.produto_id
            AND eg.endereco_id = v_endereco_cancelamento
        ) s;$novo$,
  'Antes de 20261109182344_separacao_limpar_item_saldo_documento'
);
