-- =============================================================================
-- Expedição por etapas — Fase 1: saneamento de tarefa_atribuicao
-- Plano: "Plano — Reatribuição de tarefas e fluxo de expedição por etapas" (11/11/2026)
--
-- Escopo: somente tarefas de etapas de onda (SEP / SEP-CONF). Os status legados
-- de outros módulos (ATIVO, FINALIZADO, COLETA_PENDENTE) continuam aceitos.
--
-- Reversão:
--   1. UPDATE tarefa_atribuicao ta SET status = b.status, liberado_em = b.liberado_em,
--        motivo_liberacao = NULL, liberado_por = NULL
--      FROM bkp_tarefa_atribuicao_20261111 b WHERE b.id = ta.id;
--   2. DROP TRIGGER trg_tarefa_encerrar_atribuicao ON tarefa;
--   3. DROP INDEX uq_tarefa_atribuicao_dono_aberto;
--      ALTER TABLE tarefa_atribuicao ADD CONSTRAINT uq_tarefa_atribuicao_tarefa_usuario UNIQUE (tarefa_id, usuario_id);
--   4. ALTER TABLE tarefa_atribuicao DROP CONSTRAINT ck_tarefa_atribuicao_status,
--        DROP CONSTRAINT ck_tarefa_atribuicao_aberta, DROP CONSTRAINT ck_tarefa_atribuicao_motivo;
-- =============================================================================

-- 1. Backup do estado atual (somente service_role lê: RLS ligada e sem policy)
CREATE TABLE IF NOT EXISTS public.bkp_tarefa_atribuicao_20261111 AS
SELECT id, tarefa_id, usuario_id, status, liberado_em, now() AS backup_em
FROM public.tarefa_atribuicao;
ALTER TABLE public.bkp_tarefa_atribuicao_20261111 ENABLE ROW LEVEL SECURITY;

-- 2. Novas colunas de rastreabilidade da liberação
ALTER TABLE public.tarefa_atribuicao
  ADD COLUMN IF NOT EXISTS liberado_por uuid REFERENCES public.usuario(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_liberacao text;

COMMENT ON COLUMN public.tarefa_atribuicao.liberado_por IS 'Quem encerrou a atribuição (gestor, o próprio operador ou NULL quando automático).';
COMMENT ON COLUMN public.tarefa_atribuicao.motivo_liberacao IS 'REATRIBUICAO | DEVOLUCAO_FILA | CONCLUSAO | CANCELAMENTO | SANEAMENTO';

-- 3. Etapas de onda em tipo_tarefa (SEP = 1, SEP-CONF = 2; futuro EMB = 3)
ALTER TABLE public.tipo_tarefa ADD COLUMN IF NOT EXISTS etapa_onda_ordem smallint;
COMMENT ON COLUMN public.tipo_tarefa.etapa_onda_ordem IS 'Ordem da etapa na onda de carregamento. NULL = não é etapa de onda.';

UPDATE public.tipo_tarefa
   SET etapa_onda_ordem = CASE codigo WHEN 'SEP' THEN 1 WHEN 'SEP-CONF' THEN 2 END
 WHERE codigo IN ('SEP', 'SEP-CONF') AND etapa_onda_ordem IS NULL;

CREATE OR REPLACE FUNCTION public.tg_tipo_tarefa_etapa_onda_padrao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.etapa_onda_ordem IS NULL THEN
    NEW.etapa_onda_ordem := CASE NEW.codigo WHEN 'SEP' THEN 1 WHEN 'SEP-CONF' THEN 2 END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tipo_tarefa_etapa_onda ON public.tipo_tarefa;
CREATE TRIGGER trg_tipo_tarefa_etapa_onda
  BEFORE INSERT ON public.tipo_tarefa
  FOR EACH ROW EXECUTE FUNCTION public.tg_tipo_tarefa_etapa_onda_padrao();

-- 4. Encerra atribuições abertas de tarefas de expedição já concluídas/canceladas
UPDATE public.tarefa_atribuicao ta
   SET status           = CASE WHEN t.status = 'CANCELADA' THEN 'CANCELADA' ELSE 'FINALIZADA' END,
       liberado_em      = GREATEST(ta.atribuido_em, COALESCE(t.concluido_em, now())),
       motivo_liberacao = CASE WHEN t.status = 'CANCELADA' THEN 'CANCELAMENTO' ELSE 'CONCLUSAO' END
  FROM public.tarefa t
  JOIN public.tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
 WHERE ta.tarefa_id = t.id
   AND ta.liberado_em IS NULL
   AND tt.etapa_onda_ordem IS NOT NULL
   AND t.status IN ('CONCLUIDA', 'CANCELADA', 'AUDITADA');

-- 5. Tarefas com mais de um dono aberto: mantém a atribuição mais recente
WITH r AS (
  SELECT id, row_number() OVER (PARTITION BY tarefa_id
                                ORDER BY atribuido_em DESC, created_at DESC NULLS LAST, id) AS rn
  FROM public.tarefa_atribuicao
  WHERE liberado_em IS NULL
)
UPDATE public.tarefa_atribuicao ta
   SET status = 'LIBERADA', liberado_em = now(), motivo_liberacao = 'SANEAMENTO'
  FROM r
 WHERE r.id = ta.id AND r.rn > 1;

-- 6. Coerência entre status e liberado_em
UPDATE public.tarefa_atribuicao
   SET status = 'LIBERADA', motivo_liberacao = COALESCE(motivo_liberacao, 'SANEAMENTO')
 WHERE liberado_em IS NOT NULL AND status IN ('ATRIBUIDA', 'ATIVO', 'COLETA_PENDENTE');

UPDATE public.tarefa_atribuicao
   SET liberado_em = now(), motivo_liberacao = COALESCE(motivo_liberacao, 'SANEAMENTO')
 WHERE liberado_em IS NULL AND status NOT IN ('ATRIBUIDA', 'ATIVO', 'COLETA_PENDENTE');

-- 7. Regras de integridade
ALTER TABLE public.tarefa_atribuicao
  DROP CONSTRAINT IF EXISTS ck_tarefa_atribuicao_status,
  DROP CONSTRAINT IF EXISTS ck_tarefa_atribuicao_aberta,
  DROP CONSTRAINT IF EXISTS ck_tarefa_atribuicao_motivo;

ALTER TABLE public.tarefa_atribuicao
  ADD CONSTRAINT ck_tarefa_atribuicao_status CHECK (status IN
      ('ATRIBUIDA', 'ATIVO', 'COLETA_PENDENTE', 'LIBERADA', 'FINALIZADA', 'FINALIZADO', 'CANCELADA')),
  ADD CONSTRAINT ck_tarefa_atribuicao_aberta CHECK
      ((liberado_em IS NULL) = (status IN ('ATRIBUIDA', 'ATIVO', 'COLETA_PENDENTE'))),
  ADD CONSTRAINT ck_tarefa_atribuicao_motivo CHECK (motivo_liberacao IS NULL OR motivo_liberacao IN
      ('REATRIBUICAO', 'DEVOLUCAO_FILA', 'CONCLUSAO', 'CANCELAMENTO', 'SANEAMENTO'));

-- 8. Dono único: sai (tarefa + operador), entra "uma tarefa, um dono aberto"
ALTER TABLE public.tarefa_atribuicao DROP CONSTRAINT IF EXISTS uq_tarefa_atribuicao_tarefa_usuario;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tarefa_atribuicao_dono_aberto
  ON public.tarefa_atribuicao (tarefa_id) WHERE liberado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_tarefa_atribuicao_usuario_aberta
  ON public.tarefa_atribuicao (usuario_id) WHERE liberado_em IS NULL;

-- conferencia_buscar_tarefas usava a constraint antiga no ON CONFLICT.
-- Ajuste mínimo aqui; a função é reescrita na migration de rotinas do coletor.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'conferencia_buscar_tarefas';
  IF v_def IS NOT NULL AND v_def LIKE '%uq_tarefa_atribuicao_tarefa_usuario%' THEN
    EXECUTE replace(v_def, 'ON CONFLICT ON CONSTRAINT uq_tarefa_atribuicao_tarefa_usuario DO NOTHING',
                           'ON CONFLICT DO NOTHING');
  END IF;
END $$;

-- 9. Gatilho: concluir/cancelar tarefa de expedição encerra a atribuição aberta
CREATE OR REPLACE FUNCTION public.tg_tarefa_encerrar_atribuicao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('CONCLUIDA', 'CANCELADA')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND EXISTS (SELECT 1 FROM tipo_tarefa tt
                 WHERE tt.id = NEW.tipo_tarefa_id AND tt.etapa_onda_ordem IS NOT NULL) THEN
    UPDATE tarefa_atribuicao
       SET status           = CASE WHEN NEW.status = 'CANCELADA' THEN 'CANCELADA' ELSE 'FINALIZADA' END,
           liberado_em      = now(),
           motivo_liberacao = CASE WHEN NEW.status = 'CANCELADA' THEN 'CANCELAMENTO' ELSE 'CONCLUSAO' END
     WHERE tarefa_id = NEW.id AND liberado_em IS NULL;
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.tg_tarefa_encerrar_atribuicao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tarefa_encerrar_atribuicao ON public.tarefa;
CREATE TRIGGER trg_tarefa_encerrar_atribuicao
  AFTER UPDATE OF status ON public.tarefa
  FOR EACH ROW EXECUTE FUNCTION public.tg_tarefa_encerrar_atribuicao();
