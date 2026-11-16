-- Migration: 20261115233000_etq_f5_remetente.sql
-- Plano: Etiqueta de Volume — remetente na etiqueta (pedido de 15/11, cliente JRLUB)
-- A transportadora precisa saber de qual empresa é o volume. A etiqueta ganha três chaves,
-- preenchidas pelo servidor com a empresa que fatura o pedido (documento_saida.empresa_id;
-- sem pedido, a empresa do volume):
--   remetente_nome  — razão social da empresa, em maiúsculas
--   remetente_cnpj  — CNPJ formatado (00.000.000/0000-00); vazio se o cadastro não tiver 14 dígitos
--   remetente       — "RAZÃO SOCIAL - CNPJ" (ou só a razão social), para uma linha só
-- Risco: baixo — só acrescenta chaves; as existentes ficam iguais.
-- Rollback: definição anterior em ops.rollback_definicao (migration = este arquivo).

INSERT INTO ops.rollback_definicao (migration, objeto, definicao)
SELECT '20261115233000_etq_f5_remetente', 'function public._fn_etiqueta_volume_dados',
       pg_get_functiondef('public._fn_etiqueta_volume_dados(uuid,uuid[])'::regprocedure)
 WHERE NOT EXISTS (SELECT 1 FROM ops.rollback_definicao r
                    WHERE r.migration = '20261115233000_etq_f5_remetente');

CREATE OR REPLACE FUNCTION public._fn_etiqueta_volume_dados(p_tenant_id uuid, p_volume_ids uuid[])
 RETURNS TABLE(volume_id uuid, dados jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           'identificacao_volume', CASE WHEN v.numero_volume IS NOT NULL
                                     THEN lpad(v.numero_volume::text, 2, '0') || '/' || lpad(v.total_volumes_pedido::text, 2, '0') END,
           'data_hora',       to_char(v.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
           'usuario',         upper(v.criado_por_nome),
           'peso',            CASE WHEN v.peso_bruto IS NOT NULL THEN trim(to_char(v.peso_bruto, 'FM999990.000')) END,
           'pedido',          v.numero_pedido::text,
           'nota_fiscal',     CASE WHEN v.nf_numero IS NOT NULL THEN v.nf_numero || COALESCE('-' || nullif(v.nf_serie, ''), '') END,
           'nf_numero',       v.nf_numero,
           'nf_serie',        nullif(v.nf_serie, ''),
           'nf_chave',        v.nf_chave,
           'nf_data_emissao', to_char(v.nf_data_emissao AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
           'nf_qtd_volumes',  v.nf_qtd_volumes::text,
           'nf_especie_volumes', upper(nullif(v.nf_especie_volumes, '')),
           'nf_peso_bruto',   CASE WHEN v.nf_peso_bruto IS NOT NULL THEN trim(to_char(v.nf_peso_bruto, 'FM999990.000')) END,
           'transportadora',  upper(COALESCE(v.carga_transportadora, nullif(v.pedido_transportador, ''))),
           'numero_carga',    v.numero_carga::text,
           'observacao',      v.pedido_observacao,
           'remetente_nome',  r.nome,
           'remetente_cnpj',  r.cnpj,
           'remetente',       concat_ws(' - ', r.nome, r.cnpj)
         ))
    FROM public.vw_volume_expedicao_lista v
    LEFT JOIN public.documento_saida ds ON ds.id = v.documento_saida_id
    LEFT JOIN LATERAL (
      SELECT nullif(upper(btrim(e.razaosocial)), '') AS nome,
             CASE WHEN length(regexp_replace(COALESCE(e.cnpj, ''), '\D', '', 'g')) = 14
                  THEN regexp_replace(regexp_replace(e.cnpj, '\D', '', 'g'),
                                      '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5') END AS cnpj
        FROM public.empresa e
       WHERE e.id = COALESCE(ds.empresa_id, v.empresa_id) AND e.tenant_id = v.tenant_id) r ON true
   WHERE v.tenant_id = p_tenant_id
     AND v.id = ANY(p_volume_ids);
$function$;
REVOKE ALL ON FUNCTION public._fn_etiqueta_volume_dados(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- ROLLBACK (manual):
--   SELECT definicao FROM ops.rollback_definicao WHERE migration = '20261115233000_etq_f5_remetente';  e executar.
