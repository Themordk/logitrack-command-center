-- Status S1 · 4/4 — A linha do tempo do documento (integracao_documento_eventos) devolve o status de
-- integração junto com o documento: documento.integracao = {estado, evento, evento_nome, em, erro,
-- execucao_id, erros_outros, marcador}. Troca de um trecho só; o restante da função fica igual.

DO $do$
DECLARE
  v_sig  constant text := 'public.integracao_documento_eventos(uuid,uuid,text,uuid,text,boolean,text,integer,integer)';
  v_def  text := pg_get_functiondef(v_sig::regprocedure);
  v_old  constant text := $t$'numero', v_numero, 'status_integracao', v_status_i),$t$;
  v_new  constant text := $t$'numero', v_numero, 'status_integracao', v_status_i,
                                    'integracao', integracao.fn_documento_integracao_json(p_entidade, p_documento_id)),$t$;
BEGIN
  IF position('fn_documento_integracao_json' in v_def) > 0 THEN
    RETURN;  -- já aplicada
  END IF;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado não encontrado em integracao_documento_eventos';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$do$;
