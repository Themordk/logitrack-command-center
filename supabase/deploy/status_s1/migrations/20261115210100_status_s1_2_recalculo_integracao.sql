-- Status S1 · 2/4 — Cálculo do status de integração e gatilho em retorno_execucao
--
-- Regras (plano de status, decisões aprovadas em 15/11/2026):
--  * Teste e simulação não contam. Execução "lote" é só o envelope: vale para os documentos membros.
--  * Há execução pendente/executando/aguardando_retry/agrupando/agrupado (na fila de um lote) → pendente.
--  * Senão, por regra (fluxo) vale a última execução concluída (sucesso/erro):
--      erro → erro (mensagem da execução)
--      sucesso → o que o nó "Atualizar documento" declarou (integrado / ignorado / erro de negócio / não alterar);
--                sem declaração: integrado se algum envio (requisição, ação do ERP, webhook) deu certo; senão ignorado.
--    "não alterar" pula a execução. Entre as regras, vence o resultado integrado/erro mais recente;
--    as demais regras com erro viram integracao_erros_outros (aviso "retorno anterior com erro").
--  * Sem integrado/erro: ignorado se houve alguma execução; nao_integra se nenhuma.
--  * Resumo do movimento = pior caso dos documentos ativos (cancelados/excluídos ficam de fora).
--  * "Marcar como exportado": aplicado na conclusão da execução com sucesso, e só quando nenhum
--    documento ativo do movimento está em erro ou pendente (antes: o 1º documento marcava a onda toda).
--  * O gatilho é DEFERRABLE INITIALLY DEFERRED: roda no fim da transação, quando os passos da execução
--    já foram gravados por integracao_retorno_svc_concluir. Falha vira WARNING e nunca derruba o dispatcher.

-- 1) Cálculo (somente leitura) ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION integracao.fn_documento_integracao_calcular(p_entidade text, p_documento_id uuid)
RETURNS TABLE (estado text, evento text, em timestamptz, erro text, execucao_id uuid, erros_outros integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  r        record;
  v_res    text;
  v_msg    text;
  v_tem    boolean := false;
  v_vistos uuid[]  := '{}';
BEGIN
  estado := 'nao_integra';
  erros_outros := 0;

  SELECT x.evento, x.created_at, x.id
    INTO evento, em, execucao_id
    FROM integracao.retorno_execucao x
   WHERE x.documento_id = p_documento_id AND x.entidade = p_entidade
     AND x.modo NOT IN ('teste', 'simulacao', 'lote')
     AND x.status IN ('pendente', 'executando', 'aguardando_retry', 'agrupando', 'agrupado')
   ORDER BY x.created_at
   LIMIT 1;
  IF FOUND THEN
    estado := 'pendente';
    RETURN NEXT;
    RETURN;
  END IF;

  FOR r IN
    SELECT x.id, x.evento, x.status, x.erro, x.fluxo_id,
           coalesce(x.finalizado_em, x.created_at) AS fim,
           coalesce(x.lote_execucao_id, x.id)     AS fonte_id
      FROM integracao.retorno_execucao x
     WHERE x.documento_id = p_documento_id AND x.entidade = p_entidade
       AND x.modo NOT IN ('teste', 'simulacao', 'lote')
     ORDER BY coalesce(x.finalizado_em, x.created_at) DESC, x.created_at DESC
  LOOP
    v_tem := true;
    IF r.status NOT IN ('sucesso', 'erro') THEN
      CONTINUE;                                   -- filtrado / descartado
    END IF;
    IF r.fluxo_id = ANY (v_vistos) THEN
      CONTINUE;                                   -- só a última execução concluída de cada regra
    END IF;

    IF r.status = 'erro' THEN
      v_res := 'erro';
      v_msg := r.erro;
    ELSE
      SELECT f.integracao_resultado, f.integracao_mensagem INTO v_res, v_msg
        FROM integracao.retorno_execucao f WHERE f.id = r.fonte_id;
      IF v_res IS NULL THEN
        v_res := CASE WHEN EXISTS (SELECT 1 FROM integracao.retorno_execucao_passo p
                                    WHERE p.execucao_id = r.fonte_id
                                      AND p.no_tipo IN ('acao.http', 'acao.provedor', 'acao.webhook')
                                      AND p.status = 'sucesso')
                      THEN 'integrado' ELSE 'ignorado' END;
        v_msg := NULL;
      END IF;
    END IF;

    IF v_res = 'nao_alterar' THEN
      CONTINUE;                                   -- a execução não decide; vale a anterior da regra
    END IF;
    v_vistos := v_vistos || r.fluxo_id;
    IF v_res = 'ignorado' THEN
      CONTINUE;
    END IF;

    IF estado = 'nao_integra' THEN
      estado      := v_res;
      evento      := r.evento;
      em          := r.fim;
      execucao_id := r.id;
      erro        := CASE WHEN v_res = 'erro' THEN coalesce(nullif(v_msg, ''), 'Erro no retorno ao ERP') END;
    ELSIF v_res = 'erro' THEN
      erros_outros := erros_outros + 1;
    END IF;
  END LOOP;

  IF estado = 'nao_integra' AND v_tem THEN
    estado := 'ignorado';
  END IF;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION integracao.fn_documento_integracao_calcular(text, uuid) FROM PUBLIC, anon, authenticated;

-- 2) Resumo do movimento + "marcar como exportado" com o movimento completo -----------------------
CREATE OR REPLACE FUNCTION integracao._fn_movimento_integracao_resumo(p_tabela text, p_movimento_id uuid, p_exportar boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  c_ordem constant text[] := ARRAY['nao_integra', 'ignorado', 'integrado', 'pendente', 'erro'];
  v_pos   int;
  v_res   text;
BEGIN
  IF p_tabela = 'movimento_saida' THEN
    SELECT max(array_position(c_ordem, d.integracao_estado)) INTO v_pos
      FROM movimento_saida_documento msd
      JOIN documento_saida d ON d.id = msd.documento_saida_id
     WHERE msd.movimento_saida_id = p_movimento_id
       AND d.status NOT IN (9, 99);
    v_res := coalesce(c_ordem[v_pos], 'nao_integra');

    UPDATE movimento_saida SET integracao_resumo = v_res
     WHERE id = p_movimento_id AND integracao_resumo IS DISTINCT FROM v_res;

    IF p_exportar AND v_res NOT IN ('erro', 'pendente') THEN
      UPDATE movimento_saida SET status = 'EXPORTADA_ERP'
       WHERE id = p_movimento_id AND status = 'CONCLUIDA';
    END IF;

  ELSIF p_tabela = 'movimento_entrada' THEN
    SELECT max(array_position(c_ordem, d.integracao_estado)) INTO v_pos
      FROM movimento_entrada_documento med
      JOIN documento_entrada d ON d.id = med.documento_entrada_id
     WHERE med.movimento_entrada_id = p_movimento_id
       AND d.status NOT IN (8, 9, 99);
    v_res := coalesce(c_ordem[v_pos], 'nao_integra');

    UPDATE movimento_entrada SET integracao_resumo = v_res
     WHERE id = p_movimento_id AND integracao_resumo IS DISTINCT FROM v_res;

    IF p_exportar AND v_res NOT IN ('erro', 'pendente') THEN
      UPDATE movimento_entrada SET status = 'EXPORTADO'
       WHERE id = p_movimento_id AND status = 'ARMAZENADO';
    END IF;
  END IF;
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION integracao._fn_movimento_integracao_resumo(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- 3) Recálculo de um documento (grava só se mudou) e dos movimentos dele ---------------------------
CREATE OR REPLACE FUNCTION integracao._fn_documento_integracao_recalcular(p_entidade text, p_documento_id uuid, p_exportar boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  c     record;
  v_mov uuid;
BEGIN
  SELECT * INTO c FROM integracao.fn_documento_integracao_calcular(p_entidade, p_documento_id);

  IF p_entidade = 'documento_saida' THEN
    UPDATE documento_saida d SET
      integracao_estado       = c.estado,
      integracao_evento       = c.evento,
      integracao_em           = c.em,
      integracao_erro         = c.erro,
      integracao_execucao_id  = c.execucao_id,
      integracao_erros_outros = c.erros_outros
     WHERE d.id = p_documento_id
       AND (d.integracao_estado, d.integracao_evento, d.integracao_em, d.integracao_erro, d.integracao_execucao_id, d.integracao_erros_outros)
           IS DISTINCT FROM (c.estado, c.evento, c.em, c.erro, c.execucao_id, c.erros_outros);
    FOR v_mov IN SELECT msd.movimento_saida_id FROM movimento_saida_documento msd WHERE msd.documento_saida_id = p_documento_id LOOP
      PERFORM integracao._fn_movimento_integracao_resumo('movimento_saida', v_mov, p_exportar);
    END LOOP;

  ELSIF p_entidade = 'documento_entrada' THEN
    UPDATE documento_entrada d SET
      integracao_estado       = c.estado,
      integracao_evento       = c.evento,
      integracao_em           = c.em,
      integracao_erro         = c.erro,
      integracao_execucao_id  = c.execucao_id,
      integracao_erros_outros = c.erros_outros
     WHERE d.id = p_documento_id
       AND (d.integracao_estado, d.integracao_evento, d.integracao_em, d.integracao_erro, d.integracao_execucao_id, d.integracao_erros_outros)
           IS DISTINCT FROM (c.estado, c.evento, c.em, c.erro, c.execucao_id, c.erros_outros);
    FOR v_mov IN SELECT med.movimento_entrada_id FROM movimento_entrada_documento med WHERE med.documento_entrada_id = p_documento_id LOOP
      PERFORM integracao._fn_movimento_integracao_resumo('movimento_entrada', v_mov, p_exportar);
    END LOOP;
  END IF;
  RETURN c.estado;
END;
$function$;

REVOKE ALL ON FUNCTION integracao._fn_documento_integracao_recalcular(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- 4) Gatilho em retorno_execucao (fim da transação) ----------------------------------------------
CREATE OR REPLACE FUNCTION integracao.trg_retorno_execucao_integracao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_exportar boolean;
BEGIN
  IF NEW.documento_id IS NULL
     OR NEW.entidade NOT IN ('documento_saida', 'documento_entrada')
     OR NEW.modo IN ('teste', 'simulacao', 'lote') THEN
    RETURN NULL;
  END IF;
  BEGIN
    SELECT x.status = 'sucesso' AND f.marcar_exportado
      INTO v_exportar
      FROM integracao.retorno_execucao x
      JOIN integracao.retorno_execucao f ON f.id = coalesce(x.lote_execucao_id, x.id)
     WHERE x.id = NEW.id;
    PERFORM integracao._fn_documento_integracao_recalcular(NEW.entidade, NEW.documento_id, coalesce(v_exportar, false));
  EXCEPTION WHEN others THEN
    RAISE WARNING '[retorno] status de integração não recalculado (execução %, documento %): % %',
      NEW.id, NEW.documento_id, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION integracao.trg_retorno_execucao_integracao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_retorno_execucao_integracao_ins ON integracao.retorno_execucao;
CREATE CONSTRAINT TRIGGER trg_zz_retorno_execucao_integracao_ins
  AFTER INSERT ON integracao.retorno_execucao
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.documento_id IS NOT NULL AND NEW.modo NOT IN ('teste', 'simulacao', 'lote'))
  EXECUTE FUNCTION integracao.trg_retorno_execucao_integracao();

DROP TRIGGER IF EXISTS trg_zz_retorno_execucao_integracao_upd ON integracao.retorno_execucao;
CREATE CONSTRAINT TRIGGER trg_zz_retorno_execucao_integracao_upd
  AFTER UPDATE OF status ON integracao.retorno_execucao
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.documento_id IS NOT NULL AND NEW.modo NOT IN ('teste', 'simulacao', 'lote')
        AND OLD.status IS DISTINCT FROM NEW.status
        AND NOT (OLD.status IN ('pendente', 'executando', 'aguardando_retry', 'agrupando', 'agrupado')
                 AND NEW.status IN ('pendente', 'executando', 'aguardando_retry', 'agrupando', 'agrupado')))
  EXECUTE FUNCTION integracao.trg_retorno_execucao_integracao();

-- 5) Nó "Atualizar documento": resultado declarado + exportar na conclusão ------------------------
--    Parâmetros novos com padrão: o dispatcher atual (3 parâmetros) continua funcionando.
DROP FUNCTION IF EXISTS public.integracao_retorno_svc_atualizar_documento(uuid, text, boolean);

CREATE OR REPLACE FUNCTION public.integracao_retorno_svc_atualizar_documento(
  p_execucao_id       uuid,
  p_status_integracao text,
  p_marcar_exportado  boolean DEFAULT false,
  p_resultado         text    DEFAULT NULL,
  p_mensagem          text    DEFAULT NULL
)
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
  IF p_resultado IS NOT NULL AND p_resultado NOT IN ('integrado', 'ignorado', 'erro', 'nao_alterar') THEN
    RAISE EXCEPTION 'RETORNO_RESULTADO_INVALIDO: %', p_resultado USING ERRCODE = '22023';
  END IF;
  IF e.modo IN ('simulacao', 'teste') THEN RETURN jsonb_build_object('documentos', 0, 'simulado', true); END IF;

  -- Resultado e "marcar exportado" ficam na execução; o status do documento e do movimento
  -- é recalculado quando a execução termina (gatilho trg_zz_retorno_execucao_integracao_upd).
  UPDATE integracao.retorno_execucao SET
    integracao_resultado = coalesce(p_resultado, integracao_resultado),
    integracao_mensagem  = CASE WHEN p_resultado IS NOT NULL THEN nullif(btrim(p_mensagem), '') ELSE integracao_mensagem END,
    marcar_exportado     = marcar_exportado OR coalesce(p_marcar_exportado, false)
  WHERE id = e.id;

  FOR v_doc IN
    SELECT e.documento_id WHERE e.documento_id IS NOT NULL
    UNION SELECT m.documento_id FROM integracao.retorno_execucao m WHERE m.lote_execucao_id = e.id AND m.documento_id IS NOT NULL
  LOOP
    IF e.entidade = 'documento_saida' THEN
      UPDATE documento_saida SET status_integracao = coalesce(nullif(p_status_integracao, ''), status_integracao), sincronizado_em = now()
      WHERE id = v_doc AND tenant_id = e.tenant_id AND empresa_id = e.empresa_id;
    ELSE
      UPDATE documento_entrada SET status_integracao = coalesce(nullif(p_status_integracao, ''), status_integracao), sincronizado_em = now()
      WHERE id = v_doc AND tenant_id = e.tenant_id AND empresa_id = e.empresa_id;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('documentos', v_n, 'resultado', p_resultado,
                            'marcar_exportado', coalesce(p_marcar_exportado, false));
END;
$function$;

REVOKE ALL ON FUNCTION public.integracao_retorno_svc_atualizar_documento(uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_retorno_svc_atualizar_documento(uuid, text, boolean, text, text) TO service_role;

-- 6) Leitura para as telas (documento) ------------------------------------------------------------
CREATE OR REPLACE FUNCTION integracao.fn_documento_integracao_json(p_entidade text, p_documento_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'integracao'
AS $function$
  SELECT jsonb_build_object('estado', d.integracao_estado, 'evento', d.integracao_evento,
           'evento_nome', (SELECT c.nome FROM integracao.retorno_evento_catalogo c WHERE c.codigo = d.integracao_evento),
           'em', d.integracao_em, 'erro', d.integracao_erro, 'execucao_id', d.integracao_execucao_id,
           'erros_outros', d.integracao_erros_outros, 'marcador', d.status_integracao)
    FROM (SELECT ds.integracao_estado, ds.integracao_evento, ds.integracao_em, ds.integracao_erro, ds.integracao_execucao_id,
                 ds.integracao_erros_outros, ds.status_integracao
            FROM documento_saida ds WHERE p_entidade = 'documento_saida' AND ds.id = p_documento_id
          UNION ALL
          SELECT de.integracao_estado, de.integracao_evento, de.integracao_em, de.integracao_erro, de.integracao_execucao_id,
                 de.integracao_erros_outros, de.status_integracao
            FROM documento_entrada de WHERE p_entidade = 'documento_entrada' AND de.id = p_documento_id) d
$function$;

REVOKE ALL ON FUNCTION integracao.fn_documento_integracao_json(text, uuid) FROM PUBLIC, anon, authenticated;
