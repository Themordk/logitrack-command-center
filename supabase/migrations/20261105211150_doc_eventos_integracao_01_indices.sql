-- Copiada de produção (schema_migrations, versão 20261105211150): estava aplicada em produção e faltava no repositório.
-- Eventos de integração do documento: índices de apoio (tabelas pequenas, CREATE INDEX comum)
CREATE INDEX IF NOT EXISTS idx_evento_integracao_entidade_interno
  ON integracao.evento_integracao (tenant_id, entidade, id_interno)
  WHERE id_interno IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_doc_saida_alteracao_documentos_saida
  ON public.documento_saida_alteracao USING gin (documentos_saida);

CREATE INDEX IF NOT EXISTS ix_doc_saida_alteracao_saida_gerada
  ON public.documento_saida_alteracao (documento_saida_gerado_id)
  WHERE documento_saida_gerado_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_doc_saida_alteracao_entrada_origem
  ON public.documento_saida_alteracao (documento_entrada_id)
  WHERE documento_entrada_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documento_saida_nf_documento
  ON public.documento_saida_nf (tenant_id, documento_saida_id);;
