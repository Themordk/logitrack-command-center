
CREATE OR REPLACE FUNCTION public.fn_gerar_abastecimento(
    p_tenant_id uuid,
    p_empresa_id uuid,
    p_armazem_id uuid,
    p_tipo text,
    p_usuario_id uuid,
    p_simular boolean DEFAULT true,
    p_itens jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_abast_id uuid;
    v_tipo enum_tipo_abastecimento;
    v_tipo_tarefa_abast uuid;
    v_tipo_tarefa_sep uuid;
    v_result jsonb;
    v_count integer;
    v_total_itens numeric;
BEGIN

-- =====================================================
-- 1. VALIDAR TIPOS
-- =====================================================

SELECT id INTO v_tipo_tarefa_sep
FROM tipo_tarefa
WHERE codigo = 'SEP'
LIMIT 1;

SELECT id INTO v_tipo_tarefa_abast
FROM tipo_tarefa
WHERE codigo = 'ABAST'
LIMIT 1;

IF v_tipo_tarefa_sep IS NULL OR v_tipo_tarefa_abast IS NULL THEN
    RAISE EXCEPTION 'Tipos SEP/ABAST não configurados.';
END IF;

v_tipo := p_tipo::enum_tipo_abastecimento;

-- =====================================================
-- 2. CRIAR DOCUMENTO (somente se gerando de verdade)
-- =====================================================

IF NOT p_simular THEN
    INSERT INTO abastecimento (
        tenant_id, empresa_id, armazem_id, tipo, criado_por
    )
    VALUES (
        p_tenant_id, p_empresa_id, p_armazem_id, v_tipo, p_usuario_id
    )
    RETURNING id INTO v_abast_id;
END IF;

-- =====================================================
-- 3. Se p_itens informado e NÃO simular, gerar apenas esses itens
-- =====================================================
IF NOT p_simular AND p_itens IS NOT NULL THEN

    WITH selected_items AS (
        SELECT
            (item->>'produto_id')::uuid AS produto_id,
            (item->>'origem')::uuid AS origem,
            (item->>'destino')::uuid AS destino,
            (item->>'quantidade')::numeric AS qtd
        FROM jsonb_array_elements(p_itens) AS item
    ),
    inserted AS (
        INSERT INTO tarefa (
            tenant_id, empresa_id, tipo_tarefa_id, produto_id,
            id_local_origem, id_local_destino, quantidade_requerida,
            armazem_id, id_documento_origem, prioridade
        )
        SELECT
            p_tenant_id, p_empresa_id, v_tipo_tarefa_abast, si.produto_id,
            si.origem, si.destino, si.qtd,
            p_armazem_id, v_abast_id,
            CASE WHEN v_tipo = 'PREVENTIVO' THEN 1 ELSE 2 END
        FROM selected_items si
        RETURNING id, quantidade_requerida
    )
    SELECT COUNT(*), COALESCE(SUM(quantidade_requerida), 0)
    INTO v_count, v_total_itens
    FROM inserted;

    -- update abastecimento totals
    UPDATE abastecimento
    SET total_tarefas = v_count,
        total_itens = v_total_itens
    WHERE id = v_abast_id;

    RETURN jsonb_build_object(
        'abastecimento_id', v_abast_id,
        'total_tarefas', v_count,
        'total_itens', v_total_itens
    );

END IF;

-- =====================================================
-- 4. ENGINE FIFO MULTI-PULMÃO (simulação ou geração sem p_itens)
-- =====================================================

WITH

tarefas_pendentes AS (
    SELECT produto_id, id_local_destino
    FROM tarefa
    WHERE tenant_id = p_tenant_id
      AND empresa_id = p_empresa_id
      AND tipo_tarefa_id = v_tipo_tarefa_abast
      AND status IN ('CRIADA','ATRIBUIDA','EM_ANDAMENTO')
),

saldo_picking AS (
    SELECT
        pp.produto_id,
        pp.endereco_id,
        pp.est_minimo,
        pp.est_maximo,
        COALESCE(SUM(eg.quantidade_disponivel),0) saldo_atual
    FROM picking_produto pp
    LEFT JOIN estoque_geral eg
        ON eg.endereco_id = pp.endereco_id
       AND eg.produto_id = pp.produto_id
       AND eg.tenant_id = p_tenant_id
       AND eg.empresa_id = p_empresa_id
    WHERE pp.tenant_id = p_tenant_id
      AND pp.armazem_id = p_armazem_id
      AND pp.ativo = true
    GROUP BY 1,2,3,4
),

demanda_sep AS (
    SELECT produto_id,
           SUM(quantidade_requerida) demanda
    FROM tarefa
    WHERE tenant_id = p_tenant_id
      AND empresa_id = p_empresa_id
      AND armazem_id = p_armazem_id
      AND tipo_tarefa_id = v_tipo_tarefa_sep
      AND status IN ('CRIADA','ATRIBUIDA','EM_ANDAMENTO')
    GROUP BY produto_id
),

necessidade AS (
    SELECT
        sp.produto_id,
        sp.endereco_id,
        GREATEST(ds.demanda - sp.saldo_atual,0) qtd_necessaria,
        sp.est_minimo,
        sp.est_maximo,
        sp.saldo_atual
    FROM saldo_picking sp
    JOIN demanda_sep ds USING(produto_id)
    WHERE v_tipo = 'PREVENTIVO'

    UNION ALL

    SELECT
        produto_id,
        endereco_id,
        (est_maximo - saldo_atual),
        est_minimo,
        est_maximo,
        saldo_atual
    FROM saldo_picking
    WHERE v_tipo = 'CORRETIVO'
      AND saldo_atual <= est_minimo
),

pulmao_fifo AS (
    SELECT
        eg.produto_id,
        eg.endereco_id,
        eg.quantidade_disponivel,
        eg.atualizado_em,
        SUM(eg.quantidade_disponivel) OVER (
            PARTITION BY eg.produto_id
            ORDER BY eg.atualizado_em, eg.endereco_id
            ROWS UNBOUNDED PRECEDING
        ) acumulado_fifo
    FROM estoque_geral eg
    JOIN endereco e ON e.id = eg.endereco_id
    WHERE eg.tenant_id = p_tenant_id
      AND eg.empresa_id = p_empresa_id
      AND e.armazem_id = p_armazem_id
      AND e.tipo_endereco = 'PULMAO'
      AND eg.quantidade_disponivel > 0
),

abastecer AS (
    SELECT
        n.produto_id,
        pf.endereco_id AS origem,
        n.endereco_id AS destino,
        n.est_minimo,
        n.est_maximo,
        n.saldo_atual AS saldo_picking,
        GREATEST(
            LEAST(
                pf.quantidade_disponivel,
                n.qtd_necessaria
                - COALESCE(
                    LAG(pf.acumulado_fifo)
                    OVER (
                        PARTITION BY n.produto_id, n.endereco_id
                        ORDER BY pf.atualizado_em, pf.endereco_id
                    ),0
                )
            ),
            0
        ) AS qtd
    FROM necessidade n
    JOIN pulmao_fifo pf
        ON pf.produto_id = n.produto_id
    LEFT JOIN tarefas_pendentes tp
        ON tp.produto_id = n.produto_id
       AND tp.id_local_destino = n.endereco_id
    WHERE n.qtd_necessaria > 0
      AND tp.produto_id IS NULL
),

abastecer_final AS (
    SELECT * FROM abastecer WHERE qtd > 0
),

-- INSERT REAL (apenas quando não simular)
inserted AS (
    INSERT INTO tarefa (
        tenant_id, empresa_id, tipo_tarefa_id, produto_id,
        id_local_origem, id_local_destino, quantidade_requerida,
        armazem_id, id_documento_origem, prioridade
    )
    SELECT
        p_tenant_id, p_empresa_id, v_tipo_tarefa_abast, produto_id,
        origem, destino, qtd,
        p_armazem_id, v_abast_id,
        CASE WHEN v_tipo = 'PREVENTIVO' THEN 1 ELSE 2 END
    FROM abastecer_final
    WHERE NOT p_simular
    RETURNING produto_id, quantidade_requerida
),

-- Contadores para update do cabeçalho
totals AS (
    SELECT COUNT(*) AS cnt, COALESCE(SUM(quantidade_requerida),0) AS tot
    FROM inserted
),

-- Em separação por produto
em_sep AS (
    SELECT produto_id, SUM(quantidade_requerida) AS total_sep
    FROM tarefa
    WHERE tenant_id = p_tenant_id
      AND empresa_id = p_empresa_id
      AND armazem_id = p_armazem_id
      AND tipo_tarefa_id = v_tipo_tarefa_sep
      AND status IN ('CRIADA','ATRIBUIDA','EM_ANDAMENTO')
    GROUP BY produto_id
),

-- Saldo pulmão por produto (total)
saldo_pulmao_total AS (
    SELECT eg.produto_id, SUM(eg.quantidade_disponivel) AS saldo
    FROM estoque_geral eg
    JOIN endereco e ON e.id = eg.endereco_id
    WHERE eg.tenant_id = p_tenant_id
      AND eg.empresa_id = p_empresa_id
      AND e.armazem_id = p_armazem_id
      AND e.tipo_endereco = 'PULMAO'
      AND eg.quantidade_disponivel > 0
    GROUP BY eg.produto_id
)

-- RESULTADO ENRIQUECIDO
SELECT jsonb_agg(
    jsonb_build_object(
        'produto_id', af.produto_id,
        'origem', af.origem,
        'destino', af.destino,
        'quantidade', af.qtd,
        'sku', p.sku,
        'descricao', p.descricao,
        'endereco_origem_desc', eo.descricao,
        'endereco_destino_desc', ed.descricao,
        'saldo_picking', af.saldo_picking,
        'saldo_pulmao', COALESCE(spt.saldo, 0),
        'est_minimo', af.est_minimo,
        'est_maximo', af.est_maximo,
        'em_separacao', COALESCE(es.total_sep, 0),
        'setor_id', ed.setor_id,
        'setor_descricao', s.descricao
    )
)
INTO v_result
FROM abastecer_final af
JOIN produto p ON p.id = af.produto_id
JOIN endereco eo ON eo.id = af.origem
JOIN endereco ed ON ed.id = af.destino
LEFT JOIN setor s ON s.id = ed.setor_id
LEFT JOIN em_sep es ON es.produto_id = af.produto_id
LEFT JOIN saldo_pulmao_total spt ON spt.produto_id = af.produto_id;

-- Update totals on abastecimento header when generating
IF NOT p_simular AND v_abast_id IS NOT NULL THEN
    UPDATE abastecimento
    SET total_tarefas = (SELECT cnt FROM totals),
        total_itens = (SELECT tot FROM totals)
    WHERE id = v_abast_id;
END IF;

RETURN COALESCE(v_result, '[]'::jsonb);

END;
$$;
