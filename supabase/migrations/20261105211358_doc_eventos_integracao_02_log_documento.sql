-- Copiada de produção (schema_migrations, versão 20261105211358): estava aplicada em produção e faltava no repositório.
-- Log append-only de eventos de documento que hoje só guardam o último estado
-- (exclusão / restauração de documento, cancelamento de entrada).
CREATE TABLE IF NOT EXISTS integracao.documento_evento_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  empresa_id    uuid,
  entidade      text NOT NULL CHECK (entidade IN ('documento_saida','documento_entrada')),
  documento_id  uuid NOT NULL,
  codigo_erp    text,
  tipo          text NOT NULL CHECK (tipo IN ('EXCLUSAO','RESTAURACAO','CANCELAMENTO')),
  origem        text NOT NULL,           -- USUARIO | API_SISTEMA | BACKFILL | valor de cancelamento_origem
  usuario_id    uuid,                     -- public.usuario.id quando conhecido
  auth_user_id  uuid,                     -- auth.uid() no momento do evento
  request_id    text,
  motivo        text,
  detalhe       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documento_evento_log_doc
  ON integracao.documento_evento_log (tenant_id, entidade, documento_id, ocorrido_em);

ALTER TABLE integracao.documento_evento_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON integracao.documento_evento_log FROM anon, authenticated;
COMMENT ON TABLE integracao.documento_evento_log IS
  'Append-only. Gravado por trigger em documento_saida/documento_entrada. Leitura apenas via RPC integracao_documento_eventos.';

-- Trigger: nunca bloqueia a operação de negócio (falha vira WARNING)
CREATE OR REPLACE FUNCTION integracao.trg_documento_evento_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $$
DECLARE
  v_entidade text := CASE TG_TABLE_NAME WHEN 'documento_saida' THEN 'documento_saida' ELSE 'documento_entrada' END;
  v_auth     uuid := auth.uid();
  v_req      text;
  v_tipo     text;
  v_origem   text;
  v_motivo   text;
  v_usuario  uuid;
BEGIN
  BEGIN
    v_req := nullif(coalesce(
               current_setting('request.headers', true)::json ->> 'x-request-id',
               current_setting('app.request_id', true)), '');
  EXCEPTION WHEN others THEN v_req := NULL;
  END;

  -- Exclusão / restauração
  IF NEW.excluido_em IS DISTINCT FROM OLD.excluido_em THEN
    v_tipo    := CASE WHEN NEW.excluido_em IS NOT NULL THEN 'EXCLUSAO' ELSE 'RESTAURACAO' END;
    v_usuario := NEW.excluido_por;
    v_origem  := CASE WHEN v_auth IS NOT NULL OR NEW.excluido_por IS NOT NULL THEN 'USUARIO' ELSE 'API_SISTEMA' END;
    v_motivo  := NEW.observacao_exclusao;
    BEGIN
      INSERT INTO integracao.documento_evento_log
        (tenant_id, empresa_id, entidade, documento_id, codigo_erp, tipo, origem, usuario_id, auth_user_id, request_id, motivo, detalhe, ocorrido_em)
      VALUES
        (NEW.tenant_id, NEW.empresa_id, v_entidade, NEW.id, NEW.codigo_erp, v_tipo, v_origem, v_usuario, v_auth, v_req, v_motivo,
         jsonb_build_object('status_antes', OLD.status, 'status_depois', NEW.status, 'motivo_exclusao_id', NEW.motivo_exclusao_id),
         coalesce(NEW.excluido_em, now()));
    EXCEPTION WHEN others THEN
      RAISE WARNING 'documento_evento_log (exclusao) falhou: %', SQLERRM;
    END;
  END IF;

  -- Cancelamento (somente entrada; saída já tem documento_saida_cancelamento)
  IF v_entidade = 'documento_entrada'
     AND NEW.cancelamento_solicitado_em IS NOT NULL
     AND NEW.cancelamento_solicitado_em IS DISTINCT FROM OLD.cancelamento_solicitado_em THEN
    BEGIN
      INSERT INTO integracao.documento_evento_log
        (tenant_id, empresa_id, entidade, documento_id, codigo_erp, tipo, origem, auth_user_id, request_id, motivo, detalhe, ocorrido_em)
      VALUES
        (NEW.tenant_id, NEW.empresa_id, v_entidade, NEW.id, NEW.codigo_erp, 'CANCELAMENTO',
         coalesce(nullif(NEW.cancelamento_origem, ''), CASE WHEN v_auth IS NOT NULL THEN 'USUARIO' ELSE 'API_SISTEMA' END),
         v_auth, v_req, NEW.cancelamento_motivo,
         jsonb_build_object('status_antes', OLD.status, 'status_depois', NEW.status),
         NEW.cancelamento_solicitado_em);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'documento_evento_log (cancelamento) falhou: %', SQLERRM;
    END;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION integracao.trg_documento_evento_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_documento_evento_log ON public.documento_saida;
CREATE TRIGGER trg_zz_documento_evento_log
  AFTER UPDATE OF excluido_em ON public.documento_saida
  FOR EACH ROW
  WHEN (OLD.excluido_em IS DISTINCT FROM NEW.excluido_em)
  EXECUTE FUNCTION integracao.trg_documento_evento_log();

DROP TRIGGER IF EXISTS trg_zz_documento_evento_log ON public.documento_entrada;
CREATE TRIGGER trg_zz_documento_evento_log
  AFTER UPDATE OF excluido_em, cancelamento_solicitado_em ON public.documento_entrada
  FOR EACH ROW
  WHEN (OLD.excluido_em IS DISTINCT FROM NEW.excluido_em
        OR OLD.cancelamento_solicitado_em IS DISTINCT FROM NEW.cancelamento_solicitado_em)
  EXECUTE FUNCTION integracao.trg_documento_evento_log();

-- Backfill do estado atual (histórico anterior não existe)
INSERT INTO integracao.documento_evento_log
  (tenant_id, empresa_id, entidade, documento_id, codigo_erp, tipo, origem, usuario_id, motivo, detalhe, ocorrido_em)
SELECT d.tenant_id, d.empresa_id, 'documento_saida', d.id, d.codigo_erp, 'EXCLUSAO', 'BACKFILL', d.excluido_por, d.observacao_exclusao,
       jsonb_build_object('motivo_exclusao_id', d.motivo_exclusao_id, 'origem_estimada', CASE WHEN d.excluido_por IS NULL THEN 'API_SISTEMA' ELSE 'USUARIO' END),
       d.excluido_em
FROM public.documento_saida d
WHERE d.excluido_em IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM integracao.documento_evento_log l WHERE l.documento_id = d.id AND l.tipo = 'EXCLUSAO');

INSERT INTO integracao.documento_evento_log
  (tenant_id, empresa_id, entidade, documento_id, codigo_erp, tipo, origem, usuario_id, motivo, detalhe, ocorrido_em)
SELECT d.tenant_id, d.empresa_id, 'documento_entrada', d.id, d.codigo_erp, 'EXCLUSAO', 'BACKFILL', d.excluido_por, d.observacao_exclusao,
       jsonb_build_object('motivo_exclusao_id', d.motivo_exclusao_id, 'origem_estimada', CASE WHEN d.excluido_por IS NULL THEN 'API_SISTEMA' ELSE 'USUARIO' END),
       d.excluido_em
FROM public.documento_entrada d
WHERE d.excluido_em IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM integracao.documento_evento_log l WHERE l.documento_id = d.id AND l.tipo = 'EXCLUSAO');

INSERT INTO integracao.documento_evento_log
  (tenant_id, empresa_id, entidade, documento_id, codigo_erp, tipo, origem, motivo, detalhe, ocorrido_em)
SELECT d.tenant_id, d.empresa_id, 'documento_entrada', d.id, d.codigo_erp, 'CANCELAMENTO', 'BACKFILL', d.cancelamento_motivo,
       jsonb_build_object('cancelamento_origem', d.cancelamento_origem),
       d.cancelamento_solicitado_em
FROM public.documento_entrada d
WHERE d.cancelamento_solicitado_em IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM integracao.documento_evento_log l WHERE l.documento_id = d.id AND l.tipo = 'CANCELAMENTO');;
