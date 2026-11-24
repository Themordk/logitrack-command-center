-- =====================================================================
-- 2026-11-23 · Relatórios · Entregas (saídas e tentativas) e Resultado por motivo
--
-- Fonte da verdade: entrega_tentativa (uma linha imutável por resultado na
-- porta). Nunca o status atual da parada, que muda com estorno e nova saída.
--
-- rpc_relatorio_entregas_tentativas — uma linha por:
--   · tentativa registrada (ENTREGUE / NAO_ENTREGUE), estornadas opcionais;
--   · parada sem tentativa válida: PENDENTE (saída ainda ativa) ou
--     NAO_VISITADA (saída cancelada/encerrada sem passar no cliente).
--   Assim "todas as saídas" aparecem, deram certo ou não.
--   Data: tentativa = registrada_em; sem tentativa = cancelada_em ou atribuida_em.
--   Filtros no fuso p_fuso (America/Fortaleza). Ordem: data desc, id.
--   Resumo do conjunto filtrado repetido em cada linha (cards).
--
-- rpc_relatorio_entregas_motivos — jsonb com resumo, motivos (falha e
--   ressalva), por entregador, por cliente e por dia. Estornadas ficam fora.
--
-- Segurança: SECURITY INVOKER (RLS por tenant nas tabelas de entrega) +
-- assert_tenant_access. Permissões: web.relatorios.entregas e
-- web.relatorios.entregas-motivos (READ para ADMINISTRADOR e SUPERVISOR).
-- Índices: os de entrega_tentativa criados em 20261123150000.
-- Reverter: supabase/rollback/20261123_relatorios_entregas_reverter.sql
-- =====================================================================

-- ---------- 1. saídas e tentativas ----------
DROP FUNCTION IF EXISTS public.rpc_relatorio_entregas_tentativas(
  uuid, uuid, date, date, uuid, uuid, uuid, text, uuid, boolean, integer, integer, text);

CREATE FUNCTION public.rpc_relatorio_entregas_tentativas(
  p_tenant_id           uuid,
  p_empresa_id          uuid,
  p_data_inicio         date    DEFAULT NULL,
  p_data_fim            date    DEFAULT NULL,
  p_usuario_id          uuid    DEFAULT NULL,   -- entregador
  p_veiculo_id          uuid    DEFAULT NULL,
  p_parceiro_id         uuid    DEFAULT NULL,   -- cliente
  p_resultado           text    DEFAULT NULL,   -- ENTREGUE | NAO_ENTREGUE | PENDENTE | NAO_VISITADA
  p_motivo_id           uuid    DEFAULT NULL,   -- motivo da falha ou de uma ressalva
  p_incluir_estornadas  boolean DEFAULT false,
  p_limit               integer DEFAULT 100,
  p_offset              integer DEFAULT 0,
  p_fuso                text    DEFAULT 'America/Fortaleza'
)
RETURNS TABLE(
  linha_id              uuid,
  tipo_linha            text,      -- TENTATIVA | SEM_TENTATIVA
  data_evento           timestamptz,
  resultado             text,
  numero_tentativa      integer,
  carga_id              uuid,
  numero_carga          text,
  entrega_id            uuid,
  numero_saida          integer,
  status_saida          text,
  atribuida_em          timestamptz,
  aceita_em             timestamptz,
  sequencia_parada      integer,
  documento_saida_id    uuid,
  numero_pedido         text,
  numero_nf             text,
  parceiro_id           uuid,
  cliente               text,
  bairro                text,
  cidade                text,
  entregador            text,
  veiculo               text,
  motivo_id             uuid,
  motivo                text,
  ocorrencia_numero     text,
  ressalvas             text,
  recebedor_nome        text,
  tem_foto              boolean,
  fora_de_ordem         boolean,
  estornada             boolean,
  estornada_em          timestamptz,
  estornada_por         text,
  motivo_estorno        text,
  origem                text,
  total_registros       bigint,
  qtd_tentativas        bigint,
  qtd_entregues         bigint,
  qtd_nao_entregues     bigint,
  qtd_pendentes         bigint,
  qtd_nao_visitadas     bigint,
  qtd_estornadas        bigint,
  qtd_pedidos           bigint,
  qtd_pedidos_entregues bigint,
  qtd_entregues_primeira bigint,
  qtd_com_ressalva      bigint,
  qtd_fora_ordem        bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_fuso text := COALESCE(NULLIF(btrim(p_fuso), ''), 'America/Fortaleza');
  v_res  text := NULLIF(upper(btrim(p_resultado)), '');
  v_ini  timestamptz;
  v_fim  timestamptz;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023'; END IF;
  IF p_empresa_id IS NULL THEN RAISE EXCEPTION 'empresa_id obrigatório' USING ERRCODE = '22023'; END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL AND p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Data final não pode ser anterior à data inicial' USING ERRCODE = '22023';
  END IF;
  IF v_res IS NOT NULL AND v_res NOT IN ('ENTREGUE','NAO_ENTREGUE','PENDENTE','NAO_VISITADA') THEN
    RAISE EXCEPTION 'Resultado inválido: %', p_resultado USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit deve estar entre 1 e 1000' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset não pode ser negativo' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_ini := CASE WHEN p_data_inicio IS NULL THEN NULL ELSE p_data_inicio::timestamp AT TIME ZONE v_fuso END;
    v_fim := CASE WHEN p_data_fim    IS NULL THEN NULL ELSE (p_data_fim + 1)::timestamp AT TIME ZONE v_fuso END;
    PERFORM now() AT TIME ZONE v_fuso;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Fuso horário inválido: %', v_fuso USING ERRCODE = '22023';
  END;

  RETURN QUERY
  WITH saidas AS MATERIALIZED (
    SELECT e.*, row_number() OVER (PARTITION BY e.carga_id ORDER BY e.created_at, e.id)::int AS numero_saida
    FROM entrega e
    WHERE e.tenant_id = p_tenant_id AND e.empresa_id = p_empresa_id
  ),
  tent AS (
    SELECT t.id AS linha_id, 'TENTATIVA'::text AS tipo_linha, t.registrada_em AS data_evento,
           t.resultado, t.numero_tentativa, t.entrega_id, t.entrega_parada_id,
           t.usuario_id, t.veiculo_id, t.motivo_ocorrencia_id, t.ocorrencia_id, t.ressalvas,
           t.recebedor_nome, (t.foto_path IS NOT NULL) AS tem_foto, t.fora_de_ordem,
           (t.estornada_em IS NOT NULL) AS estornada, t.estornada_em, t.estornada_por, t.motivo_estorno, t.origem
    FROM entrega_tentativa t
    WHERE t.tenant_id = p_tenant_id AND t.empresa_id = p_empresa_id
      AND (p_incluir_estornadas OR t.estornada_em IS NULL)
  ),
  sem AS (
    -- paradas sem nenhuma tentativa válida (nunca visitadas, ou só tentativas estornadas)
    SELECT p.id AS linha_id, 'SEM_TENTATIVA'::text AS tipo_linha,
           CASE WHEN s.status = 'CANCELADA' THEN COALESCE(s.cancelada_em, s.updated_at) ELSE s.atribuida_em END AS data_evento,
           CASE WHEN s.status IN ('AGUARDANDO_ACEITE','EM_ROTA') THEN 'PENDENTE' ELSE 'NAO_VISITADA' END AS resultado,
           NULL::int AS numero_tentativa, s.id AS entrega_id, p.id AS entrega_parada_id,
           s.usuario_id, s.veiculo_id, NULL::uuid AS motivo_ocorrencia_id, NULL::uuid AS ocorrencia_id, '[]'::jsonb AS ressalvas,
           NULL::text AS recebedor_nome, false AS tem_foto, false AS fora_de_ordem,
           false AS estornada, NULL::timestamptz AS estornada_em, NULL::uuid AS estornada_por, NULL::text AS motivo_estorno,
           NULL::text AS origem
    FROM entrega_parada p
    JOIN saidas s ON s.id = p.entrega_id
    WHERE NOT EXISTS (SELECT 1 FROM entrega_tentativa t WHERE t.entrega_parada_id = p.id AND t.estornada_em IS NULL)
  ),
  base AS MATERIALIZED (
    SELECT x.*, s.carga_id, s.numero_saida, s.status AS status_saida, s.atribuida_em, s.aceita_em,
           p.sequencia, p.documento_saida_id, p.parceiro_id, p.numero_pedido, p.numero_nf, p.parceiro_nome,
           p.bairro, p.cidade
    FROM (SELECT * FROM tent UNION ALL SELECT * FROM sem) x
    JOIN saidas s         ON s.id = x.entrega_id
    JOIN entrega_parada p ON p.id = x.entrega_parada_id
    WHERE (v_ini IS NULL OR x.data_evento >= v_ini)
      AND (v_fim IS NULL OR x.data_evento <  v_fim)
      AND (p_usuario_id  IS NULL OR x.usuario_id = p_usuario_id)
      AND (p_veiculo_id  IS NULL OR x.veiculo_id = p_veiculo_id)
      AND (p_parceiro_id IS NULL OR p.parceiro_id = p_parceiro_id)
      AND (v_res IS NULL OR x.resultado = v_res)
      AND (p_motivo_id IS NULL OR x.motivo_ocorrencia_id = p_motivo_id
           OR x.ressalvas @> jsonb_build_array(jsonb_build_object('motivo_id', p_motivo_id::text)))
  ),
  resumo AS (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE b.tipo_linha = 'TENTATIVA' AND NOT b.estornada) AS tentativas,
           count(*) FILTER (WHERE b.resultado = 'ENTREGUE' AND NOT b.estornada) AS entregues,
           count(*) FILTER (WHERE b.resultado = 'NAO_ENTREGUE' AND NOT b.estornada) AS nao_entregues,
           count(*) FILTER (WHERE b.resultado = 'PENDENTE') AS pendentes,
           count(*) FILTER (WHERE b.resultado = 'NAO_VISITADA') AS nao_visitadas,
           count(*) FILTER (WHERE b.estornada) AS estornadas,
           count(DISTINCT b.documento_saida_id) AS pedidos,
           count(DISTINCT b.documento_saida_id) FILTER (WHERE b.resultado = 'ENTREGUE' AND NOT b.estornada) AS pedidos_entregues,
           count(*) FILTER (WHERE b.resultado = 'ENTREGUE' AND NOT b.estornada AND b.numero_tentativa = 1) AS primeira,
           count(*) FILTER (WHERE NOT b.estornada AND jsonb_array_length(b.ressalvas) > 0) AS com_ressalva,
           count(*) FILTER (WHERE NOT b.estornada AND b.fora_de_ordem) AS fora_ordem
    FROM base b
  ),
  pagina AS (
    SELECT b.* FROM base b
    ORDER BY b.data_evento DESC, b.linha_id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT pg.linha_id, pg.tipo_linha, pg.data_evento, pg.resultado, pg.numero_tentativa,
         pg.carga_id, c.numero_carga::text, pg.entrega_id, pg.numero_saida, pg.status_saida,
         pg.atribuida_em, pg.aceita_em, pg.sequencia, pg.documento_saida_id,
         pg.numero_pedido, COALESCE(nf.numero_nf::text, pg.numero_nf), pg.parceiro_id, pg.parceiro_nome, pg.bairro, pg.cidade,
         u.nome, NULLIF(concat_ws(' · ', v.placa, v.descricao), ''),
         pg.motivo_ocorrencia_id, mo.descricao, o.numero_ocorrencia::text,
         NULLIF((SELECT string_agg(r->>'motivo', '; ') FROM jsonb_array_elements(pg.ressalvas) r), ''),
         pg.recebedor_nome, pg.tem_foto, pg.fora_de_ordem,
         pg.estornada, pg.estornada_em, ue.nome, pg.motivo_estorno, pg.origem,
         rs.total, rs.tentativas, rs.entregues, rs.nao_entregues, rs.pendentes, rs.nao_visitadas,
         rs.estornadas, rs.pedidos, rs.pedidos_entregues, rs.primeira, rs.com_ressalva, rs.fora_ordem
  FROM pagina pg
  CROSS JOIN resumo rs
  JOIN carga c                     ON c.id  = pg.carga_id
  LEFT JOIN usuario u              ON u.id  = pg.usuario_id
  LEFT JOIN usuario ue             ON ue.id = pg.estornada_por
  LEFT JOIN veiculos v             ON v.id  = pg.veiculo_id
  LEFT JOIN motivo_ocorrencia mo   ON mo.id = pg.motivo_ocorrencia_id
  LEFT JOIN ocorrencia_operacional o ON o.id = pg.ocorrencia_id
  -- NF viva: a nota costuma ser emitida depois de a entrega existir
  LEFT JOIN LATERAL (
    SELECT n.numero_nf FROM documento_saida_nf n
     WHERE n.documento_saida_id = pg.documento_saida_id AND n.data_cancelamento IS NULL
     ORDER BY n.data_emissao DESC NULLS LAST, n.created_at DESC LIMIT 1) nf ON true
  ORDER BY pg.data_evento DESC, pg.linha_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_entregas_tentativas(
  uuid, uuid, date, date, uuid, uuid, uuid, text, uuid, boolean, integer, integer, text
) IS 'Relatório de saídas e tentativas de entrega (paginado). Uma linha por tentativa (entrega_tentativa) e por parada sem tentativa válida (PENDENTE/NAO_VISITADA). Resumo do conjunto em cada linha.';
REVOKE ALL ON FUNCTION public.rpc_relatorio_entregas_tentativas(
  uuid, uuid, date, date, uuid, uuid, uuid, text, uuid, boolean, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_entregas_tentativas(
  uuid, uuid, date, date, uuid, uuid, uuid, text, uuid, boolean, integer, integer, text) TO authenticated, service_role;

-- ---------- 2. resultado por motivo ----------
DROP FUNCTION IF EXISTS public.rpc_relatorio_entregas_motivos(uuid, uuid, date, date, uuid, uuid, uuid, text);

CREATE FUNCTION public.rpc_relatorio_entregas_motivos(
  p_tenant_id   uuid,
  p_empresa_id  uuid,
  p_data_inicio date DEFAULT NULL,
  p_data_fim    date DEFAULT NULL,
  p_usuario_id  uuid DEFAULT NULL,
  p_veiculo_id  uuid DEFAULT NULL,
  p_parceiro_id uuid DEFAULT NULL,
  p_fuso        text DEFAULT 'America/Fortaleza'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_fuso text := COALESCE(NULLIF(btrim(p_fuso), ''), 'America/Fortaleza');
  v_ini  timestamptz;
  v_fim  timestamptz;
  v_out  jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023'; END IF;
  IF p_empresa_id IS NULL THEN RAISE EXCEPTION 'empresa_id obrigatório' USING ERRCODE = '22023'; END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL AND p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Data final não pode ser anterior à data inicial' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_ini := CASE WHEN p_data_inicio IS NULL THEN NULL ELSE p_data_inicio::timestamp AT TIME ZONE v_fuso END;
    v_fim := CASE WHEN p_data_fim    IS NULL THEN NULL ELSE (p_data_fim + 1)::timestamp AT TIME ZONE v_fuso END;
    PERFORM now() AT TIME ZONE v_fuso;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Fuso horário inválido: %', v_fuso USING ERRCODE = '22023';
  END;

  WITH t AS MATERIALIZED (
    SELECT t.*, p.parceiro_nome, (t.registrada_em AT TIME ZONE v_fuso)::date AS dia
    FROM entrega_tentativa t
    JOIN entrega_parada p ON p.id = t.entrega_parada_id
    WHERE t.tenant_id = p_tenant_id AND t.empresa_id = p_empresa_id
      AND t.estornada_em IS NULL
      AND (v_ini IS NULL OR t.registrada_em >= v_ini)
      AND (v_fim IS NULL OR t.registrada_em <  v_fim)
      AND (p_usuario_id  IS NULL OR t.usuario_id  = p_usuario_id)
      AND (p_veiculo_id  IS NULL OR t.veiculo_id  = p_veiculo_id)
      AND (p_parceiro_id IS NULL OR t.parceiro_id = p_parceiro_id)
  ),
  nv AS (
    -- paradas de saídas encerradas/canceladas que nunca tiveram tentativa válida
    SELECT p.id
    FROM entrega_parada p
    JOIN entrega e ON e.id = p.entrega_id
    WHERE e.tenant_id = p_tenant_id AND e.empresa_id = p_empresa_id
      AND e.status IN ('CANCELADA','CONCLUIDA')
      AND (v_ini IS NULL OR COALESCE(e.cancelada_em, e.updated_at) >= v_ini)
      AND (v_fim IS NULL OR COALESCE(e.cancelada_em, e.updated_at) <  v_fim)
      AND (p_usuario_id  IS NULL OR e.usuario_id  = p_usuario_id)
      AND (p_veiculo_id  IS NULL OR e.veiculo_id  = p_veiculo_id)
      AND (p_parceiro_id IS NULL OR p.parceiro_id = p_parceiro_id)
      AND NOT EXISTS (SELECT 1 FROM entrega_tentativa x WHERE x.entrega_parada_id = p.id AND x.estornada_em IS NULL)
  ),
  ocorr AS (
    -- falhas: o motivo da tentativa NAO_ENTREGUE
    SELECT 'FALHA'::text AS tipo, t.motivo_ocorrencia_id AS motivo_id, t.documento_saida_id, t.parceiro_id, t.usuario_id
    FROM t WHERE t.resultado = 'NAO_ENTREGUE'
    UNION ALL
    -- ressalvas: ocorrências informativas que acompanharam a tentativa
    SELECT 'RESSALVA', NULLIF(r->>'motivo_id', '')::uuid, t.documento_saida_id, t.parceiro_id, t.usuario_id
    FROM t CROSS JOIN LATERAL jsonb_array_elements(t.ressalvas) r
  ),
  falhas_total AS (SELECT count(*) AS n FROM ocorr WHERE tipo = 'FALHA')
  SELECT jsonb_build_object(
    'resumo', (
      SELECT jsonb_build_object(
        'tentativas', count(*),
        'entregues', count(*) FILTER (WHERE resultado = 'ENTREGUE'),
        'nao_entregues', count(*) FILTER (WHERE resultado = 'NAO_ENTREGUE'),
        'pedidos', count(DISTINCT documento_saida_id),
        'pedidos_entregues', count(DISTINCT documento_saida_id) FILTER (WHERE resultado = 'ENTREGUE'),
        'entregues_primeira', count(*) FILTER (WHERE resultado = 'ENTREGUE' AND numero_tentativa = 1),
        'com_ressalva', count(*) FILTER (WHERE jsonb_array_length(ressalvas) > 0),
        'fora_de_ordem', count(*) FILTER (WHERE fora_de_ordem),
        'entregadores', count(DISTINCT usuario_id),
        'clientes', count(DISTINCT parceiro_id),
        'nao_visitadas', (SELECT count(*) FROM nv)
      ) FROM t),
    'motivos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'tipo', g.tipo, 'motivo_id', g.motivo_id, 'motivo', COALESCE(mo.descricao, 'Sem motivo'),
               'impede_entrega', mo.impede_entrega, 'quantidade', g.qtd,
               'pct', CASE WHEN g.tipo = 'FALHA' AND ft.n > 0 THEN round(g.qtd * 100.0 / ft.n, 1) END,
               'pedidos', g.pedidos, 'clientes', g.clientes, 'entregadores', g.entregadores)
             ORDER BY g.tipo, g.qtd DESC, mo.descricao)
      FROM (SELECT o.tipo, o.motivo_id, count(*) AS qtd, count(DISTINCT o.documento_saida_id) AS pedidos,
                   count(DISTINCT o.parceiro_id) AS clientes, count(DISTINCT o.usuario_id) AS entregadores
            FROM ocorr o GROUP BY o.tipo, o.motivo_id) g
      CROSS JOIN falhas_total ft
      LEFT JOIN motivo_ocorrencia mo ON mo.id = g.motivo_id), '[]'::jsonb),
    'por_entregador', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'tentativas')::int DESC, x->>'nome') FROM (
        SELECT jsonb_build_object(
                 'usuario_id', t.usuario_id, 'nome', COALESCE(u.nome, '—'),
                 'tentativas', count(*),
                 'entregues', count(*) FILTER (WHERE t.resultado = 'ENTREGUE'),
                 'nao_entregues', count(*) FILTER (WHERE t.resultado = 'NAO_ENTREGUE'),
                 'entregues_primeira', count(*) FILTER (WHERE t.resultado = 'ENTREGUE' AND t.numero_tentativa = 1),
                 'com_ressalva', count(*) FILTER (WHERE jsonb_array_length(t.ressalvas) > 0),
                 'principal_motivo', (SELECT mo.descricao FROM t t2 JOIN motivo_ocorrencia mo ON mo.id = t2.motivo_ocorrencia_id
                                       WHERE t2.usuario_id = t.usuario_id AND t2.resultado = 'NAO_ENTREGUE'
                                       GROUP BY mo.descricao ORDER BY count(*) DESC, mo.descricao LIMIT 1)) AS x
        FROM t LEFT JOIN usuario u ON u.id = t.usuario_id
        GROUP BY t.usuario_id, u.nome) s), '[]'::jsonb),
    'por_cliente', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'nao_entregues')::int DESC, (x->>'tentativas')::int DESC, x->>'nome') FROM (
        SELECT jsonb_build_object(
                 'parceiro_id', t.parceiro_id, 'nome', COALESCE(max(t.parceiro_nome), '—'),
                 'tentativas', count(*),
                 'entregues', count(*) FILTER (WHERE t.resultado = 'ENTREGUE'),
                 'nao_entregues', count(*) FILTER (WHERE t.resultado = 'NAO_ENTREGUE'),
                 'pedidos', count(DISTINCT t.documento_saida_id),
                 'principal_motivo', (SELECT mo.descricao FROM t t2 JOIN motivo_ocorrencia mo ON mo.id = t2.motivo_ocorrencia_id
                                       WHERE t2.parceiro_id IS NOT DISTINCT FROM t.parceiro_id AND t2.resultado = 'NAO_ENTREGUE'
                                       GROUP BY mo.descricao ORDER BY count(*) DESC, mo.descricao LIMIT 1)) AS x
        FROM t GROUP BY t.parceiro_id) s), '[]'::jsonb),
    'por_dia', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', d.dia, 'tentativas', d.tent, 'entregues', d.ent, 'nao_entregues', d.nao)
                       ORDER BY d.dia)
      FROM (SELECT t.dia, count(*) AS tent,
                   count(*) FILTER (WHERE t.resultado = 'ENTREGUE') AS ent,
                   count(*) FILTER (WHERE t.resultado = 'NAO_ENTREGUE') AS nao
            FROM t GROUP BY t.dia) d), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_entregas_motivos(uuid, uuid, date, date, uuid, uuid, uuid, text)
  IS 'Relatório de resultado das entregas por motivo: resumo, motivos (FALHA/RESSALVA), por entregador, por cliente e por dia. Base: entrega_tentativa não estornada.';
REVOKE ALL ON FUNCTION public.rpc_relatorio_entregas_motivos(uuid, uuid, date, date, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_entregas_motivos(uuid, uuid, date, date, uuid, uuid, uuid, text) TO authenticated, service_role;

-- ---------- 3. permissões (todos os tenants) ----------
DO $$
DECLARE r record; v_mod uuid; v_perm uuid; m text[];
  v_mods text[][] := ARRAY[
    ARRAY['web.relatorios.entregas', 'Saídas e Tentativas de Entrega'],
    ARRAY['web.relatorios.entregas-motivos', 'Entregas por Motivo']];
BEGIN
  FOR r IN SELECT t.id FROM tenant t LOOP
    FOREACH m SLICE 1 IN ARRAY v_mods LOOP
      INSERT INTO modulo (tenant_id, codigo, descricao, ambiente, menu_grupo)
      VALUES (r.id, m[1], m[2], 'WEB'::enum_ambiente_modulo, 'relatorios')
      ON CONFLICT (tenant_id, codigo) DO NOTHING;
      SELECT id INTO v_mod FROM modulo WHERE tenant_id = r.id AND codigo = m[1];
      INSERT INTO permissao (tenant_id, modulo_id, acao, descricao)
      VALUES (r.id, v_mod, 'READ'::enum_acao_permissao, 'Visualizar')
      ON CONFLICT (tenant_id, modulo_id, acao) DO NOTHING;
      SELECT id INTO v_perm FROM permissao WHERE tenant_id = r.id AND modulo_id = v_mod AND acao = 'READ'::enum_acao_permissao;
      INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
      SELECT r.id, p.id, v_perm FROM perfil p WHERE p.tenant_id = r.id AND p.nome IN ('ADMINISTRADOR','SUPERVISOR')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
