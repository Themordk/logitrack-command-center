-- Migration: 20261115215500_etq_f1b_cidade_uf.sql
-- Plano: Etiqueta de Volume — ajuste da Fase 1 encontrado no teste do branch-qa:
-- o cadastro de parceiro já traz a UF na cidade ("PACATUBA (CE)"), e a etiqueta
-- saía "PACATUBA (CE) / CE". Só acrescenta a UF quando ela não está na cidade.
-- Risco: baixo. Rollback: reaplicar _fn_etiqueta_volume_dados da migration 20261115214500.

CREATE OR REPLACE FUNCTION public._fn_etiqueta_volume_dados(p_tenant_id uuid, p_volume_ids uuid[])
RETURNS TABLE (volume_id uuid, dados jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id,
         jsonb_strip_nulls(jsonb_build_object(
           'codigo_volume',   v.codigo_volume,
           'parceiro_nome',   upper(v.parceiro_nome),
           'destino_carga',   upper(v.destino_carga),
           'cidade_uf',       upper(CASE
                               WHEN nullif(v.parceiro_uf, '') IS NULL OR v.parceiro_cidade ~* ('[(/ -]\s*' || v.parceiro_uf || '\)?\s*$')
                                 THEN nullif(v.parceiro_cidade, '')
                               ELSE concat_ws(' / ', nullif(v.parceiro_cidade, ''), v.parceiro_uf)
                             END),
           'numero_onda',     v.numero_onda::text,
           'numero_volume',   lpad(v.numero_volume::text, 2, '0'),
           'total_volumes',   lpad(v.total_volumes_pedido::text, 2, '0'),
           'data_hora',       to_char(v.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
           'usuario',         upper(v.criado_por_nome),
           'peso',            CASE WHEN v.peso_bruto IS NOT NULL THEN trim(to_char(v.peso_bruto, 'FM999990.000')) END,
           'pedido',          v.numero_pedido::text,
           'nota_fiscal',     CASE WHEN v.nf_numero IS NOT NULL THEN v.nf_numero || COALESCE('-' || nullif(v.nf_serie, ''), '') END,
           'nf_chave',        v.nf_chave,
           'nf_data_emissao', to_char(v.nf_data_emissao AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
           'nf_qtd_volumes',  v.nf_qtd_volumes::text,
           'nf_peso_bruto',   CASE WHEN v.nf_peso_bruto IS NOT NULL THEN trim(to_char(v.nf_peso_bruto, 'FM999990.000')) END,
           'transportadora',  upper(COALESCE(v.carga_transportadora, nullif(v.pedido_transportador, ''))),
           'numero_carga',    v.numero_carga::text,
           'observacao',      v.pedido_observacao
         ))
    FROM public.vw_volume_expedicao_lista v
   WHERE v.tenant_id = p_tenant_id
     AND v.id = ANY(p_volume_ids);
$$;
REVOKE ALL ON FUNCTION public._fn_etiqueta_volume_dados(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- Aviso do Supabase (advisor) após aplicar no branch-qa: função de gatilho não deve ter EXECUTE público.
REVOKE ALL ON FUNCTION public.tg_fila_impressao_dados_volume() FROM PUBLIC, anon, authenticated;
