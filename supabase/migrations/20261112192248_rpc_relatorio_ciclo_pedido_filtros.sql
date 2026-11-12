-- =====================================================================
-- 2026-11-12 · Relatórios · Tempo de Ciclo de Pedido — filtros no servidor
-- Aplicada em produção como versão 20261112192248 (221 ms, 2.124 ondas sem filtro).
-- Reversão: não é necessária para voltar a tela — o front anterior chama esta
-- assinatura com os mesmos nomes de parâmetro (datas "AAAA-MM-DD").
--
-- Redefine rpc_relatorio_ciclo_pedido. Marcos (T0..T5), tempos por etapa,
-- ocioso, %SLA e status SLA inalterados. Mudanças:
--  1. Novos filtros:
--     - p_parceiro_id: onda com QUALQUER pedido desse cliente (o front antigo
--       filtrava no navegador comparando só com o 1º cliente da onda);
--     - p_numero_onda: número exato da onda;
--     - p_numero_pedido: busca parcial no número de qualquer pedido da onda;
--     - p_numero_nf: busca parcial em qualquer NF (documento_saida_nf) dos
--       pedidos da onda, também ignorando zeros à esquerda.
--  2. Datas: p_data_inicio/p_data_fim passam a ser date, interpretadas no fuso
--     p_fuso (America/Fortaleza) sobre data_emissao da onda (antes timestamptz
--     recebendo "AAAA-MM-DD" = meia-noite UTC).
--  3. cliente lista todos os clientes da onda (antes só o 1º); nova coluna
--     notas com as NFs dos pedidos; parceiro_id segue sendo o 1º cliente.
--  4. assert_tenant_access + SECURITY INVOKER explícito; anon sem execução.
-- =====================================================================

DROP FUNCTION IF EXISTS public.rpc_relatorio_ciclo_pedido(uuid, uuid, uuid, timestamptz, timestamptz, text, text, numeric);
DROP FUNCTION IF EXISTS public.rpc_relatorio_ciclo_pedido(uuid, uuid, uuid, date, date, text, text, numeric, uuid, bigint, text, text, text);

CREATE FUNCTION public.rpc_relatorio_ciclo_pedido(
  p_tenant_id      uuid,
  p_empresa_id     uuid    DEFAULT NULL,
  p_armazem_id     uuid    DEFAULT NULL,
  p_data_inicio    date    DEFAULT NULL,   -- data local de emissão da onda (T0), inclusive
  p_data_fim       date    DEFAULT NULL,   -- inclusive
  p_status_onda    text    DEFAULT NULL,
  p_prioridade     text    DEFAULT NULL,
  p_sla_horas      numeric DEFAULT 24,
  p_parceiro_id    uuid    DEFAULT NULL,
  p_numero_onda    bigint  DEFAULT NULL,
  p_numero_pedido  text    DEFAULT NULL,   -- busca parcial
  p_numero_nf      text    DEFAULT NULL,   -- busca parcial
  p_fuso           text    DEFAULT 'America/Fortaleza'
)
RETURNS TABLE(
  movimento_saida_id     uuid,
  numero_onda            bigint,
  status_onda            text,
  prioridade             text,
  pedidos                text,
  cliente                text,
  parceiro_id            uuid,
  box_id                 uuid,
  t0_criacao             timestamptz,
  t1_liberado            timestamptz,
  t2_inicio_sep          timestamptz,
  t3_fim_sep             timestamptz,
  t4_inicio_conf         timestamptz,
  t4_fim_conf            timestamptz,
  t5_expedicao           timestamptz,
  tempo_total_min        numeric,
  tempo_fila_min         numeric,
  tempo_picking_min      numeric,
  tempo_conferencia_min  numeric,
  tempo_pos_conf_min     numeric,
  tempo_ocioso_min       numeric,
  perc_sla               numeric,
  status_sla             text,
  sla_horas              numeric,
  notas                  text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_sla_min numeric;
  v_pedido  text := NULLIF(btrim(p_numero_pedido), '');
  v_nf      text := NULLIF(btrim(p_numero_nf), '');
  v_nf_norm text;
  v_fuso    text := COALESCE(NULLIF(btrim(p_fuso), ''), 'America/Fortaleza');
  v_ini     timestamptz;
  v_fim     timestamptz;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL AND p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Data final não pode ser anterior à data inicial' USING ERRCODE = '22023';
  END IF;
  IF p_sla_horas IS NOT NULL AND p_sla_horas <= 0 THEN
    RAISE EXCEPTION 'SLA deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_ini := CASE WHEN p_data_inicio IS NULL THEN NULL
                  ELSE p_data_inicio::timestamp AT TIME ZONE v_fuso END;
    v_fim := CASE WHEN p_data_fim IS NULL THEN NULL
                  ELSE (p_data_fim + 1)::timestamp AT TIME ZONE v_fuso END;
    PERFORM now() AT TIME ZONE v_fuso;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Fuso horário inválido: %', v_fuso USING ERRCODE = '22023';
  END;
  v_sla_min := COALESCE(p_sla_horas, 24) * 60;
  v_nf_norm := NULLIF(ltrim(v_nf, '0'), '');

  RETURN QUERY
  WITH tipos AS (
    SELECT tt.id, tt.codigo FROM tipo_tarefa tt
    WHERE tt.tenant_id = p_tenant_id AND tt.codigo IN ('SEP', 'SEP-CONF')
  ),
  ondas AS (
    SELECT ms.id, ms.numero_onda, ms.status::text AS status_onda, ms.prioridade::text AS prioridade,
           ms.data_emissao AS t0, ms.finalizado_em, ms.box_id
    FROM movimento_saida ms
    WHERE ms.tenant_id = p_tenant_id
      AND (p_empresa_id  IS NULL OR ms.empresa_id = p_empresa_id)
      AND (p_armazem_id  IS NULL OR ms.box_id IN (
            SELECT b.id FROM box b WHERE b.tenant_id = p_tenant_id AND b.armazem_id = p_armazem_id))
      AND (p_status_onda IS NULL OR ms.status::text = p_status_onda)
      AND (p_prioridade  IS NULL OR ms.prioridade::text = p_prioridade)
      AND (v_ini         IS NULL OR ms.data_emissao >= v_ini)
      AND (v_fim         IS NULL OR ms.data_emissao <  v_fim)
      AND (p_numero_onda IS NULL OR ms.numero_onda = p_numero_onda)
      AND (p_parceiro_id IS NULL OR EXISTS (
            SELECT 1
            FROM movimento_saida_documento msd
            JOIN documento_saida ds ON ds.id = msd.documento_saida_id
            WHERE msd.tenant_id = p_tenant_id
              AND msd.movimento_saida_id = ms.id
              AND ds.parceiro_id = p_parceiro_id))
      AND (v_pedido IS NULL OR EXISTS (
            SELECT 1
            FROM movimento_saida_documento msd
            JOIN documento_saida ds ON ds.id = msd.documento_saida_id
            WHERE msd.tenant_id = p_tenant_id
              AND msd.movimento_saida_id = ms.id
              AND ds.numero_pedido::text ILIKE '%' || v_pedido || '%'))
      AND (v_nf IS NULL OR EXISTS (
            SELECT 1
            FROM movimento_saida_documento msd
            JOIN documento_saida_nf nf ON nf.documento_saida_id = msd.documento_saida_id
                                      AND nf.tenant_id = p_tenant_id
            WHERE msd.tenant_id = p_tenant_id
              AND msd.movimento_saida_id = ms.id
              AND (nf.numero_nf ILIKE '%' || v_nf || '%'
                   OR (v_nf_norm IS NOT NULL AND ltrim(nf.numero_nf, '0') ILIKE '%' || v_nf_norm || '%'))))
  ),
  docs AS (
    SELECT msd.movimento_saida_id,
           STRING_AGG(DISTINCT ds.numero_pedido::text, ', ') AS pedidos,
           STRING_AGG(DISTINCT pa.razaosocial, ', ' ORDER BY pa.razaosocial) AS clientes,
           (ARRAY_AGG(DISTINCT ds.parceiro_id) FILTER (WHERE ds.parceiro_id IS NOT NULL))[1] AS parceiro_id
    FROM movimento_saida_documento msd
    JOIN documento_saida ds ON ds.id = msd.documento_saida_id
    LEFT JOIN parceiro pa ON pa.id = ds.parceiro_id
    WHERE msd.tenant_id = p_tenant_id
      AND msd.movimento_saida_id IN (SELECT o.id FROM ondas o)
    GROUP BY msd.movimento_saida_id
  ),
  nfs AS (
    SELECT msd.movimento_saida_id,
           STRING_AGG(DISTINCT nf.numero_nf, ', ' ORDER BY nf.numero_nf) AS notas
    FROM movimento_saida_documento msd
    JOIN documento_saida_nf nf ON nf.documento_saida_id = msd.documento_saida_id
                              AND nf.tenant_id = p_tenant_id
    WHERE msd.tenant_id = p_tenant_id
      AND msd.movimento_saida_id IN (SELECT o.id FROM ondas o)
      AND nf.numero_nf IS NOT NULL
    GROUP BY msd.movimento_saida_id
  ),
  marcos AS (
    SELECT msi.movimento_saida_id,
           MIN(t.criado_em) FILTER (WHERE tp.codigo = 'SEP') AS sep_criado_min,
           MIN(ta.atribuido_em::timestamptz) FILTER (WHERE tp.codigo = 'SEP') AS sep_atrib_min,
           MAX(te.concluido_em) FILTER (WHERE tp.codigo = 'SEP' AND te.status = 'CONCLUIDA') AS sep_conc_max,
           MIN(ta.atribuido_em::timestamptz) FILTER (WHERE tp.codigo = 'SEP-CONF') AS conf_atrib_min,
           MAX(te.concluido_em) FILTER (WHERE tp.codigo = 'SEP-CONF' AND te.status = 'CONCLUIDA') AS conf_conc_max
    FROM tarefa t
    JOIN tipos tp ON tp.id = t.tipo_tarefa_id
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
    LEFT JOIN LATERAL (
      SELECT ta_i.atribuido_em FROM tarefa_atribuicao ta_i
      WHERE ta_i.tarefa_id = t.id ORDER BY ta_i.atribuido_em ASC LIMIT 1
    ) ta ON true
    LEFT JOIN LATERAL (
      SELECT te_i.concluido_em, te_i.status FROM tarefa_execucao te_i
      WHERE te_i.tarefa_id = t.id AND te_i.concluido_em IS NOT NULL
      ORDER BY te_i.concluido_em DESC LIMIT 1
    ) te ON true
    WHERE t.tenant_id = p_tenant_id
      AND t.tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM'
      AND msi.movimento_saida_id IN (SELECT o.id FROM ondas o)
    GROUP BY msi.movimento_saida_id
  ),
  resultado AS (
    SELECT o.id, o.numero_onda, o.status_onda, o.prioridade,
           COALESCE(d.pedidos, '—') AS pedidos,
           COALESCE(d.clientes, '—') AS cliente,
           d.parceiro_id, o.box_id,
           o.t0,
           mk.sep_criado_min AS t1,
           mk.sep_atrib_min  AS t2,
           mk.sep_conc_max   AS t3,
           mk.conf_atrib_min AS t4i,
           mk.conf_conc_max  AS t4f,
           COALESCE(CASE WHEN o.status_onda = 'CONCLUIDA' THEN o.finalizado_em ELSE NULL END,
                    mk.conf_conc_max, mk.sep_conc_max) AS t5,
           o.status_onda = 'CONCLUIDA' AS concluido,
           COALESCE(n.notas, '—') AS notas
    FROM ondas o
    LEFT JOIN docs d   ON d.movimento_saida_id = o.id
    LEFT JOIN nfs n    ON n.movimento_saida_id = o.id
    LEFT JOIN marcos mk ON mk.movimento_saida_id = o.id
  )
  SELECT r.id, r.numero_onda, r.status_onda, r.prioridade, r.pedidos, r.cliente, r.parceiro_id, r.box_id,
         r.t0, r.t1, r.t2, r.t3, r.t4i, r.t4f, r.t5,
         CASE WHEN r.t0 IS NOT NULL AND r.t5 IS NOT NULL
              THEN ROUND(GREATEST(EXTRACT(epoch FROM r.t5 - r.t0) / 60, 0), 1) ELSE NULL END,
         -- Fila: T0 → T2
         CASE WHEN r.t0 IS NOT NULL AND r.t2 IS NOT NULL
              THEN ROUND(GREATEST(EXTRACT(epoch FROM r.t2 - r.t0) / 60, 0), 1) ELSE NULL END,
         -- Picking: T2 → T3
         CASE WHEN r.t2 IS NOT NULL AND r.t3 IS NOT NULL
              THEN ROUND(GREATEST(EXTRACT(epoch FROM r.t3 - r.t2) / 60, 0), 1) ELSE NULL END,
         -- Conferência: T4i → T4f
         CASE WHEN r.t4i IS NOT NULL AND r.t4f IS NOT NULL
              THEN ROUND(GREATEST(EXTRACT(epoch FROM r.t4f - r.t4i) / 60, 0), 1) ELSE NULL END,
         -- Pós-conferência: T4f → T5
         CASE WHEN r.t4f IS NOT NULL AND r.t5 IS NOT NULL
              THEN ROUND(GREATEST(EXTRACT(epoch FROM r.t5 - r.t4f) / 60, 0), 1) ELSE NULL END,
         -- Ocioso = gap(T1→T2) + gap(T3→T4i)
         CASE WHEN (r.t1 IS NOT NULL AND r.t2 IS NOT NULL) OR (r.t3 IS NOT NULL AND r.t4i IS NOT NULL)
              THEN ROUND(GREATEST(
                     COALESCE(GREATEST(EXTRACT(epoch FROM r.t2 - r.t1) / 60, 0), 0)
                   + COALESCE(GREATEST(EXTRACT(epoch FROM r.t4i - r.t3) / 60, 0), 0), 0), 1)
              ELSE NULL END,
         CASE WHEN r.t0 IS NOT NULL AND r.t5 IS NOT NULL AND v_sla_min > 0
              THEN ROUND(GREATEST(EXTRACT(epoch FROM r.t5 - r.t0) / 60, 0) / v_sla_min * 100, 1)
              ELSE NULL END,
         CASE WHEN NOT r.concluido THEN 'EM_ANDAMENTO'
              WHEN r.t0 IS NULL OR r.t5 IS NULL THEN 'EM_ANDAMENTO'
              WHEN GREATEST(EXTRACT(epoch FROM r.t5 - r.t0) / 60, 0) / v_sla_min * 100 <= 80 THEN 'DENTRO'
              WHEN GREATEST(EXTRACT(epoch FROM r.t5 - r.t0) / 60, 0) / v_sla_min * 100 <= 100 THEN 'ALERTA'
              ELSE 'FORA' END,
         COALESCE(p_sla_horas, 24),
         r.notas
  FROM resultado r
  ORDER BY r.t0 DESC;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_ciclo_pedido(uuid, uuid, uuid, date, date, text, text, numeric, uuid, bigint, text, text, text)
  IS 'Relatório Tempo de Ciclo de Pedido: marcos T0..T5 da onda, tempos por etapa e SLA. Filtros de armazém, período (data local), status, prioridade, cliente (qualquer pedido), onda, pedido e NF.';

REVOKE ALL ON FUNCTION public.rpc_relatorio_ciclo_pedido(uuid, uuid, uuid, date, date, text, text, numeric, uuid, bigint, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_ciclo_pedido(uuid, uuid, uuid, date, date, text, text, numeric, uuid, bigint, text, text, text) TO authenticated, service_role;
