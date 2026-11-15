-- Migration: 20261115223000_etq_f3_nota_fiscal.sql
-- Plano: Etiqueta de Volume de Expedição — Fase 3 (nota fiscal)
-- Ações: A12 (campos de NF na etiqueta: novas chaves no dado do servidor),
--        A13 (reimpressão automática da etiqueta com os dados da NF quando ela é autorizada — D2),
--        A14 (conferência de volumes WMS × NF: aviso, bloqueio configurável — D4)
-- Decisões aplicadas: D2 (configurável por tipo de saída, desligado por padrão),
--                     D4 (aviso por padrão; bloqueio opcional por tipo de saída)
-- Risco: médio — novo gatilho em documento_saida_nf (gravação da integração).
--        O gatilho nunca faz a gravação da NF falhar: qualquer erro vira WARNING no log.
--        Nada muda para quem não ligar as opções novas, exceto ocorrências de aviso
--        quando a quantidade de volumes diverge da NF (regra padrão AVISAR).
-- Ordem de deploy: banco e frontend em qualquer ordem (o frontend novo só lê campos novos
--        quando existem; o banco novo não exige nada do frontend).
-- Rollback: definições anteriores em ops.rollback_definicao (migration = este arquivo);
--        DROP TRIGGER trg_documento_saida_nf_volume; colunas novas podem ficar.

-- ============================================================
-- Cópia das definições anteriores
-- ============================================================
INSERT INTO ops.rollback_definicao (migration, objeto, definicao)
SELECT '20261115223000_etq_f3_nota_fiscal', o.objeto, o.def
  FROM (VALUES
    ('function public._fn_etiqueta_volume_dados', pg_get_functiondef('public._fn_etiqueta_volume_dados(uuid,uuid[])'::regprocedure)),
    ('function public.gerar_volumes_expedicao',   pg_get_functiondef('public.gerar_volumes_expedicao(uuid,uuid,uuid,integer,text,jsonb)'::regprocedure)),
    ('function public.embarque_gerar_volumes',    pg_get_functiondef('public.embarque_gerar_volumes(uuid,uuid,uuid,uuid,integer,text)'::regprocedure)),
    ('function public.embarque_fechar_carga',     pg_get_functiondef('public.embarque_fechar_carga(uuid,uuid,uuid)'::regprocedure))
  ) AS o(objeto, def)
 WHERE NOT EXISTS (SELECT 1 FROM ops.rollback_definicao r
                    WHERE r.migration = '20261115223000_etq_f3_nota_fiscal' AND r.objeto = o.objeto);

-- ============================================================
-- Configuração por tipo de saída
-- ============================================================
ALTER TABLE public.tipo_saida
  ADD COLUMN IF NOT EXISTS reimprime_volume_nf boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS divergencia_volume_nf text NOT NULL DEFAULT 'AVISAR';

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tipo_saida_divergencia_volume_nf') THEN
    ALTER TABLE public.tipo_saida
      ADD CONSTRAINT ck_tipo_saida_divergencia_volume_nf
      CHECK (divergencia_volume_nf IN ('IGNORAR', 'AVISAR', 'BLOQUEAR'));
  END IF;
END $do$;

COMMENT ON COLUMN public.tipo_saida.reimprime_volume_nf IS
  'Quando a NF do pedido é autorizada, reimprime automaticamente as etiquetas de volume já impressas sem a NF (mesma impressora e template).';
COMMENT ON COLUMN public.tipo_saida.divergencia_volume_nf IS
  'Quantidade de volumes do WMS diferente da NF: IGNORAR, AVISAR (ocorrência + aviso) ou BLOQUEAR (impede gerar e fechar a carga).';

-- ============================================================
-- A12 — novas chaves no dado do servidor
--   identificacao_volume ("01/05"), nf_numero, nf_serie, nf_especie_volumes
-- ============================================================
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
           'observacao',      v.pedido_observacao
         ))
    FROM public.vw_volume_expedicao_lista v
   WHERE v.tenant_id = p_tenant_id
     AND v.id = ANY(p_volume_ids);
$function$;

-- ============================================================
-- A14 — conferência de um pedido: volumes do WMS × NF autorizada
--   p_wms: quantidade a comparar (a que está sendo gerada); NULL = volumes existentes
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_volume_nf_conferir(p_documento_saida_id uuid, p_wms integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
           'documento_saida_id', ds.id,
           'numero_pedido',      ds.numero_pedido,
           'nf_id',              nf.id,
           'nota_fiscal',        CASE WHEN nf.numero_nf IS NOT NULL THEN nf.numero_nf || COALESCE('-' || nullif(nf.serie, ''), '') END,
           'nf_qtd_volumes',     nf.qtd_volumes,
           'wms_volumes',        w.n,
           'regra',              COALESCE(ts.divergencia_volume_nf, 'AVISAR'),
           'divergente',         (nf.qtd_volumes IS NOT NULL AND w.n > 0 AND w.n <> nf.qtd_volumes))
    FROM public.documento_saida ds
    LEFT JOIN public.tipo_saida ts ON ts.id = ds.tipo_pedido_id
    LEFT JOIN LATERAL (
      SELECT n.id, n.numero_nf, n.serie, n.qtd_volumes
        FROM public.documento_saida_nf n
       WHERE n.documento_saida_id = ds.id AND n.situacao = 'AUTORIZADA' AND n.data_cancelamento IS NULL
       ORDER BY n.data_emissao DESC NULLS LAST, n.created_at DESC
       LIMIT 1) nf ON true
    CROSS JOIN LATERAL (
      SELECT COALESCE(p_wms, (SELECT count(*)::int FROM public.volume_expedicao v WHERE v.documento_saida_id = ds.id)) AS n) w
   WHERE ds.id = p_documento_saida_id;
$function$;

CREATE OR REPLACE FUNCTION public._fn_registrar_divergencia_volume_nf(
  p_div jsonb, p_tenant_id uuid, p_empresa_id uuid, p_armazem_id uuid,
  p_usuario_id uuid, p_contexto text, p_estrito boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_r jsonb;
BEGIN
  SELECT public.registrar_ocorrencia_operacional(
    p_tenant_id := p_tenant_id,
    p_empresa_id := p_empresa_id,
    p_armazem_id := p_armazem_id,
    p_etapa_ocorrencia := 'EXPEDICAO',
    p_tipo_ocorrencia := 'OUTROS',
    p_categoria := 'CORRETIVA',
    p_documento_origem_id := (p_div->>'documento_saida_id')::uuid,
    p_tipo_documento_origem := 'DOCUMENTO_SAIDA',
    p_usuario_criador_id := p_usuario_id,
    p_usuario_causador_id := p_usuario_id,
    p_quantidade_esperada := (p_div->>'nf_qtd_volumes')::numeric,
    p_quantidade_real := (p_div->>'wms_volumes')::numeric,
    p_observacao := format('Volumes do pedido %s diferentes da NF %s (%s): %s no WMS, %s na nota. Regra do tipo de saída: %s.',
                           p_div->>'numero_pedido', COALESCE(p_div->>'nota_fiscal', '?'), p_contexto,
                           p_div->>'wms_volumes', p_div->>'nf_qtd_volumes', p_div->>'regra'),
    p_prioridade := CASE WHEN p_div->>'regra' = 'BLOQUEAR' THEN 'ALTA' ELSE 'NORMAL' END) INTO v_r;
  IF NOT COALESCE((v_r->>'sucesso')::boolean, false) THEN
    IF p_estrito THEN
      RAISE EXCEPTION 'OCORRENCIA_FALHOU: não foi possível registrar a divergência de volumes × NF (%).', v_r->>'mensagem';
    END IF;
    RAISE WARNING 'divergência volume × NF não registrada: %', v_r->>'mensagem';
  END IF;
END $function$;

-- ============================================================
-- A13 + A14 — gatilho na NF
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_documento_saida_nf_volume()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ds   record;
  v_vol  record;
  v_ult  record;
  v_imp  uuid;
  v_tpl  uuid;
  v_arm  uuid;
  v_div  jsonb;
  v_nova boolean;
BEGIN
  IF NEW.documento_saida_id IS NULL OR NEW.situacao IS DISTINCT FROM 'AUTORIZADA' OR NEW.data_cancelamento IS NOT NULL THEN
    RETURN NULL;
  END IF;
  v_nova := TG_OP = 'INSERT' OR OLD.situacao IS DISTINCT FROM 'AUTORIZADA' OR OLD.data_cancelamento IS NOT NULL;
  IF NOT v_nova AND OLD.qtd_volumes IS NOT DISTINCT FROM NEW.qtd_volumes THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT ds.id, ds.empresa_id, ds.numero_pedido,
           COALESCE(ts.reimprime_volume_nf, false) AS reimprime,
           COALESCE(ts.divergencia_volume_nf, 'AVISAR') AS regra
      INTO v_ds
      FROM public.documento_saida ds
      LEFT JOIN public.tipo_saida ts ON ts.id = ds.tipo_pedido_id
     WHERE ds.id = NEW.documento_saida_id AND ds.tenant_id = NEW.tenant_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    -- A13: reimpressão das etiquetas já impressas sem esta NF
    IF v_nova AND v_ds.reimprime THEN
      FOR v_vol IN
        SELECT ve.id, ve.empresa_id
          FROM public.volume_expedicao ve
         WHERE ve.documento_saida_id = NEW.documento_saida_id
           AND ve.tenant_id = NEW.tenant_id
           AND ve.status <> 'EXPEDIDO'
         ORDER BY ve.numero_volume
      LOOP
        SELECT f.impressora_id, f.template_id, f.armazem_id, f.dados
          INTO v_ult
          FROM public.fila_impressao f
         WHERE f.tipo_documento_origem = 'volume_expedicao'
           AND f.documento_origem_id = v_vol.id
           AND f.status <> 'CANCELADO'
         ORDER BY f.criado_em DESC
         LIMIT 1;
        CONTINUE WHEN NOT FOUND;                                           -- nunca impressa: a 1ª impressão já sai com NF
        CONTINUE WHEN v_ult.dados->>'_nf_id' = NEW.id::text;               -- já reimpressa para esta NF
        CONTINUE WHEN NEW.chave_nfe IS NOT NULL AND v_ult.dados->>'nf_chave' = NEW.chave_nfe;  -- já saiu com esta NF

        v_imp := NULL;
        SELECT i.id INTO v_imp FROM public.impressora i
         WHERE i.id = v_ult.impressora_id AND i.tenant_id = NEW.tenant_id AND i.ativo;
        IF v_imp IS NULL THEN
          SELECT i.id INTO v_imp FROM public.impressora i
           WHERE i.tenant_id = NEW.tenant_id AND i.armazem_id = v_ult.armazem_id AND i.ativo
             AND i.setor_uso IN ('EXPEDICAO', 'GERAL')
           ORDER BY (i.setor_uso = 'EXPEDICAO') DESC, i.created_at
           LIMIT 1;
        END IF;
        CONTINUE WHEN v_imp IS NULL;

        v_tpl := NULL;
        SELECT t.id INTO v_tpl FROM public.etiqueta_template t
         WHERE t.id = v_ult.template_id AND t.tenant_id = NEW.tenant_id AND t.tipo = 'VOLUME' AND t.ativo;
        IF v_tpl IS NULL THEN
          SELECT t.id INTO v_tpl FROM public.etiqueta_template t
           WHERE t.tenant_id = NEW.tenant_id AND t.tipo = 'VOLUME' AND t.ativo
             AND (t.empresa_id IS NULL OR t.empresa_id = v_vol.empresa_id)
           ORDER BY t.padrao DESC, (t.empresa_id IS NOT DISTINCT FROM v_vol.empresa_id) DESC, t.created_at DESC, t.id
           LIMIT 1;
        END IF;
        CONTINUE WHEN v_tpl IS NULL;

        INSERT INTO public.fila_impressao (
          tenant_id, empresa_id, armazem_id, impressora_id, template_id, dados,
          quantidade_copias, origem, documento_origem_id, tipo_documento_origem, prioridade)
        VALUES (
          NEW.tenant_id, v_vol.empresa_id, v_ult.armazem_id, v_imp, v_tpl,
          jsonb_build_object('_nf_id', NEW.id, '_motivo', 'NF_AUTORIZADA'),
          1, 'NF_AUTORIZADA', v_vol.id, 'volume_expedicao', 5);
        v_arm := COALESCE(v_arm, v_ult.armazem_id);
      END LOOP;
    END IF;

    -- A14: volumes do WMS × NF
    IF v_ds.regra <> 'IGNORAR' THEN
      v_div := public._fn_volume_nf_conferir(NEW.documento_saida_id);
      IF COALESCE((v_div->>'divergente')::boolean, false) THEN
        IF v_arm IS NULL THEN
          SELECT b.armazem_id INTO v_arm
            FROM public.volume_expedicao ve
            JOIN public.movimento_saida ms ON ms.id = ve.movimento_saida_id
            JOIN public.box b ON b.id = ms.box_id
           WHERE ve.documento_saida_id = NEW.documento_saida_id
           LIMIT 1;
        END IF;
        PERFORM public._fn_registrar_divergencia_volume_nf(
          v_div, NEW.tenant_id, v_ds.empresa_id, v_arm, NULL, 'na autorização da NF', false);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- a gravação da NF (integração) nunca falha por causa da etiqueta
    RAISE WARNING 'tg_documento_saida_nf_volume (NF %): % [%]', NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS trg_documento_saida_nf_volume ON public.documento_saida_nf;
CREATE TRIGGER trg_documento_saida_nf_volume
  AFTER INSERT OR UPDATE OF situacao, data_cancelamento, qtd_volumes ON public.documento_saida_nf
  FOR EACH ROW EXECUTE FUNCTION public.tg_documento_saida_nf_volume();

-- ============================================================
-- A14 na geração (Separação / Conferência)
-- ============================================================
CREATE OR REPLACE FUNCTION public.gerar_volumes_expedicao(p_tenant_id uuid, p_empresa_id uuid, p_movimento_saida_id uuid, p_quantidade_volumes integer, p_etapa_origem text DEFAULT 'CONFERÊNCIA'::text, p_quantidades jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ms             record;
  v_etapa          text;
  v_pedidos        jsonb;
  v_n_pedidos      int;
  v_itens          jsonb;
  v_item           jsonb;
  v_doc            uuid;
  v_qtd            int;
  v_num_pedido     bigint;
  v_total          int := 0;
  v_codigo         text;
  v_volume_id      uuid;
  v_volumes        jsonb := '[]'::jsonb;
  v_diverg         jsonb;
  v_avisos         jsonb := '[]'::jsonb;
  v_d              jsonb;
  v_usuario        uuid;
  v_armazem        uuid;
  i                int;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  SELECT ms.id, ms.empresa_id, ms.tipo_saida, ms.box_id
    INTO v_ms
    FROM public.movimento_saida ms
   WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id
   FOR UPDATE;

  IF v_ms.id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOVIMENTO_NAO_ENCONTRADO',
      'mensagem', 'Movimento de saída não encontrado.');
  END IF;

  SELECT ts.gera_volume_etapa::text INTO v_etapa
    FROM public.tipo_saida ts
   WHERE ts.id = v_ms.tipo_saida AND ts.tenant_id = p_tenant_id;

  IF v_etapa IS NULL OR v_etapa = 'NENHUMA' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TIPO_SAIDA_SEM_VOLUME',
      'mensagem', 'Este tipo de saída não está configurado para gerar volumes.');
  END IF;

  IF v_etapa <> p_etapa_origem THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ETAPA_DIFERENTE',
      'mensagem', format('Geração de volume configurada para a etapa %s, não %s.', v_etapa, p_etapa_origem));
  END IF;

  IF EXISTS (SELECT 1 FROM public.volume_expedicao
              WHERE movimento_saida_id = p_movimento_saida_id AND tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUMES_JA_GERADOS',
      'mensagem', 'Volumes já foram gerados para esta onda.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'documento_saida_id', ds.id,
           'numero_pedido', ds.numero_pedido,
           'parceiro_nome', p.razaosocial) ORDER BY msd.ordem NULLS LAST, ds.numero_pedido), '[]'::jsonb),
         count(*)
    INTO v_pedidos, v_n_pedidos
    FROM public.movimento_saida_documento msd
    JOIN public.documento_saida ds ON ds.id = msd.documento_saida_id
    LEFT JOIN public.parceiro p ON p.id = ds.parceiro_id
   WHERE msd.movimento_saida_id = p_movimento_saida_id;

  IF v_n_pedidos = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_SEM_PEDIDOS',
      'mensagem', 'A onda não tem pedidos vinculados.');
  END IF;

  IF p_quantidades IS NULL THEN
    IF v_n_pedidos > 1 THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'INFORMAR_VOLUMES_POR_PEDIDO',
        'mensagem', format('Esta onda tem %s pedidos. Informe a quantidade de volumes de cada pedido.', v_n_pedidos),
        'pedidos', v_pedidos);
    END IF;
    IF p_quantidade_volumes IS NULL OR p_quantidade_volumes <= 0 OR p_quantidade_volumes > 999 THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'QUANTIDADE_INVALIDA',
        'mensagem', 'Informe de 1 a 999 volumes.');
    END IF;
    v_itens := jsonb_build_array(jsonb_build_object(
      'documento_saida_id', v_pedidos->0->>'documento_saida_id', 'quantidade', p_quantidade_volumes));
  ELSE
    v_itens := p_quantidades;
    IF jsonb_typeof(v_itens) <> 'array'
       OR jsonb_array_length(v_itens) <> v_n_pedidos
       OR (SELECT count(DISTINCT x->>'documento_saida_id') FROM jsonb_array_elements(v_itens) x) <> v_n_pedidos
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_itens) x
                   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pedidos) pd
                                      WHERE pd->>'documento_saida_id' = x->>'documento_saida_id')
                      OR (x->>'quantidade') !~ '^[0-9]+$'
                      OR (x->>'quantidade')::int NOT BETWEEN 1 AND 999) THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'QUANTIDADES_INVALIDAS',
        'mensagem', 'Informe de 1 a 999 volumes para cada pedido da onda.',
        'pedidos', v_pedidos);
    END IF;
  END IF;

  -- A14: pedidos que já têm NF autorizada com quantidade de volumes diferente
  SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) INTO v_diverg
    FROM jsonb_array_elements(v_itens) x
   CROSS JOIN LATERAL public._fn_volume_nf_conferir((x->>'documento_saida_id')::uuid, (x->>'quantidade')::int) d
   WHERE COALESCE((d->>'divergente')::boolean, false) AND d->>'regra' <> 'IGNORAR';

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_diverg) d WHERE d->>'regra' = 'BLOQUEAR') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUMES_DIVERGEM_NF',
      'mensagem', 'A quantidade de volumes difere da nota fiscal: '
                  || (SELECT string_agg(format('pedido %s com %s volume(s), NF %s com %s',
                                               d->>'numero_pedido', d->>'wms_volumes', COALESCE(d->>'nota_fiscal', '?'), d->>'nf_qtd_volumes'), '; ')
                        FROM jsonb_array_elements(v_diverg) d WHERE d->>'regra' = 'BLOQUEAR')
                  || '. Informe a quantidade da NF ou peça a correção da NF.',
      'divergencias', v_diverg,
      'pedidos', v_pedidos);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens) LOOP
    v_doc := (v_item->>'documento_saida_id')::uuid;
    v_qtd := (v_item->>'quantidade')::int;
    SELECT (pd->>'numero_pedido')::bigint INTO v_num_pedido
      FROM jsonb_array_elements(v_pedidos) pd WHERE pd->>'documento_saida_id' = v_doc::text;

    FOR i IN 1..v_qtd LOOP
      v_codigo := 'VOL-' || lpad(nextval('volume_expedicao_codigo_seq')::text, 6, '0');
      INSERT INTO public.volume_expedicao (
        tenant_id, empresa_id, movimento_saida_id, documento_saida_id,
        codigo_volume, numero_volume, status)
      VALUES (p_tenant_id, v_ms.empresa_id, p_movimento_saida_id, v_doc,
        v_codigo, i, 'ABERTO'::enum_status_volume)
      RETURNING id INTO v_volume_id;

      v_volumes := v_volumes || jsonb_build_object(
        'id', v_volume_id,
        'codigo_volume', v_codigo,
        'numero_volume', i,
        'total_volumes', v_qtd,
        'documento_saida_id', v_doc,
        'numero_pedido', v_num_pedido,
        'identificacao_volume', i::text || '/' || v_qtd::text);
    END LOOP;
    v_total := v_total + v_qtd;
  END LOOP;

  -- A14 (AVISAR): gera, registra ocorrência e devolve o aviso
  IF jsonb_array_length(v_diverg) > 0 THEN
    SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = auth.uid() AND u.tenant_id = p_tenant_id LIMIT 1;
    SELECT b.armazem_id INTO v_armazem FROM public.box b WHERE b.id = v_ms.box_id;
    FOR v_d IN SELECT * FROM jsonb_array_elements(v_diverg) LOOP
      PERFORM public._fn_registrar_divergencia_volume_nf(
        v_d, p_tenant_id, v_ms.empresa_id, v_armazem, v_usuario, 'na geração em ' || p_etapa_origem, true);
      v_avisos := v_avisos || jsonb_build_object('codigo', 'VOLUMES_DIVERGEM_NF', 'mensagem', format('Pedido %s: %s volume(s) gerado(s), mas a NF %s informa %s. Divergência registrada como ocorrência.',
                                              v_d->>'numero_pedido', v_d->>'wms_volumes', COALESCE(v_d->>'nota_fiscal', '?'), v_d->>'nf_qtd_volumes'));
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', format('%s volume(s) gerado(s) com sucesso.', v_total),
    'total_volumes', v_total,
    'volumes', v_volumes,
    'avisos', v_avisos);
END;
$function$;

-- ============================================================
-- A14 no embarque (geração)
-- ============================================================
CREATE OR REPLACE FUNCTION public.embarque_gerar_volumes(p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid, p_carga_documento_id uuid, p_quantidade integer, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_u uuid; v_c record; v_cd record; v_ids uuid[] := '{}'; v_id uuid; i integer; v_vols jsonb;
        v_etapa text; v_excecao boolean; v_armazem uuid; v_ocorr jsonb; v_div jsonb; v_aviso text;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  PERFORM public._fn_embarque_checar_responsavel(p_carga_id, v_u);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em %.', v_c.numero_carga, v_c.status;
  END IF;
  PERFORM public._fn_embarque_checar_veiculo(p_carga_id);
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 999 THEN
    RAISE EXCEPTION 'EMBARQUE_QUANTIDADE_INVALIDA: informe de 1 a 999 volumes.';
  END IF;
  SELECT cd.*, ds.numero_pedido, ds.tipo_pedido_id, ms.numero_onda INTO v_cd FROM carga_documento cd
    JOIN documento_saida ds ON ds.id = cd.documento_saida_id JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
   WHERE cd.id = p_carga_documento_id AND cd.carga_id = p_carga_id AND cd.ativo;
  IF v_cd.id IS NULL THEN RAISE EXCEPTION 'EMBARQUE_PEDIDO_FORA_DA_CARGA: o pedido não faz parte desta carga.'; END IF;
  IF EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_documento_id = v_cd.id AND cu.status <> 'CANCELADA') THEN
    RAISE EXCEPTION 'EMBARQUE_VOLUMES_JA_GERADOS: o pedido % já tem volumes; bipe as etiquetas dele.', v_cd.numero_pedido;
  END IF;
  IF EXISTS (SELECT 1 FROM volume_expedicao ve
              WHERE ve.movimento_saida_id = v_cd.movimento_saida_id
                AND ve.documento_saida_id = v_cd.documento_saida_id) THEN
    RAISE EXCEPTION 'EMBARQUE_PEDIDO_JA_TEM_VOLUMES: o pedido % já tem % volume(s) gerado(s). Reimprima as etiquetas na tela Volumes em vez de gerar de novo.',
      v_cd.numero_pedido, (SELECT count(*) FROM volume_expedicao ve WHERE ve.movimento_saida_id = v_cd.movimento_saida_id AND ve.documento_saida_id = v_cd.documento_saida_id);
  END IF;

  SELECT ts.gera_volume_etapa::text INTO v_etapa FROM tipo_saida ts
   WHERE ts.id = v_cd.tipo_pedido_id AND ts.tenant_id = p_tenant_id;
  v_excecao := COALESCE(v_etapa, 'NENHUMA') <> 'CARREGAMENTO';
  IF v_excecao AND (p_motivo IS NULL OR length(btrim(p_motivo)) < 5) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'EMBARQUE_MOTIVO_OBRIGATORIO',
      'mensagem', format('O pedido %s é de um tipo de saída que gera volume em %s, não no carregamento. Informe o motivo para gerar aqui (mínimo 5 caracteres).',
                         v_cd.numero_pedido, COALESCE(v_etapa, 'NENHUMA')));
  END IF;

  -- A14: NF já autorizada com outra quantidade
  v_div := public._fn_volume_nf_conferir(v_cd.documento_saida_id, p_quantidade);
  IF COALESCE((v_div->>'divergente')::boolean, false) AND v_div->>'regra' = 'BLOQUEAR' THEN
    RAISE EXCEPTION 'EMBARQUE_VOLUMES_DIVERGEM_NF: a NF % do pedido % informa % volume(s), e foram informados %. Gere a quantidade da NF ou peça a correção da NF.',
      COALESCE(v_div->>'nota_fiscal', '?'), v_cd.numero_pedido, v_div->>'nf_qtd_volumes', p_quantidade;
  END IF;

  FOR i IN 1..p_quantidade LOOP
    INSERT INTO volume_expedicao (tenant_id, empresa_id, movimento_saida_id, documento_saida_id, codigo_volume, numero_volume, status, created_by)
    VALUES (v_c.tenant_id, v_c.empresa_id, v_cd.movimento_saida_id, v_cd.documento_saida_id,
            'VOL-' || lpad(nextval('volume_expedicao_codigo_seq')::text, 6, '0'), i, 'ABERTO', v_u)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;
  PERFORM public._fn_carga_gerar_unidades(p_carga_id, ARRAY[v_cd.movimento_saida_id]);
  PERFORM public._fn_carga_recalcular(p_carga_id);
  PERFORM public._fn_carga_registrar_evento(p_carga_id, 'VOLUMES_GERADOS', v_u,
    jsonb_build_object('carga_documento_id', v_cd.id, 'documento_saida_id', v_cd.documento_saida_id,
                       'quantidade', p_quantidade, 'excecao', v_excecao, 'motivo', p_motivo));

  SELECT b.armazem_id INTO v_armazem FROM box b WHERE b.id = v_c.box_id;

  IF v_excecao THEN
    SELECT public.registrar_ocorrencia_operacional(
      p_tenant_id := v_c.tenant_id,
      p_empresa_id := v_c.empresa_id,
      p_armazem_id := v_armazem,
      p_tipo_ocorrencia := 'OUTROS',
      p_categoria := 'CORRETIVA',
      p_etapa_ocorrencia := 'EXPEDICAO',
      p_observacao := format('Volumes gerados no embarque fora da configuração: pedido %s, carga #%s, %s volume(s); tipo de saída gera volume em %s. Motivo: %s',
                             v_cd.numero_pedido, v_c.numero_carga, p_quantidade, COALESCE(v_etapa, 'NENHUMA'), btrim(p_motivo)),
      p_documento_origem_id := v_cd.documento_saida_id,
      p_tipo_documento_origem := 'DOCUMENTO_SAIDA',
      p_usuario_criador_id := v_u,
      p_usuario_causador_id := v_u,
      p_prioridade := 'NORMAL') INTO v_ocorr;
    IF NOT COALESCE((v_ocorr->>'sucesso')::boolean, false) THEN
      RAISE EXCEPTION 'EMBARQUE_OCORRENCIA_FALHOU: não foi possível registrar a ocorrência da exceção (%).', v_ocorr->>'mensagem';
    END IF;
  END IF;

  IF COALESCE((v_div->>'divergente')::boolean, false) AND v_div->>'regra' = 'AVISAR' THEN
    PERFORM public._fn_registrar_divergencia_volume_nf(
      v_div, v_c.tenant_id, v_c.empresa_id, v_armazem, v_u, format('na geração no embarque da carga #%s', v_c.numero_carga), true);
    v_aviso := format('Atenção: a NF %s informa %s volume(s); divergência registrada como ocorrência.',
                      COALESCE(v_div->>'nota_fiscal', '?'), v_div->>'nf_qtd_volumes');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', v.id, 'codigo_volume', v.codigo_volume, 'numero_volume', v.numero_volume,
           'total_volumes', p_quantidade, 'numero_pedido', v_cd.numero_pedido, 'numero_onda', v_cd.numero_onda) ORDER BY v.numero_volume)
    INTO v_vols FROM volume_expedicao v WHERE v.id = ANY(v_ids);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_VOLUMES_GERADOS',
    'mensagem', format('%s volume(s) gerado(s) para o pedido %s. Cole as etiquetas e bipe cada uma ao carregar.', p_quantidade, v_cd.numero_pedido)
                || CASE WHEN v_excecao THEN ' Exceção registrada como ocorrência.' ELSE '' END
                || COALESCE(' ' || v_aviso, ''),
    'avisos', CASE WHEN v_aviso IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('codigo', 'VOLUMES_DIVERGEM_NF', 'mensagem', v_aviso)) END,
    'dados', jsonb_build_object('volumes', v_vols, 'excecao', v_excecao));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $function$;

-- ============================================================
-- A14 no fechamento da carga
-- ============================================================
CREATE OR REPLACE FUNCTION public.embarque_fechar_carga(p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_u uuid; v_c record; v_pend integer; v_onda uuid; v_n integer := 0; v_faltam text;
        v_div jsonb; v_bloq text; v_aviso text;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  PERFORM public._fn_embarque_checar_responsavel(p_carga_id, v_u);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status = 'FECHADA' THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_JA_FECHADA', 'mensagem', format('Carga #%s já estava carregada.', v_c.numero_carga),
      'dados', public._fn_carga_detalhe(p_carga_id));
  END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em %.', v_c.numero_carga, v_c.status;
  END IF;
  SELECT count(*) INTO v_pend FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'PENDENTE';
  IF v_pend > 0 THEN
    RAISE EXCEPTION 'EMBARQUE_PENDENTE: ainda faltam % unidade(s) para embarcar.', v_pend;
  END IF;
  SELECT string_agg(COALESCE(ds.numero_pedido::text, ds.codigo_erp, '?'), ', ') INTO v_faltam
    FROM carga_documento cd JOIN documento_saida ds ON ds.id = cd.documento_saida_id
   WHERE cd.carga_id = p_carga_id AND cd.ativo
     AND NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_documento_id = cd.id AND cu.status <> 'CANCELADA');
  IF v_faltam IS NOT NULL THEN
    RAISE EXCEPTION 'EMBARQUE_PEDIDO_SEM_VOLUMES: gere e bipe os volumes do(s) pedido(s) %.', v_faltam;
  END IF;
  v_faltam := NULL;
  IF NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'EMBARCADA') THEN
    RAISE EXCEPTION 'EMBARQUE_PENDENTE: nenhuma unidade foi embarcada.';
  END IF;
  SELECT string_agg(x, ', ') INTO v_faltam
    FROM jsonb_array_elements_text(public._fn_carga_detalhe(p_carga_id) -> 'pendencias_fechamento') x;
  IF v_faltam IS NOT NULL THEN
    RAISE EXCEPTION 'CARGA_TERCEIRO_SEM_DADOS: para fechar uma carga de transportadora, informe: %.', lower(v_faltam);
  END IF;

  -- A14: volumes do WMS × NF de cada pedido da carga
  SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) INTO v_div
    FROM (SELECT DISTINCT cd.documento_saida_id FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo) x
   CROSS JOIN LATERAL public._fn_volume_nf_conferir(x.documento_saida_id) d
   WHERE COALESCE((d->>'divergente')::boolean, false) AND d->>'regra' <> 'IGNORAR';
  SELECT string_agg(format('pedido %s: %s no WMS, %s na NF %s', d->>'numero_pedido', d->>'wms_volumes', d->>'nf_qtd_volumes', COALESCE(d->>'nota_fiscal', '?')), '; ')
         FILTER (WHERE d->>'regra' = 'BLOQUEAR'),
         string_agg(format('pedido %s: %s no WMS, %s na NF %s', d->>'numero_pedido', d->>'wms_volumes', d->>'nf_qtd_volumes', COALESCE(d->>'nota_fiscal', '?')), '; ')
         FILTER (WHERE d->>'regra' = 'AVISAR')
    INTO v_bloq, v_aviso
    FROM jsonb_array_elements(v_div) d;
  IF v_bloq IS NOT NULL THEN
    RAISE EXCEPTION 'EMBARQUE_VOLUMES_DIVERGEM_NF: a quantidade de volumes não confere com a nota fiscal (%). Peça a correção da NF ou ajuste os volumes antes de fechar.', v_bloq;
  END IF;

  UPDATE carga SET status = 'FECHADA', fechada_em = now(), fechada_por = v_u, updated_by = v_u WHERE id = p_carga_id;
  FOR v_onda IN SELECT DISTINCT cd.movimento_saida_id FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo LOOP
    PERFORM public.fn_onda_concluir_etapa(p_tenant_id, v_onda, 3);
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_FECHADA',
    'mensagem', format('Carregamento da carga #%s concluído; %s onda(s) concluída(s).', v_c.numero_carga, v_n)
                || COALESCE(' Atenção, volumes diferentes da NF: ' || v_aviso || '.', ''),
    'avisos', CASE WHEN v_aviso IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('codigo', 'VOLUMES_DIVERGEM_NF', 'mensagem', 'Volumes diferentes da NF: ' || v_aviso)) END,
    'dados', public._fn_carga_detalhe(p_carga_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $function$;

-- ============================================================
-- Permissões: funções internas não ficam expostas pela API
-- ============================================================
REVOKE ALL ON FUNCTION public._fn_volume_nf_conferir(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_registrar_divergencia_volume_nf(jsonb, uuid, uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_documento_saida_nf_volume() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP TRIGGER IF EXISTS trg_documento_saida_nf_volume ON public.documento_saida_nf;
-- DROP FUNCTION IF EXISTS public.tg_documento_saida_nf_volume();
-- Reaplicar as definições guardadas:
--   SELECT definicao FROM ops.rollback_definicao WHERE migration = '20261115223000_etq_f3_nota_fiscal';
-- DROP FUNCTION IF EXISTS public._fn_registrar_divergencia_volume_nf(jsonb, uuid, uuid, uuid, uuid, text, boolean);
-- DROP FUNCTION IF EXISTS public._fn_volume_nf_conferir(uuid, integer);
-- (opcional) ALTER TABLE public.tipo_saida DROP COLUMN reimprime_volume_nf, DROP COLUMN divergencia_volume_nf;
