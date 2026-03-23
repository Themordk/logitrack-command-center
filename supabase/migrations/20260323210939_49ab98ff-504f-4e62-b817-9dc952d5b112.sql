DROP VIEW IF EXISTS public.inventario_item_resumo;
CREATE VIEW public.inventario_item_resumo AS
SELECT 
    t.id,
    t.id_documento_origem AS inventario_id,
    e.rua,
    e.predio,
    e.nivel,
    e.apto,
    p.sku,
    p.referencia,
    p.descricao,
    t.quantidade_requerida,
    t.quantidade_executada AS primeira_contagem,
    t.quantidade_executada2 AS segunda_contagem,
    t.quantidade_executada3 AS "divergência",
    t.quantidade_executada4 AS saldo_final,
    t.status
FROM tarefa t
JOIN inventario i ON t.id_documento_origem = i.id
JOIN produto p ON p.id = t.produto_id
JOIN endereco e ON e.id = t.id_local_origem
LEFT JOIN tipo_tarefa tt ON t.tipo_tarefa_id = tt.id
WHERE tt.codigo = 'INV-AUDIT';