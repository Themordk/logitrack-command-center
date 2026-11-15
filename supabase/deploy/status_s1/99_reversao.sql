-- Reversão do S1 (status de integração). Uma transação; devolve o banco ao estado anterior às
-- migrations 20261115210000 … 20261115210400. Os dados das colunas novas são descartados
-- (são recalculáveis a partir de integracao.retorno_execucao). O marcador status_integracao não é tocado.
-- O retorno-dispatcher anterior continua funcionando com a função de 3 parâmetros recriada aqui.

BEGIN;

-- 1) Gatilhos e funções do cálculo
DROP TRIGGER IF EXISTS trg_zz_retorno_execucao_integracao_ins ON integracao.retorno_execucao;
DROP TRIGGER IF EXISTS trg_zz_retorno_execucao_integracao_upd ON integracao.retorno_execucao;
DROP FUNCTION IF EXISTS integracao.trg_retorno_execucao_integracao();
DROP FUNCTION IF EXISTS integracao._fn_documento_integracao_recalcular(text, uuid, boolean);
DROP FUNCTION IF EXISTS integracao._fn_movimento_integracao_resumo(text, uuid, boolean);
DROP FUNCTION IF EXISTS integracao.fn_documento_integracao_calcular(text, uuid);

-- 2) Linha do tempo do documento sem o bloco "integracao"
DO $do$
DECLARE
  v_def text := pg_get_functiondef('public.integracao_documento_eventos(uuid,uuid,text,uuid,text,boolean,text,integer,integer)'::regprocedure);
  v_new constant text := $t$'numero', v_numero, 'status_integracao', v_status_i,
                                    'integracao', integracao.fn_documento_integracao_json(p_entidade, p_documento_id)),$t$;
  v_old constant text := $t$'numero', v_numero, 'status_integracao', v_status_i),$t$;
BEGIN
  IF position(v_new in v_def) > 0 THEN
    EXECUTE replace(v_def, v_new, v_old);
  END IF;
END
$do$;
DROP FUNCTION IF EXISTS integracao.fn_documento_integracao_json(text, uuid);

-- 3) Nó "Atualizar documento": volta a versão de 3 parâmetros (marca exportado na hora)
DROP FUNCTION IF EXISTS public.integracao_retorno_svc_atualizar_documento(uuid, text, boolean, text, text);
CREATE OR REPLACE FUNCTION public.integracao_retorno_svc_atualizar_documento(p_execucao_id uuid, p_status_integracao text, p_marcar_exportado boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  e      integracao.retorno_execucao;
  v_doc  uuid;
  v_n    int := 0;
BEGIN
  SELECT * INTO e FROM integracao.retorno_execucao WHERE id = p_execucao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETORNO_EXECUCAO_NAO_ENCONTRADA' USING ERRCODE = 'P0002'; END IF;
  IF e.modo IN ('simulacao', 'teste') THEN RETURN jsonb_build_object('documentos', 0, 'simulado', true); END IF;

  FOR v_doc IN
    SELECT e.documento_id WHERE e.documento_id IS NOT NULL
    UNION SELECT m.documento_id FROM integracao.retorno_execucao m WHERE m.lote_execucao_id = e.id AND m.documento_id IS NOT NULL
  LOOP
    IF e.entidade = 'documento_saida' THEN
      UPDATE documento_saida SET status_integracao = coalesce(nullif(p_status_integracao, ''), status_integracao), sincronizado_em = now()
      WHERE id = v_doc AND tenant_id = e.tenant_id AND empresa_id = e.empresa_id;
      IF p_marcar_exportado THEN PERFORM integracao_marcar_exportado('pedido_saida', v_doc); END IF;
    ELSE
      UPDATE documento_entrada SET status_integracao = coalesce(nullif(p_status_integracao, ''), status_integracao), sincronizado_em = now()
      WHERE id = v_doc AND tenant_id = e.tenant_id AND empresa_id = e.empresa_id;
      IF p_marcar_exportado THEN PERFORM integracao_marcar_exportado('recebimento', v_doc); END IF;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('documentos', v_n);
END;
$function$;
REVOKE ALL ON FUNCTION public.integracao_retorno_svc_atualizar_documento(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_svc_atualizar_documento(uuid, text, boolean) TO service_role;

-- 4) Catálogo do nó
UPDATE integracao.retorno_no_catalogo
   SET descricao = 'Grava o status de integração no documento.',
       config_exemplo = '{"marcar_exportado": true, "status_integracao": "retornado"}'::jsonb
 WHERE tipo = 'acao.atualizar_documento';

-- 5) Colunas (restrições e índices saem junto)
DROP INDEX IF EXISTS public.idx_movimento_saida_integracao_resumo;
DROP INDEX IF EXISTS public.idx_movimento_entrada_integracao_resumo;
ALTER TABLE public.documento_saida
  DROP COLUMN IF EXISTS integracao_estado, DROP COLUMN IF EXISTS integracao_evento, DROP COLUMN IF EXISTS integracao_em,
  DROP COLUMN IF EXISTS integracao_erro, DROP COLUMN IF EXISTS integracao_execucao_id, DROP COLUMN IF EXISTS integracao_erros_outros;
ALTER TABLE public.documento_entrada
  DROP COLUMN IF EXISTS integracao_estado, DROP COLUMN IF EXISTS integracao_evento, DROP COLUMN IF EXISTS integracao_em,
  DROP COLUMN IF EXISTS integracao_erro, DROP COLUMN IF EXISTS integracao_execucao_id, DROP COLUMN IF EXISTS integracao_erros_outros;
ALTER TABLE public.movimento_saida   DROP COLUMN IF EXISTS integracao_resumo;
ALTER TABLE public.movimento_entrada DROP COLUMN IF EXISTS integracao_resumo;
ALTER TABLE integracao.retorno_execucao
  DROP COLUMN IF EXISTS integracao_resultado, DROP COLUMN IF EXISTS integracao_mensagem, DROP COLUMN IF EXISTS marcar_exportado;

COMMENT ON COLUMN public.documento_saida.status_integracao IS NULL;
COMMENT ON COLUMN public.documento_entrada.status_integracao IS NULL;

-- 6) Conferência
DO $conf$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE column_name IN ('integracao_estado', 'integracao_resumo', 'integracao_resultado'))
     OR to_regprocedure('integracao.fn_documento_integracao_calcular(text,uuid)') IS NOT NULL
     OR to_regprocedure('public.integracao_retorno_svc_atualizar_documento(uuid,text,boolean)') IS NULL
     OR position('fn_documento_integracao_json' in pg_get_functiondef('public.integracao_documento_eventos(uuid,uuid,text,uuid,text,boolean,text,integer,integer)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'Reversão do S1 incompleta';
  END IF;
END
$conf$;

COMMIT;
