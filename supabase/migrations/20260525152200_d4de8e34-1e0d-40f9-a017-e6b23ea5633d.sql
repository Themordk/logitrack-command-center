CREATE OR REPLACE VIEW public.vw_produto_listagem AS
SELECT p.*,
  EXISTS (
    SELECT 1 FROM public.produto_embalagem pe
    WHERE pe.produto_id = p.id
      AND pe.ativo = true
      AND pe.ean IS NOT NULL
      AND pe.ean <> ''
  ) AS tem_ean
FROM public.produto p;