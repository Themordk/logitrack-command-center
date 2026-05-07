CREATE INDEX IF NOT EXISTS idx_doc_entrada_lista
  ON documento_entrada (tenant_id, empresa_id, status, armazem_id, data_emissao DESC);

CREATE INDEX IF NOT EXISTS idx_doc_entrada_item_doc
  ON documento_entrada_item (documento_entrada_id);