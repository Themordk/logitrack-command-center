-- =====================================================================
-- 2026-11-09 · Inventário · Ajuste de estoque gravado como tipo 6 e com o
-- saldo do endereço no lado certo
--
-- Problemas (fn_pme_processar_inventario):
--   1. O ajuste era gravado com o tipo de movimento do tipo de tarefa INV-ATU
--      (3 = Transferência), aparecendo como "Transferência" no relatório.
--   2. O saldo do endereço era SEMPRE gravado nas colunas de ORIGEM, mesmo no
--      ajuste positivo (que tem só endereço de destino) — 973 casos em prod.
--   3. O saldo gravado era o da combinação lote/HU/validade, enquanto todos os
--      outros movimentos gravam o saldo TOTAL do SKU no endereço
--      (fn_pme_capturar_saldos_anteriores).
--
-- Correção (daqui para frente — o ledger antigo NÃO é alterado; o relatório
-- já reinterpreta os registros antigos na leitura):
--   • tipo_movimento = 6 (Inventário) no ledger;
--   • ajuste positivo  → saldo_anterior/posterior_DESTINO;
--     ajuste negativo  → saldo_anterior/posterior_ORIGEM;
--     sem diferença    → saldo de origem (anterior = posterior), como antes;
--   • saldo = total do SKU no endereço (todos os lotes/HUs).
--   • tipo_tarefa INV-ATU passa a tipo_movimento = 6 (configuração).
--   A regra de cálculo do ajuste (delta por lote/HU) e as validações NÃO mudam.
--
-- Verificado: nenhuma função ou tela filtra ajuste de inventário pelo tipo 3
-- (curva ABC e baixo giro usam 2, 5 e 99).
--
-- Reversão: recriar a definição salva em integracao.bkp_funcao_definicao e
-- voltar INV-ATU para tipo_movimento = 3.
-- =====================================================================

INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(),
       'public.fn_pme_processar_inventario(uuid,uuid,uuid,uuid,text,uuid,uuid,text,date,date,uuid,uuid,uuid,integer)',
       pg_get_functiondef('public.fn_pme_processar_inventario(uuid,uuid,uuid,uuid,text,uuid,uuid,text,date,date,uuid,uuid,uuid,integer)'::regprocedure),
       'Antes de 20261109182405_inventario_ajuste_tipo6_saldo_endereco',
       now();

CREATE OR REPLACE FUNCTION public.fn_pme_processar_inventario(
  p_te_id uuid, p_tenant_id uuid, p_empresa_id uuid, p_id_documento_origem uuid,
  p_tipo_documento_origem text, p_produto_id uuid, p_hu_id uuid, p_lote text,
  p_validade date, p_fabricacao date, p_endereco_origem_id uuid, p_usuario_id uuid,
  p_tarefa_id uuid, p_tipo_movimento integer
)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Ajuste de inventário é sempre tipo 6 no ledger (p_tipo_movimento mantido
  -- na assinatura por compatibilidade com processar_movimento_estoque).
  c_tipo_inventario  CONSTANT smallint := 6;
  v_tarefa_status     text;
  v_valor_convergido  numeric;
  v_endereco_inv      uuid;
  v_estoque_id        uuid;
  v_saldo             numeric;   -- saldo da combinação lote/HU/validade (base do ajuste)
  v_saldo_endereco    numeric;   -- saldo TOTAL do SKU no endereço (snapshot do ledger)
  v_delta             numeric;
  v_movimento_id      uuid;
BEGIN
  SELECT t.status, t.quantidade_executada4, t.id_local_origem
    INTO v_tarefa_status, v_valor_convergido, v_endereco_inv
  FROM tarefa t
  WHERE t.id = p_tarefa_id AND t.tenant_id = p_tenant_id;

  IF v_tarefa_status <> 'CONCLUIDA' OR v_valor_convergido IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM estoque_movimento em
    JOIN tarefa_execucao te2 ON te2.id = em.tarefa_execucao_id
    WHERE te2.tarefa_id = p_tarefa_id AND em.tipo_documento_origem = 'INVENTARIO'
  ) THEN
    RETURN;
  END IF;

  v_endereco_inv := COALESCE(v_endereco_inv, p_endereco_origem_id);

  SELECT id, quantidade_total INTO v_estoque_id, v_saldo
  FROM estoque_geral
  WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
    AND produto_id = p_produto_id AND endereco_id = v_endereco_inv
    AND hu_id = p_hu_id AND lote = p_lote
    AND data_validade = p_validade AND data_fabricacao = p_fabricacao
  FOR UPDATE;

  v_saldo := COALESCE(v_saldo, 0);
  v_delta := v_valor_convergido - v_saldo;

  SELECT COALESCE(SUM(eg.quantidade_total), 0) INTO v_saldo_endereco
  FROM estoque_geral eg
  WHERE eg.tenant_id = p_tenant_id AND eg.empresa_id = p_empresa_id
    AND eg.produto_id = p_produto_id AND eg.endereco_id = v_endereco_inv;

  IF v_delta = 0 THEN
    INSERT INTO estoque_movimento (
      tenant_id, empresa_id, documento_origem_id, produto_id, hu_id, endereco_origem_id,
      data_validade, lote, data_fabricacao, tipo_movimento, quantidade,
      tarefa_execucao_id, tipo_documento_origem, usuario_id,
      saldo_anterior_origem, saldo_posterior_origem
    ) VALUES (
      p_tenant_id, p_empresa_id, p_id_documento_origem, p_produto_id, p_hu_id, v_endereco_inv,
      p_validade, p_lote, p_fabricacao, c_tipo_inventario, 0,
      p_te_id, p_tipo_documento_origem, p_usuario_id,
      v_saldo_endereco, v_saldo_endereco
    ) ON CONFLICT (tarefa_execucao_id) DO NOTHING;
    RETURN;
  END IF;

  INSERT INTO estoque_movimento (
    tenant_id, empresa_id, documento_origem_id, produto_id, hu_id,
    endereco_origem_id, endereco_destino_id, data_validade, lote, data_fabricacao,
    tipo_movimento, quantidade, tarefa_execucao_id, tipo_documento_origem, usuario_id,
    saldo_anterior_origem, saldo_posterior_origem,
    saldo_anterior_destino, saldo_posterior_destino
  ) VALUES (
    p_tenant_id, p_empresa_id, p_id_documento_origem, p_produto_id, p_hu_id,
    CASE WHEN v_delta < 0 THEN v_endereco_inv ELSE NULL END,
    CASE WHEN v_delta > 0 THEN v_endereco_inv ELSE NULL END,
    p_validade, p_lote, p_fabricacao,
    c_tipo_inventario, abs(v_delta), p_te_id, p_tipo_documento_origem, p_usuario_id,
    CASE WHEN v_delta < 0 THEN v_saldo_endereco END,
    CASE WHEN v_delta < 0 THEN v_saldo_endereco + v_delta END,
    CASE WHEN v_delta > 0 THEN v_saldo_endereco END,
    CASE WHEN v_delta > 0 THEN v_saldo_endereco + v_delta END
  ) ON CONFLICT (tarefa_execucao_id) DO NOTHING
  RETURNING id INTO v_movimento_id;

  IF v_movimento_id IS NULL THEN
    RETURN;
  END IF;

  IF v_delta > 0 THEN
    IF v_estoque_id IS NOT NULL THEN
      UPDATE estoque_geral
      SET quantidade_disponivel = quantidade_disponivel + v_delta,
          quantidade_total = quantidade_total + v_delta, atualizado_em = now()
      WHERE id = v_estoque_id AND tenant_id = p_tenant_id;
    ELSE
      INSERT INTO estoque_geral (
        tenant_id, empresa_id, produto_id, endereco_id, hu_id,
        data_validade, data_fabricacao, lote, quantidade_disponivel, quantidade_total
      ) VALUES (
        p_tenant_id, p_empresa_id, p_produto_id, v_endereco_inv, p_hu_id,
        p_validade, p_fabricacao, p_lote, v_delta, v_delta
      );
    END IF;
  END IF;

  IF v_delta < 0 THEN
    IF v_estoque_id IS NULL THEN
      RAISE EXCEPTION 'Estoque inexistente para ajuste negativo de inventário';
    END IF;
    IF v_saldo < abs(v_delta) THEN
      RAISE EXCEPTION 'Saldo insuficiente para ajuste. Saldo: %, Delta: %', v_saldo, v_delta;
    END IF;
    UPDATE estoque_geral
    SET quantidade_disponivel = quantidade_disponivel + v_delta,
        quantidade_total = quantidade_total + v_delta, atualizado_em = now()
    WHERE id = v_estoque_id AND tenant_id = p_tenant_id;
  END IF;
END;
$function$;

-- Configuração: o tipo de tarefa de ajuste de inventário passa a declarar tipo 6
UPDATE public.tipo_tarefa
   SET tipo_movimento = 6
 WHERE codigo = 'INV-ATU'
   AND tipo_movimento IS DISTINCT FROM 6;
