DROP VIEW IF EXISTS public.vw_movimento_entrada_info;
CREATE VIEW public.vw_movimento_entrada_info AS
SELECT me.id AS movimento_id,
       me.numero_movimento,
       me.status,
       me.created_at,
       me.tipo_entrada_id,
       te.descricao AS tipo_entrada_descricao,
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
LEFT JOIN armazem a ON a.id = me.armazem_id
LEFT JOIN tipo_entrada te ON te.id = me.tipo_entrada_id;
GRANT SELECT ON public.vw_movimento_entrada_info TO anon, authenticated;
GRANT ALL ON public.vw_movimento_entrada_info TO service_role;