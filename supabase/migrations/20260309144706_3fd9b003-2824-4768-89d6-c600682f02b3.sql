DROP VIEW IF EXISTS vw_movimento_entrada_conferencia_detalhe;
CREATE VIEW vw_movimento_entrada_conferencia_detalhe AS
SELECT 
    me.id AS movimento_id,
    te.id AS tarefa_execucao_id,
    t.id AS tarefa_id,
    t.status AS tarefa_status,
    p.sku,
    p.descricao,
    u.nome AS operador,
    h.codigo_hu,
    te.validade,
    te.fabricacao,
    te.serie,
    te.quantidade_executada,
    te.iniciado_em,
    te.concluido_em,
    te.status,
    te.lote
FROM tarefa t
JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
JOIN tarefa_execucao te ON te.tarefa_id = t.id
JOIN usuario u ON u.id = te.usuario_id
LEFT JOIN hu h ON h.id = te.hu
JOIN produto p ON p.id = t.produto_id
JOIN movimento_entrada_item mei ON mei.id = t.id_documento_origem
JOIN movimento_entrada me ON me.id = mei.movimento_entrada_id
WHERE tt.descricao = 'CONFERENCIA_ENTRADA';