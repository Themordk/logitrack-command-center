
DROP FUNCTION IF EXISTS public.buscar_itens_onda_carregamento(uuid, uuid);

CREATE OR REPLACE FUNCTION public.buscar_itens_onda_carregamento(p_tenant_id uuid, p_movimento_saida_id uuid)
 RETURNS TABLE(id uuid, movimento_item_id uuid, produto_id uuid, sku text, descricao text, qtd_esperada numeric, qtd_separada numeric, qtd_cortada numeric, qtd_conferida numeric, status text, motivo_descricao text, auto_separacao boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id é obrigatório';
  END IF;
  IF p_movimento_saida_id IS NULL THEN
    RAISE EXCEPTION 'movimento_saida_id é obrigatório';
  END IF;

  RETURN QUERY
  SELECT
    msi.id,
    msi.id                              AS movimento_item_id,
    msi.produto_id,
    prod.sku,
    prod.descricao,
    msi.qtd_esperada,
    COALESCE(SUM(CASE WHEN tt.codigo = 'SEP' THEN t.quantidade_executada ELSE 0 END), 0)  AS qtd_separada,
    COALESCE(SUM(CASE WHEN tt.codigo = 'SEP' THEN t.quantidade_cortada ELSE 0 END), 0)    AS qtd_cortada,
    COALESCE(SUM(CASE WHEN tt.codigo = 'SEP-CONF' THEN t.quantidade_executada ELSE 0 END), 0) AS qtd_conferida,
    msi.status::text                    AS status,
    mo.descricao                        AS motivo_descricao,
    COALESCE(BOOL_OR(CASE WHEN tt.codigo = 'SEP' THEN t.auto_separacao ELSE false END), false) AS auto_separacao
  FROM public.movimento_saida_item msi
  JOIN public.produto prod ON prod.id = msi.produto_id
  LEFT JOIN public.tarefa t ON t.id_documento_origem = msi.id
  LEFT JOIN public.tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
  LEFT JOIN public.motivo_ocorrencia mo ON mo.id = msi.motivo_ocorrencia
  WHERE msi.tenant_id = p_tenant_id
    AND msi.movimento_saida_id = p_movimento_saida_id
  GROUP BY msi.id, msi.produto_id, prod.sku, prod.descricao,
           msi.qtd_esperada, msi.status, mo.descricao
  ORDER BY prod.sku;
END;
$function$;

CREATE OR REPLACE VIEW public.vw_movimento_saida_separacao_detalhe AS
SELECT ms.id AS movimento_id,
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
    te.lote,
    t.auto_separacao
   FROM tarefa t
     JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
     JOIN tarefa_execucao te ON te.tarefa_id = t.id
     JOIN usuario u ON u.id = te.usuario_id
     LEFT JOIN hu h ON h.id = te.hu
     JOIN produto p ON p.id = t.produto_id
     JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
     JOIN movimento_saida ms ON ms.id = msi.movimento_saida_id
  WHERE tt.codigo = 'SEP'::text;
