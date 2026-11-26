-- =====================================================================
-- 2026-11-26 · Retorno ao ERP · novos eventos (00/03) — base do motor
--
-- O motor passa a aceitar duas entidades além de documento de entrada/saída:
--   movimentacao_interna  transferência / mudança de picking que troca armazém,
--                         setor ou tipo de estoque (public.movimentacao_interna)
--   cadastro_importacao   pedido feito pelo botão "Importar do ERP"
--                         (integracao.retorno_importacao)
-- e ganha:
--   modo   'interativo'              execução do botão, roda na requisição do usuário
--   status 'aguardando_confirmacao'  pausa do nó "Confirmar com o usuário" (prévia)
--
-- Este arquivo só mexe em CHECKs e nas funções de fila (svc_concluir/svc_reservar).
-- CHECKs entram NOT VALID + VALIDATE para não segurar lock exclusivo durante a
-- varredura (retorno_execucao é grande em produção).
-- Reverter: supabase/rollback/20261126_retorno_novos_eventos_reverter.sql
-- =====================================================================

-- ---------- 1. entidades ----------
ALTER TABLE integracao.retorno_evento DROP CONSTRAINT IF EXISTS retorno_evento_entidade_check;
ALTER TABLE integracao.retorno_evento ADD CONSTRAINT retorno_evento_entidade_check
  CHECK (entidade = ANY (ARRAY['documento_entrada','documento_saida','movimentacao_interna','cadastro_importacao'])) NOT VALID;
ALTER TABLE integracao.retorno_evento VALIDATE CONSTRAINT retorno_evento_entidade_check;

ALTER TABLE integracao.retorno_execucao DROP CONSTRAINT IF EXISTS retorno_execucao_entidade_check;
ALTER TABLE integracao.retorno_execucao ADD CONSTRAINT retorno_execucao_entidade_check
  CHECK (entidade = ANY (ARRAY['documento_entrada','documento_saida','movimentacao_interna','cadastro_importacao'])) NOT VALID;
ALTER TABLE integracao.retorno_execucao VALIDATE CONSTRAINT retorno_execucao_entidade_check;

ALTER TABLE integracao.retorno_evento_catalogo DROP CONSTRAINT IF EXISTS retorno_evento_catalogo_entidade_check;
ALTER TABLE integracao.retorno_evento_catalogo ADD CONSTRAINT retorno_evento_catalogo_entidade_check
  CHECK (entidade = ANY (ARRAY['documento_entrada','documento_saida','movimentacao_interna','cadastro_importacao']));

-- ---------- 2. modo e status ----------
ALTER TABLE integracao.retorno_execucao DROP CONSTRAINT IF EXISTS retorno_execucao_modo_check;
ALTER TABLE integracao.retorno_execucao ADD CONSTRAINT retorno_execucao_modo_check
  CHECK (modo = ANY (ARRAY['automatico','manual','teste','simulacao','lote','interativo'])) NOT VALID;
ALTER TABLE integracao.retorno_execucao VALIDATE CONSTRAINT retorno_execucao_modo_check;

ALTER TABLE integracao.retorno_execucao DROP CONSTRAINT IF EXISTS retorno_execucao_status_check;
ALTER TABLE integracao.retorno_execucao ADD CONSTRAINT retorno_execucao_status_check
  CHECK (status = ANY (ARRAY['agrupando','agrupado','pendente','executando','aguardando_retry','aguardando_confirmacao',
                             'sucesso','erro','filtrado','descartado'])) NOT VALID;
ALTER TABLE integracao.retorno_execucao VALIDATE CONSTRAINT retorno_execucao_status_check;

CREATE INDEX IF NOT EXISTS idx_retorno_exec_interativo_aberta
  ON integracao.retorno_execucao (processar_apos)
  WHERE modo = 'interativo' AND status IN ('pendente', 'executando', 'aguardando_confirmacao');

-- ---------- 3. svc_concluir: aceita a pausa de confirmação ----------
CREATE OR REPLACE FUNCTION public.integracao_retorno_svc_concluir(p_execucao_id uuid, p_resultado jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  e        integracao.retorno_execucao;
  v_status text := p_resultado->>'status';
  v_final  boolean;
BEGIN
  IF v_status NOT IN ('pendente', 'aguardando_retry', 'aguardando_confirmacao', 'sucesso', 'erro', 'filtrado') THEN
    RAISE EXCEPTION 'RETORNO_STATUS_INVALIDO: %', v_status USING ERRCODE = '22023';
  END IF;
  v_final := v_status IN ('sucesso', 'erro', 'filtrado');

  UPDATE integracao.retorno_execucao SET
    status = v_status,
    proximo_no = CASE WHEN p_resultado ? 'proximo_no' THEN p_resultado->>'proximo_no' ELSE proximo_no END,
    estado = coalesce(p_resultado->'estado', estado),
    tentativas_no = coalesce((p_resultado->>'tentativas_no')::int, tentativas_no),
    processar_apos = coalesce((p_resultado->>'processar_apos')::timestamptz, now()),
    reservado_ate = NULL,
    finalizado_em = CASE WHEN v_final THEN now() END,
    erro = p_resultado->>'erro',
    erro_http_status = (p_resultado->>'erro_http_status')::int
  WHERE id = p_execucao_id AND status = 'executando'
  RETURNING * INTO e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETORNO_EXECUCAO_NAO_RESERVADA: %', p_execucao_id USING ERRCODE = '22023';
  END IF;

  INSERT INTO integracao.retorno_execucao_passo (tenant_id, execucao_id, no_id, no_tipo, tentativa, status, saida,
    entrada, resultado, request, response, http_status, duracao_ms, erro)
  SELECT e.tenant_id, e.id, x.p->>'no_id', x.p->>'no_tipo', coalesce((x.p->>'tentativa')::int, 1), x.p->>'status', x.p->>'saida',
         x.p->'entrada', x.p->'resultado', x.p->'request', x.p->'response', (x.p->>'http_status')::int, (x.p->>'duracao_ms')::int,
         left(x.p->>'erro', 4000)
  FROM jsonb_array_elements(coalesce(p_resultado->'passos', '[]'::jsonb)) WITH ORDINALITY AS x(p, ord)
  ORDER BY x.ord;

  IF v_final AND e.modo = 'lote' THEN
    UPDATE integracao.retorno_execucao
    SET status = e.status, finalizado_em = now(), erro = e.erro, erro_http_status = e.erro_http_status
    WHERE lote_execucao_id = e.id;
  END IF;

  RETURN jsonb_build_object('id', e.id, 'status', e.status);
END;
$function$;

-- ---------- 4. svc_reservar: o agendador não pega execução interativa ----------
-- A execução do botão roda na requisição do usuário (retorno-dispatcher acao=executar_interativo).
-- Se a requisição cair, a execução expira (integracao.fn_retorno_interativo_expirar) em vez de
-- rodar em segundo plano sem ninguém olhando.
CREATE OR REPLACE FUNCTION public.integracao_retorno_svc_reservar(p_limite integer DEFAULT 10, p_execucao_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  WITH cand AS (
    SELECT e.id
    FROM integracao.retorno_execucao e
    WHERE (
        (p_execucao_id IS NOT NULL AND e.id = p_execucao_id AND e.status IN ('pendente', 'aguardando_retry'))
        OR (p_execucao_id IS NULL AND e.modo <> 'interativo' AND (
              (e.status IN ('pendente', 'aguardando_retry') AND e.processar_apos <= now())
              OR (e.status = 'executando' AND e.reservado_ate < now())))
      )
      AND (e.modo IN ('teste', 'simulacao') OR NOT EXISTS (
            SELECT 1 FROM integracao.retorno_execucao p
            WHERE p.chave_ordenacao = e.chave_ordenacao AND p.id <> e.id AND p.created_at < e.created_at
              AND p.status IN ('pendente', 'executando', 'aguardando_retry', 'erro')
              AND p.modo NOT IN ('teste', 'simulacao')))
    ORDER BY e.processar_apos, e.created_at
    LIMIT least(greatest(coalesce(p_limite, 10), 1), 50)
    FOR UPDATE OF e SKIP LOCKED
  ), upd AS (
    UPDATE integracao.retorno_execucao x
    SET status = 'executando', reservado_ate = now() + interval '3 minutes', iniciado_em = coalesce(x.iniciado_em, now())
    FROM cand WHERE x.id = cand.id
    RETURNING x.id
  )
  SELECT array_agg(id) INTO v_ids FROM upd;

  RETURN (SELECT coalesce(jsonb_agg(integracao.fn_retorno_pacote_execucao(i)), '[]'::jsonb) FROM unnest(v_ids) i);
END;
$function$;

-- ---------- 5. expiração das execuções interativas ----------
CREATE OR REPLACE FUNCTION integracao.fn_retorno_interativo_expirar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE v_prev int; v_parada int;
BEGIN
  -- Prévia não confirmada dentro do prazo do nó "Confirmar com o usuário"
  UPDATE integracao.retorno_execucao
     SET status = 'descartado', finalizado_em = now(), reservado_ate = NULL,
         erro = 'Prévia expirada sem confirmação do usuário'
   WHERE modo = 'interativo' AND status = 'aguardando_confirmacao' AND processar_apos < now();
  GET DIAGNOSTICS v_prev = ROW_COUNT;

  -- Requisição do botão que caiu no meio (navegador fechado, timeout da Edge Function)
  UPDATE integracao.retorno_execucao
     SET status = 'erro', finalizado_em = now(), reservado_ate = NULL,
         erro = coalesce(erro, 'Tempo esgotado: a importação não terminou na requisição do usuário')
   WHERE modo = 'interativo'
     AND ((status = 'executando' AND reservado_ate < now())
          OR (status = 'pendente' AND updated_at < now() - interval '10 minutes'));
  GET DIAGNOSTICS v_parada = ROW_COUNT;

  RETURN jsonb_build_object('previas_expiradas', v_prev, 'interrompidas', v_parada);
END;
$function$;
REVOKE ALL ON FUNCTION integracao.fn_retorno_interativo_expirar() FROM public, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'retorno-interativo-expirar';
    PERFORM cron.schedule('retorno-interativo-expirar', '*/5 * * * *', 'SELECT integracao.fn_retorno_interativo_expirar()');
  END IF;
END $$;
