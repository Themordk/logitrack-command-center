-- Migration: 20261116160000_hu_h4_h5_etiqueta_tela.sql
-- Plano HU — H4 (etiqueta da HU com dados do servidor) e H5 (tela de acompanhamento da HU).
-- Resolve: H7 (etiqueta com dados do navegador e só a 1ª NF) e o item "Tela Atividades › HU" da avaliação.
-- H4: _fn_etiqueta_hu_dados monta os dados (todas as NFs e fornecedores do recebimento); o gatilho
--     trg_fila_impressao_dados_hu aplica-os em todo job de HU e registra o evento IMPRESSA.
--     dados_etiqueta_hu (prévia) passa a usar a mesma função.
-- H5: rpc_hus_listar (lista, cards, filtros no servidor), rpc_hu_detalhe (conteúdo, estoque, origem, histórico,
--     impressões, ações permitidas) e rpc_hu_desmontar (devolve os itens de uma HU não armazenada).
-- Risco: baixo/médio (gatilho novo na fila de impressão, só para tipo_documento_origem = 'hu').
-- Rollback: bloco no fim; dados_etiqueta_hu anterior em ops.rollback_definicao.

INSERT INTO ops.rollback_definicao (migration, objeto, definicao)
SELECT '20261116160000_hu_h4_h5_etiqueta_tela', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'dados_etiqueta_hu';

-- Número sem zeros inúteis (10.0000 → 10; 2.5000 → 2,5 fica 2.5)
CREATE OR REPLACE FUNCTION public._fn_num_txt(p numeric)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p IS NULL THEN '' WHEN p = trunc(p) THEN trunc(p)::bigint::text
              ELSE rtrim(p::text, '0') END;
$$;

-- ============================================================
-- H4.1 Dados da etiqueta da HU (fonte única)
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_etiqueta_hu_dados(p_tenant uuid, p_hu_ids uuid[])
RETURNS TABLE (hu_id uuid, dados jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.id, jsonb_build_object(
    'codigo_hu', h.codigo_hu,
    'tipo_hu', COALESCE(h.tipo_hu::text, ''),
    'tamanho', COALESCE(h.tamanho::text, ''),
    'status', COALESCE(h.status::text, ''),
    'peso_bruto', public._fn_num_txt(h.peso_bruto),
    'm3', public._fn_num_txt(h.m3),
    'altura', public._fn_num_txt(h.altura),
    'numero_movimento', COALESCE(me.numero_movimento::text, ''),
    'data_entrada', COALESCE(to_char(me.created_at AT TIME ZONE 'America/Fortaleza', 'DD/MM/YYYY'), ''),
    'data_entrada_hora', COALESCE(to_char(me.created_at AT TIME ZONE 'America/Fortaleza', 'DD/MM/YYYY HH24:MI'), ''),
    'parceiro_nome', COALESCE(doc.fornecedores, ''),
    'numero_nota', COALESCE(doc.nfs, ''),
    'qtd_notas', COALESCE(doc.qtd_nfs, 0)::text,
    'lote_principal', COALESCE(it.lote_principal, ''),
    'lote', COALESCE(it.lote_principal, ''),
    'validade_proxima', COALESCE(to_char(it.validade_min, 'DD/MM/YYYY'), ''),
    'validade', COALESCE(to_char(it.validade_min, 'DD/MM/YYYY'), ''),
    'total_itens', COALESCE(it.qtd_skus, 0)::text,
    'total_quantidade', public._fn_num_txt(COALESCE(it.qtd_total, 0)),
    'sku', CASE WHEN it.qtd_skus = 1 THEN it.sku_unico WHEN it.qtd_skus > 1 THEN 'VÁRIOS' ELSE '' END,
    'descricao_produto', CASE WHEN it.qtd_skus = 1 THEN it.desc_unica
                              WHEN it.qtd_skus > 1 THEN format('VÁRIOS PRODUTOS (%s)', it.qtd_skus) ELSE '' END,
    'endereco', COALESCE(e.descricao, ''),
    'armazem', COALESCE(a.descricao, ''),
    'empresa', COALESCE(upper(btrim(emp.razaosocial)), ''),
    'criado_em', COALESCE(to_char(h.created_at AT TIME ZONE 'America/Fortaleza', 'DD/MM/YYYY HH24:MI'), ''),
    'usuario', COALESCE(u.nome, '')
  )
  FROM public.hu h
  LEFT JOIN public.movimento_entrada me ON me.id = h.movimento_entrada_id
  LEFT JOIN public.endereco e ON e.id = h.endereco_id
  LEFT JOIN public.armazem a ON a.id = h.armazem_id
  LEFT JOIN public.empresa emp ON emp.id = h.empresa_id
  LEFT JOIN public.usuario u ON u.id = h.created_by
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT de.numero_nota::text, ', ') AS nfs, count(DISTINCT de.id) AS qtd_nfs,
           string_agg(DISTINCT COALESCE(nullif(btrim(par.nome_fantasia), ''), par.razaosocial), ' / ') AS fornecedores
    FROM public.movimento_entrada_documento med
    JOIN public.documento_entrada de ON de.id = med.documento_entrada_id
    LEFT JOIN public.parceiro par ON par.id = de.parceiro_id
    WHERE med.movimento_entrada_id = h.movimento_entrada_id AND med.tenant_id = h.tenant_id) doc ON true
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT hi.produto_id) AS qtd_skus, sum(hi.quantidade) AS qtd_total,
           min(p.sku) AS sku_unico, min(p.descricao) AS desc_unica,
           min(hi.data_validade) FILTER (WHERE hi.data_validade <> DATE '1900-01-01') AS validade_min,
           (SELECT x.lote FROM public.hu_item x WHERE x.hu_id = h.id AND x.lote <> ''
             GROUP BY x.lote ORDER BY sum(x.quantidade) DESC LIMIT 1) AS lote_principal
    FROM public.hu_item hi JOIN public.produto p ON p.id = hi.produto_id
    WHERE hi.hu_id = h.id) it ON true
  WHERE h.tenant_id = p_tenant AND h.id = ANY(p_hu_ids);
$$;
REVOKE ALL ON FUNCTION public._fn_etiqueta_hu_dados(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- H4.2 Gatilho: todo job de HU sai com os dados do servidor
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_fila_impressao_dados_hu()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dados jsonb; v_usuario uuid;
BEGIN
  IF NEW.tipo_documento_origem = 'hu' AND NEW.documento_origem_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.hu h WHERE h.id = NEW.documento_origem_id AND h.tenant_id = NEW.tenant_id) THEN
    SELECT d.dados INTO v_dados FROM public._fn_etiqueta_hu_dados(NEW.tenant_id, ARRAY[NEW.documento_origem_id]) d;
    IF v_dados IS NOT NULL THEN
      NEW.dados := COALESCE(NEW.dados, '{}'::jsonb) || v_dados || jsonb_build_object('_dados_servidor', true);
    END IF;
    SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = auth.uid() AND u.tenant_id = NEW.tenant_id LIMIT 1;
    PERFORM public._fn_hu_evento(NEW.tenant_id, NEW.documento_origem_id, 'IMPRESSA', NULL, NULL, v_usuario, NULL,
      jsonb_build_object('fila_impressao_id', NEW.id, 'origem', NEW.origem, 'copias', NEW.quantidade_copias));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_fila_impressao_dados_hu() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fila_impressao_dados_hu ON public.fila_impressao;
CREATE TRIGGER trg_fila_impressao_dados_hu
  BEFORE INSERT ON public.fila_impressao
  FOR EACH ROW WHEN (NEW.tipo_documento_origem = 'hu')
  EXECUTE FUNCTION public.tg_fila_impressao_dados_hu();

-- ============================================================
-- H4.3 Prévia (mesma fonte; formato antigo mantido + itens)
-- ============================================================
CREATE OR REPLACE FUNCTION public.dados_etiqueta_hu(p_tenant_id uuid, p_hu_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_id é obrigatório'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(d.dados || jsonb_build_object('hu_id', d.hu_id, 'itens', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('sku', p.sku, 'descricao', p.descricao, 'quantidade', hi.quantidade,
                 'lote', nullif(hi.lote, ''),
                 'data_validade', CASE WHEN hi.data_validade = DATE '1900-01-01' THEN NULL ELSE to_char(hi.data_validade, 'DD/MM/YYYY') END)
               ORDER BY p.descricao)
        FROM public.hu_item hi JOIN public.produto p ON p.id = hi.produto_id WHERE hi.hu_id = d.hu_id), '[]'::jsonb))
      ORDER BY d.dados->>'codigo_hu')
    FROM public._fn_etiqueta_hu_dados(p_tenant_id, p_hu_ids) d), '[]'::jsonb);
END $$;

-- ============================================================
-- H5.1 Base da tela (uma linha por HU, com situações)
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_hus_base(p_tenant uuid, p_empresa uuid)
RETURNS TABLE (
  id uuid, codigo_hu text, tipo_hu text, tamanho text, status text, disponibilidade text,
  peso_bruto numeric, m3 numeric, altura numeric, created_at timestamptz, criado_por_nome text,
  empresa_id uuid, armazem_id uuid, armazem text, endereco_id uuid, endereco text,
  movimento_entrada_id uuid, numero_movimento bigint, nfs text, fornecedores text,
  qtd_skus int, qtd_total numeric, sku_principal text, descricao_principal text,
  estoque_total numeric, estoque_enderecos int,
  ultimo_evento text, ultimo_evento_em timestamptz,
  etiqueta_impressoes int, etiqueta_ultimo_status text, etiqueta_ultima_em timestamptz,
  horas_parada numeric,
  vazia boolean, aguardando_armazenagem boolean, divergente boolean, nunca_impressa boolean, parada boolean, encerrada boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.id, h.codigo_hu, h.tipo_hu::text, h.tamanho::text, h.status::text, h.disponibilidade::text,
         h.peso_bruto, h.m3, h.altura, h.created_at, u.nome,
         h.empresa_id, h.armazem_id, a.descricao, h.endereco_id, e.descricao,
         h.movimento_entrada_id, me.numero_movimento::bigint, doc.nfs, doc.fornecedores,
         COALESCE(it.qtd_skus, 0)::int, COALESCE(it.qtd_total, 0), it.sku_unico, it.desc_unica,
         COALESCE(es.total, 0), COALESCE(es.enderecos, 0)::int,
         ev.evento, ev.created_at,
         COALESCE(im.qtd, 0)::int, im.ultimo_status, im.ultima_em,
         round(extract(epoch FROM now() - COALESCE(ev.created_at, h.created_at)) / 3600.0, 1),
         -- situações
         (h.status = 'ABERTA' AND COALESCE(it.qtd_skus, 0) = 0),
         (h.status IN ('ABERTA', 'FECHADA') AND COALESCE(it.qtd_skus, 0) > 0),
         ((h.status = 'ARMAZENADA' AND COALESCE(es.enderecos, 0) <> 1)
          OR (h.status IN ('ABERTA', 'FECHADA') AND COALESCE(es.total, 0) > 0)),
         (h.status NOT IN ('EXPEDIDA', 'DESCARTADA', 'DESMONTADA') AND COALESCE(im.qtd, 0) = 0),
         (h.status IN ('ABERTA', 'FECHADA') AND COALESCE(it.qtd_skus, 0) > 0
          AND COALESCE(ev.created_at, h.created_at) < now() - interval '24 hours'),
         (h.status IN ('EXPEDIDA', 'DESCARTADA', 'DESMONTADA'))
  FROM public.hu h
  LEFT JOIN public.usuario u ON u.id = h.created_by
  LEFT JOIN public.armazem a ON a.id = h.armazem_id
  LEFT JOIN public.endereco e ON e.id = h.endereco_id
  LEFT JOIN public.movimento_entrada me ON me.id = h.movimento_entrada_id
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT de.numero_nota::text, ', ') AS nfs,
           string_agg(DISTINCT COALESCE(nullif(btrim(par.nome_fantasia), ''), par.razaosocial), ' / ') AS fornecedores
    FROM public.movimento_entrada_documento med
    JOIN public.documento_entrada de ON de.id = med.documento_entrada_id
    LEFT JOIN public.parceiro par ON par.id = de.parceiro_id
    WHERE med.movimento_entrada_id = h.movimento_entrada_id AND med.tenant_id = h.tenant_id) doc ON true
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT hi.produto_id) AS qtd_skus, sum(hi.quantidade) AS qtd_total,
           CASE WHEN count(DISTINCT hi.produto_id) = 1 THEN min(p.sku) END AS sku_unico,
           CASE WHEN count(DISTINCT hi.produto_id) = 1 THEN min(p.descricao) END AS desc_unica
    FROM public.hu_item hi JOIN public.produto p ON p.id = hi.produto_id WHERE hi.hu_id = h.id) it ON true
  LEFT JOIN LATERAL (
    SELECT sum(eg.quantidade_total) AS total, count(DISTINCT eg.endereco_id) FILTER (WHERE eg.quantidade_total > 0) AS enderecos
    FROM public.estoque_geral eg WHERE eg.hu_id = h.id AND eg.tenant_id = h.tenant_id AND eg.quantidade_total > 0) es ON true
  LEFT JOIN LATERAL (
    SELECT x.evento, x.created_at FROM public.hu_evento x WHERE x.hu_id = h.id ORDER BY x.created_at DESC LIMIT 1) ev ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS qtd, (array_agg(f.status::text ORDER BY f.criado_em DESC))[1] AS ultimo_status, max(f.criado_em) AS ultima_em
    FROM public.fila_impressao f
    WHERE f.tenant_id = h.tenant_id AND f.tipo_documento_origem = 'hu' AND f.documento_origem_id = h.id) im ON true
  WHERE h.tenant_id = p_tenant AND h.id <> public.hu_padrao()
    AND (p_empresa IS NULL OR h.empresa_id = p_empresa);
$$;
REVOKE ALL ON FUNCTION public._fn_hus_base(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- H5.2 Lista com cards e filtros
--   p_filtros: status, situacao (AGUARDANDO_ARMAZENAGEM | VAZIA | DIVERGENTE | NUNCA_IMPRESSA | PARADA),
--              tipo_hu, movimento, nf, fornecedor, sku, endereco, armazem_id, data_de, data_ate (data local), busca
--   Sem status, a lista mostra só as HUs em uso (não encerradas). Os cards não dependem de status/situação.
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_hus_listar(p_empresa_id uuid, p_filtros jsonb DEFAULT '{}'::jsonb,
  p_pagina int DEFAULT 1, p_tamanho int DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; f jsonb := COALESCE(p_filtros, '{}'::jsonb);
        v_tam int := LEAST(GREATEST(COALESCE(p_tamanho, 50), 1), 5000); v_pag int := GREATEST(COALESCE(p_pagina, 1), 1);
        v_res jsonb;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:READ']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;

  WITH base AS (
    SELECT b.* FROM public._fn_hus_base(v_tenant, p_empresa_id) b
    WHERE (nullif(f->>'tipo_hu', '') IS NULL OR b.tipo_hu = f->>'tipo_hu')
      AND (nullif(f->>'movimento', '') IS NULL OR b.numero_movimento::text = btrim(f->>'movimento'))
      AND (nullif(f->>'nf', '') IS NULL OR b.nfs ILIKE '%' || btrim(f->>'nf') || '%')
      AND (nullif(f->>'fornecedor', '') IS NULL OR b.fornecedores ILIKE '%' || btrim(f->>'fornecedor') || '%')
      AND (nullif(f->>'endereco', '') IS NULL OR b.endereco ILIKE '%' || btrim(f->>'endereco') || '%')
      AND (nullif(f->>'armazem_id', '') IS NULL OR b.armazem_id = (f->>'armazem_id')::uuid)
      AND (nullif(f->>'data_de', '') IS NULL OR (b.created_at AT TIME ZONE 'America/Fortaleza')::date >= (f->>'data_de')::date)
      AND (nullif(f->>'data_ate', '') IS NULL OR (b.created_at AT TIME ZONE 'America/Fortaleza')::date <= (f->>'data_ate')::date)
      AND (nullif(f->>'busca', '') IS NULL OR b.codigo_hu ILIKE '%' || btrim(f->>'busca') || '%')
      AND (nullif(f->>'sku', '') IS NULL OR EXISTS (
            SELECT 1 FROM public.hu_item hi JOIN public.produto p ON p.id = hi.produto_id
             WHERE hi.hu_id = b.id AND (p.sku ILIKE '%' || btrim(f->>'sku') || '%' OR p.descricao ILIKE '%' || btrim(f->>'sku') || '%')))
  ), lista AS (
    SELECT b.* FROM base b
    WHERE (CASE WHEN nullif(f->>'status', '') IS NULL THEN NOT b.encerrada ELSE b.status = f->>'status' END)
      AND (CASE f->>'situacao'
             WHEN 'AGUARDANDO_ARMAZENAGEM' THEN b.aguardando_armazenagem
             WHEN 'VAZIA' THEN b.vazia
             WHEN 'DIVERGENTE' THEN b.divergente
             WHEN 'NUNCA_IMPRESSA' THEN b.nunca_impressa
             WHEN 'PARADA' THEN b.parada
             ELSE true END)
  )
  SELECT jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', jsonb_build_object(
    'total', (SELECT count(*) FROM lista),
    'pagina', v_pag, 'tamanho', v_tam,
    'linhas', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC)
                          FROM (SELECT * FROM lista ORDER BY created_at DESC OFFSET (v_pag - 1) * v_tam LIMIT v_tam) l), '[]'::jsonb),
    'resumo', (SELECT jsonb_build_object(
       'abertas', count(*) FILTER (WHERE status = 'ABERTA'),
       'aguardando_armazenagem', count(*) FILTER (WHERE aguardando_armazenagem),
       'armazenadas', count(*) FILTER (WHERE status = 'ARMAZENADA'),
       'vazias', count(*) FILTER (WHERE vazia),
       'divergentes', count(*) FILTER (WHERE divergente),
       'nunca_impressas', count(*) FILTER (WHERE nunca_impressa),
       'paradas', count(*) FILTER (WHERE parada),
       'encerradas', count(*) FILTER (WHERE encerrada)) FROM base)))
  INTO v_res;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.rpc_hus_listar(uuid, jsonb, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_hus_listar(uuid, jsonb, int, int) TO authenticated;

-- ============================================================
-- H5.3 Detalhe
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_hu_detalhe(p_hu_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_b record; v_pode_upd boolean; v_pode_del boolean;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:READ']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  SELECT b.* INTO v_b FROM public._fn_hus_base(v_tenant, NULL) b WHERE b.id = p_hu_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada.'); END IF;
  v_pode_upd := public.fn_usuario_tem_permissao(v_usuario, 'web.atividades.hus', 'UPDATE');
  v_pode_del := public.fn_usuario_tem_permissao(v_usuario, 'web.atividades.hus', 'DELETE');

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', jsonb_build_object(
    'hu', to_jsonb(v_b),
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('hu_item_id', hi.id, 'sku', p.sku, 'descricao', p.descricao,
               'quantidade', hi.quantidade, 'lote', nullif(hi.lote, ''),
               'validade', CASE WHEN hi.data_validade = DATE '1900-01-01' THEN NULL ELSE hi.data_validade END,
               'conferido_por', u.nome, 'conferido_em', hi.created_at) ORDER BY hi.created_at)
      FROM public.hu_item hi JOIN public.produto p ON p.id = hi.produto_id
      LEFT JOIN public.usuario u ON u.id = hi.created_by
      WHERE hi.hu_id = p_hu_id), '[]'::jsonb),
    'estoque', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('endereco', e.descricao, 'sku', p.sku, 'descricao', p.descricao,
               'lote', nullif(eg.lote, ''),
               'validade', CASE WHEN eg.data_validade = DATE '1900-01-01' THEN NULL ELSE eg.data_validade END,
               'quantidade', eg.quantidade_total, 'disponivel', eg.quantidade_disponivel) ORDER BY e.descricao, p.descricao)
      FROM public.estoque_geral eg JOIN public.produto p ON p.id = eg.produto_id
      LEFT JOIN public.endereco e ON e.id = eg.endereco_id
      WHERE eg.hu_id = p_hu_id AND eg.tenant_id = v_tenant AND eg.quantidade_total > 0), '[]'::jsonb),
    'eventos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('evento', x.evento, 'status_anterior', x.status_anterior, 'status_novo', x.status_novo,
               'usuario', u.nome, 'observacao', x.observacao, 'dados', x.dados, 'created_at', x.created_at) ORDER BY x.created_at DESC)
      FROM public.hu_evento x LEFT JOIN public.usuario u ON u.id = x.usuario_id
      WHERE x.hu_id = p_hu_id AND x.tenant_id = v_tenant), '[]'::jsonb),
    'impressoes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', f.id, 'status', f.status, 'criado_em', f.criado_em, 'impresso_em', f.impresso_em,
               'erro', f.erro_mensagem, 'impressora', i.nome, 'origem', f.origem, 'copias', f.quantidade_copias) ORDER BY f.criado_em DESC)
      FROM public.fila_impressao f LEFT JOIN public.impressora i ON i.id = f.impressora_id
      WHERE f.tenant_id = v_tenant AND f.tipo_documento_origem = 'hu' AND f.documento_origem_id = p_hu_id), '[]'::jsonb),
    'acoes', jsonb_build_object(
      'editar', v_pode_upd AND NOT v_b.encerrada,
      'fechar', v_pode_upd AND v_b.status = 'ABERTA' AND v_b.qtd_skus > 0,
      'reabrir', v_pode_upd AND v_b.status = 'FECHADA',
      'desmontar', v_pode_upd AND v_b.status IN ('ABERTA', 'FECHADA') AND v_b.qtd_skus > 0,
      'descartar', v_pode_del AND v_b.status = 'ABERTA' AND v_b.qtd_skus = 0 AND v_b.estoque_total = 0,
      'imprimir', NOT v_b.encerrada)));
END $$;
REVOKE ALL ON FUNCTION public.rpc_hu_detalhe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_hu_detalhe(uuid) TO authenticated;

-- ============================================================
-- H5.4 Desmontar HU ainda não armazenada (itens saem da HU; a conferência continua valendo)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_hu_desmontar(p_hu_id uuid, p_observacao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_hu record; v_itens jsonb;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:UPDATE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  IF nullif(btrim(p_observacao), '') IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOTIVO_OBRIGATORIO', 'mensagem', 'Informe o motivo.');
  END IF;
  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu_id AND h.tenant_id = v_tenant AND h.id <> public.hu_padrao() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada.'); END IF;
  IF v_hu.status NOT IN ('ABERTA', 'FECHADA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'STATUS_INVALIDO',
      'mensagem', format('Só HU Aberta ou Fechada pode ser desmontada aqui (a HU %s está %s).', v_hu.codigo_hu, lower(v_hu.status::text)));
  END IF;
  SELECT jsonb_agg(jsonb_build_object('sku', p.sku, 'quantidade', hi.quantidade, 'lote', hi.lote, 'tarefa_execucao_id', hi.tarefa_execucao_id))
    INTO v_itens FROM public.hu_item hi JOIN public.produto p ON p.id = hi.produto_id WHERE hi.hu_id = v_hu.id;
  IF v_itens IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_VAZIA', 'mensagem', 'A HU está vazia; descarte-a em vez de desmontar.');
  END IF;
  UPDATE public.tarefa_execucao te SET hu = NULL
    FROM public.hu_item hi WHERE hi.hu_id = v_hu.id AND te.id = hi.tarefa_execucao_id AND te.tenant_id = v_tenant;
  DELETE FROM public.hu_item WHERE hu_id = v_hu.id;
  UPDATE public.hu SET status = 'DESMONTADA', disponibilidade = 'DISPONIVEL', encerrada_em = now(), updated_by = v_usuario
   WHERE id = v_hu.id;
  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'DESMONTADA', v_hu.status::text, 'DESMONTADA', v_usuario, p_observacao,
    jsonb_build_object('itens', v_itens));
  RETURN jsonb_build_object('sucesso', true,
    'mensagem', format('HU %s desmontada; os itens seguem conferidos e serão armazenados avulsos.', v_hu.codigo_hu));
END $$;
REVOKE ALL ON FUNCTION public.rpc_hu_desmontar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_hu_desmontar(uuid, text) TO authenticated;

-- ============================================================
-- ROLLBACK (manual)
-- DROP TRIGGER trg_fila_impressao_dados_hu ON public.fila_impressao; DROP FUNCTION tg_fila_impressao_dados_hu,
-- rpc_hu_desmontar, rpc_hu_detalhe, rpc_hus_listar, _fn_hus_base, _fn_etiqueta_hu_dados, _fn_num_txt;
-- recriar dados_etiqueta_hu de ops.rollback_definicao (migration '20261116160000_hu_h4_h5_etiqueta_tela').
-- ============================================================

-- Índice parcial: estoque por HU real (o gatilho trg_estoque_geral_hu e a tela procuram por hu_id)
-- (aplicado no QA como migration separada hu_h5_indice_estoque_hu)
CREATE INDEX IF NOT EXISTS idx_estoque_geral_hu_real ON public.estoque_geral (hu_id, endereco_id)
  WHERE hu_id <> '00000000-0000-0000-0000-000000000000'::uuid;
