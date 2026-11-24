-- =====================================================================
-- Status S2 · 2/5 — Cálculo da situação do pedido e gatilhos · 2026-11-23
--
-- Uma fonte só: onda (movimento_saida), carga (carga / carga_documento) e entrega
-- (entrega / entrega_parada / entrega_tentativa). Nada é gravado pelas rotinas
-- operacionais: gatilhos de FIM DE TRANSAÇÃO (DEFERRABLE INITIALLY DEFERRED) chamam
-- public._fn_pedido_situacao_recalcular, que grava só se algo mudou. Falha vira WARNING
-- e nunca bloqueia coletor, entregador ou tela.
--
-- Etapa (ordem de decisão):
--   99 → excluido · 9 → cancelado · 0 ou sem onda ativa → aguardando_onda
--   onda CONCLUIDA/EXPORTADA_ERP ou carga ativa FECHADA → expedido
--   carga ativa aberta: embarcado (carga_documento.embarcado_em) > em_carregamento
--     (carga EM_CARREGAMENTO) > em_carga (EM_MONTAGEM/LIBERADA)
--   senão, pela onda: CRIADA/LIBERADO em_onda · EM_PICKING em_separacao · SEPARADO separado
--     · EM_CONFERENCIA em_conferencia · CONFERIDO conferido · EM_CARREGAMENTO em_carregamento
-- Entrega:
--   pedido cancelado/excluído → nao_se_aplica
--   parada na entrega não cancelada mais recente: ENTREGUE → entregue · NAO_ENTREGUE → nao_entregue
--     (motivo da última tentativa válida) · PENDENTE → em_rota (entrega EM_ROTA/CONCLUIDA) ou
--     aguardando_saida (AGUARDANDO_ACEITE)
--   carga de transportadora FECHADA → com_transportadora (decisão 3)
--   tipo de saída sem entrega → nao_se_aplica
--   carga ativa de veículo próprio e momento devido (MONTADA: liberada em diante; FECHADA:
--     fechada) sem parada → entrega_nao_gerada, com o motivo de _fn_entrega_motivo_sem_entrega
--   expedido sem carga → entrega_nao_gerada · senão aguardando_expedicao
-- =====================================================================

-- 1) Cálculo (somente leitura) ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_pedido_situacao_calcular(p_documento_id uuid)
RETURNS TABLE (etapa text, etapa_em timestamptz, onda_numero bigint, carga_numero bigint,
               entrega_status text, entrega_em timestamptz, entrega_motivo text, entrega_tentativas integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d   record;
  o   record;
  k   record;
  ts  record;
  pa  record;
  t   record;
  v_aberta  boolean;
  v_devido  boolean;
BEGIN
  SELECT ds.id, ds.status, ds.tipo_pedido_id INTO d FROM documento_saida ds WHERE ds.id = p_documento_id;
  IF d.id IS NULL THEN RETURN; END IF;

  -- onda atual (a não cancelada mais recente)
  SELECT ms.id, ms.numero_onda, ms.status::text AS status, ms.tipo_saida, ms.finalizado_em
    INTO o
    FROM movimento_saida_documento msd
    JOIN movimento_saida ms ON ms.id = msd.movimento_saida_id
   WHERE msd.documento_saida_id = p_documento_id
   ORDER BY (ms.status::text <> 'CANCELADA') DESC, ms.created_at DESC
   LIMIT 1;

  -- carga atual (vínculo ativo primeiro; depois a não cancelada mais recente)
  SELECT cd.id AS cd_id, cd.ativo, cd.embarcado_em, c.id, c.numero_carga, c.status, c.modalidade,
         c.liberada_em, c.iniciada_em, c.fechada_em
    INTO k
    FROM carga_documento cd
    JOIN carga c ON c.id = cd.carga_id
   WHERE cd.documento_saida_id = p_documento_id
   ORDER BY cd.ativo DESC, (c.status <> 'CANCELADA') DESC, c.created_at DESC
   LIMIT 1;
  v_aberta := k.id IS NOT NULL AND k.ativo AND k.status IN ('EM_MONTAGEM', 'LIBERADA', 'EM_CARREGAMENTO');

  SELECT tsx.realiza_entrega, tsx.entrega_gerar_em INTO ts
    FROM tipo_saida tsx WHERE tsx.id = COALESCE(d.tipo_pedido_id, o.tipo_saida);

  onda_numero  := CASE WHEN o.status IS DISTINCT FROM 'CANCELADA' THEN o.numero_onda END;
  carga_numero := CASE WHEN k.id IS NOT NULL AND k.ativo AND k.status <> 'CANCELADA' THEN k.numero_carga END;

  -- ---------- etapa ----------
  IF d.status = 99 THEN
    etapa := 'excluido';
  ELSIF d.status = 9 THEN
    etapa := 'cancelado';
  ELSIF d.status = 0 OR o.id IS NULL OR o.status = 'CANCELADA' THEN
    etapa := 'aguardando_onda';
  ELSIF o.status IN ('CONCLUIDA', 'EXPORTADA_ERP') OR (k.id IS NOT NULL AND k.ativo AND k.status = 'FECHADA') THEN
    etapa := 'expedido';
    etapa_em := COALESCE(CASE WHEN k.ativo THEN k.fechada_em END, o.finalizado_em);
  ELSIF v_aberta THEN
    IF k.embarcado_em IS NOT NULL THEN
      etapa := 'embarcado';        etapa_em := k.embarcado_em;
    ELSIF k.status = 'EM_CARREGAMENTO' THEN
      etapa := 'em_carregamento';  etapa_em := k.iniciada_em;
    ELSE
      etapa := 'em_carga';         etapa_em := k.liberada_em;
    END IF;
  ELSE
    etapa := CASE o.status
               WHEN 'CRIADA' THEN 'em_onda' WHEN 'LIBERADO' THEN 'em_onda'
               WHEN 'EM_PICKING' THEN 'em_separacao' WHEN 'SEPARADO' THEN 'separado'
               WHEN 'EM_CONFERENCIA' THEN 'em_conferencia' WHEN 'CONFERIDO' THEN 'conferido'
               WHEN 'EM_CARREGAMENTO' THEN 'em_carregamento'
               ELSE 'em_onda' END;
  END IF;

  -- ---------- entrega ----------
  SELECT count(*)::int INTO entrega_tentativas
    FROM entrega_tentativa et WHERE et.documento_saida_id = p_documento_id AND et.estornada_em IS NULL;

  IF d.status IN (9, 99) THEN
    entrega_status := 'nao_se_aplica';
    RETURN NEXT; RETURN;
  END IF;

  SELECT p.status, p.entregue_em, p.finalizada_em, e.status AS entrega_status, e.atribuida_em, e.aceita_em
    INTO pa
    FROM entrega_parada p
    JOIN entrega e ON e.id = p.entrega_id
   WHERE p.documento_saida_id = p_documento_id AND e.status <> 'CANCELADA'
   ORDER BY e.created_at DESC, p.created_at DESC
   LIMIT 1;

  IF pa.status IS NOT NULL THEN
    IF pa.status IN ('ENTREGUE', 'NAO_ENTREGUE') THEN
      SELECT et.registrada_em, mo.descricao AS motivo, oc.observacao
        INTO t
        FROM entrega_tentativa et
        LEFT JOIN motivo_ocorrencia mo ON mo.id = et.motivo_ocorrencia_id
        LEFT JOIN ocorrencia_operacional oc ON oc.id = et.ocorrencia_id
       WHERE et.documento_saida_id = p_documento_id AND et.estornada_em IS NULL
       ORDER BY et.registrada_em DESC, et.created_at DESC
       LIMIT 1;
    END IF;
    IF pa.status = 'ENTREGUE' THEN
      entrega_status := 'entregue';
      entrega_em := COALESCE(pa.entregue_em, t.registrada_em, pa.finalizada_em);
    ELSIF pa.status = 'NAO_ENTREGUE' THEN
      entrega_status := 'nao_entregue';
      entrega_em := COALESCE(t.registrada_em, pa.finalizada_em);
      entrega_motivo := COALESCE(t.motivo, t.observacao, 'Não entregue');
    ELSIF pa.entrega_status = 'AGUARDANDO_ACEITE' THEN
      entrega_status := 'aguardando_saida';
      entrega_em := pa.atribuida_em;
    ELSE
      entrega_status := 'em_rota';
      entrega_em := pa.aceita_em;
    END IF;
    RETURN NEXT; RETURN;
  END IF;

  IF k.id IS NOT NULL AND k.ativo AND k.status = 'FECHADA' AND k.modalidade = 'TERCEIRO' THEN
    entrega_status := 'com_transportadora';
    entrega_em := k.fechada_em;
  ELSIF NOT COALESCE(ts.realiza_entrega, false) THEN
    entrega_status := 'nao_se_aplica';
  ELSIF k.id IS NOT NULL AND k.ativo AND k.status <> 'CANCELADA' THEN
    v_devido := k.modalidade = 'PROPRIA'
                AND (k.status = 'FECHADA' OR (ts.entrega_gerar_em = 'MONTADA' AND k.status IN ('LIBERADA', 'EM_CARREGAMENTO')));
    IF v_devido THEN
      entrega_status := 'entrega_nao_gerada';
      entrega_motivo := COALESCE(
        public._fn_entrega_motivo_sem_entrega(k.id),
        CASE WHEN EXISTS (SELECT 1 FROM entrega e2 WHERE e2.carga_id = k.id AND e2.status = 'CANCELADA')
             THEN 'A entrega desta carga foi cancelada. Gere a entrega de novo na Montagem de Carga.'
             ELSE 'A entrega ainda não foi gerada para esta carga.' END);
    ELSE
      entrega_status := 'aguardando_expedicao';
    END IF;
  ELSIF etapa = 'expedido' THEN
    entrega_status := 'entrega_nao_gerada';
    entrega_motivo := 'O pedido foi expedido sem carga de entrega (o tipo de saída não realiza embarque).';
    entrega_em := etapa_em;
  ELSE
    entrega_status := 'aguardando_expedicao';
  END IF;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public._fn_pedido_situacao_calcular(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Resumo de entrega da onda ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_onda_entrega_resumo(p_movimento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_ordem constant text[] := ARRAY['nao_se_aplica', 'com_transportadora', 'entregue', 'aguardando_expedicao',
                                   'aguardando_saida', 'em_rota', 'entrega_nao_gerada', 'nao_entregue'];
  r record;
BEGIN
  SELECT coalesce(c_ordem[max(array_position(c_ordem, d.entrega_status))], 'nao_se_aplica') AS resumo,
         count(*) FILTER (WHERE d.entrega_status NOT IN ('nao_se_aplica', 'com_transportadora'))::int AS total,
         count(*) FILTER (WHERE d.entrega_status = 'entregue')::int AS entregues,
         count(*) FILTER (WHERE d.entrega_status = 'nao_entregue')::int AS nao_entregues
    INTO r
    FROM movimento_saida_documento msd
    JOIN documento_saida d ON d.id = msd.documento_saida_id
   WHERE msd.movimento_saida_id = p_movimento_id
     AND d.status NOT IN (9, 99);

  UPDATE movimento_saida ms SET
    entrega_resumo = r.resumo, entrega_total = r.total,
    entrega_entregues = r.entregues, entrega_nao_entregues = r.nao_entregues
   WHERE ms.id = p_movimento_id
     AND (ms.entrega_resumo, ms.entrega_total, ms.entrega_entregues, ms.entrega_nao_entregues)
         IS DISTINCT FROM (r.resumo, r.total, r.entregues, r.nao_entregues);
END;
$function$;

REVOKE ALL ON FUNCTION public._fn_onda_entrega_resumo(uuid) FROM PUBLIC, anon, authenticated;

-- 3) Recálculo de um pedido (grava só se mudou) e das ondas dele ------------------------------
CREATE OR REPLACE FUNCTION public._fn_pedido_situacao_recalcular(p_documento_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c     record;
  v_mov uuid;
BEGIN
  SELECT * INTO c FROM public._fn_pedido_situacao_calcular(p_documento_id);
  IF c.etapa IS NULL THEN RETURN NULL; END IF;

  UPDATE documento_saida d SET
    etapa              = c.etapa,
    etapa_em           = CASE WHEN d.etapa IS DISTINCT FROM c.etapa THEN COALESCE(c.etapa_em, now()) ELSE d.etapa_em END,
    etapa_onda_numero  = c.onda_numero,
    etapa_carga_numero = c.carga_numero,
    entrega_status     = c.entrega_status,
    entrega_em         = CASE WHEN c.entrega_em IS NOT NULL THEN c.entrega_em
                              WHEN d.entrega_status IS DISTINCT FROM c.entrega_status THEN NULL
                              ELSE d.entrega_em END,
    entrega_motivo     = c.entrega_motivo,
    entrega_tentativas = c.entrega_tentativas
   WHERE d.id = p_documento_id
     AND (d.etapa, d.etapa_onda_numero, d.etapa_carga_numero, d.entrega_status, d.entrega_em, d.entrega_motivo, d.entrega_tentativas)
         IS DISTINCT FROM (c.etapa, c.onda_numero, c.carga_numero, c.entrega_status,
                           CASE WHEN c.entrega_em IS NOT NULL THEN c.entrega_em
                                WHEN d.entrega_status IS DISTINCT FROM c.entrega_status THEN NULL
                                ELSE d.entrega_em END,
                           c.entrega_motivo, c.entrega_tentativas);

  FOR v_mov IN SELECT msd.movimento_saida_id FROM movimento_saida_documento msd WHERE msd.documento_saida_id = p_documento_id LOOP
    PERFORM public._fn_onda_entrega_resumo(v_mov);
  END LOOP;
  RETURN c.etapa;
END;
$function$;

REVOKE ALL ON FUNCTION public._fn_pedido_situacao_recalcular(uuid) FROM PUBLIC, anon, authenticated;

-- 4) Gatilho genérico (fim da transação) ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_pedido_situacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_docs uuid[];
  v_doc  uuid;
  v_onda uuid;
BEGIN
  BEGIN
    CASE TG_TABLE_NAME
      WHEN 'documento_saida' THEN
        v_docs := ARRAY[NEW.id];
      WHEN 'movimento_saida' THEN
        SELECT array_agg(msd.documento_saida_id) INTO v_docs
          FROM movimento_saida_documento msd WHERE msd.movimento_saida_id = NEW.id;
      WHEN 'movimento_saida_documento' THEN
        IF TG_OP = 'DELETE' THEN
          v_docs := ARRAY[OLD.documento_saida_id]; v_onda := OLD.movimento_saida_id;
        ELSE
          v_docs := ARRAY[NEW.documento_saida_id];
        END IF;
      WHEN 'carga' THEN
        SELECT array_agg(DISTINCT cd.documento_saida_id) INTO v_docs
          FROM carga_documento cd WHERE cd.carga_id = NEW.id;
      WHEN 'carga_documento' THEN
        v_docs := ARRAY[NEW.documento_saida_id];
      WHEN 'entrega' THEN
        SELECT array_agg(DISTINCT p.documento_saida_id) INTO v_docs
          FROM entrega_parada p WHERE p.entrega_id = NEW.id;
      WHEN 'entrega_parada' THEN
        v_docs := CASE WHEN TG_OP = 'DELETE' THEN ARRAY[OLD.documento_saida_id] ELSE ARRAY[NEW.documento_saida_id] END;
      WHEN 'entrega_tentativa' THEN
        v_docs := ARRAY[NEW.documento_saida_id];
      ELSE
        v_docs := '{}';
    END CASE;

    FOREACH v_doc IN ARRAY coalesce(v_docs, '{}') LOOP
      IF v_doc IS NOT NULL THEN
        PERFORM public._fn_pedido_situacao_recalcular(v_doc);
      END IF;
    END LOOP;
    -- pedido saiu da onda: o resumo da onda antiga também muda
    IF v_onda IS NOT NULL THEN
      PERFORM public._fn_onda_entrega_resumo(v_onda);
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[situacao_pedido] não recalculada (% %): % %', TG_TABLE_NAME, TG_OP, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_pedido_situacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_situacao_doc_saida_ins ON public.documento_saida;
CREATE CONSTRAINT TRIGGER trg_zz_situacao_doc_saida_ins
  AFTER INSERT ON public.documento_saida DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedido_situacao();

DROP TRIGGER IF EXISTS trg_zz_situacao_doc_saida_upd ON public.documento_saida;
CREATE CONSTRAINT TRIGGER trg_zz_situacao_doc_saida_upd
  AFTER UPDATE OF status, tipo_pedido_id ON public.documento_saida DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.tipo_pedido_id IS DISTINCT FROM NEW.tipo_pedido_id)
  EXECUTE FUNCTION public.trg_pedido_situacao();

DROP TRIGGER IF EXISTS trg_zz_situacao_mov_saida ON public.movimento_saida;
CREATE CONSTRAINT TRIGGER trg_zz_situacao_mov_saida
  AFTER UPDATE OF status ON public.movimento_saida DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_pedido_situacao();

DROP TRIGGER IF EXISTS trg_zz_situacao_mov_saida_doc ON public.movimento_saida_documento;
CREATE CONSTRAINT TRIGGER trg_zz_situacao_mov_saida_doc
  AFTER INSERT OR DELETE ON public.movimento_saida_documento DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedido_situacao();

DROP TRIGGER IF EXISTS trg_zz_situacao_carga ON public.carga;
CREATE CONSTRAINT TRIGGER trg_zz_situacao_carga
  AFTER UPDATE OF status, modalidade ON public.carga DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.modalidade IS DISTINCT FROM NEW.modalidade)
  EXECUTE FUNCTION public.trg_pedido_situacao();

DROP TRIGGER IF EXISTS trg_zz_situacao_carga_doc ON public.carga_documento;
CREATE CONSTRAINT TRIGGER trg_zz_situacao_carga_doc
  AFTER INSERT OR UPDATE OF ativo, embarcado_em, carga_id ON public.carga_documento DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedido_situacao();

DROP TRIGGER IF EXISTS trg_zz_situacao_entrega ON public.entrega;
CREATE CONSTRAINT TRIGGER trg_zz_situacao_entrega
  AFTER INSERT OR UPDATE OF status ON public.entrega DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedido_situacao();

DROP TRIGGER IF EXISTS trg_zz_situacao_entrega_parada ON public.entrega_parada;
CREATE CONSTRAINT TRIGGER trg_zz_situacao_entrega_parada
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.entrega_parada DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedido_situacao();

DROP TRIGGER IF EXISTS trg_zz_situacao_entrega_tentativa ON public.entrega_tentativa;
CREATE CONSTRAINT TRIGGER trg_zz_situacao_entrega_tentativa
  AFTER INSERT OR UPDATE OF estornada_em ON public.entrega_tentativa DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_pedido_situacao();
