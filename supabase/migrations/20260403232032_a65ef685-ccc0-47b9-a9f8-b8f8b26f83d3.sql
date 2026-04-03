CREATE OR REPLACE VIEW public.vw_estoque_movimento_relatorio AS
SELECT
  em.id,
  em.criado_em,
  em.tenant_id,
  em.empresa_id,
  em.tipo_movimento,
  em.quantidade,
  em.lote,
  em.hu_id,
  em.tarefa_execucao_id,
  em.usuario_id,
  -- Produto
  p.sku,
  p.descricao AS produto_descricao,
  -- Enderecos
  eo.descricao AS endereco_origem,
  ed.descricao AS endereco_destino,
  -- Usuario
  u.nome AS usuario_nome,
  -- Tarefa (via tarefa_execucao -> tarefa)
  t.tipo_documento_origem,
  tt.codigo AS tipo_tarefa_codigo,
  tt.descricao AS tipo_tarefa_descricao,
  -- Tarefa execucao resumo
  te.status AS tarefa_execucao_status,
  te.usuario_id AS tarefa_usuario_id,
  tu.nome AS tarefa_usuario_nome
FROM estoque_movimento em
LEFT JOIN produto p ON p.id = em.produto_id
LEFT JOIN endereco eo ON eo.id = em.endereco_origem_id
LEFT JOIN endereco ed ON ed.id = em.endereco_destino_id
LEFT JOIN usuario u ON u.id = em.usuario_id
LEFT JOIN tarefa_execucao te ON te.id = em.tarefa_execucao_id
LEFT JOIN tarefa t ON t.id = te.tarefa_id
LEFT JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
LEFT JOIN usuario tu ON tu.id = te.usuario_id;