-- Painel TV Operacional v2: "maior espera agora" considera pedidos em CRIADA
-- (sem tarefa de separação ainda) a partir da data de emissão.

CREATE OR REPLACE FUNCTION public.rpc_painel_tv_operacional(p_tv_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz      CONSTANT text := 'America/Sao_Paulo';
  v_hoje    date        := (now() AT TIME ZONE c_tz)::date;
  v_ini     timestamptz := v_hoje::timestamp       AT TIME ZONE c_tz;
  v_fim     timestamptz := (v_hoje + 1)::timestamp AT TIME ZONE c_tz;
  v_tenant_id uuid;
  v_empresa_id uuid;
  v_armazem_id uuid;
  v_armazem_descricao text;
  v_limites jsonb;
  v_empresa_nome text;
  v_empresa_logo text;
  v_result jsonb;
BEGIN
  IF p_tv_token IS NULL OR length(trim(p_tv_token)) = 0 THEN
    RAISE EXCEPTION 'Token de TV obrigatório';
  END IF;

  SELECT a.tenant_id, a.empresa_id, a.id, a.descricao, a.painel_tv_limites
    INTO v_tenant_id, v_empresa_id, v_armazem_id, v_armazem_descricao, v_limites
    FROM public.armazem a
   WHERE a.tv_token = upper(trim(p_tv_token))
     AND a.ativo = true;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Token de TV inválido ou armazém inativo';
  END IF;

  SELECT e.razaosocial, e.url_logo
    INTO v_empresa_nome, v_empresa_logo
    FROM public.empresa e
   WHERE e.id = v_empresa_id;

  WITH ms_dia AS (
    SELECT ms.id, ms.status, ms.finalizado_em, ms.data_emissao
      FROM public.movimento_saida ms
     WHERE ms.tenant_id  = v_tenant_id
       AND ms.empresa_id = v_empresa_id
       AND ms.data_emissao >= v_ini
       AND ms.data_emissao <  v_fim
       AND ms.status NOT IN ('CANCELADA', 'EXPORTADA_ERP')
  ),
  sep AS (
    -- Uma linha por pedido (movimento) com tarefas de separação.
    -- Tarefas SEP têm origem no item: tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM'.
    SELECT m.id AS ms_id,
           m.status,
           MIN(t.criado_em)     AS entrou_fila,
           MIN(te.iniciado_em)  AS inicio_sep,
           MAX(te.concluido_em) AS fim_sep,
           bool_and(t.status IN ('CONCLUIDA', 'AUDITADA', 'CANCELADA'))
             AND bool_or(t.status IN ('CONCLUIDA', 'AUDITADA')) AS sep_concluida
      FROM ms_dia m
      JOIN public.movimento_saida_item i
        ON i.movimento_saida_id = m.id
       AND i.tenant_id = v_tenant_id
      JOIN public.tarefa t
        ON t.tenant_id = v_tenant_id
       AND t.tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM'
       AND t.id_documento_origem = i.id
      JOIN public.tipo_tarefa tt
        ON tt.id = t.tipo_tarefa_id
       AND tt.codigo = 'SEP'
      LEFT JOIN public.tarefa_execucao te
        ON te.tarefa_id = t.id
       AND te.status <> 'CANCELADA'
     GROUP BY m.id, m.status
  ),
  cortes AS (
    SELECT COALESCE(SUM(i.qtde_cortada), 0)::numeric AS unidades,
           COUNT(*)::int                             AS linhas,
           COUNT(DISTINCT i.movimento_saida_id)::int AS pedidos
      FROM public.movimento_saida_item i
     WHERE i.tenant_id = v_tenant_id
       AND i.movimento_saida_id IN (SELECT id FROM ms_dia)
       AND COALESCE(i.qtde_cortada, 0) > 0
  )
  SELECT jsonb_build_object(
    'armazem',      v_armazem_descricao,
    'empresa',      v_empresa_nome,
    'empresa_logo', v_empresa_logo,
    'gerado_em',    now(),
    'data_ref',     v_hoje,
    'contadores', (
      SELECT jsonb_build_object(
        'aguardando_separacao',   COUNT(*) FILTER (WHERE status IN ('CRIADA', 'LIBERADO')),
        'em_separacao',           COUNT(*) FILTER (WHERE status = 'EM_PICKING'),
        'aguardando_conferencia', COUNT(*) FILTER (WHERE status IN ('SEPARADO', 'EM_CONFERENCIA')),
        'pronto_embarque',        COUNT(*) FILTER (WHERE status IN ('CONFERIDO', 'EM_CARREGAMENTO')),
        'expedidos_hoje',         COUNT(*) FILTER (WHERE status = 'CONCLUIDA'
                                                     AND finalizado_em >= v_ini
                                                     AND finalizado_em <  v_fim)
      )
      FROM ms_dia
    ),
    'aguardando_ids', (
      SELECT COALESCE(jsonb_agg(id ORDER BY id), '[]'::jsonb)
        FROM ms_dia
       WHERE status IN ('CRIADA', 'LIBERADO')
    ),
    'tempos', (
      SELECT jsonb_build_object(
        'espera_media_seg', COALESCE(EXTRACT(EPOCH FROM
            AVG(inicio_sep - entrou_fila) FILTER (WHERE inicio_sep IS NOT NULL))::int, 0),
        'separacao_media_seg', COALESCE(EXTRACT(EPOCH FROM
            AVG(fim_sep - inicio_sep) FILTER (WHERE sep_concluida
                                                AND inicio_sep IS NOT NULL
                                                AND fim_sep IS NOT NULL))::int, 0),
        'separacao_base_pedidos', COUNT(*) FILTER (WHERE sep_concluida)
      )
      FROM sep
    ) || jsonb_build_object(
      -- Pedido em CRIADA ainda não tem tarefa de separação: a fila conta desde a emissão.
      'espera_max_atual_seg', (
        SELECT COALESCE(EXTRACT(EPOCH FROM MAX(now() - COALESCE(s.entrou_fila, m.data_emissao)))::int, 0)
          FROM ms_dia m
          LEFT JOIN sep s ON s.ms_id = m.id
         WHERE m.status IN ('CRIADA', 'LIBERADO')
      )
    ),
    'cortes', (SELECT to_jsonb(c) FROM cortes c),
    'limites', COALESCE(v_limites, '{}'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;
