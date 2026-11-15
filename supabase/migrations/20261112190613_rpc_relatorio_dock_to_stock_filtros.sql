-- =====================================================================
-- 2026-11-12 · Relatórios · Recebimento (Dock-to-Stock) — filtros no servidor
-- Aplicada em produção como versão 20261112190613 (47 ms, 456 movimentos).
-- Reversão: não é necessária para voltar a tela — o front anterior chama esta
-- assinatura com os mesmos nomes de parâmetro (datas "AAAA-MM-DD").
--
-- Redefine rpc_relatorio_dock_to_stock. Cálculo de marcos (T0..T5), tempos,
-- %SLA e status SLA inalterados. Mudanças:
--  1. Novos filtros:
--     - p_parceiro_id: movimento com QUALQUER NF desse parceiro. O front antigo
--       filtrava no navegador comparando só com o 1º fornecedor do movimento —
--       60 de 456 movimentos do maior tenant têm NFs de 2+ fornecedores.
--     - p_numero_movimento: número exato do movimento.
--     - p_numero_nota: busca parcial em qualquer NF do movimento.
--  2. Datas: p_data_inicio/p_data_fim passam a ser date, interpretadas no fuso
--     p_fuso (America/Fortaleza). Antes eram timestamptz e o front mandava
--     "AAAA-MM-DD" (meia-noite UTC): recebimentos criados entre 21h e 0h
--     locais caíam no dia seguinte.
--  3. fornecedor lista todos os fornecedores do movimento (antes só o 1º);
--     parceiro_id segue sendo o primeiro, por compatibilidade.
--  4. assert_tenant_access + SECURITY INVOKER explícito; anon sem execução.
-- =====================================================================

DROP FUNCTION IF EXISTS public.rpc_relatorio_dock_to_stock(uuid, uuid, uuid, timestamptz, timestamptz, numeric);
DROP FUNCTION IF EXISTS public.rpc_relatorio_dock_to_stock(uuid, uuid, uuid, date, date, numeric, uuid, numeric, text, text);

CREATE FUNCTION public.rpc_relatorio_dock_to_stock(
  p_tenant_id         uuid,
  p_empresa_id        uuid    DEFAULT NULL,
  p_armazem_id        uuid    DEFAULT NULL,
  p_data_inicio       date    DEFAULT NULL,   -- data local de chegada (T0), inclusive
  p_data_fim          date    DEFAULT NULL,   -- data local de chegada (T0), inclusive
  p_sla_horas         numeric DEFAULT 24,
  p_parceiro_id       uuid    DEFAULT NULL,
  p_numero_movimento  numeric DEFAULT NULL,
  p_numero_nota       text    DEFAULT NULL,   -- busca parcial
  p_fuso              text    DEFAULT 'America/Fortaleza'
)
RETURNS TABLE(
  movimento_entrada_id   uuid,
  numero_movimento       numeric,
  status_movimento       text,
  total_volume           numeric,
  documento              text,
  fornecedor             text,
  parceiro_id            uuid,
  t0_dock                timestamptz,
  t1_autorizado          timestamptz,
  t2_conf_inicio         timestamptz,
  t3_conf_fim            timestamptz,
  t4_armz_inicio         timestamptz,
  t5_stock               timestamptz,
  tempo_total_min        numeric,
  tempo_liberacao_min    numeric,
  tempo_conferencia_min  numeric,
  tempo_armazenagem_min  numeric,
  tempo_ocioso_min       numeric,
  perc_sla               numeric,
  status_sla             text,
  sla_horas              numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_sla_min numeric;
  v_nota    text := NULLIF(btrim(p_numero_nota), '');
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

  RETURN QUERY
  WITH tipo_armz AS (
    SELECT tt.id FROM tipo_tarefa tt
    WHERE tt.tenant_id = p_tenant_id AND tt.codigo = 'ENTR-ARMZ'
    LIMIT 1
  ),
  movs AS (
    SELECT me.id, me.numero_movimento, me.status::text AS status_mov, me.total_volume,
           me.created_at AS t0, me.autorizado_em AS t1,
           me.conferencia_iniciada_em AS t2, me.conferencia_finalizada_em AS t3,
           me.finalizado_em
    FROM movimento_entrada me
    WHERE me.tenant_id = p_tenant_id
      AND (p_empresa_id       IS NULL OR me.empresa_id = p_empresa_id)
      AND (p_armazem_id       IS NULL OR me.armazem_id = p_armazem_id)
      AND (v_ini              IS NULL OR me.created_at >= v_ini)
      AND (v_fim              IS NULL OR me.created_at <  v_fim)
      AND (p_numero_movimento IS NULL OR me.numero_movimento = p_numero_movimento)
      AND (p_parceiro_id IS NULL OR EXISTS (
            SELECT 1
            FROM movimento_entrada_documento med
            JOIN documento_entrada de ON de.id = med.documento_entrada_id
            WHERE med.tenant_id = p_tenant_id
              AND med.movimento_entrada_id = me.id
              AND de.parceiro_id = p_parceiro_id))
      AND (v_nota IS NULL OR EXISTS (
            SELECT 1
            FROM movimento_entrada_documento med
            JOIN documento_entrada de ON de.id = med.documento_entrada_id
            WHERE med.tenant_id = p_tenant_id
              AND med.movimento_entrada_id = me.id
              AND de.numero_nota ILIKE '%' || v_nota || '%'))
  ),
  docs AS (
    SELECT med.movimento_entrada_id,
           STRING_AGG(DISTINCT de.numero_nota, ', ' ORDER BY de.numero_nota) AS notas,
           STRING_AGG(DISTINCT pa.razaosocial, ', ' ORDER BY pa.razaosocial) AS fornecedores,
           (ARRAY_AGG(de.parceiro_id ORDER BY de.numero_nota) FILTER (WHERE de.parceiro_id IS NOT NULL))[1] AS parceiro_id
    FROM movimento_entrada_documento med
    JOIN documento_entrada de ON de.id = med.documento_entrada_id
    LEFT JOIN parceiro pa ON pa.id = de.parceiro_id
    WHERE med.tenant_id = p_tenant_id
      AND med.movimento_entrada_id IN (SELECT m.id FROM movs m)
    GROUP BY med.movimento_entrada_id
  ),
  armz AS (
    SELECT mei.movimento_entrada_id,
           MIN(t.criado_em) AS t4_criado,
           MAX(te.concluido_em) AS t5_concluido,
           COUNT(t.id)::int AS total_tarefas,
           COUNT(t.id) FILTER (WHERE t.status = 'CONCLUIDA')::int AS tarefas_concluidas
    FROM tarefa t
    JOIN tipo_armz ta ON ta.id = t.tipo_tarefa_id
    JOIN movimento_entrada_item mei ON mei.id = t.id_documento_origem
    LEFT JOIN tarefa_execucao te ON te.tarefa_id = t.id AND te.concluido_em IS NOT NULL
    WHERE t.tenant_id = p_tenant_id
      AND t.tipo_documento_origem = 'MOVIMENTO_ENTRADA_ITEM'
      AND mei.movimento_entrada_id IN (SELECT m.id FROM movs m)
    GROUP BY mei.movimento_entrada_id
  ),
  resultado AS (
    SELECT m.id, m.numero_movimento, m.status_mov, m.total_volume,
           COALESCE(d.notas, '—') AS documento,
           COALESCE(d.fornecedores, '—') AS fornecedor,
           d.parceiro_id,
           m.t0, m.t1, m.t2, m.t3,
           a.t4_criado AS t4,
           COALESCE(a.t5_concluido,
                    CASE WHEN m.status_mov = 'ARMAZENADO' THEN m.finalizado_em ELSE NULL END) AS t5,
           (a.t5_concluido IS NOT NULL AND a.total_tarefas > 0 AND a.tarefas_concluidas = a.total_tarefas)
             OR (m.status_mov = 'ARMAZENADO' AND m.finalizado_em IS NOT NULL) AS concluido
    FROM movs m
    LEFT JOIN docs d ON d.movimento_entrada_id = m.id
    LEFT JOIN armz a ON a.movimento_entrada_id = m.id
  )
  SELECT r.id, r.numero_movimento, r.status_mov, r.total_volume, r.documento, r.fornecedor, r.parceiro_id,
         r.t0, r.t1, r.t2, r.t3, r.t4, r.t5,
         CASE WHEN r.t0 IS NOT NULL AND r.t5 IS NOT NULL
              THEN GREATEST(EXTRACT(epoch FROM r.t5 - r.t0) / 60, 0) ELSE NULL END,
         CASE WHEN r.t0 IS NOT NULL AND r.t1 IS NOT NULL
              THEN GREATEST(EXTRACT(epoch FROM r.t1 - r.t0) / 60, 0) ELSE NULL END,
         CASE WHEN r.t2 IS NOT NULL AND r.t3 IS NOT NULL
              THEN GREATEST(EXTRACT(epoch FROM r.t3 - r.t2) / 60, 0) ELSE NULL END,
         CASE WHEN r.t4 IS NOT NULL AND r.t5 IS NOT NULL
              THEN GREATEST(EXTRACT(epoch FROM r.t5 - r.t4) / 60, 0) ELSE NULL END,
         -- Ocioso = (T2-T1) + (T4-T3)
         CASE WHEN (r.t1 IS NOT NULL AND r.t2 IS NOT NULL) OR (r.t3 IS NOT NULL AND r.t4 IS NOT NULL)
              THEN GREATEST(
                     COALESCE(GREATEST(EXTRACT(epoch FROM r.t2 - r.t1) / 60, 0), 0)
                   + COALESCE(GREATEST(EXTRACT(epoch FROM r.t4 - r.t3) / 60, 0), 0), 0)
              ELSE NULL END,
         CASE WHEN r.t0 IS NOT NULL AND r.t5 IS NOT NULL AND v_sla_min > 0
              THEN ROUND(GREATEST(EXTRACT(epoch FROM r.t5 - r.t0) / 60, 0) / v_sla_min * 100, 1)
              ELSE NULL END,
         CASE WHEN NOT r.concluido THEN 'EM_ANDAMENTO'
              WHEN r.t0 IS NULL OR r.t5 IS NULL THEN 'EM_ANDAMENTO'
              WHEN GREATEST(EXTRACT(epoch FROM r.t5 - r.t0) / 60, 0) / v_sla_min * 100 <= 80 THEN 'DENTRO'
              WHEN GREATEST(EXTRACT(epoch FROM r.t5 - r.t0) / 60, 0) / v_sla_min * 100 <= 100 THEN 'ALERTA'
              ELSE 'FORA' END,
         COALESCE(p_sla_horas, 24)
  FROM resultado r
  ORDER BY r.t0 DESC;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_dock_to_stock(uuid, uuid, uuid, date, date, numeric, uuid, numeric, text, text)
  IS 'Relatório Recebimento Dock-to-Stock: marcos T0..T5, tempos por etapa e SLA. Filtros de armazém, período (data local), fornecedor (qualquer NF), nº do movimento e NF.';

REVOKE ALL ON FUNCTION public.rpc_relatorio_dock_to_stock(uuid, uuid, uuid, date, date, numeric, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_dock_to_stock(uuid, uuid, uuid, date, date, numeric, uuid, numeric, text, text) TO authenticated, service_role;
