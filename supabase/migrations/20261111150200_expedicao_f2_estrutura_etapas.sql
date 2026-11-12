-- =============================================================================
-- Expedição por etapas — Fase 2: estrutura (regras R2, R3 e R9 do plano)
--   * tipo_saida.permite_mesmo_operador_sep_conf
--   * movimento_saida_etapa       -> modo de cada etapa gravado na onda
--   * movimento_saida_responsavel -> quem o gestor convocou para cada etapa
--   * validação roteiro por zona x reserva de separação
--   * funções de leitura do modo da etapa
-- Reversão: DROP das duas tabelas, das funções e gatilhos criados aqui e da coluna nova.
-- =============================================================================

-- 1. Parâmetro R9
ALTER TABLE public.tipo_saida
  ADD COLUMN IF NOT EXISTS permite_mesmo_operador_sep_conf boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.tipo_saida.permite_mesmo_operador_sep_conf IS
  'FALSE: quem separou a onda não pode conferi-la.';

-- 2. Modo da etapa gravado na onda (R2)
CREATE TABLE IF NOT EXISTS public.movimento_saida_etapa (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES public.tenant(id),
  empresa_id             uuid NOT NULL REFERENCES public.empresa(id),
  movimento_saida_id     uuid NOT NULL REFERENCES public.movimento_saida(id) ON DELETE CASCADE,
  tipo_tarefa_id         uuid NOT NULL REFERENCES public.tipo_tarefa(id),
  modo                   text NOT NULL CHECK (modo IN ('EXCLUSIVA', 'COMPARTILHADA')),
  ativa                  boolean NOT NULL DEFAULT true,
  por_zona               boolean NOT NULL DEFAULT false,
  permite_mesmo_operador boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES public.usuario(id) ON DELETE SET NULL,
  CONSTRAINT uq_movimento_saida_etapa UNIQUE (movimento_saida_id, tipo_tarefa_id)
);
COMMENT ON TABLE public.movimento_saida_etapa IS
  'Modo de cada etapa (EXCLUSIVA/COMPARTILHADA), gravado na liberação da onda. Mudanças no tipo de saída só valem para ondas liberadas depois.';

-- 3. Convocação manual pelo gestor (R1 / R1.1)
CREATE TABLE IF NOT EXISTS public.movimento_saida_responsavel (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenant(id),
  empresa_id         uuid NOT NULL REFERENCES public.empresa(id),
  movimento_saida_id uuid NOT NULL REFERENCES public.movimento_saida(id) ON DELETE CASCADE,
  tipo_tarefa_id     uuid NOT NULL REFERENCES public.tipo_tarefa(id),
  usuario_id         uuid NOT NULL REFERENCES public.usuario(id),
  ativo              boolean NOT NULL DEFAULT true,
  definido_por       uuid REFERENCES public.usuario(id) ON DELETE SET NULL,
  definido_em        timestamptz NOT NULL DEFAULT now(),
  removido_por       uuid REFERENCES public.usuario(id) ON DELETE SET NULL,
  removido_em        timestamptz,
  observacao         text,
  CONSTRAINT ck_msr_removido CHECK (ativo OR removido_em IS NOT NULL)
);
COMMENT ON TABLE public.movimento_saida_responsavel IS
  'Operadores convocados pelo gestor para uma etapa da onda. Histórico: linhas nunca são apagadas, só inativadas.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_msr_ativo
  ON public.movimento_saida_responsavel (movimento_saida_id, tipo_tarefa_id, usuario_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_msr_onda_ativo
  ON public.movimento_saida_responsavel (movimento_saida_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_msr_usuario_ativo
  ON public.movimento_saida_responsavel (usuario_id) WHERE ativo;

-- RLS: leitura por tenant; escrita só pelas RPCs (SECURITY DEFINER)
ALTER TABLE public.movimento_saida_etapa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimento_saida_responsavel ENABLE ROW LEVEL SECURITY;

CREATE POLICY mse_leitura_tenant ON public.movimento_saida_etapa
  FOR SELECT TO authenticated USING (tenant_id = public.get_current_tenant());

CREATE POLICY msr_leitura_tenant ON public.movimento_saida_responsavel
  FOR SELECT TO authenticated USING (tenant_id = public.get_current_tenant());

-- 4. R3: roteiro com ZONA_ATIVIDADE exige reserva de separação desmarcada
CREATE OR REPLACE FUNCTION public.tg_tipo_saida_valida_zona()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.reserva_separacao_movimento, true) AND COALESCE(NEW.ativo, true)
     AND EXISTS (SELECT 1 FROM agrupamento_separacao a
                 WHERE a.tenant_id = NEW.tenant_id
                   AND (NEW.empresa_id IS NULL OR a.empresa_id IS NULL OR a.empresa_id = NEW.empresa_id)
                   AND a.tipo_agrupamento = 'ZONA_ATIVIDADE') THEN
    RAISE EXCEPTION 'ROTEIRO_ZONA_EXIGE_SEM_RESERVA: O roteiro de separação desta empresa usa zona de atividade. Desmarque "Reserva todo o movimento na separação" neste tipo de saída.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_tipo_saida_valida_zona() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tipo_saida_valida_zona
  BEFORE INSERT OR UPDATE OF reserva_separacao_movimento, ativo ON public.tipo_saida
  FOR EACH ROW EXECUTE FUNCTION public.tg_tipo_saida_valida_zona();

CREATE OR REPLACE FUNCTION public.tg_agrupamento_separacao_valida_zona()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tipos text;
BEGIN
  IF NEW.tipo_agrupamento = 'ZONA_ATIVIDADE' THEN
    SELECT string_agg(ts.descricao, ', ' ORDER BY ts.descricao) INTO v_tipos
    FROM tipo_saida ts
    WHERE ts.tenant_id = NEW.tenant_id
      AND COALESCE(ts.ativo, true)
      AND COALESCE(ts.reserva_separacao_movimento, true)
      AND (NEW.empresa_id IS NULL OR ts.empresa_id IS NULL OR ts.empresa_id = NEW.empresa_id);
    IF v_tipos IS NOT NULL THEN
      RAISE EXCEPTION 'ROTEIRO_ZONA_CONFLITO_RESERVA: Estes tipos de saída reservam todo o movimento na separação: %. Desmarque a reserva neles antes de usar zona de atividade no roteiro.', v_tipos
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_agrupamento_separacao_valida_zona() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_agrupamento_separacao_valida_zona
  BEFORE INSERT OR UPDATE OF tipo_agrupamento ON public.agrupamento_separacao
  FOR EACH ROW EXECUTE FUNCTION public.tg_agrupamento_separacao_valida_zona();

-- 5. Cálculo do modo da etapa a partir da configuração atual (usado no snapshot e como fallback)
CREATE OR REPLACE FUNCTION public._fn_onda_etapa_calcular(p_movimento_saida_id uuid, p_tipo_tarefa_id uuid)
RETURNS TABLE (modo text, ativa boolean, por_zona boolean, permite_mesmo_operador boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant uuid; v_empresa uuid; v_tipo_saida uuid; v_codigo text;
  v_res_sep boolean; v_res_conf boolean; v_realiza_ts boolean; v_permite boolean;
  v_zona boolean; v_realiza_docs boolean;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id, ms.tipo_saida INTO v_tenant, v_empresa, v_tipo_saida
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt
  WHERE tt.id = p_tipo_tarefa_id AND tt.tenant_id = v_tenant;

  SELECT ts.reserva_separacao_movimento, ts.reserva_conferencia_movimento,
         ts.realiza_conferencia, ts.permite_mesmo_operador_sep_conf
    INTO v_res_sep, v_res_conf, v_realiza_ts, v_permite
  FROM tipo_saida ts WHERE ts.id = v_tipo_saida;

  v_zona := EXISTS (SELECT 1 FROM agrupamento_separacao a
                    WHERE a.tenant_id = v_tenant
                      AND (a.empresa_id IS NULL OR a.empresa_id = v_empresa)
                      AND a.tipo_agrupamento = 'ZONA_ATIVIDADE');

  IF v_codigo = 'SEP' THEN
    RETURN QUERY SELECT
      CASE WHEN v_zona OR NOT COALESCE(v_res_sep, true) THEN 'COMPARTILHADA' ELSE 'EXCLUSIVA' END,
      true, v_zona, true;
  ELSIF v_codigo = 'SEP-CONF' THEN
    SELECT bool_or(ts.realiza_conferencia) INTO v_realiza_docs
    FROM movimento_saida_documento msd
    JOIN documento_saida ds ON ds.id = msd.documento_saida_id
    JOIN tipo_saida ts      ON ts.id = ds.tipo_pedido_id
    WHERE msd.movimento_saida_id = p_movimento_saida_id;
    RETURN QUERY SELECT
      CASE WHEN COALESCE(v_res_conf, true) THEN 'EXCLUSIVA' ELSE 'COMPARTILHADA' END,
      COALESCE(v_realiza_docs, v_realiza_ts, true), false, COALESCE(v_permite, true);
  ELSE
    RETURN QUERY SELECT 'EXCLUSIVA'::text, true, false, true;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._fn_onda_etapa_calcular(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 6. Leitura única do modo da etapa: gravado na onda; sem gravação, calcula na hora
CREATE OR REPLACE FUNCTION public.fn_onda_etapa_info(p_movimento_saida_id uuid, p_tipo_tarefa_id uuid)
RETURNS TABLE (modo text, ativa boolean, por_zona boolean, permite_mesmo_operador boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT e.modo, e.ativa, e.por_zona, e.permite_mesmo_operador
  FROM movimento_saida_etapa e
  WHERE e.movimento_saida_id = p_movimento_saida_id AND e.tipo_tarefa_id = p_tipo_tarefa_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT * FROM public._fn_onda_etapa_calcular(p_movimento_saida_id, p_tipo_tarefa_id);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_onda_etapa_info(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 7. Grava o modo de todas as etapas da onda (idempotente: mantém a primeira gravação)
CREATE OR REPLACE FUNCTION public.fn_onda_snapshot_etapas(p_movimento_saida_id uuid, p_usuario_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO movimento_saida_etapa (tenant_id, empresa_id, movimento_saida_id, tipo_tarefa_id,
                                     modo, ativa, por_zona, permite_mesmo_operador, created_by)
  SELECT ms.tenant_id, ms.empresa_id, ms.id, tt.id, c.modo, c.ativa, c.por_zona, c.permite_mesmo_operador, p_usuario_id
  FROM movimento_saida ms
  JOIN tipo_tarefa tt ON tt.tenant_id = ms.tenant_id AND tt.etapa_onda_ordem IS NOT NULL
  CROSS JOIN LATERAL public._fn_onda_etapa_calcular(ms.id, tt.id) c
  WHERE ms.id = p_movimento_saida_id
  ON CONFLICT (movimento_saida_id, tipo_tarefa_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.fn_onda_snapshot_etapas(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 8. Carga: ondas já liberadas e ainda abertas recebem o modo atual do tipo de saída
SELECT public.fn_onda_snapshot_etapas(ms.id)
FROM movimento_saida ms
WHERE ms.status IN ('LIBERADO', 'EM_PICKING', 'SEPARADO', 'EM_CONFERENCIA', 'CONFERIDO', 'EM_CARREGAMENTO');
