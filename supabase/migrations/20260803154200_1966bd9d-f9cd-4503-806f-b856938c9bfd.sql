DROP FUNCTION IF EXISTS public.fn_buscar_dados_armazenagem(uuid, uuid[], text);

CREATE OR REPLACE FUNCTION public.fn_buscar_dados_armazenagem(p_tenant_id uuid, p_empresa_ids uuid[], p_ean text)
 RETURNS TABLE(tarefa_id uuid, produto_id uuid, sku text, descricao text, lote text, validade date, fabricacao date, qtd_conferida numeric, qtd_armazenada numeric, qtd_a_armazenar numeric, varios_pickings text, enderecos_picking text, fator_caixa numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN

RETURN QUERY

WITH dados_base AS (
    SELECT DISTINCT ON (t.produto_id)
        t.id AS tarefa_id,
        t.produto_id,
        p.sku,
        p.descricao,
        p.varios_pickings,
        p.fator_caixa,
        t.quantidade_requerida
    FROM tarefa t
    JOIN produto p ON p.id = t.produto_id
    JOIN produto_embalagem pe ON pe.produto_id = p.id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
    WHERE
        t.tenant_id = p_tenant_id
        AND t.empresa_id = ANY(p_empresa_ids)
        AND pe.ean = p_ean
        AND tt.codigo = 'ENTR-ARMZ'
        AND t.status IN ('CRIADA', 'EM_ANDAMENTO')
    ORDER BY t.produto_id, t.criado_em ASC
),

movimentos_vinculados AS (
    SELECT DISTINCT mei.movimento_entrada_id
    FROM tarefa t2
    JOIN tipo_tarefa tt2 ON tt2.id = t2.tipo_tarefa_id
    JOIN movimento_entrada_item mei ON mei.id = t2.id_documento_origem
    WHERE t2.produto_id IN (SELECT db.produto_id FROM dados_base db)
      AND t2.tenant_id = p_tenant_id
      AND t2.empresa_id = ANY(p_empresa_ids)
      AND tt2.codigo = 'ENTR-ARMZ'
      AND t2.status IN ('CRIADA', 'EM_ANDAMENTO')
),

lotes_conferencia AS (
    SELECT
        t.produto_id,
        te.lote,
        te.validade,
        te.fabricacao,
        SUM(COALESCE(te.quantidade_executada, 0))::numeric AS qtd_conferida
    FROM tarefa_execucao te
    JOIN tarefa t ON t.id = te.tarefa_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
    JOIN movimento_entrada_item mei ON mei.id = t.id_documento_origem
    WHERE
        tt.codigo = 'ENTR-CONF'
        AND t.tenant_id = p_tenant_id
        AND t.empresa_id = ANY(p_empresa_ids)
        AND mei.movimento_entrada_id IN (SELECT mv.movimento_entrada_id FROM movimentos_vinculados mv)
    GROUP BY
        t.produto_id,
        te.lote,
        te.validade,
        te.fabricacao
),

lotes_armazenados AS (
    SELECT
        t.produto_id,
        te.lote,
        te.validade,
        te.fabricacao,
        SUM(COALESCE(te.quantidade_executada, 0))::numeric AS qtd_armazenada
    FROM tarefa_execucao te
    JOIN tarefa t ON t.id = te.tarefa_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
    JOIN movimento_entrada_item mei ON mei.id = t.id_documento_origem
    WHERE
        tt.codigo = 'ENTR-ARMZ'
        AND t.tenant_id = p_tenant_id
        AND t.empresa_id = ANY(p_empresa_ids)
        AND mei.movimento_entrada_id IN (SELECT mv.movimento_entrada_id FROM movimentos_vinculados mv)
    GROUP BY
        t.produto_id,
        te.lote,
        te.validade,
        te.fabricacao
),

lotes_consolidados AS (
    SELECT
        lc.produto_id,
        lc.lote,
        lc.validade,
        lc.fabricacao,
        lc.qtd_conferida,
        COALESCE(la.qtd_armazenada, 0) AS qtd_armazenada
    FROM lotes_conferencia lc
    LEFT JOIN lotes_armazenados la
        ON la.produto_id = lc.produto_id
        AND la.lote = lc.lote
        AND COALESCE(la.validade, DATE '1900-01-01') = COALESCE(lc.validade, DATE '1900-01-01')
        AND COALESCE(la.fabricacao, DATE '1900-01-01') = COALESCE(lc.fabricacao, DATE '1900-01-01')
),

pickings AS (
    SELECT
        pp.produto_id,
        STRING_AGG(e.descricao, ' | ' ORDER BY e.descricao) AS enderecos_picking
    FROM picking_produto pp
    JOIN endereco e ON e.id = pp.endereco_id
    WHERE pp.ativo = true
      AND pp.tenant_id = p_tenant_id
    GROUP BY pp.produto_id
)

SELECT
    db.tarefa_id,
    db.produto_id,
    db.sku,
    db.descricao,

    lc.lote,
    lc.validade,
    lc.fabricacao,

    lc.qtd_conferida,
    lc.qtd_armazenada,

    (lc.qtd_conferida - lc.qtd_armazenada) AS qtd_a_armazenar,

    CASE
        WHEN db.varios_pickings THEN 'SIM'
        ELSE 'NAO'
    END AS varios_pickings,

    COALESCE(p.enderecos_picking, '') AS enderecos_picking,

    COALESCE(db.fator_caixa, 1)::numeric AS fator_caixa

FROM dados_base db
JOIN lotes_consolidados lc
    ON lc.produto_id = db.produto_id
LEFT JOIN pickings p
    ON p.produto_id = db.produto_id

WHERE
    (lc.qtd_conferida - lc.qtd_armazenada) > 0

ORDER BY
    lc.validade ASC NULLS LAST,
    lc.lote;

END;
$function$;