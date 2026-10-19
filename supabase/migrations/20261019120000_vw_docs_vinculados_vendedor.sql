-- =====================================================================
-- 2026-10-19 · Ondas de Carregamento · aba Informações · Documentos Vinculados
-- Acrescenta a coluna "vendedor" (documento_saida.vendedor) na view
-- vw_movimento_saida_docs_vinculados.
--
-- - A coluna nova entra no FINAL (exigência do CREATE OR REPLACE VIEW).
-- - WITH (security_invoker = true) precisa ser repetido: o REPLACE substitui
--   as opções da view, e sem ele a view passaria a ignorar o RLS do usuário.
-- - Mesma fonte do filtro "Vendedor" da tela (listar_ondas_carregamento usa
--   documento_saida.vendedor).
-- - Os grants existentes da view são mantidos pelo REPLACE.
-- =====================================================================

CREATE OR REPLACE VIEW public.vw_movimento_saida_docs_vinculados
WITH (security_invoker = true) AS
SELECT msd.movimento_saida_id,
       msd.ordem,
       ds.numero_pedido,
       ds.data_emissao,
       ds.valor_pedido,
       p.razaosocial AS parceiro,
       ds.tenant_id,
       ds.id AS documento_saida_id,
       NULLIF(ltrim(nf.numero_nf, '0'::text), ''::text) AS numero_nf,
       nf.serie AS serie_nf,
       nf.nf_situacao,
       nf.chave_nfe,
       NULLIF(btrim(ds.vendedor), '') AS vendedor
FROM movimento_saida_documento msd
JOIN documento_saida ds ON ds.id = msd.documento_saida_id
LEFT JOIN parceiro p ON p.id = ds.parceiro_id
LEFT JOIN vw_documento_saida_nf_vigente nf
       ON nf.documento_saida_id = ds.id AND nf.tenant_id = ds.tenant_id;

NOTIFY pgrst, 'reload schema';
