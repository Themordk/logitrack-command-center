-- Migration: 20261115231000_etq_f4_tela_volumes.sql
-- Plano: Etiqueta de Volume de Expedição — Fase 4 (tela Atividades › Volumes)
-- Ações: A18 (lista com cards, filtros e busca no servidor), A19 (detalhe do volume),
--        A20 (impressão/reimpressão em lote com motivo e reenvio de job), A16 (reimpressão com motivo),
--        A21 (cancelamento no lugar da exclusão, com histórico preservado),
--        A22 (vincular volume a pedido, acrescentar volume ao pedido, registrar peso e cubagem)
-- Decisão de desenho (A21): em vez de um status CANCELADO na própria volume_expedicao — que obrigaria
--   a mexer em 9 funções de carga/embarque que contam volumes —, o volume cancelado vai para
--   volume_expedicao_cancelado com o retrato completo (dados da etiqueta, pedido, NF, motivo, quem, quando,
--   ocorrência) e sai da tabela ativa. O histórico de impressões continua em fila_impressao pelo mesmo id.
-- Risco: baixo — só acrescenta tabela e funções novas; nada existente muda de comportamento.
--   fn_excluir_volume_expedicao continua disponível (tela antiga) até a publicação do frontend novo.
-- Rollback: DROP das funções novas e da tabela volume_expedicao_cancelado (bloco no fim do arquivo).
-- Permissões: módulo web.atividades.volumes — READ (lista, detalhe, impressão), UPDATE (vincular,
--   medidas, reenviar job), CREATE (acrescentar volume), DELETE (cancelar volume).

-- ============================================================
-- A21 — histórico de volumes cancelados
-- ============================================================
CREATE TABLE IF NOT EXISTS public.volume_expedicao_cancelado (
  id                  uuid        NOT NULL,              -- mesmo id do volume cancelado
  tenant_id           uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id          uuid        REFERENCES public.empresa(id),
  movimento_saida_id  uuid,
  documento_saida_id  uuid,
  codigo_volume       text        NOT NULL,
  numero_volume       smallint,
  status_anterior     text,
  dados               jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- retrato da linha de vw_volume_expedicao_lista
  motivo              text        NOT NULL,
  cancelado_por       uuid        REFERENCES public.usuario(id),
  cancelado_em        timestamptz NOT NULL DEFAULT now(),
  ocorrencia_id       uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volume_expedicao_cancelado_pkey PRIMARY KEY (id),
  CONSTRAINT ck_volume_cancelado_motivo CHECK (length(btrim(motivo)) >= 5)
);

CREATE INDEX IF NOT EXISTS idx_volume_cancelado_tenant_data ON public.volume_expedicao_cancelado (tenant_id, cancelado_em DESC);
CREATE INDEX IF NOT EXISTS idx_volume_cancelado_movimento   ON public.volume_expedicao_cancelado (movimento_saida_id);
CREATE INDEX IF NOT EXISTS idx_volume_cancelado_documento   ON public.volume_expedicao_cancelado (documento_saida_id);

ALTER TABLE public.volume_expedicao_cancelado ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS volume_expedicao_cancelado_select ON public.volume_expedicao_cancelado;
CREATE POLICY volume_expedicao_cancelado_select ON public.volume_expedicao_cancelado
  FOR SELECT TO authenticated USING (tenant_id = public.get_current_tenant());
REVOKE ALL ON public.volume_expedicao_cancelado FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.volume_expedicao_cancelado FROM authenticated;
GRANT SELECT ON public.volume_expedicao_cancelado TO authenticated;

COMMENT ON TABLE public.volume_expedicao_cancelado IS
  'Volumes de expedição cancelados pela tela Volumes (fn_cancelar_volume_expedicao): retrato do volume, motivo, autor e ocorrência. Gravação só pela função.';

-- ============================================================
-- Contexto comum: tenant + usuário + permissão no módulo de volumes
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_volume_contexto(p_acao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid := public.get_current_tenant(); v_usuario uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_SESSAO', 'mensagem', 'Sessão sem tenant válido.');
  END IF;
  SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = auth.uid() AND u.tenant_id = v_tenant LIMIT 1;
  IF v_usuario IS NULL OR NOT public.fn_usuario_tem_permissao(v_usuario, 'web.atividades.volumes', p_acao) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_PERMISSAO',
      'mensagem', 'Seu perfil não tem permissão para esta ação em Volumes.');
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'tenant_id', v_tenant, 'usuario_id', v_usuario);
END $function$;

-- ============================================================
-- A18 — lista com filtros, busca, paginação e cards
--   p_filtros: status (ABERTO|FECHADO|CONFERIDO|EXPEDIDO|CANCELADO), situacao (SEM_PEDIDO|SEM_NF|
--   NF_DIVERGENTE|NUNCA_IMPRESSO|ERRO_IMPRESSAO|EM_CARGA|EMBARCADO), numero_onda, pedido, nf, cliente,
--   numero_carga, data_de, data_ate (data local America/Fortaleza), busca
--   Os cards não dependem dos filtros de status e situação (clicar no card aplica a situação).
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_volumes_listar(
  p_empresa_id uuid DEFAULT NULL,
  p_filtros jsonb DEFAULT '{}'::jsonb,
  p_pagina integer DEFAULT 1,
  p_tamanho integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx      jsonb := public._fn_volume_contexto('READ');
  v_tenant   uuid;
  f          jsonb := COALESCE(p_filtros, '{}'::jsonb);
  v_status   text := nullif(f->>'status', '');
  v_situacao text := nullif(f->>'situacao', '');
  v_onda     bigint;
  v_carga    bigint;
  v_pedido   text := nullif(btrim(f->>'pedido'), '');
  v_nf       text := nullif(ltrim(btrim(f->>'nf'), '0'), '');
  v_cliente  text := nullif(btrim(f->>'cliente'), '');
  v_busca    text := nullif(btrim(f->>'busca'), '');
  v_de       date;
  v_ate      date;
  v_tam      integer := LEAST(GREATEST(COALESCE(p_tamanho, 50), 1), 500);
  v_off      integer := (GREATEST(COALESCE(p_pagina, 1), 1) - 1) * LEAST(GREATEST(COALESCE(p_tamanho, 50), 1), 500);
  v_resumo   jsonb;
  v_linhas   jsonb;
  v_total    integer;
BEGIN
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;

  BEGIN
    v_onda  := nullif(btrim(f->>'numero_onda'), '')::bigint;
    v_carga := nullif(btrim(f->>'numero_carga'), '')::bigint;
    v_de    := nullif(f->>'data_de', '')::date;
    v_ate   := nullif(f->>'data_ate', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'FILTRO_INVALIDO', 'mensagem', 'Filtro inválido: confira onda, carga e datas.');
  END;

  -- Cancelados: vêm do histórico, com os mesmos filtros que fazem sentido para eles
  IF v_status = 'CANCELADO' THEN
    WITH c AS (
      SELECT vc.*, u.nome AS cancelado_por_nome
        FROM public.volume_expedicao_cancelado vc
        LEFT JOIN public.usuario u ON u.id = vc.cancelado_por
       WHERE vc.tenant_id = v_tenant
         AND (p_empresa_id IS NULL OR vc.empresa_id = p_empresa_id)
         AND (v_onda IS NULL OR (vc.dados->>'numero_onda')::bigint = v_onda)
         AND (v_pedido IS NULL OR vc.dados->>'numero_pedido' ILIKE '%' || v_pedido || '%')
         AND (v_nf IS NULL OR ltrim(vc.dados->>'nf_numero', '0') = v_nf)
         AND (v_cliente IS NULL OR vc.dados->>'parceiro_nome' ILIKE '%' || v_cliente || '%')
         AND (v_de IS NULL OR (vc.cancelado_em AT TIME ZONE 'America/Fortaleza')::date >= v_de)
         AND (v_ate IS NULL OR (vc.cancelado_em AT TIME ZONE 'America/Fortaleza')::date <= v_ate)
         AND (v_busca IS NULL OR vc.codigo_volume ILIKE '%' || v_busca || '%'
              OR vc.dados->>'numero_pedido' ILIKE '%' || v_busca || '%'
              OR vc.dados->>'parceiro_nome' ILIKE '%' || v_busca || '%')
    )
    SELECT (SELECT count(*) FROM c),
           COALESCE((SELECT jsonb_agg(x ORDER BY x->>'cancelado_em' DESC) FROM (
             SELECT (c.dados || jsonb_build_object(
                      'id', c.id, 'codigo_volume', c.codigo_volume, 'status', 'CANCELADO',
                      'status_anterior', c.status_anterior, 'motivo_cancelamento', c.motivo,
                      'cancelado_em', c.cancelado_em, 'cancelado_por_nome', c.cancelado_por_nome)) AS x
               FROM c ORDER BY c.cancelado_em DESC LIMIT v_tam OFFSET v_off) s), '[]'::jsonb)
      INTO v_total, v_linhas;
  END IF;

  WITH b AS (
    SELECT v.*,
           (v.documento_saida_id IS NULL) AS sem_pedido,
           (v.documento_saida_id IS NOT NULL AND v.nf_id IS NULL) AS sem_nf,
           (v.nf_qtd_volumes IS NOT NULL AND v.total_volumes_pedido <> v.nf_qtd_volumes) AS nf_divergente,
           (COALESCE(v.etiqueta_impressoes, 0) = 0) AS nunca_impresso,
           (v.etiqueta_ultimo_status = 'ERRO') AS erro_impressao
      FROM public.vw_volume_expedicao_lista v
     WHERE v.tenant_id = v_tenant
       AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id)
       AND (v_onda IS NULL OR v.numero_onda = v_onda)
       AND (v_carga IS NULL OR v.numero_carga = v_carga)
       AND (v_pedido IS NULL OR v.numero_pedido::text ILIKE '%' || v_pedido || '%')
       AND (v_nf IS NULL OR ltrim(v.nf_numero, '0') = v_nf
            OR EXISTS (SELECT 1 FROM public.documento_saida_nf n
                        WHERE n.documento_saida_id = v.documento_saida_id AND ltrim(n.numero_nf, '0') = v_nf))
       AND (v_cliente IS NULL OR v.parceiro_nome ILIKE '%' || v_cliente || '%')
       AND (v_de IS NULL OR (v.created_at AT TIME ZONE 'America/Fortaleza')::date >= v_de)
       AND (v_ate IS NULL OR (v.created_at AT TIME ZONE 'America/Fortaleza')::date <= v_ate)
       AND (v_busca IS NULL OR v.codigo_volume ILIKE '%' || v_busca || '%'
            OR v.numero_pedido::text ILIKE '%' || v_busca || '%'
            OR v.parceiro_nome ILIKE '%' || v_busca || '%'
            OR v.nf_numero ILIKE '%' || v_busca || '%'
            OR v.numero_onda::text = v_busca)
  ),
  r AS (
    SELECT jsonb_build_object(
      'total',          count(*),
      'nunca_impresso', count(*) FILTER (WHERE nunca_impresso),
      'erro_impressao', count(*) FILTER (WHERE erro_impressao),
      'sem_pedido',     count(*) FILTER (WHERE sem_pedido),
      'sem_nf',         count(*) FILTER (WHERE sem_nf),
      'nf_divergente',  count(*) FILTER (WHERE nf_divergente),
      'em_carga',       count(*) FILTER (WHERE embarque_status = 'PENDENTE'),
      'embarcados',     count(*) FILTER (WHERE embarque_status = 'EMBARCADA'),
      'expedidos',      count(*) FILTER (WHERE status = 'EXPEDIDO'),
      'abertos',        count(*) FILTER (WHERE status = 'ABERTO')) AS j
      FROM b
  ),
  l AS (
    SELECT * FROM b
     WHERE v_status IS DISTINCT FROM 'CANCELADO'
       AND (v_status IS NULL OR status::text = v_status)
       AND (v_situacao IS NULL
            OR (v_situacao = 'SEM_PEDIDO' AND sem_pedido)
            OR (v_situacao = 'SEM_NF' AND sem_nf)
            OR (v_situacao = 'NF_DIVERGENTE' AND nf_divergente)
            OR (v_situacao = 'NUNCA_IMPRESSO' AND nunca_impresso)
            OR (v_situacao = 'ERRO_IMPRESSAO' AND erro_impressao)
            OR (v_situacao = 'EM_CARGA' AND embarque_status = 'PENDENTE')
            OR (v_situacao = 'EMBARCADO' AND embarque_status = 'EMBARCADA'))
  )
  SELECT r.j,
         CASE WHEN v_status = 'CANCELADO' THEN v_total ELSE (SELECT count(*) FROM l) END,
         CASE WHEN v_status = 'CANCELADO' THEN v_linhas ELSE
           COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.codigo_volume DESC) FROM (
             SELECT l.id, l.codigo_volume, l.numero_volume, l.total_volumes_pedido, l.status, l.peso_bruto, l.m3,
                    l.created_at, l.criado_por_nome, l.movimento_saida_id, l.documento_saida_id,
                    l.numero_onda, l.numero_pedido, l.parceiro_nome, l.parceiro_cidade, l.parceiro_uf, l.destino_carga,
                    l.nf_id, l.nf_numero, l.nf_serie, l.nf_qtd_volumes,
                    l.carga_id, l.numero_carga, l.embarque_status, l.embarcada_em,
                    l.etiqueta_impressoes, l.etiqueta_ultimo_status, l.etiqueta_ultima_em,
                    l.sem_pedido, l.sem_nf, l.nf_divergente, l.nunca_impresso, l.erro_impressao
               FROM l ORDER BY l.created_at DESC, l.codigo_volume DESC LIMIT v_tam OFFSET v_off) x), '[]'::jsonb)
         END
    INTO v_resumo, v_total, v_linhas
    FROM r;

  v_resumo := v_resumo || jsonb_build_object('cancelados',
    (SELECT count(*) FROM public.volume_expedicao_cancelado vc
      WHERE vc.tenant_id = v_tenant AND (p_empresa_id IS NULL OR vc.empresa_id = p_empresa_id)
        AND (v_de IS NULL OR (vc.cancelado_em AT TIME ZONE 'America/Fortaleza')::date >= v_de)
        AND (v_ate IS NULL OR (vc.cancelado_em AT TIME ZONE 'America/Fortaleza')::date <= v_ate)));

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK',
    'dados', jsonb_build_object('linhas', v_linhas, 'total', v_total, 'pagina', GREATEST(COALESCE(p_pagina, 1), 1),
                                'tamanho', v_tam, 'resumo', v_resumo));
END $function$;

-- ============================================================
-- A19 — detalhe do volume (também de um volume cancelado)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_volume_detalhe(p_volume_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx     jsonb := public._fn_volume_contexto('READ');
  v_tenant  uuid;
  v_vol     jsonb;
  v_canc    jsonb;
  v_doc     uuid;
  v_mov     uuid;
BEGIN
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;

  SELECT to_jsonb(v) INTO v_vol FROM public.vw_volume_expedicao_lista v WHERE v.id = p_volume_id AND v.tenant_id = v_tenant;
  IF v_vol IS NULL THEN
    SELECT vc.dados || jsonb_build_object('id', vc.id, 'codigo_volume', vc.codigo_volume, 'status', 'CANCELADO'),
           jsonb_build_object('motivo', vc.motivo, 'cancelado_em', vc.cancelado_em, 'status_anterior', vc.status_anterior,
                              'cancelado_por_nome', u.nome, 'ocorrencia_id', vc.ocorrencia_id)
      INTO v_vol, v_canc
      FROM public.volume_expedicao_cancelado vc LEFT JOIN public.usuario u ON u.id = vc.cancelado_por
     WHERE vc.id = p_volume_id AND vc.tenant_id = v_tenant;
  END IF;
  IF v_vol IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_NAO_ENCONTRADO', 'mensagem', 'Volume não encontrado.');
  END IF;
  v_doc := nullif(v_vol->>'documento_saida_id', '')::uuid;
  v_mov := nullif(v_vol->>'movimento_saida_id', '')::uuid;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', jsonb_build_object(
    'volume', v_vol,
    'cancelamento', v_canc,
    'etiqueta', CASE WHEN v_canc IS NULL THEN
                  (SELECT d.dados FROM public._fn_etiqueta_volume_dados(v_tenant, ARRAY[p_volume_id]) d) END,
    'conferencia_nf', CASE WHEN v_doc IS NOT NULL AND v_canc IS NULL THEN public._fn_volume_nf_conferir(v_doc) END,
    'pedidos_da_onda', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('documento_saida_id', ds.id, 'numero_pedido', ds.numero_pedido, 'parceiro_nome', p.razaosocial)
                       ORDER BY msd.ordem NULLS LAST, ds.numero_pedido)
        FROM public.movimento_saida_documento msd
        JOIN public.documento_saida ds ON ds.id = msd.documento_saida_id
        LEFT JOIN public.parceiro p ON p.id = ds.parceiro_id
       WHERE msd.movimento_saida_id = v_mov), '[]'::jsonb),
    'volumes_do_pedido', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', ve.id, 'codigo_volume', ve.codigo_volume, 'numero_volume', ve.numero_volume,
                                          'status', ve.status) ORDER BY ve.numero_volume, ve.codigo_volume)
        FROM public.volume_expedicao ve
       WHERE ve.tenant_id = v_tenant AND ve.movimento_saida_id = v_mov
         AND ve.documento_saida_id IS NOT DISTINCT FROM v_doc), '[]'::jsonb),
    'impressoes', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'criado_em' DESC) FROM (
        SELECT jsonb_build_object('id', f.id, 'status', f.status, 'origem', f.origem, 'criado_em', f.criado_em,
                 'impresso_em', f.impresso_em, 'erro_mensagem', f.erro_mensagem, 'tentativas', f.tentativas,
                 'quantidade_copias', f.quantidade_copias, 'impressora_nome', i.nome, 'template_nome', t.nome,
                 'solicitado_por_nome', u.nome, 'motivo', f.dados->>'_motivo_reimpressao',
                 'nota_fiscal', f.dados->>'nota_fiscal') AS x
          FROM public.fila_impressao f
          LEFT JOIN public.impressora i ON i.id = f.impressora_id
          LEFT JOIN public.etiqueta_template t ON t.id = f.template_id
          LEFT JOIN public.usuario u ON u.id = f.solicitado_por
         WHERE f.tenant_id = v_tenant AND f.tipo_documento_origem = 'volume_expedicao' AND f.documento_origem_id = p_volume_id
         ORDER BY f.criado_em DESC LIMIT 50) s), '[]'::jsonb),
    'embarque', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('carga_id', c.id, 'numero_carga', c.numero_carga, 'carga_status', c.status,
                 'unidade_status', cu.status, 'embarcada_em', cu.embarcada_em, 'embarcada_por_nome', u.nome,
                 'incluida_em', cu.created_at) ORDER BY cu.created_at DESC)
        FROM public.carga_unidade cu
        JOIN public.carga c ON c.id = cu.carga_id
        LEFT JOIN public.usuario u ON u.id = cu.embarcada_por
       WHERE cu.tenant_id = v_tenant AND cu.tipo = 'VOLUME' AND cu.referencia_id = p_volume_id), '[]'::jsonb),
    'ocorrencias', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'criado_em' DESC) FROM (
        SELECT jsonb_build_object('id', o.id, 'numero', o.numero_ocorrencia, 'status', o.status, 'prioridade', o.prioridade,
                 'observacao', o.observacao, 'criado_em', o.criado_em) AS x
          FROM public.ocorrencia_operacional o
         WHERE o.tenant_id = v_tenant AND o.documento_origem_id IN (v_doc, v_mov)
           AND o.etapa_ocorrencia = 'EXPEDICAO'
         ORDER BY o.criado_em DESC LIMIT 20) s), '[]'::jsonb)
  ));
END $function$;

-- ============================================================
-- A20 — impressão e reimpressão em lote pelo servidor
--   Volume que já tem etiqueta impressa só é reimpresso com motivo (mínimo 5 caracteres).
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_volume_imprimir(
  p_volume_ids uuid[],
  p_armazem_id uuid,
  p_impressora_id uuid DEFAULT NULL,
  p_template_id uuid DEFAULT NULL,
  p_copias integer DEFAULT 1,
  p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx      jsonb := public._fn_volume_contexto('READ');
  v_tenant   uuid;
  v_ids      uuid[];
  v_ja       text[];
  v_motivo   text := nullif(btrim(p_motivo), '');
  r          record;
  v_res      jsonb;
  v_ok       integer := 0;
  v_falhas   jsonb := '[]'::jsonb;
  v_imp_nome text;
  v_aviso    text;
BEGIN
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;

  IF p_volume_ids IS NULL OR cardinality(p_volume_ids) = 0 OR cardinality(p_volume_ids) > 200 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'QUANTIDADE_INVALIDA', 'mensagem', 'Selecione de 1 a 200 volumes.');
  END IF;
  IF p_copias IS NULL OR p_copias NOT BETWEEN 1 AND 20 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'COPIAS_INVALIDAS', 'mensagem', 'Informe de 1 a 20 cópias.');
  END IF;

  SELECT array_agg(ve.id) INTO v_ids FROM public.volume_expedicao ve
   WHERE ve.id = ANY(p_volume_ids) AND ve.tenant_id = v_tenant;
  IF COALESCE(cardinality(v_ids), 0) <> (SELECT count(DISTINCT x) FROM unnest(p_volume_ids) x) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_NAO_ENCONTRADO',
      'mensagem', 'Um ou mais volumes não foram encontrados (podem ter sido cancelados). Atualize a lista.');
  END IF;

  SELECT array_agg(ve.codigo_volume::text ORDER BY ve.codigo_volume) INTO v_ja
    FROM public.volume_expedicao ve
   WHERE ve.id = ANY(v_ids)
     AND EXISTS (SELECT 1 FROM public.fila_impressao f
                  WHERE f.tipo_documento_origem = 'volume_expedicao' AND f.documento_origem_id = ve.id AND f.status = 'IMPRESSO');
  IF v_ja IS NOT NULL AND (v_motivo IS NULL OR length(v_motivo) < 5) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOTIVO_REIMPRESSAO_OBRIGATORIO',
      'mensagem', format('%s volume(s) já têm etiqueta impressa. Informe o motivo da reimpressão (mínimo 5 caracteres).', cardinality(v_ja)),
      'ja_impressos', to_jsonb(v_ja));
  END IF;

  FOR r IN
    SELECT ve.id, ve.codigo_volume, (ve.codigo_volume::text = ANY(COALESCE(v_ja, '{}'))) AS reimpressao
      FROM public.volume_expedicao ve WHERE ve.id = ANY(v_ids)
     ORDER BY ve.movimento_saida_id, ve.documento_saida_id, ve.numero_volume, ve.codigo_volume
  LOOP
    v_res := public.solicitar_impressao(
      p_armazem_id := p_armazem_id,
      p_tipo_etiqueta := 'VOLUME',
      p_dados := CASE WHEN r.reimpressao THEN jsonb_build_object('_motivo_reimpressao', v_motivo) ELSE '{}'::jsonb END,
      p_origem := CASE WHEN r.reimpressao THEN 'REIMPRESSAO' ELSE 'PAINEL_ADMINISTRATIVO' END,
      p_documento_origem_id := r.id,
      p_impressora_id := p_impressora_id,
      p_prioridade := 5,
      p_quantidade_copias := p_copias,
      p_setor_uso := NULL,
      p_tipo_documento_origem := 'volume_expedicao',
      p_template_id := p_template_id);
    IF COALESCE((v_res->>'success')::boolean, false) THEN
      v_ok := v_ok + 1;
      v_imp_nome := COALESCE(v_imp_nome, v_res->>'impressora_nome');
      v_aviso := COALESCE(v_aviso, v_res->>'aviso');
    ELSIF v_res->>'codigo' IN ('IMPRESSORA_OFFLINE', 'SEM_IMPRESSORA_ONLINE', 'IMPRESSORA_INVALIDA', 'SEM_IMPRESSORA_CADASTRADA',
                               'TEMPLATE_INVALIDO', 'SEM_TEMPLATE', 'SEM_TENANT') THEN
      -- problema de impressora/template vale para todos: para aqui
      RETURN jsonb_build_object('sucesso', v_ok > 0, 'codigo', v_res->>'codigo', 'mensagem', v_res->>'error',
        'dados', jsonb_build_object('enviados', v_ok, 'falhas', v_falhas, 'impressora_nome', v_imp_nome,
                                    'interrompido', true, 'restantes', cardinality(v_ids) - v_ok - jsonb_array_length(v_falhas)));
    ELSE
      v_falhas := v_falhas || jsonb_build_object('codigo_volume', r.codigo_volume, 'erro', COALESCE(v_res->>'error', 'erro desconhecido'));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('sucesso', v_ok > 0,
    'codigo', CASE WHEN jsonb_array_length(v_falhas) = 0 THEN 'ETIQUETAS_ENVIADAS' ELSE 'ETIQUETAS_PARCIAIS' END,
    'mensagem', format('%s etiqueta(s) enviada(s)%s.', v_ok, COALESCE(' para ' || v_imp_nome, '')),
    'dados', jsonb_build_object('enviados', v_ok, 'falhas', v_falhas, 'impressora_nome', v_imp_nome, 'aviso', v_aviso,
                                'reimpressoes', COALESCE(cardinality(v_ja), 0)));
END $function$;

-- Reenvio de um job que não imprimiu (ERRO, CANCELADO ou PENDENTE parado): cria um job novo,
-- com os dados atuais do servidor, na mesma impressora e template; o job antigo fica no histórico.
CREATE OR REPLACE FUNCTION public.rpc_volume_reenviar_job(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx     jsonb := public._fn_volume_contexto('UPDATE');
  v_tenant  uuid;
  v_usuario uuid;
  v_job     record;
  v_novo    uuid;
BEGIN
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;
  v_usuario := (v_ctx->>'usuario_id')::uuid;

  SELECT f.* INTO v_job FROM public.fila_impressao f
   WHERE f.id = p_job_id AND f.tenant_id = v_tenant AND f.tipo_documento_origem = 'volume_expedicao'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'JOB_NAO_ENCONTRADO', 'mensagem', 'Impressão não encontrada.');
  END IF;
  IF v_job.status::text NOT IN ('ERRO', 'CANCELADO', 'PENDENTE') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'JOB_STATUS_INVALIDO',
      'mensagem', format('Esta impressão está %s. Para imprimir de novo, use Reimprimir.', v_job.status));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.volume_expedicao ve WHERE ve.id = v_job.documento_origem_id AND ve.tenant_id = v_tenant) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_NAO_ENCONTRADO', 'mensagem', 'O volume foi cancelado.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.impressora i WHERE i.id = v_job.impressora_id AND i.ativo) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'IMPRESSORA_INVALIDA',
      'mensagem', 'A impressora deste job está inativa. Use Reimprimir e escolha outra impressora.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.etiqueta_template t WHERE t.id = v_job.template_id AND t.ativo) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TEMPLATE_INVALIDO',
      'mensagem', 'O template deste job está inativo. Use Reimprimir e escolha outro template.');
  END IF;

  IF v_job.status::text = 'PENDENTE' THEN
    UPDATE public.fila_impressao SET status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_usuario,
           erro_mensagem = 'Substituído por reenvio'
     WHERE id = v_job.id;
  END IF;

  INSERT INTO public.fila_impressao (tenant_id, empresa_id, armazem_id, impressora_id, template_id, dados,
         quantidade_copias, origem, documento_origem_id, tipo_documento_origem, solicitado_por, criado_por, prioridade)
  VALUES (v_job.tenant_id, v_job.empresa_id, v_job.armazem_id, v_job.impressora_id, v_job.template_id,
         jsonb_build_object('_reenvio_de', v_job.id), v_job.quantidade_copias, 'REENVIO',
         v_job.documento_origem_id, 'volume_expedicao', v_usuario, v_usuario, v_job.prioridade)
  RETURNING id INTO v_novo;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'JOB_REENVIADO', 'mensagem', 'Etiqueta reenviada para a impressora.',
    'dados', jsonb_build_object('job_id', v_novo));
END $function$;

-- ============================================================
-- A21 — cancelamento do volume
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_cancelar_volume_expedicao(p_volume_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx       jsonb := public._fn_volume_contexto('DELETE');
  v_tenant    uuid;
  v_usuario   uuid;
  v_vol       record;
  v_snap      jsonb;
  v_arm       uuid;
  v_ocorr     jsonb;
  v_jobs      integer;
  v_restantes jsonb;
  v_motivo    text := btrim(COALESCE(p_motivo, ''));
BEGIN
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;
  v_usuario := (v_ctx->>'usuario_id')::uuid;

  IF length(v_motivo) < 5 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOTIVO_OBRIGATORIO', 'mensagem', 'Informe o motivo do cancelamento (mínimo 5 caracteres).');
  END IF;

  SELECT ve.*, ms.numero_onda, ms.box_id INTO v_vol
    FROM public.volume_expedicao ve LEFT JOIN public.movimento_saida ms ON ms.id = ve.movimento_saida_id
   WHERE ve.id = p_volume_id AND ve.tenant_id = v_tenant
   FOR UPDATE OF ve;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_NAO_ENCONTRADO', 'mensagem', 'Volume não encontrado.');
  END IF;
  IF v_vol.status::text = 'EXPEDIDO' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_EXPEDIDO', 'mensagem', 'O volume já foi expedido e não pode ser cancelado.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.carga_unidade cu WHERE cu.tenant_id = v_tenant AND cu.tipo = 'VOLUME'
              AND cu.referencia_id = p_volume_id AND cu.status = 'EMBARCADA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_EMBARCADO', 'mensagem', 'O volume já foi embarcado e não pode ser cancelado.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.carga_unidade cu WHERE cu.tenant_id = v_tenant AND cu.tipo = 'VOLUME'
              AND cu.referencia_id = p_volume_id AND cu.status <> 'CANCELADA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_EM_CARGA', 'mensagem', 'O volume está numa carga. Remova a onda da carga antes de cancelar.');
  END IF;

  SELECT to_jsonb(v) INTO v_snap FROM public.vw_volume_expedicao_lista v WHERE v.id = p_volume_id;

  INSERT INTO public.volume_expedicao_cancelado (id, tenant_id, empresa_id, movimento_saida_id, documento_saida_id,
         codigo_volume, numero_volume, status_anterior, dados, motivo, cancelado_por)
  VALUES (v_vol.id, v_vol.tenant_id, v_vol.empresa_id, v_vol.movimento_saida_id, v_vol.documento_saida_id,
         v_vol.codigo_volume, v_vol.numero_volume, v_vol.status::text, COALESCE(v_snap, '{}'::jsonb), v_motivo, v_usuario);

  UPDATE public.fila_impressao SET status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_usuario,
         erro_mensagem = 'Volume cancelado'
   WHERE tipo_documento_origem = 'volume_expedicao' AND documento_origem_id = p_volume_id
     AND status IN ('PENDENTE', 'ERRO', 'REIMPRESSAO');
  GET DIAGNOSTICS v_jobs = ROW_COUNT;

  DELETE FROM public.volume_expedicao WHERE id = p_volume_id AND tenant_id = v_tenant;

  SELECT b.armazem_id INTO v_arm FROM public.box b WHERE b.id = v_vol.box_id;
  IF v_arm IS NULL THEN
    SELECT a.id INTO v_arm FROM public.armazem a WHERE a.tenant_id = v_vol.tenant_id AND a.empresa_id = v_vol.empresa_id
     ORDER BY a.created_at NULLS LAST LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ve.id, 'codigo_volume', ve.codigo_volume, 'numero_volume', ve.numero_volume)
                            ORDER BY ve.numero_volume), '[]'::jsonb)
    INTO v_restantes
    FROM public.volume_expedicao ve
   WHERE ve.tenant_id = v_tenant AND ve.movimento_saida_id = v_vol.movimento_saida_id
     AND ve.documento_saida_id IS NOT DISTINCT FROM v_vol.documento_saida_id;

  v_ocorr := public.registrar_ocorrencia_operacional(
    p_tenant_id := v_vol.tenant_id,
    p_empresa_id := v_vol.empresa_id,
    p_armazem_id := v_arm,
    p_tipo_ocorrencia := 'OUTROS',
    p_categoria := 'CORRETIVA',
    p_etapa_ocorrencia := 'EXPEDICAO',
    p_observacao := format('Cancelamento do volume %s (onda %s, pedido %s). Motivo: %s. O pedido passa a ter %s volume(s).',
                           v_vol.codigo_volume, COALESCE(v_vol.numero_onda::text, '—'),
                           COALESCE(v_snap->>'numero_pedido', '—'), v_motivo, jsonb_array_length(v_restantes)),
    p_documento_origem_id := COALESCE(v_vol.documento_saida_id, v_vol.movimento_saida_id),
    p_tipo_documento_origem := CASE WHEN v_vol.documento_saida_id IS NOT NULL THEN 'DOCUMENTO_SAIDA' ELSE 'MOVIMENTO_SAIDA' END,
    p_usuario_criador_id := v_usuario,
    p_usuario_causador_id := v_usuario,
    p_prioridade := 'NORMAL');
  IF NOT COALESCE((v_ocorr->>'sucesso')::boolean, false) THEN
    RAISE EXCEPTION 'OCORRENCIA_FALHOU: %', v_ocorr->>'mensagem';
  END IF;
  UPDATE public.volume_expedicao_cancelado SET ocorrencia_id = (v_ocorr->>'ocorrencia_id')::uuid WHERE id = v_vol.id;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'VOLUME_CANCELADO',
    'mensagem', format('Volume %s cancelado. Ocorrência registrada.', v_vol.codigo_volume),
    'dados', jsonb_build_object('codigo_volume', v_vol.codigo_volume, 'jobs_cancelados', v_jobs,
                                'volumes_restantes', v_restantes, 'ocorrencia_id', v_ocorr->>'ocorrencia_id'));
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fn_cancelar_volume_expedicao(%): % %', p_volume_id, SQLSTATE, SQLERRM;
  RETURN jsonb_build_object('sucesso', false, 'codigo', 'ERRO_INTERNO',
    'mensagem', 'Erro ao cancelar o volume. Tente novamente ou acione o suporte.');
END $function$;

-- ============================================================
-- A22 — correções
-- ============================================================
-- Vincula um volume sem pedido a um dos pedidos da própria onda
CREATE OR REPLACE FUNCTION public.rpc_volume_vincular_pedido(p_volume_id uuid, p_documento_saida_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx jsonb := public._fn_volume_contexto('UPDATE');
  v_tenant uuid; v_usuario uuid; v_vol record; v_num smallint; v_ped bigint; v_ocorr jsonb;
BEGIN
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;

  SELECT ve.* INTO v_vol FROM public.volume_expedicao ve WHERE ve.id = p_volume_id AND ve.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_NAO_ENCONTRADO', 'mensagem', 'Volume não encontrado.');
  END IF;
  IF v_vol.documento_saida_id IS NOT NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_JA_VINCULADO', 'mensagem', 'O volume já está ligado a um pedido.');
  END IF;
  IF v_vol.status::text = 'EXPEDIDO' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_EXPEDIDO', 'mensagem', 'O volume já foi expedido.');
  END IF;
  SELECT ds.numero_pedido INTO v_ped FROM public.movimento_saida_documento msd JOIN public.documento_saida ds ON ds.id = msd.documento_saida_id
   WHERE msd.movimento_saida_id = v_vol.movimento_saida_id AND msd.documento_saida_id = p_documento_saida_id AND ds.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'PEDIDO_FORA_DA_ONDA', 'mensagem', 'O pedido escolhido não faz parte da onda do volume.');
  END IF;

  v_num := v_vol.numero_volume;
  IF v_num IS NULL OR EXISTS (SELECT 1 FROM public.volume_expedicao ve WHERE ve.movimento_saida_id = v_vol.movimento_saida_id
                               AND ve.documento_saida_id = p_documento_saida_id AND ve.numero_volume = v_num) THEN
    SELECT COALESCE(max(ve.numero_volume), 0) + 1 INTO v_num FROM public.volume_expedicao ve
     WHERE ve.movimento_saida_id = v_vol.movimento_saida_id AND ve.documento_saida_id = p_documento_saida_id;
  END IF;

  UPDATE public.volume_expedicao SET documento_saida_id = p_documento_saida_id, numero_volume = v_num WHERE id = p_volume_id;

  v_ocorr := public.registrar_ocorrencia_operacional(
    p_tenant_id := v_vol.tenant_id, p_empresa_id := v_vol.empresa_id, p_armazem_id := NULL,
    p_tipo_ocorrencia := 'OUTROS', p_categoria := 'CORRETIVA', p_etapa_ocorrencia := 'EXPEDICAO',
    p_observacao := format('Volume %s ligado ao pedido %s pela tela Volumes (número %s).', v_vol.codigo_volume, v_ped, v_num),
    p_documento_origem_id := p_documento_saida_id, p_tipo_documento_origem := 'DOCUMENTO_SAIDA',
    p_usuario_criador_id := v_usuario, p_usuario_causador_id := v_usuario, p_prioridade := 'BAIXA');
  IF NOT COALESCE((v_ocorr->>'sucesso')::boolean, false) THEN
    RAISE EXCEPTION 'OCORRENCIA_FALHOU: %', v_ocorr->>'mensagem';
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'VOLUME_VINCULADO',
    'mensagem', format('Volume %s ligado ao pedido %s. Reimprima a etiqueta para sair com cliente e NF.', v_vol.codigo_volume, v_ped),
    'dados', jsonb_build_object('numero_volume', v_num));
END $function$;

-- Acrescenta volumes a um pedido que já tem volumes (continua a numeração)
CREATE OR REPLACE FUNCTION public.rpc_volume_acrescentar(
  p_movimento_saida_id uuid, p_documento_saida_id uuid, p_quantidade integer, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx jsonb := public._fn_volume_contexto('CREATE');
  v_tenant uuid; v_usuario uuid; v_ms record; v_ped bigint; v_atual integer; v_ini integer;
  v_div jsonb; v_carga record; v_ids uuid[] := '{}'; v_id uuid; i integer; v_ocorr jsonb; v_aviso text; v_arm uuid;
  v_motivo text := btrim(COALESCE(p_motivo, ''));
BEGIN
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;

  IF p_quantidade IS NULL OR p_quantidade NOT BETWEEN 1 AND 99 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'QUANTIDADE_INVALIDA', 'mensagem', 'Informe de 1 a 99 volumes.');
  END IF;
  IF length(v_motivo) < 5 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOTIVO_OBRIGATORIO', 'mensagem', 'Informe o motivo (mínimo 5 caracteres).');
  END IF;

  SELECT ms.id, ms.empresa_id, ms.box_id, ms.numero_onda INTO v_ms FROM public.movimento_saida ms
   WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOVIMENTO_NAO_ENCONTRADO', 'mensagem', 'Onda não encontrada.');
  END IF;
  SELECT ds.numero_pedido INTO v_ped FROM public.movimento_saida_documento msd JOIN public.documento_saida ds ON ds.id = msd.documento_saida_id
   WHERE msd.movimento_saida_id = p_movimento_saida_id AND msd.documento_saida_id = p_documento_saida_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'PEDIDO_FORA_DA_ONDA', 'mensagem', 'O pedido não faz parte da onda.');
  END IF;

  SELECT count(*), COALESCE(max(ve.numero_volume), 0) INTO v_atual, v_ini FROM public.volume_expedicao ve
   WHERE ve.movimento_saida_id = p_movimento_saida_id AND ve.documento_saida_id = p_documento_saida_id;
  IF v_atual = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'PEDIDO_SEM_VOLUMES',
      'mensagem', 'O pedido ainda não tem volumes. Gere os volumes pelo fluxo normal (separação, conferência ou embarque).');
  END IF;

  SELECT c.id, c.numero_carga, c.status INTO v_carga FROM public.carga_documento cd JOIN public.carga c ON c.id = cd.carga_id
   WHERE cd.documento_saida_id = p_documento_saida_id AND cd.movimento_saida_id = p_movimento_saida_id AND cd.ativo
     AND c.status <> 'CANCELADA' ORDER BY c.created_at DESC LIMIT 1;
  IF v_carga.status = 'FECHADA' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'CARGA_FECHADA',
      'mensagem', format('O pedido já saiu na carga #%s (fechada).', v_carga.numero_carga));
  END IF;

  v_div := public._fn_volume_nf_conferir(p_documento_saida_id, v_atual + p_quantidade);
  IF COALESCE((v_div->>'divergente')::boolean, false) AND v_div->>'regra' = 'BLOQUEAR' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUMES_DIVERGEM_NF',
      'mensagem', format('Com mais %s volume(s), o pedido %s ficaria com %s, e a NF %s informa %s. Peça a correção da NF antes.',
                         p_quantidade, v_ped, v_atual + p_quantidade, COALESCE(v_div->>'nota_fiscal', '?'), v_div->>'nf_qtd_volumes'));
  END IF;

  FOR i IN 1..p_quantidade LOOP
    INSERT INTO public.volume_expedicao (tenant_id, empresa_id, movimento_saida_id, documento_saida_id, codigo_volume, numero_volume, status, created_by)
    VALUES (v_tenant, v_ms.empresa_id, p_movimento_saida_id, p_documento_saida_id,
            'VOL-' || lpad(nextval('volume_expedicao_codigo_seq')::text, 6, '0'), v_ini + i, 'ABERTO', v_usuario)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;

  IF v_carga.id IS NOT NULL THEN
    PERFORM public._fn_carga_gerar_unidades(v_carga.id, ARRAY[p_movimento_saida_id]);
    PERFORM public._fn_carga_recalcular(v_carga.id);
    PERFORM public._fn_carga_registrar_evento(v_carga.id, 'VOLUMES_GERADOS', v_usuario,
      jsonb_build_object('documento_saida_id', p_documento_saida_id, 'quantidade', p_quantidade,
                         'origem', 'TELA_VOLUMES', 'motivo', v_motivo));
  END IF;

  SELECT b.armazem_id INTO v_arm FROM public.box b WHERE b.id = v_ms.box_id;
  v_ocorr := public.registrar_ocorrencia_operacional(
    p_tenant_id := v_tenant, p_empresa_id := v_ms.empresa_id, p_armazem_id := v_arm,
    p_tipo_ocorrencia := 'OUTROS', p_categoria := 'CORRETIVA', p_etapa_ocorrencia := 'EXPEDICAO',
    p_observacao := format('%s volume(s) acrescentado(s) ao pedido %s (onda %s) pela tela Volumes: passa de %s para %s. Motivo: %s',
                           p_quantidade, v_ped, v_ms.numero_onda, v_atual, v_atual + p_quantidade, v_motivo),
    p_documento_origem_id := p_documento_saida_id, p_tipo_documento_origem := 'DOCUMENTO_SAIDA',
    p_usuario_criador_id := v_usuario, p_usuario_causador_id := v_usuario, p_prioridade := 'NORMAL');
  IF NOT COALESCE((v_ocorr->>'sucesso')::boolean, false) THEN
    RAISE EXCEPTION 'OCORRENCIA_FALHOU: %', v_ocorr->>'mensagem';
  END IF;

  IF COALESCE((v_div->>'divergente')::boolean, false) AND v_div->>'regra' = 'AVISAR' THEN
    PERFORM public._fn_registrar_divergencia_volume_nf(v_div, v_tenant, v_ms.empresa_id, v_arm, v_usuario, 'ao acrescentar volumes na tela Volumes', true);
    v_aviso := format('A NF %s informa %s volume(s); divergência registrada como ocorrência.', COALESCE(v_div->>'nota_fiscal', '?'), v_div->>'nf_qtd_volumes');
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'VOLUMES_ACRESCENTADOS',
    'mensagem', format('%s volume(s) acrescentado(s) ao pedido %s. O total mudou: reimprima as etiquetas do pedido.', p_quantidade, v_ped),
    'avisos', CASE WHEN v_aviso IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('codigo', 'VOLUMES_DIVERGEM_NF', 'mensagem', v_aviso)) END,
    'dados', jsonb_build_object('novos', to_jsonb(v_ids),
      'volumes_do_pedido', (SELECT to_jsonb(array_agg(ve.id ORDER BY ve.numero_volume)) FROM public.volume_expedicao ve
                             WHERE ve.movimento_saida_id = p_movimento_saida_id AND ve.documento_saida_id = p_documento_saida_id),
      'carga', CASE WHEN v_carga.id IS NOT NULL THEN v_carga.numero_carga END));
END $function$;

-- Peso bruto (kg) e cubagem (m³) de um ou mais volumes
CREATE OR REPLACE FUNCTION public.rpc_volume_registrar_medidas(p_volume_ids uuid[], p_peso_bruto numeric, p_m3 numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ctx jsonb := public._fn_volume_contexto('UPDATE'); v_tenant uuid; v_n integer;
BEGIN
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;
  IF p_volume_ids IS NULL OR cardinality(p_volume_ids) NOT BETWEEN 1 AND 200 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'QUANTIDADE_INVALIDA', 'mensagem', 'Selecione de 1 a 200 volumes.');
  END IF;
  IF p_peso_bruto IS NULL AND p_m3 IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MEDIDA_OBRIGATORIA', 'mensagem', 'Informe o peso ou a cubagem.');
  END IF;
  IF (p_peso_bruto IS NOT NULL AND (p_peso_bruto <= 0 OR p_peso_bruto > 5000))
     OR (p_m3 IS NOT NULL AND (p_m3 <= 0 OR p_m3 > 50)) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MEDIDA_INVALIDA',
      'mensagem', 'Peso entre 0,001 e 5.000 kg; cubagem entre 0,001 e 50 m³.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.volume_expedicao ve WHERE ve.id = ANY(p_volume_ids) AND ve.tenant_id = v_tenant AND ve.status::text = 'EXPEDIDO') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_EXPEDIDO', 'mensagem', 'Há volumes já expedidos na seleção.');
  END IF;
  UPDATE public.volume_expedicao ve
     SET peso_bruto = COALESCE(round(p_peso_bruto, 3), ve.peso_bruto), m3 = COALESCE(round(p_m3, 4), ve.m3)
   WHERE ve.id = ANY(p_volume_ids) AND ve.tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> (SELECT count(DISTINCT x) FROM unnest(p_volume_ids) x) THEN
    RAISE EXCEPTION 'VOLUME_NAO_ENCONTRADO';
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'MEDIDAS_REGISTRADAS',
    'mensagem', format('Medidas registradas em %s volume(s).', v_n), 'dados', jsonb_build_object('atualizados', v_n));
EXCEPTION WHEN raise_exception THEN
  RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_NAO_ENCONTRADO', 'mensagem', 'Um ou mais volumes não foram encontrados.');
END $function$;

-- ============================================================
-- Permissões: funções internas fechadas; RPCs da tela só para usuários autenticados
-- ============================================================
REVOKE ALL ON FUNCTION public._fn_volume_contexto(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_volumes_listar(uuid, jsonb, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_volume_detalhe(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_volume_imprimir(uuid[], uuid, uuid, uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_volume_reenviar_job(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_cancelar_volume_expedicao(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_volume_vincular_pedido(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_volume_acrescentar(uuid, uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_volume_registrar_medidas(uuid[], numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_volumes_listar(uuid, jsonb, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_volume_detalhe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_volume_imprimir(uuid[], uuid, uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_volume_reenviar_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cancelar_volume_expedicao(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_volume_vincular_pedido(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_volume_acrescentar(uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_volume_registrar_medidas(uuid[], numeric, numeric) TO authenticated;

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP FUNCTION IF EXISTS public.rpc_volume_registrar_medidas(uuid[], numeric, numeric);
-- DROP FUNCTION IF EXISTS public.rpc_volume_acrescentar(uuid, uuid, integer, text);
-- DROP FUNCTION IF EXISTS public.rpc_volume_vincular_pedido(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.fn_cancelar_volume_expedicao(uuid, text);
-- DROP FUNCTION IF EXISTS public.rpc_volume_reenviar_job(uuid);
-- DROP FUNCTION IF EXISTS public.rpc_volume_imprimir(uuid[], uuid, uuid, uuid, integer, text);
-- DROP FUNCTION IF EXISTS public.rpc_volume_detalhe(uuid);
-- DROP FUNCTION IF EXISTS public.rpc_volumes_listar(uuid, jsonb, integer, integer);
-- DROP FUNCTION IF EXISTS public._fn_volume_contexto(text);
-- (só se nenhum volume tiver sido cancelado, ou depois de guardar o conteúdo)
-- DROP TABLE IF EXISTS public.volume_expedicao_cancelado;
