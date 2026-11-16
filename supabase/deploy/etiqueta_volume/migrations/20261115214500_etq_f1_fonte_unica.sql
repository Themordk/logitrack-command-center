-- Migration: 20261115214500_etq_f1_fonte_unica.sql
-- Plano: Etiqueta de Volume de Expedição — Fase 1 (fonte única dos dados)
-- Ações: A5 (view enriquecida + índices), A6 (dados montados no servidor),
--        A8 (backfill do pedido nos volumes antigos), A11 (escolha de template),
--        A27 (jobs presos / espera entre tentativas / expiração)
-- Decisões aplicadas: D5 (cidade/UF do destinatário), D6 (observação do pedido)
-- Risco: médio — a view ganha colunas (as antigas ficam iguais), jobs de VOLUME
--        passam a ter os dados completados pelo servidor, jobs pendentes há mais
--        de 24 h são cancelados pela rotina de manutenção.
-- Rollback: ver bloco ROLLBACK no fim do arquivo.

-- ============================================================
-- Cópia exata das definições anteriores, para rollback (schema não exposto
-- pela API). Rollback de uma função: EXECUTE da coluna "definicao".
-- ============================================================
CREATE SCHEMA IF NOT EXISTS ops;
REVOKE ALL ON SCHEMA ops FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS ops.rollback_definicao (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  migration  text NOT NULL,
  objeto     text NOT NULL,
  definicao  text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ops.rollback_definicao FROM PUBLIC, anon, authenticated;
INSERT INTO ops.rollback_definicao (migration, objeto, definicao)
SELECT '20261115214500_etq_f1_fonte_unica', o.objeto, o.def
  FROM (VALUES
    ('function public.solicitar_impressao', pg_get_functiondef('public.solicitar_impressao(uuid,text,jsonb,text,uuid,uuid,integer,integer,text,text,uuid)'::regprocedure)),
    ('function public._buscar_jobs_pendentes_core', pg_get_functiondef('public._buscar_jobs_pendentes_core(uuid,integer)'::regprocedure)),
    ('function public._atualizar_status_job_core', pg_get_functiondef('public._atualizar_status_job_core(uuid,text,text,text)'::regprocedure)),
    ('view public.vw_volume_expedicao_lista', 'CREATE OR REPLACE VIEW public.vw_volume_expedicao_lista WITH (security_invoker = true) AS ' || pg_get_viewdef('public.vw_volume_expedicao_lista'::regclass)),
    ('data etiqueta_template padrao', COALESCE((SELECT string_agg(format('UPDATE public.etiqueta_template SET padrao = true WHERE id = %L;', t.id), E'\n')
        FROM public.etiqueta_template t
       WHERE t.padrao = true AND t.ativo = true
         AND EXISTS (SELECT 1 FROM public.etiqueta_template t2
                      WHERE t2.tenant_id = t.tenant_id AND t2.tipo = t.tipo
                        AND t2.empresa_id IS NOT DISTINCT FROM t.empresa_id
                        AND t2.padrao = true AND t2.ativo = true
                        AND (t2.created_at, t2.id) > (t.created_at, t.id))), '-- nenhum'))
  ) AS o(objeto, def)
 WHERE NOT EXISTS (SELECT 1 FROM ops.rollback_definicao r
                    WHERE r.migration = '20261115214500_etq_f1_fonte_unica' AND r.objeto = o.objeto);

-- ============================================================
-- Índices (A5 / desempenho)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_volume_expedicao_movimento ON public.volume_expedicao (movimento_saida_id);
CREATE INDEX IF NOT EXISTS idx_volume_expedicao_documento ON public.volume_expedicao (documento_saida_id);
CREATE INDEX IF NOT EXISTS idx_fila_impressao_origem ON public.fila_impressao (tipo_documento_origem, documento_origem_id);
CREATE INDEX IF NOT EXISTS idx_fila_impressao_processando ON public.fila_impressao (processado_em) WHERE status = 'PROCESSANDO';
CREATE INDEX IF NOT EXISTS idx_documento_saida_nf_doc ON public.documento_saida_nf (documento_saida_id);
CREATE INDEX IF NOT EXISTS idx_carga_unidade_referencia ON public.carga_unidade (referencia_id);

-- ============================================================
-- A8 — Volumes antigos sem pedido, em ondas de 1 pedido só
-- ============================================================
UPDATE public.volume_expedicao ve
   SET documento_saida_id = x.documento_saida_id
  FROM (SELECT msd.movimento_saida_id, min(msd.documento_saida_id::text)::uuid AS documento_saida_id
          FROM public.movimento_saida_documento msd
         GROUP BY msd.movimento_saida_id
        HAVING count(*) = 1) x
 WHERE ve.documento_saida_id IS NULL
   AND x.movimento_saida_id = ve.movimento_saida_id;

-- ============================================================
-- A5 — View enriquecida (colunas antigas mantidas na mesma ordem;
--      novas colunas só no fim, então a tela atual não muda)
-- ============================================================
CREATE OR REPLACE VIEW public.vw_volume_expedicao_lista
WITH (security_invoker = true) AS
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
    (SELECT count(*) FROM public.volume_expedicao v2 WHERE v2.movimento_saida_id = ve.movimento_saida_id) AS total_volumes_movimento,
    -- novas colunas
    ds.numero_pedido,
    ds.observacao AS pedido_observacao,
    ds.transportador AS pedido_transportador,
    p.cidade AS parceiro_cidade,
    p.estado AS parceiro_uf,
    CASE WHEN ve.documento_saida_id IS NOT NULL
         THEN (SELECT count(*) FROM public.volume_expedicao v3 WHERE v3.documento_saida_id = ve.documento_saida_id)
         ELSE (SELECT count(*) FROM public.volume_expedicao v3 WHERE v3.movimento_saida_id = ve.movimento_saida_id AND v3.documento_saida_id IS NULL)
    END AS total_volumes_pedido,
    nf.id AS nf_id,
    nf.numero_nf AS nf_numero,
    nf.serie AS nf_serie,
    nf.chave_nfe AS nf_chave,
    nf.data_emissao AS nf_data_emissao,
    nf.qtd_volumes AS nf_qtd_volumes,
    nf.especie_volumes AS nf_especie_volumes,
    nf.peso_bruto AS nf_peso_bruto,
    ve.created_by,
    uc.nome AS criado_por_nome,
    cu.carga_id,
    c.numero_carga,
    cu.status AS embarque_status,
    cu.embarcada_em,
    ue.nome AS embarcada_por_nome,
    tp.razaosocial AS carga_transportadora,
    etq.impressoes AS etiqueta_impressoes,
    etq.ultimo_status AS etiqueta_ultimo_status,
    etq.ultima_em AS etiqueta_ultima_em
FROM public.volume_expedicao ve
LEFT JOIN public.movimento_saida ms ON ms.id = ve.movimento_saida_id
LEFT JOIN public.documento_saida ds ON ds.id = ve.documento_saida_id
LEFT JOIN public.parceiro p ON p.id = ds.parceiro_id
LEFT JOIN LATERAL (
    SELECT n.* FROM public.documento_saida_nf n
     WHERE n.documento_saida_id = ve.documento_saida_id
       AND n.situacao = 'AUTORIZADA' AND n.data_cancelamento IS NULL
     ORDER BY n.data_emissao DESC NULLS LAST, n.created_at DESC
     LIMIT 1) nf ON true
LEFT JOIN public.usuario uc ON uc.id = ve.created_by
LEFT JOIN LATERAL (
    SELECT u.* FROM public.carga_unidade u
     WHERE u.referencia_id = ve.id AND u.tipo = 'VOLUME' AND u.status <> 'CANCELADA'
     ORDER BY u.created_at DESC LIMIT 1) cu ON true
LEFT JOIN public.carga c ON c.id = cu.carga_id
LEFT JOIN public.parceiro tp ON tp.id = c.transportadora_id
LEFT JOIN public.usuario ue ON ue.id = cu.embarcada_por
LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE f.status = 'IMPRESSO') AS impressoes,
           (array_agg(f.status::text ORDER BY f.criado_em DESC))[1] AS ultimo_status,
           max(f.criado_em) AS ultima_em
      FROM public.fila_impressao f
     WHERE f.tipo_documento_origem = 'volume_expedicao' AND f.documento_origem_id = ve.id) etq ON true;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.vw_volume_expedicao_lista FROM authenticated;
GRANT SELECT ON public.vw_volume_expedicao_lista TO authenticated;

-- ============================================================
-- A6 — Dados da etiqueta montados no servidor (uma única fonte)
-- Chaves = as do catálogo de campos do template VOLUME (+ novas de NF).
-- ============================================================
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
           'cidade_uf',       upper(concat_ws(' / ', nullif(v.parceiro_cidade, ''), nullif(v.parceiro_uf, ''))),
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

-- Versão pública para a prévia na tela (tenant da sessão)
CREATE OR REPLACE FUNCTION public.fn_etiqueta_volume_dados(p_volume_ids uuid[])
RETURNS TABLE (volume_id uuid, dados jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.volume_id, d.dados
    FROM public._fn_etiqueta_volume_dados(public.get_current_tenant(), p_volume_ids) d
   WHERE public.get_current_tenant() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.fn_etiqueta_volume_dados(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_etiqueta_volume_dados(uuid[]) TO authenticated;

-- Todo job de VOLUME ligado a um volume tem os dados completados pelo
-- servidor ao entrar na fila (vale para coletor, tela Volumes e reimpressão).
-- Os valores do servidor prevalecem sobre os enviados pela tela.
CREATE OR REPLACE FUNCTION public.tg_fila_impressao_dados_volume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dados jsonb;
BEGIN
  IF NEW.tipo_documento_origem = 'volume_expedicao' AND NEW.documento_origem_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.etiqueta_template t WHERE t.id = NEW.template_id AND t.tipo = 'VOLUME') THEN
    SELECT d.dados INTO v_dados
      FROM public._fn_etiqueta_volume_dados(NEW.tenant_id, ARRAY[NEW.documento_origem_id]) d;
    IF v_dados IS NOT NULL THEN
      NEW.dados := COALESCE(NEW.dados, '{}'::jsonb) - 'numero_pedido' || v_dados
                   || jsonb_build_object('_dados_servidor', true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fila_impressao_dados_volume ON public.fila_impressao;
CREATE TRIGGER trg_fila_impressao_dados_volume
  BEFORE INSERT ON public.fila_impressao
  FOR EACH ROW EXECUTE FUNCTION public.tg_fila_impressao_dados_volume();

-- ============================================================
-- A11 — Escolha de template determinística: padrão antes de não padrão,
--       da empresa antes do tenant, mais recente primeiro. No máximo 1
--       padrão por tenant + empresa + tipo (os padrões repetidos mais
--       antigos deixam de ser padrão).
-- ============================================================
UPDATE public.etiqueta_template t
   SET padrao = false
 WHERE t.padrao = true AND t.ativo = true
   AND EXISTS (SELECT 1 FROM public.etiqueta_template t2
                WHERE t2.tenant_id = t.tenant_id AND t2.tipo = t.tipo
                  AND t2.empresa_id IS NOT DISTINCT FROM t.empresa_id
                  AND t2.padrao = true AND t2.ativo = true
                  AND (t2.created_at, t2.id) > (t.created_at, t.id));

CREATE UNIQUE INDEX IF NOT EXISTS uq_etiqueta_template_padrao
  ON public.etiqueta_template (tenant_id, tipo, COALESCE(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE padrao = true AND ativo = true;

CREATE OR REPLACE FUNCTION public.solicitar_impressao(p_armazem_id uuid, p_tipo_etiqueta text, p_dados jsonb, p_origem text, p_documento_origem_id uuid, p_impressora_id uuid, p_prioridade integer, p_quantidade_copias integer, p_setor_uso text, p_tipo_documento_origem text, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_empresa_id uuid;
  v_usuario_id uuid;
  v_impressora_id uuid;
  v_impressora_nome text;
  v_template_id uuid;
  v_job_id uuid;
  v_setor enum_setor_uso_impressora;
  v_tpl_larg numeric; v_tpl_alt numeric;
  v_imp_larg integer; v_imp_alt integer;
  v_aviso text := NULL;
  v_empresa_doc uuid;
BEGIN
  -- 1. Tenant do usuário logado
  SELECT u.tenant_id, u.empresa_id, u.id
  INTO v_tenant_id, v_empresa_id, v_usuario_id
  FROM public.usuario u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado ou sem tenant', 'codigo', 'SEM_TENANT');
  END IF;

  -- Empresa do documento (volume) prevalece para escolher o template
  IF p_tipo_documento_origem = 'volume_expedicao' AND p_documento_origem_id IS NOT NULL THEN
    SELECT ve.empresa_id INTO v_empresa_doc FROM public.volume_expedicao ve
     WHERE ve.id = p_documento_origem_id AND ve.tenant_id = v_tenant_id;
    IF v_empresa_doc IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Volume não encontrado', 'codigo', 'VOLUME_NAO_ENCONTRADO');
    END IF;
  END IF;
  v_empresa_doc := COALESCE(v_empresa_doc, v_empresa_id);

  -- 2. Template
  IF p_template_id IS NOT NULL THEN
    SELECT id INTO v_template_id
    FROM public.etiqueta_template
    WHERE id = p_template_id AND tenant_id = v_tenant_id
      AND tipo = p_tipo_etiqueta AND ativo = true
    LIMIT 1;

    IF v_template_id IS NULL THEN
      RETURN jsonb_build_object('success', false,
        'error', 'Template selecionado não encontrado, inativo, ou não é do tipo ' || p_tipo_etiqueta,
        'codigo', 'TEMPLATE_INVALIDO');
    END IF;
  ELSE
    SELECT id INTO v_template_id
    FROM public.etiqueta_template
    WHERE tenant_id = v_tenant_id AND tipo = p_tipo_etiqueta AND ativo = true
      AND (empresa_id IS NULL OR empresa_id = v_empresa_doc)
    ORDER BY padrao DESC,
             (empresa_id IS NOT DISTINCT FROM v_empresa_doc) DESC,
             created_at DESC, id
    LIMIT 1;

    IF v_template_id IS NULL THEN
      RETURN jsonb_build_object('success', false,
        'error', 'Nenhum template encontrado para tipo: ' || p_tipo_etiqueta,
        'codigo', 'SEM_TEMPLATE');
    END IF;
  END IF;

  -- 3. Impressora
  IF p_impressora_id IS NOT NULL THEN
    SELECT id, nome INTO v_impressora_id, v_impressora_nome
    FROM public.impressora
    WHERE id = p_impressora_id AND tenant_id = v_tenant_id
      AND armazem_id = p_armazem_id AND ativo = true;

    IF v_impressora_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Impressora não encontrada ou inativa', 'codigo', 'IMPRESSORA_INVALIDA');
    END IF;

    IF NOT public.impressora_elegivel(v_impressora_id) THEN
      RETURN jsonb_build_object('success', false,
        'error', 'Impressora ' || v_impressora_nome || ' indisponível: agente de impressão offline ou inativo',
        'codigo', 'IMPRESSORA_OFFLINE');
    END IF;
  ELSE
    IF p_setor_uso IS NOT NULL THEN
      v_setor := p_setor_uso::enum_setor_uso_impressora;
    ELSIF p_tipo_etiqueta IN ('PRODUTO', 'HU') THEN
      v_setor := 'RECEBIMENTO';
    ELSIF p_tipo_etiqueta = 'VOLUME' THEN
      v_setor := 'EXPEDICAO';
    ELSE
      v_setor := 'GERAL';
    END IF;

    SELECT id, nome INTO v_impressora_id, v_impressora_nome
    FROM public.impressora
    WHERE tenant_id = v_tenant_id AND armazem_id = p_armazem_id
      AND setor_uso = v_setor AND ativo = true
      AND public.impressora_elegivel(id)
    ORDER BY CASE status_conexao WHEN 'ONLINE' THEN 0 ELSE 1 END, created_at ASC
    LIMIT 1;

    IF v_impressora_id IS NULL AND v_setor <> 'GERAL' THEN
      SELECT id, nome INTO v_impressora_id, v_impressora_nome
      FROM public.impressora
      WHERE tenant_id = v_tenant_id AND armazem_id = p_armazem_id
        AND setor_uso = 'GERAL' AND ativo = true
        AND public.impressora_elegivel(id)
      ORDER BY CASE status_conexao WHEN 'ONLINE' THEN 0 ELSE 1 END, created_at ASC
      LIMIT 1;
    END IF;

    IF v_impressora_id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.impressora
                     WHERE tenant_id = v_tenant_id AND armazem_id = p_armazem_id AND ativo = true) THEN
        RETURN jsonb_build_object('success', false,
          'error', 'Nenhuma impressora cadastrada neste armazém',
          'codigo', 'SEM_IMPRESSORA_CADASTRADA');
      END IF;
      RETURN jsonb_build_object('success', false,
        'error', 'Nenhuma impressora online no armazém para o setor ' || v_setor::text || '. Verifique se o LogiTrack Print Agent está rodando.',
        'codigo', 'SEM_IMPRESSORA_ONLINE');
    END IF;
  END IF;

  -- 4. Compatibilidade de tamanho (aviso, não bloqueia)
  SELECT largura_mm, altura_mm INTO v_tpl_larg, v_tpl_alt FROM public.etiqueta_template WHERE id = v_template_id;
  SELECT largura_mm, altura_mm INTO v_imp_larg, v_imp_alt FROM public.impressora WHERE id = v_impressora_id;

  IF v_tpl_larg IS NOT NULL AND v_tpl_alt IS NOT NULL AND v_imp_larg IS NOT NULL AND v_imp_alt IS NOT NULL
     AND (round(v_tpl_larg) <> v_imp_larg OR round(v_tpl_alt) <> v_imp_alt) THEN
    v_aviso := 'Template ' || round(v_tpl_larg)::text || '×' || round(v_tpl_alt)::text
            || 'mm diferente da mídia da impressora ' || v_imp_larg::text || '×' || v_imp_alt::text || 'mm';
  END IF;

  -- 5. Criar job (dados de VOLUME são completados pelo gatilho da fila)
  INSERT INTO public.fila_impressao (
    tenant_id, empresa_id, armazem_id, impressora_id, template_id,
    dados, quantidade_copias, origem, documento_origem_id, tipo_documento_origem,
    solicitado_por, prioridade
  ) VALUES (
    v_tenant_id, v_empresa_id, p_armazem_id, v_impressora_id, v_template_id,
    p_dados, p_quantidade_copias, p_origem, p_documento_origem_id, p_tipo_documento_origem,
    v_usuario_id, p_prioridade
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'impressora_id', v_impressora_id,
    'impressora_nome', v_impressora_nome,
    'template_id', v_template_id,
    'aviso', v_aviso,
    'codigo_aviso', CASE WHEN v_aviso IS NOT NULL THEN 'TAMANHO_DIVERGENTE' END,
    'mensagem', 'Job de impressão criado com sucesso'
  );
END;
$function$;

-- ============================================================
-- A27 — Fila: espera crescente entre tentativas, recuperação de jobs presos
--       em PROCESSANDO e expiração de pendentes antigos.
-- ============================================================
ALTER TABLE public.fila_impressao ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz;

CREATE OR REPLACE FUNCTION public._buscar_jobs_pendentes_core(p_agent_id uuid, p_limite integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_armazem_id uuid;
  v_impressora_ids uuid[];
  v_jobs jsonb;
BEGIN
  SELECT pa.tenant_id, pa.armazem_id
  INTO v_tenant_id, v_armazem_id
  FROM public.print_agent pa
  WHERE pa.id = p_agent_id
    AND pa.ativo = true;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent não encontrado ou inativo');
  END IF;

  SELECT array_agg(id) INTO v_impressora_ids
  FROM public.impressora
  WHERE agent_id = p_agent_id
    AND ativo = true;

  IF v_impressora_ids IS NULL OR array_length(v_impressora_ids, 1) = 0 THEN
    RETURN jsonb_build_object('success', true, 'jobs', '[]'::jsonb, 'total', 0);
  END IF;

  WITH jobs_to_process AS (
    SELECT fi.id
    FROM public.fila_impressao fi
    WHERE fi.tenant_id = v_tenant_id
      AND fi.armazem_id = v_armazem_id
      AND fi.impressora_id = ANY(v_impressora_ids)
      AND fi.status IN ('PENDENTE', 'REIMPRESSAO')
      AND fi.tentativas < fi.max_tentativas
      AND (fi.proxima_tentativa_em IS NULL OR fi.proxima_tentativa_em <= now())
    ORDER BY fi.prioridade ASC, fi.criado_em ASC
    LIMIT p_limite
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.fila_impressao fi
    SET
      status = 'PROCESSANDO',
      processado_em = now(),
      tentativas = tentativas + 1
    FROM jobs_to_process jtp
    WHERE fi.id = jtp.id
    RETURNING fi.*
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'impressora_id', u.impressora_id,
      'template_id', u.template_id,
      'dados', u.dados,
      'quantidade_copias', u.quantidade_copias,
      'prioridade', u.prioridade,
      'origem', u.origem,
      'tentativa', u.tentativas
    )
  ), '[]'::jsonb)
  INTO v_jobs
  FROM updated u;

  RETURN jsonb_build_object(
    'success', true,
    'jobs', v_jobs,
    'total', jsonb_array_length(v_jobs)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public._buscar_jobs_pendentes_core(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._atualizar_status_job_core(p_job_id uuid, p_status text, p_comando_gerado text DEFAULT NULL::text, p_erro_mensagem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job_exists boolean;
  v_new_status enum_status_impressao;
BEGIN
  BEGIN
    v_new_status := p_status::enum_status_impressao;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status inválido: ' || p_status);
  END;

  SELECT EXISTS(
    SELECT 1 FROM public.fila_impressao
    WHERE id = p_job_id AND status = 'PROCESSANDO'
  ) INTO v_job_exists;

  IF NOT v_job_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job não encontrado ou não está em processamento');
  END IF;

  UPDATE public.fila_impressao
  SET
    status = v_new_status,
    comando_gerado = COALESCE(p_comando_gerado, comando_gerado),
    erro_mensagem = p_erro_mensagem,
    impresso_em = CASE WHEN v_new_status = 'IMPRESSO' THEN now() ELSE impresso_em END,
    proxima_tentativa_em = NULL
  WHERE id = p_job_id;

  -- Erro com tentativas restantes: volta para PENDENTE com espera crescente
  -- (30 s, 1 min, 2 min, 4 min... até 10 min)
  IF v_new_status = 'ERRO' THEN
    UPDATE public.fila_impressao
    SET status = 'PENDENTE',
        proxima_tentativa_em = now() + least(interval '30 seconds' * power(2, greatest(tentativas - 1, 0)), interval '10 minutes')
    WHERE id = p_job_id
      AND tentativas < max_tentativas;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'status', v_new_status::text
  );
END;
$function$;
REVOKE ALL ON FUNCTION public._atualizar_status_job_core(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_manutencao_fila_impressao()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recuperados int; v_esgotados int; v_expirados int;
BEGIN
  -- Presos em PROCESSANDO há mais de 5 min (agente caiu antes de informar)
  UPDATE public.fila_impressao
     SET status = 'PENDENTE', proxima_tentativa_em = now(),
         erro_mensagem = 'Recuperado: sem retorno do agente após 5 minutos'
   WHERE status = 'PROCESSANDO' AND processado_em < now() - interval '5 minutes'
     AND tentativas < max_tentativas;
  GET DIAGNOSTICS v_recuperados = ROW_COUNT;

  UPDATE public.fila_impressao
     SET status = 'ERRO',
         erro_mensagem = 'Sem retorno do agente e sem tentativas restantes'
   WHERE status = 'PROCESSANDO' AND processado_em < now() - interval '5 minutes'
     AND tentativas >= max_tentativas;
  GET DIAGNOSTICS v_esgotados = ROW_COUNT;

  -- Pendentes há mais de 24 h: cancelados para não imprimir etiqueta velha
  UPDATE public.fila_impressao
     SET status = 'CANCELADO', cancelado_em = now(),
         erro_mensagem = 'Expirado: pendente há mais de 24 horas sem impressão'
   WHERE status IN ('PENDENTE', 'REIMPRESSAO') AND criado_em < now() - interval '24 hours';
  GET DIAGNOSTICS v_expirados = ROW_COUNT;

  RETURN jsonb_build_object('recuperados', v_recuperados, 'esgotados', v_esgotados, 'expirados', v_expirados);
END;
$$;
REVOKE ALL ON FUNCTION public.fn_manutencao_fila_impressao() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'impressao-manutencao-fila') THEN
    PERFORM cron.unschedule('impressao-manutencao-fila');
  END IF;
  PERFORM cron.schedule('impressao-manutencao-fila', '*/5 * * * *', 'SELECT public.fn_manutencao_fila_impressao()');
END $$;

-- ========== ROLLBACK (manual) ==========
-- SELECT cron.unschedule('impressao-manutencao-fila'); DROP FUNCTION public.fn_manutencao_fila_impressao();
-- DROP TRIGGER trg_fila_impressao_dados_volume ON public.fila_impressao; DROP FUNCTION public.tg_fila_impressao_dados_volume();
-- DROP FUNCTION public.fn_etiqueta_volume_dados(uuid[]); DROP FUNCTION public._fn_etiqueta_volume_dados(uuid, uuid[]);
-- View: reaplicar a definição de 20260720234052 com security_invoker = true (DROP VIEW antes, porque colunas saem).
-- solicitar_impressao, _buscar_jobs_pendentes_core, _atualizar_status_job_core e a view: executar a
--   coluna definicao de ops.rollback_definicao (migration = '20261115214500_etq_f1_fonte_unica').
--   A view perde colunas: DROP VIEW public.vw_volume_expedicao_lista antes de recriar.
-- DROP INDEX uq_etiqueta_template_padrao; e executar a linha 'data etiqueta_template padrao' para remarcar padrões.
-- A8 (pedido nos volumes antigos) não precisa ser revertido: só preencheu campos vazios.
-- ALTER TABLE public.fila_impressao DROP COLUMN proxima_tentativa_em;
