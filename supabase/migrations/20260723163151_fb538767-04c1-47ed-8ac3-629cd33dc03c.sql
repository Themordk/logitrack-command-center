DROP VIEW IF EXISTS public.vw_produto_listagem;
CREATE VIEW public.vw_produto_listagem AS
SELECT id,
    tenant_id,
    empresa_id,
    grupo_id,
    subgrupo_id,
    parceiro_id,
    sku,
    descricao,
    referencia,
    marca,
    curva_venda,
    curva_acesso,
    foto,
    url_imagem,
    preco_custo,
    tipo_controle,
    peso_variavel,
    tolerancia,
    peso_bruto,
    peso_liquido,
    dias_shelf,
    shelf_entrada,
    shelf_devolucao,
    lastro,
    camada,
    fator_caixa,
    usa_picking,
    tipo_separacao,
    varios_pickings,
    ativo,
    codigo_erp,
    (EXISTS ( SELECT 1
           FROM produto_embalagem pe
          WHERE pe.produto_id = p.id AND pe.ativo = true AND pe.ean IS NOT NULL AND pe.ean <> ''::text)) AS tem_ean
   FROM produto p;
GRANT SELECT ON public.vw_produto_listagem TO authenticated;
GRANT SELECT ON public.vw_produto_listagem TO anon;
GRANT ALL ON public.vw_produto_listagem TO service_role;