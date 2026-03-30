
-- View 1: Lista de movimentos de entrada (elimina N+1 na listagem)
CREATE OR REPLACE VIEW public.vw_movimento_entrada_lista AS
SELECT
  me.id,
  me.numero_movimento,
  me.status,
  me.created_at,
  me.placa_veiculo,
  me.empresa_id,
  me.armazem_id,
  me.tenant_id,
  p.razaosocial AS parceiro_nome
FROM movimento_entrada me
LEFT JOIN LATERAL (
  SELECT med.documento_entrada_id
  FROM movimento_entrada_documento med
  WHERE med.movimento_entrada_id = me.id
  LIMIT 1
) first_doc ON true
LEFT JOIN documento_entrada de ON de.id = first_doc.documento_entrada_id
LEFT JOIN parceiro p ON p.id = de.parceiro_id;

-- View 2: Lista de ondas de carregamento (elimina N+1 na listagem)
CREATE OR REPLACE VIEW public.vw_movimento_saida_lista AS
SELECT
  ms.id,
  ms.numero_onda,
  ms.status,
  ms.data_emissao,
  ms.destino_carga,
  ms.motorista,
  ms.total_pedidos,
  ms.peso_total,
  ms.m3,
  ms.prioridade,
  ms.total_volume,
  ms.observacao,
  ms.box_id,
  ms.rota_id,
  ms.veiculo_id,
  ms.empresa_id,
  ms.tenant_id,
  b.descricao AS box_nome,
  p.razaosocial AS parceiro_nome
FROM movimento_saida ms
LEFT JOIN box b ON b.id = ms.box_id
LEFT JOIN LATERAL (
  SELECT msd.documento_saida_id
  FROM movimento_saida_documento msd
  WHERE msd.movimento_saida_id = ms.id
  LIMIT 1
) first_doc ON true
LEFT JOIN documento_saida ds ON ds.id = first_doc.documento_saida_id
LEFT JOIN parceiro p ON p.id = ds.parceiro_id;

-- View 3: Documentos vinculados a movimento de entrada
CREATE OR REPLACE VIEW public.vw_movimento_entrada_docs_vinculados AS
SELECT
  med.movimento_entrada_id,
  de.numero_nota,
  p.razaosocial,
  de.valor_total_nota,
  de.qtd_volume,
  de.tenant_id,
  (SELECT count(*) FROM documento_entrada_item dei WHERE dei.documento_entrada_id = de.id) AS total_skus
FROM movimento_entrada_documento med
JOIN documento_entrada de ON de.id = med.documento_entrada_id
LEFT JOIN parceiro p ON p.id = de.parceiro_id;

-- View 4: Documentos vinculados a onda de carregamento
CREATE OR REPLACE VIEW public.vw_movimento_saida_docs_vinculados AS
SELECT
  msd.movimento_saida_id,
  msd.ordem,
  ds.numero_pedido,
  ds.data_emissao,
  ds.valor_pedido,
  p.razaosocial AS parceiro,
  ds.tenant_id
FROM movimento_saida_documento msd
JOIN documento_saida ds ON ds.id = msd.documento_saida_id
LEFT JOIN parceiro p ON p.id = ds.parceiro_id;

-- View 5: Info tab do movimento de entrada (box + armazém)
CREATE OR REPLACE VIEW public.vw_movimento_entrada_info AS
SELECT
  me.id AS movimento_id,
  me.confirma_volume,
  me.total_volume,
  me.total_volume_conferido,
  me.placa_veiculo,
  me.valor_descarga,
  me.crossdocking,
  me.observacao,
  me.tenant_id,
  b.descricao AS box_descricao,
  a.descricao AS armazem_descricao
FROM movimento_entrada me
LEFT JOIN box b ON b.id = me.box_id
LEFT JOIN armazem a ON a.id = me.armazem_id;
