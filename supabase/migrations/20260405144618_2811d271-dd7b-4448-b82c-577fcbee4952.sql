
-- View 1: Inventory listing with creator name
CREATE OR REPLACE VIEW public.vw_inventario_lista AS
SELECT
  i.id,
  i.tenant_id,
  i.empresa_id,
  i.armazem_id,
  i.numero_inventario,
  i.tipo_inventario,
  i.descricao,
  i.status,
  i.criado_em,
  i.criado_por,
  i.total_itens,
  i.total_divergencias,
  i.acuracidade,
  i.origem,
  i.tipo_execucao,
  i.observacao,
  u.login AS criado_por_nome
FROM inventario i
LEFT JOIN usuario u ON u.id = i.criado_por
WHERE i.tenant_id = get_current_tenant();

-- View 2: Inventory execution details with usuario, endereco, hu
CREATE OR REPLACE VIEW public.vw_inventario_execucao AS
SELECT
  te.id,
  te.tarefa_id,
  te.tenant_id,
  te.usuario_id,
  u.login AS usuario_login,
  te.quantidade_executada,
  te.endereco_origem_id,
  e.descricao AS endereco_descricao,
  te.lote,
  te.fabricacao,
  te.validade,
  te.hu,
  h.codigo_hu AS hu_codigo,
  te.concluido_em
FROM tarefa_execucao te
LEFT JOIN usuario u ON u.id = te.usuario_id
LEFT JOIN endereco e ON e.id = te.endereco_origem_id
LEFT JOIN hu h ON h.id = te.hu
WHERE te.tenant_id = get_current_tenant();
