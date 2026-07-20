DROP VIEW IF EXISTS public.vw_volume_expedicao_lista;
CREATE VIEW public.vw_volume_expedicao_lista AS
SELECT ve.id,
    ve.codigo_volume,
    ve.numero_volume,
    ve.status,
    ve.peso_bruto,
    ve.m3,
    ve.created_at,
    ve.tenant_id,
    ve.empresa_id,
    ve.movimento_saida_id,
    ve.documento_saida_id,
    ms.numero_onda,
    ms.destino_carga,
    ms.rota_id,
    ms.motorista,
    ds.parceiro_id,
    p.razaosocial AS parceiro_nome,
    (SELECT count(*) FROM volume_expedicao v2 WHERE v2.movimento_saida_id = ve.movimento_saida_id) AS total_volumes_movimento
FROM volume_expedicao ve
LEFT JOIN movimento_saida ms ON ms.id = ve.movimento_saida_id
LEFT JOIN documento_saida ds ON ds.id = ve.documento_saida_id
LEFT JOIN parceiro p ON p.id = ds.parceiro_id;
GRANT SELECT ON public.vw_volume_expedicao_lista TO authenticated;
GRANT ALL ON public.vw_volume_expedicao_lista TO service_role;