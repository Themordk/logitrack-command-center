DROP VIEW IF EXISTS vw_movimento_saida_resumo;
CREATE VIEW vw_movimento_saida_resumo AS
SELECT ms.id AS movimento_id,
    msi.id AS movimento_item_id,
    msi.produto_id,
    p.sku,
    p.descricao,
    msi.qtd_esperada,
    COALESCE(sum(
        CASE
            WHEN tt.codigo = 'SEP'::text THEN te.quantidade_executada
            ELSE NULL::numeric
        END), 0::numeric) AS qtd_separada,
    COALESCE(sum(
        CASE
            WHEN tt.codigo = 'SAI-CONF'::text THEN te.quantidade_executada
            ELSE NULL::numeric
        END), 0::numeric) AS qtd_conferida
   FROM movimento_saida ms
     JOIN movimento_saida_item msi ON msi.movimento_saida_id = ms.id
     JOIN produto p ON p.id = msi.produto_id
     LEFT JOIN tarefa t ON t.id_documento_origem = msi.id
     LEFT JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
     LEFT JOIN tarefa_execucao te ON te.tarefa_id = t.id
  GROUP BY ms.id, msi.id, msi.produto_id, p.sku, p.descricao, msi.qtd_esperada;