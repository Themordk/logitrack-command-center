CREATE OR REPLACE VIEW public.vw_endereco_listagem AS
SELECT
  e.id,
  e.tenant_id,
  e.armazem_id,
  e.setor_id,
  e.tipo_estoque_id,
  e.rua,
  e.predio,
  e.nivel,
  e.apto,
  e.descricao,
  e.tipo_endereco,
  e.lado,
  e.situacao,
  e.curva_acesso,
  e.ativo,
  e.tipo_estrutura,
  e.codigo_endereco,
  a.descricao AS armazem_descricao,
  s.descricao AS setor_descricao,
  te.descricao AS tipo_estoque_descricao
FROM public.endereco e
JOIN public.armazem a ON a.id = e.armazem_id
JOIN public.setor s ON s.id = e.setor_id
JOIN public.tipo_estoque te ON te.id = e.tipo_estoque_id;

ALTER VIEW public.vw_endereco_listagem SET (security_invoker = true);

GRANT SELECT ON public.vw_endereco_listagem TO authenticated;
GRANT SELECT ON public.vw_endereco_listagem TO service_role;