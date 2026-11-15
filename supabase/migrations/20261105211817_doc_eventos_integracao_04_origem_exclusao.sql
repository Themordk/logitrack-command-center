-- Copiada de produção (schema_migrations, versão 20261105211817): estava aplicada em produção e faltava no repositório.
-- Corrige a classificação de origem/direção de exclusões e cancelamentos sem usuário.
-- Só é "ERP -> WMS" quando a origem é explicitamente do ERP (API_ERP*, API, ERP).

-- 1) Backfill: exclusões sem usuário não têm origem comprovada
UPDATE integracao.documento_evento_log
   SET detalhe = jsonb_set(detalhe, '{origem_estimada}', '"NAO_IDENTIFICADA"')
 WHERE origem = 'BACKFILL' AND detalhe ->> 'origem_estimada' = 'API_SISTEMA';

-- 2) Helper de classificação
CREATE OR REPLACE FUNCTION integracao.fn_doc_evento_origem_erp(p_origem text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT coalesce(upper(p_origem) LIKE 'API_ERP%' OR upper(p_origem) IN ('API', 'ERP'), false) $$;

-- 3) Visão normalizada do log (usada pela RPC)
CREATE OR REPLACE FUNCTION integracao.fn_doc_evento_log_normalizado(p_tenant_id uuid, p_entidade text, p_documento_id uuid)
RETURNS TABLE (id uuid, tipo text, origem_efetiva text, direcao text, titulo text, motivo text,
               usuario_id uuid, auth_user_id uuid, request_id text, ocorrido_em timestamptz,
               sintetico boolean, detalhe jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $$
  SELECT l.id, l.tipo, o.orig,
         CASE WHEN integracao.fn_doc_evento_origem_erp(o.orig) THEN 'ERP_WMS' ELSE 'WMS' END,
         CASE l.tipo
           WHEN 'EXCLUSAO' THEN
             CASE WHEN integracao.fn_doc_evento_origem_erp(o.orig) THEN 'Exclusão solicitada pelo ERP'
                  WHEN o.orig = 'USUARIO'      THEN 'Documento excluído por usuário'
                  WHEN o.orig = 'API_SISTEMA'  THEN 'Documento excluído via API/sistema'
                  ELSE 'Documento excluído (origem não identificada)' END
           WHEN 'RESTAURACAO' THEN 'Exclusão desfeita'
           ELSE
             CASE WHEN integracao.fn_doc_evento_origem_erp(o.orig) THEN 'Cancelamento solicitado pelo ERP'
                  ELSE 'Cancelamento do documento' END
         END,
         l.motivo, l.usuario_id, l.auth_user_id, l.request_id, l.ocorrido_em,
         (l.origem = 'BACKFILL'), l.detalhe
    FROM integracao.documento_evento_log l
    CROSS JOIN LATERAL (
      SELECT CASE WHEN l.origem = 'BACKFILL'
                  THEN coalesce(l.detalhe ->> 'origem_estimada', l.detalhe ->> 'cancelamento_origem', 'NAO_IDENTIFICADA')
                  ELSE l.origem END AS orig
    ) o
   WHERE l.tenant_id = p_tenant_id AND l.entidade = p_entidade AND l.documento_id = p_documento_id
$$;
REVOKE ALL ON FUNCTION integracao.fn_doc_evento_log_normalizado(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- 4) Troca o bloco "4) Exclusão..." da RPC pela leitura normalizada (splice no corpo atual)
DO $do$
DECLARE
  v_def   text := pg_get_functiondef('public.integracao_documento_eventos(uuid,uuid,text,uuid,text,boolean,text,integer,integer)'::regprocedure);
  v_ini   int  := position('    -- 4) Exclusão' in v_def);
  v_fim   int  := position(E'    UNION ALL\n    -- 5)' in v_def);
  v_novo  text := $blk$    -- 4) Exclusão / restauração / cancelamento de entrada (log append-only, origem normalizada)
    SELECT l.id, 'documento_evento_log', l.direcao, lower(l.tipo), l.titulo,
           NULL, 'registrado', l.motivo, l.origem_efetiva, l.usuario_id, l.auth_user_id,
           l.ocorrido_em, 40,
           l.request_id, NULL, NULL,
           'documento', l.sintetico,
           l.detalhe
      FROM integracao.fn_doc_evento_log_normalizado(p_tenant_id, p_entidade, p_documento_id) l

$blk$;
BEGIN
  IF v_ini = 0 OR v_fim = 0 OR v_fim < v_ini THEN
    RAISE EXCEPTION 'Marcadores do bloco 4 não encontrados na RPC (ini=%, fim=%)', v_ini, v_fim;
  END IF;
  v_def := substr(v_def, 1, v_ini - 1) || v_novo || substr(v_def, v_fim);
  EXECUTE v_def;
END
$do$;;
