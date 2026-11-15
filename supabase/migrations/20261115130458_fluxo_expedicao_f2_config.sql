-- =====================================================================
-- Fluxo de Expedição — F2: configuração em níveis (por empresa)
-- Versão 1 · 2026-11-12
-- Cria a fonte única do roteiro (MOVIMENTO / SEPARACAO / CONFERENCIA / EMBARQUE),
-- limites, parâmetros de embarque, validação critério × nível,
-- RPCs de leitura/gravação e espelho do roteiro legado (tela antiga) até a F1.
-- Reversão: ver 20261112_fluxo_expedicao_f2_config_down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.enum_nivel_roteiro_saida AS ENUM ('MOVIMENTO','SEPARACAO','CONFERENCIA','EMBARQUE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.enum_criterio_roteiro_saida AS ENUM (
    'DOCUMENTO','PARCEIRO','ROTA',
    'ZONA_ATIVIDADE','TIPO_POSICAO','TIPO_SEPARACAO_SKU',
    'GRUPO_SEPARACAO','HU_VOLUME'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.enum_tipo_limite_roteiro AS ENUM ('MAX_SKU');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.enum_unidade_embarque AS ENUM ('VOLUME','HU','DOCUMENTO','CONFIRMACAO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2. MATRIZ CRITÉRIO × NÍVEL (regra única, usada por trigger e RPCs)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_roteiro_criterio_permitido(
  p_nivel public.enum_nivel_roteiro_saida,
  p_criterio public.enum_criterio_roteiro_saida)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_nivel
    WHEN 'MOVIMENTO'   THEN p_criterio IN ('DOCUMENTO','PARCEIRO','ROTA')
    WHEN 'SEPARACAO'   THEN p_criterio IN ('ZONA_ATIVIDADE','TIPO_POSICAO','TIPO_SEPARACAO_SKU')
    WHEN 'CONFERENCIA' THEN p_criterio IN ('GRUPO_SEPARACAO','HU_VOLUME')
    WHEN 'EMBARQUE'    THEN p_criterio IN ('ROTA','PARCEIRO')
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.fn_roteiro_criterio_permitido IS
  'Fluxo de Expedição: critérios aceitos por nível. Documento/Parceiro/Rota abaixo do movimento são herdados (cada onda já tem um único valor) e por isso não são gravados em SEPARACAO/CONFERENCIA.';

-- ---------------------------------------------------------------------
-- 3. TABELAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roteiro_saida_criterio (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id  uuid        NOT NULL REFERENCES public.empresa(id),
  nivel       public.enum_nivel_roteiro_saida     NOT NULL,
  criterio    public.enum_criterio_roteiro_saida  NOT NULL,
  sequencia   integer     NOT NULL CHECK (sequencia > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.usuario(id),
  updated_by  uuid        REFERENCES public.usuario(id),
  CONSTRAINT roteiro_saida_criterio_pkey PRIMARY KEY (id),
  CONSTRAINT roteiro_saida_criterio_unq UNIQUE (tenant_id, empresa_id, nivel, criterio),
  CONSTRAINT roteiro_saida_criterio_seq_unq UNIQUE (tenant_id, empresa_id, nivel, sequencia)
    DEFERRABLE INITIALLY DEFERRED
);
COMMENT ON TABLE public.roteiro_saida_criterio IS
  'Fluxo de Expedição: critérios de quebra por nível (MOVIMENTO, SEPARACAO, CONFERENCIA, EMBARQUE), por empresa. Sem critério no nível = unificar.';

CREATE TABLE IF NOT EXISTS public.roteiro_saida_limite (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id  uuid        NOT NULL REFERENCES public.empresa(id),
  nivel       public.enum_nivel_roteiro_saida  NOT NULL,
  tipo_limite public.enum_tipo_limite_roteiro  NOT NULL,
  valor       numeric     NOT NULL CHECK (valor > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.usuario(id),
  updated_by  uuid        REFERENCES public.usuario(id),
  CONSTRAINT roteiro_saida_limite_pkey PRIMARY KEY (id),
  CONSTRAINT roteiro_saida_limite_unq UNIQUE (tenant_id, empresa_id, nivel, tipo_limite),
  CONSTRAINT roteiro_saida_limite_nivel_chk CHECK (tipo_limite <> 'MAX_SKU' OR nivel = 'SEPARACAO')
);
COMMENT ON TABLE public.roteiro_saida_limite IS
  'Fluxo de Expedição: limites que rompem um grupo (ex.: MAX_SKU por grupo de separação).';

CREATE TABLE IF NOT EXISTS public.roteiro_saida_embarque (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id           uuid        NOT NULL REFERENCES public.empresa(id),
  unidade_embarque     public.enum_unidade_embarque NOT NULL DEFAULT 'CONFIRMACAO',
  template_romaneio_id uuid        REFERENCES public.etiqueta_template(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        REFERENCES public.usuario(id),
  updated_by           uuid        REFERENCES public.usuario(id),
  CONSTRAINT roteiro_saida_embarque_pkey PRIMARY KEY (id),
  CONSTRAINT roteiro_saida_embarque_unq UNIQUE (tenant_id, empresa_id)
);
COMMENT ON TABLE public.roteiro_saida_embarque IS
  'Fluxo de Expedição: parâmetros do embarque por empresa (unidade bipada, modelo do romaneio).';

-- Índices (o UNIQUE já cobre tenant+empresa como prefixo; empresa isolado para FK)
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_criterio_empresa ON public.roteiro_saida_criterio(empresa_id);
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_limite_empresa   ON public.roteiro_saida_limite(empresa_id);
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_embarque_empresa ON public.roteiro_saida_embarque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_embarque_template ON public.roteiro_saida_embarque(template_romaneio_id);
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_criterio_created_by ON public.roteiro_saida_criterio(created_by);
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_criterio_updated_by ON public.roteiro_saida_criterio(updated_by);
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_limite_created_by ON public.roteiro_saida_limite(created_by);
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_limite_updated_by ON public.roteiro_saida_limite(updated_by);
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_embarque_created_by ON public.roteiro_saida_embarque(created_by);
CREATE INDEX IF NOT EXISTS idx_roteiro_saida_embarque_updated_by ON public.roteiro_saida_embarque(updated_by);

-- ---------------------------------------------------------------------
-- 4. RLS (mesmo padrão de ordem_expedicao: get_current_tenant)
-- ---------------------------------------------------------------------
ALTER TABLE public.roteiro_saida_criterio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roteiro_saida_limite   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roteiro_saida_embarque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roteiro_saida_criterio_tenant ON public.roteiro_saida_criterio;
CREATE POLICY roteiro_saida_criterio_tenant ON public.roteiro_saida_criterio
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_current_tenant()))
  WITH CHECK (tenant_id = (SELECT public.get_current_tenant()));

DROP POLICY IF EXISTS roteiro_saida_limite_tenant ON public.roteiro_saida_limite;
CREATE POLICY roteiro_saida_limite_tenant ON public.roteiro_saida_limite
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_current_tenant()))
  WITH CHECK (tenant_id = (SELECT public.get_current_tenant()));

DROP POLICY IF EXISTS roteiro_saida_embarque_tenant ON public.roteiro_saida_embarque;
CREATE POLICY roteiro_saida_embarque_tenant ON public.roteiro_saida_embarque
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_current_tenant()))
  WITH CHECK (tenant_id = (SELECT public.get_current_tenant()));

REVOKE ALL ON public.roteiro_saida_criterio, public.roteiro_saida_limite, public.roteiro_saida_embarque FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roteiro_saida_criterio, public.roteiro_saida_limite, public.roteiro_saida_embarque TO authenticated;

-- ---------------------------------------------------------------------
-- 5. TRIGGERS (auditoria, updated_at, empresa do usuário, validação)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_roteiro_saida_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tipos text;
BEGIN
  -- empresa precisa ser do mesmo tenant (impede cruzar tenants via empresa_id)
  IF NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = NEW.empresa_id AND e.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'ROTEIRO_EMPRESA_INVALIDA: empresa não pertence ao tenant.' USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_by := COALESCE(public.fn_audit_usuario_atual(), NEW.updated_by);

  IF TG_TABLE_NAME = 'roteiro_saida_criterio' THEN
    IF NOT public.fn_roteiro_criterio_permitido(NEW.nivel, NEW.criterio) THEN
      RAISE EXCEPTION 'ROTEIRO_CRITERIO_NIVEL_INVALIDO: o critério % não é aceito no nível %.', NEW.criterio, NEW.nivel
        USING ERRCODE = 'P0001';
    END IF;

    -- regra herdada da tela antiga: zona na separação não convive com reserva do movimento inteiro
    IF NEW.nivel = 'SEPARACAO' AND NEW.criterio = 'ZONA_ATIVIDADE' THEN
      SELECT string_agg(ts.descricao, ', ' ORDER BY ts.descricao) INTO v_tipos
      FROM tipo_saida ts
      WHERE ts.tenant_id = NEW.tenant_id
        AND COALESCE(ts.ativo, true)
        AND COALESCE(ts.reserva_separacao_movimento, true)
        AND (ts.empresa_id IS NULL OR ts.empresa_id = NEW.empresa_id);
      IF v_tipos IS NOT NULL THEN
        RAISE EXCEPTION 'ROTEIRO_ZONA_CONFLITO_RESERVA: Estes tipos de saída reservam todo o movimento na separação: %. Desmarque a reserva neles antes de usar zona de atividade no roteiro.', v_tipos
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['roteiro_saida_criterio','roteiro_saida_limite','roteiro_saida_embarque'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_criacao ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_criacao BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_criacao()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_validar_empresa_usuario BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_roteiro_saida_validar ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_roteiro_saida_validar BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_roteiro_saida_validar()', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6. ESPELHO DO ROTEIRO LEGADO (até a F1 trocar a tela)
--    agrupamento_separacao  -> MOVIMENTO (só DOCUMENTO/PARCEIRO/ROTA)
--    agrupamento_conferencia -> CONFERENCIA (HU -> HU_VOLUME; o resto é herdado/sem efeito)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_roteiro_sync_legado(p_tenant_id uuid, p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM roteiro_saida_criterio
   WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
     AND nivel IN ('MOVIMENTO','CONFERENCIA');

  INSERT INTO roteiro_saida_criterio (tenant_id, empresa_id, nivel, criterio, sequencia)
  SELECT p_tenant_id, p_empresa_id, 'MOVIMENTO', x.criterio,
         ROW_NUMBER() OVER (ORDER BY x.seq)
  FROM (
    SELECT a.tipo_agrupamento::text::public.enum_criterio_roteiro_saida AS criterio,
           MIN(COALESCE(a.sequencia, 999)) AS seq
    FROM agrupamento_separacao a
    WHERE a.tenant_id = p_tenant_id AND a.empresa_id = p_empresa_id
      AND a.tipo_agrupamento::text IN ('DOCUMENTO','PARCEIRO','ROTA')
    GROUP BY 1
  ) x;

  INSERT INTO roteiro_saida_criterio (tenant_id, empresa_id, nivel, criterio, sequencia)
  SELECT p_tenant_id, p_empresa_id, 'CONFERENCIA', 'HU_VOLUME', 1
  WHERE EXISTS (SELECT 1 FROM agrupamento_conferencia c
                WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id
                  AND c.tipo_agrupamento::text = 'HU');
END;
$$;
REVOKE ALL ON FUNCTION public.fn_roteiro_sync_legado(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_roteiro_sync_legado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.fn_roteiro_sync_legado(OLD.tenant_id, OLD.empresa_id);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.fn_roteiro_sync_legado(NEW.tenant_id, NEW.empresa_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_roteiro_sync_legado ON public.agrupamento_separacao;
CREATE TRIGGER trg_roteiro_sync_legado AFTER INSERT OR UPDATE OR DELETE ON public.agrupamento_separacao
  FOR EACH ROW EXECUTE FUNCTION public.tg_roteiro_sync_legado();
DROP TRIGGER IF EXISTS trg_roteiro_sync_legado ON public.agrupamento_conferencia;
CREATE TRIGGER trg_roteiro_sync_legado AFTER INSERT OR UPDATE OR DELETE ON public.agrupamento_conferencia
  FOR EACH ROW EXECUTE FUNCTION public.tg_roteiro_sync_legado();

-- Carga inicial a partir do legado (todas as empresas que já têm roteiro)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT tenant_id, empresa_id FROM agrupamento_separacao WHERE tenant_id IS NOT NULL AND empresa_id IS NOT NULL
    UNION
    SELECT DISTINCT tenant_id, empresa_id FROM agrupamento_conferencia WHERE tenant_id IS NOT NULL AND empresa_id IS NOT NULL
  LOOP
    PERFORM public.fn_roteiro_sync_legado(r.tenant_id, r.empresa_id);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 7. RPC: OBTER (configuração completa + herdados + quebras fixas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roteiro_saida_obter(p_tenant_id uuid, p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mov jsonb; v_sep jsonb; v_conf jsonb; v_emb jsonb; v_lim jsonb; v_emb_cfg jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ROTEIRO_EMPRESA_INVALIDA',
      'mensagem', 'Empresa não encontrada neste tenant.');
  END IF;

  SELECT
    COALESCE(jsonb_agg(criterio ORDER BY sequencia) FILTER (WHERE nivel = 'MOVIMENTO'),   '[]'),
    COALESCE(jsonb_agg(criterio ORDER BY sequencia) FILTER (WHERE nivel = 'SEPARACAO'),   '[]'),
    COALESCE(jsonb_agg(criterio ORDER BY sequencia) FILTER (WHERE nivel = 'CONFERENCIA'), '[]'),
    COALESCE(jsonb_agg(criterio ORDER BY sequencia) FILTER (WHERE nivel = 'EMBARQUE'),    '[]')
  INTO v_mov, v_sep, v_conf, v_emb
  FROM roteiro_saida_criterio
  WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id;

  SELECT COALESCE(jsonb_object_agg(lower(nivel::text) || '.' || tipo_limite::text, valor), '{}')
  INTO v_lim
  FROM roteiro_saida_limite
  WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id;

  SELECT jsonb_build_object('unidade_embarque', unidade_embarque, 'template_romaneio_id', template_romaneio_id)
  INTO v_emb_cfg
  FROM roteiro_saida_embarque
  WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id;

  RETURN jsonb_build_object(
    'sucesso', true, 'codigo', 'OK', 'mensagem', 'Roteiro carregado.',
    'dados', jsonb_build_object(
      'quebras_fixas', jsonb_build_array('EMPRESA','TIPO_SAIDA'),
      'movimento',   v_mov,
      'separacao',   v_sep,
      'conferencia', v_conf,
      'embarque',    v_emb,
      'herdados',    v_mov,
      'limites',     v_lim,
      'embarque_config', COALESCE(v_emb_cfg, jsonb_build_object('unidade_embarque','CONFIRMACAO','template_romaneio_id',NULL)),
      'criterios_permitidos', jsonb_build_object(
        'movimento',   jsonb_build_array('DOCUMENTO','PARCEIRO','ROTA'),
        'separacao',   jsonb_build_array('ZONA_ATIVIDADE','TIPO_POSICAO','TIPO_SEPARACAO_SKU'),
        'conferencia', jsonb_build_array('GRUPO_SEPARACAO','HU_VOLUME'),
        'embarque',    jsonb_build_array('ROTA','PARCEIRO'))
    ));
END;
$$;
REVOKE ALL ON FUNCTION public.roteiro_saida_obter(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roteiro_saida_obter(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. RPC: SALVAR (atômico, renumera, valida; substitui N updates da tela)
--    p_config = {
--      "movimento":["ROTA","PARCEIRO"], "separacao":["ZONA_ATIVIDADE"],
--      "conferencia":["GRUPO_SEPARACAO"], "embarque":["ROTA"],
--      "limites":{"separacao":{"MAX_SKU":40}},
--      "embarque_config":{"unidade_embarque":"VOLUME","template_romaneio_id":null}
--    }
--    Chave ausente = nível não alterado. Lista vazia = unificar.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.roteiro_saida_salvar(p_tenant_id uuid, p_empresa_id uuid, p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nivel   text;
  v_item    jsonb;
  v_crit    public.enum_criterio_roteiro_saida;
  v_seq     integer;
  v_avisos  jsonb := '[]'::jsonb;
  v_sep_qtd integer;
  v_max_sku numeric;
  v_unid    text;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF p_empresa_id IS NULL OR NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ROTEIRO_EMPRESA_INVALIDA',
      'mensagem', 'Empresa não encontrada neste tenant.');
  END IF;

  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ROTEIRO_CONFIG_INVALIDA',
      'mensagem', 'Configuração ausente ou em formato inválido.');
  END IF;

  -- Critérios por nível
  FOREACH v_nivel IN ARRAY ARRAY['movimento','separacao','conferencia','embarque'] LOOP
    CONTINUE WHEN NOT (p_config ? v_nivel);

    IF jsonb_typeof(p_config -> v_nivel) <> 'array' THEN
      RAISE EXCEPTION 'ROTEIRO_CONFIG_INVALIDA: "%" deve ser uma lista.', v_nivel USING ERRCODE = 'P0001';
    END IF;

    IF (SELECT COUNT(*) <> COUNT(DISTINCT value) FROM jsonb_array_elements_text(p_config -> v_nivel)) THEN
      RAISE EXCEPTION 'ROTEIRO_CRITERIO_DUPLICADO: há critério repetido em "%".', v_nivel USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM roteiro_saida_criterio
     WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
       AND nivel = upper(v_nivel)::public.enum_nivel_roteiro_saida;

    v_seq := 0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_config -> v_nivel) LOOP
      v_seq := v_seq + 1;
      BEGIN
        v_crit := (v_item #>> '{}')::public.enum_criterio_roteiro_saida;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'ROTEIRO_CRITERIO_DESCONHECIDO: critério "%" não existe.', v_item #>> '{}' USING ERRCODE = 'P0001';
      END;

      IF upper(v_nivel) IN ('SEPARACAO','CONFERENCIA') AND v_crit IN ('DOCUMENTO','PARCEIRO','ROTA') THEN
        RAISE EXCEPTION 'ROTEIRO_CRITERIO_HERDADO: % só vale abaixo do movimento quando está no nível Movimento, e nesse caso já é herdado.', v_crit
          USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO roteiro_saida_criterio (tenant_id, empresa_id, nivel, criterio, sequencia)
      VALUES (p_tenant_id, p_empresa_id, upper(v_nivel)::public.enum_nivel_roteiro_saida, v_crit, v_seq);
    END LOOP;
  END LOOP;

  -- Limites
  IF p_config ? 'limites' THEN
    DELETE FROM roteiro_saida_limite WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id;
    v_max_sku := NULLIF(p_config #>> '{limites,separacao,MAX_SKU}', '')::numeric;
    IF v_max_sku IS NOT NULL THEN
      IF v_max_sku <= 0 OR v_max_sku <> trunc(v_max_sku) THEN
        RAISE EXCEPTION 'ROTEIRO_LIMITE_INVALIDO: o máximo de SKUs deve ser um número inteiro maior que zero.' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO roteiro_saida_limite (tenant_id, empresa_id, nivel, tipo_limite, valor)
      VALUES (p_tenant_id, p_empresa_id, 'SEPARACAO', 'MAX_SKU', v_max_sku);
    END IF;
  END IF;

  -- Parâmetros de embarque
  IF p_config ? 'embarque_config' THEN
    v_unid := COALESCE(p_config #>> '{embarque_config,unidade_embarque}', 'CONFIRMACAO');
    BEGIN
      INSERT INTO roteiro_saida_embarque (tenant_id, empresa_id, unidade_embarque, template_romaneio_id)
      VALUES (p_tenant_id, p_empresa_id, v_unid::public.enum_unidade_embarque,
              NULLIF(p_config #>> '{embarque_config,template_romaneio_id}', '')::uuid)
      ON CONFLICT (tenant_id, empresa_id) DO UPDATE
        SET unidade_embarque = EXCLUDED.unidade_embarque,
            template_romaneio_id = EXCLUDED.template_romaneio_id;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'ROTEIRO_UNIDADE_EMBARQUE_INVALIDA: unidade "%" não existe.', v_unid USING ERRCODE = 'P0001';
    END;
  END IF;

  -- Coerência entre níveis
  SELECT COUNT(*) INTO v_sep_qtd FROM roteiro_saida_criterio
   WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id AND nivel = 'SEPARACAO';

  IF v_sep_qtd = 0 AND EXISTS (SELECT 1 FROM roteiro_saida_criterio
      WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
        AND nivel = 'CONFERENCIA' AND criterio = 'GRUPO_SEPARACAO') THEN
    RAISE EXCEPTION 'ROTEIRO_DEPENDENCIA: conferir por Grupo de separação exige ao menos um critério no nível Separação.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM roteiro_saida_criterio
      WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
        AND nivel = 'CONFERENCIA' AND criterio = 'HU_VOLUME')
     AND EXISTS (SELECT 1 FROM tipo_saida ts
      WHERE ts.tenant_id = p_tenant_id AND COALESCE(ts.ativo, true)
        AND (ts.empresa_id IS NULL OR ts.empresa_id = p_empresa_id)
        AND COALESCE(ts.realiza_conferencia, false)
        AND COALESCE(ts.gera_volume_etapa::text, 'NENHUMA') = 'NENHUMA') THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'ROTEIRO_AVISO_SEM_VOLUME',
      'mensagem', 'Há tipos de saída que conferem mas não geram volume; neles a conferência por HU/Volume volta a ser pelo movimento inteiro.');
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ROTEIRO_SALVO',
    'mensagem', 'Roteiro salvo.',
    'avisos', v_avisos,
    'dados', public.roteiro_saida_obter(p_tenant_id, p_empresa_id) -> 'dados');

EXCEPTION
  WHEN raise_exception OR unique_violation OR check_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object('sucesso', false,
      'codigo', COALESCE(NULLIF(split_part(SQLERRM, ':', 1), SQLERRM), 'ROTEIRO_ERRO_VALIDACAO'),
      'mensagem', SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION public.roteiro_saida_salvar(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roteiro_saida_salvar(uuid, uuid, jsonb) TO authenticated, service_role;
