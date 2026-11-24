-- =====================================================================
-- 2026-11-23 · Entregas · fechamento da carga pela entrega (opção A)
--
-- Cenário: tipo de saída com entrega gerada na carga MONTADA. O embarque no
-- coletor pode não acontecer, e a carga ficava LIBERADA para sempre (onda sem
-- conclusão, sem baixa e sem retorno ao ERP).
--
-- R1  Volume lido no cliente (entrega_parada_conferir_volume) confirma o
--     embarque da unidade: mesma gravação do bip (tarefa concluída, unidade
--     EMBARCADA, volume EXPEDIDO, carga/onda em carregamento), evento de carga
--     VOLUME_CONFIRMADO_NA_ENTREGA.
-- R2  A 1ª parada registrada (ENTREGUE ou NAO_ENTREGUE) prova a saída do
--     veículo: a carga LIBERADA/EM_CARREGAMENTO fecha sozinha e conclui as
--     ondas (etapa 3), como embarque_fechar_carga. Unidades sem leitura não
--     bloqueiam (ficam listadas no evento CARGA_FECHADA_PELA_ENTREGA);
--     divergência volumes × NF vira aviso. Só vale se TODOS os pedidos ativos
--     da carga são de tipo com entrega na carga montada; senão a carga segue o
--     embarque normal (evento FECHAMENTO_PELA_ENTREGA_PENDENTE).
-- R3  Embarque feito no coletor antes: nada muda (a carga já está FECHADA).
-- Ao concluir a entrega, tarefas de embarque de unidades nunca lidas são
-- canceladas (cancelado_origem ENTREGA_SEM_LEITURA).
-- Nunca bloqueia o entregador: falha vira evento ENTREGA_FALHA_FECHAMENTO.
-- Reverter: supabase/rollback/20261123_entregas_fechamento_carga_reverter.sql
-- =====================================================================

-- ---------- R1 ----------
CREATE OR REPLACE FUNCTION public._fn_carga_unidade_confirmar_entrega(p_unidade_id uuid, p_usuario_id uuid, p_entrega_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_un record; v_c record; v_tot int; v_emb int;
BEGIN
  SELECT cu.* INTO v_un FROM carga_unidade cu WHERE cu.id = p_unidade_id FOR UPDATE;
  IF v_un.id IS NULL OR v_un.status <> 'PENDENTE' THEN RETURN false; END IF;
  SELECT c.* INTO v_c FROM carga c WHERE c.id = v_un.carga_id FOR UPDATE;
  IF v_c.status = 'CANCELADA' THEN RETURN false; END IF;

  IF v_un.tarefa_id IS NOT NULL THEN
    INSERT INTO tarefa_execucao (tenant_id, tarefa_id, usuario_id, status, atribuido_em, iniciado_em, concluido_em, quantidade_executada, hu)
    VALUES (v_un.tenant_id, v_un.tarefa_id, p_usuario_id, 'CONCLUIDA', now(), now(), now(), 1,
            CASE WHEN v_un.tipo::text = 'HU' THEN v_un.referencia_id END);
    UPDATE tarefa SET status = 'CONCLUIDA', quantidade_executada = 1, concluido_em = now()
     WHERE id = v_un.tarefa_id AND status <> 'CONCLUIDA';
  END IF;
  UPDATE carga_unidade SET status = 'EMBARCADA', embarcada_em = now(), embarcada_por = p_usuario_id, updated_by = p_usuario_id
   WHERE id = v_un.id;
  IF v_un.tipo::text = 'VOLUME' THEN
    UPDATE volume_expedicao SET status = 'EXPEDIDO' WHERE id = v_un.referencia_id AND status <> 'EXPEDIDO';
  END IF;

  IF v_c.status IN ('LIBERADA','EM_CARREGAMENTO') THEN
    UPDATE movimento_saida SET status_pre_carregamento = status, status = 'EM_CARREGAMENTO'
     WHERE id = v_un.movimento_saida_id AND status IN ('CONFERIDO','SEPARADO');
    IF v_c.status = 'LIBERADA' THEN
      UPDATE carga SET status = 'EM_CARREGAMENTO', iniciada_em = now(), updated_by = p_usuario_id WHERE id = v_c.id;
    END IF;
  END IF;

  IF v_un.carga_documento_id IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE x.status <> 'CANCELADA'), count(*) FILTER (WHERE x.status = 'EMBARCADA')
      INTO v_tot, v_emb FROM carga_unidade x WHERE x.carga_documento_id = v_un.carga_documento_id;
    IF v_tot = v_emb THEN
      UPDATE carga_documento SET embarcado_em = now(), updated_by = p_usuario_id WHERE id = v_un.carga_documento_id AND embarcado_em IS NULL;
    END IF;
  END IF;

  PERFORM public._fn_carga_registrar_evento(v_c.id, 'VOLUME_CONFIRMADO_NA_ENTREGA', p_usuario_id,
    jsonb_build_object('carga_unidade_id', v_un.id, 'codigo', v_un.codigo, 'entrega_id', p_entrega_id));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.entrega_parada_conferir_volume(
  p_tenant_id uuid, p_usuario_id uuid, p_parada_id uuid, p_codigo text, p_digitado boolean DEFAULT false,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_p public.entrega_parada; v_cod text := upper(btrim(COALESCE(p_codigo, ''))); v_un record; v_outra record;
        v_tot int; v_conf int;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'COLETOR');
  IF v_cod = '' THEN RAISE EXCEPTION 'ENTREGA_VOLUME_CODIGO_VAZIO: leia a etiqueta do volume.'; END IF;
  v_p := public._fn_entrega_parada_para_acao(p_tenant_id, p_parada_id, v_u);
  IF NOT v_p.confere_volume THEN
    RAISE EXCEPTION 'ENTREGA_SEM_CONFERENCIA_VOLUME: este pedido não exige leitura dos volumes na entrega.';
  END IF;

  SELECT cu.* INTO v_un
    FROM carga_unidade cu
    LEFT JOIN documento_saida ds ON ds.id = v_p.documento_saida_id
   WHERE cu.carga_documento_id = v_p.carga_documento_id AND cu.status <> 'CANCELADA'
     AND (upper(cu.codigo) = v_cod OR (cu.tipo::text IN ('DOCUMENTO','CONFIRMACAO') AND upper(COALESCE(ds.codigo_erp, '')) = v_cod))
   ORDER BY cu.sequencia LIMIT 1;

  IF v_un.id IS NULL THEN
    SELECT p.sequencia, p.parceiro_nome, p.numero_pedido INTO v_outra
      FROM entrega_parada p JOIN carga_unidade cu ON cu.carga_documento_id = p.carga_documento_id AND cu.status <> 'CANCELADA'
     WHERE p.entrega_id = v_p.entrega_id AND p.id <> v_p.id AND upper(cu.codigo) = v_cod LIMIT 1;
    IF v_outra.sequencia IS NOT NULL THEN
      RAISE EXCEPTION 'ENTREGA_VOLUME_OUTRA_PARADA: este volume é da parada % (%, pedido %). Não entregue aqui.',
        v_outra.sequencia, COALESCE(v_outra.parceiro_nome, 'outro cliente'), COALESCE(v_outra.numero_pedido, '—');
    END IF;
    RAISE EXCEPTION 'ENTREGA_VOLUME_NAO_ENCONTRADO: o código % não é volume deste pedido.', v_cod;
  END IF;
  IF EXISTS (SELECT 1 FROM entrega_volume ev WHERE ev.entrega_parada_id = v_p.id AND ev.carga_unidade_id = v_un.id) THEN
    RAISE EXCEPTION 'ENTREGA_VOLUME_JA_CONFERIDO: % já foi lido nesta entrega.', COALESCE(v_un.descricao, v_un.codigo);
  END IF;

  INSERT INTO entrega_volume (tenant_id, empresa_id, entrega_id, entrega_parada_id, carga_unidade_id, codigo, digitado,
                              conferido_por, latitude, longitude)
  VALUES (v_p.tenant_id, v_p.empresa_id, v_p.entrega_id, v_p.id, v_un.id, v_un.codigo, COALESCE(p_digitado, false),
          v_u, p_latitude, p_longitude);
  PERFORM public._fn_entrega_evento(v_p.entrega_id, v_p.id, 'VOLUME_CONFERIDO', v_u, p_latitude, p_longitude,
    jsonb_build_object('carga_unidade_id', v_un.id, 'codigo', v_un.codigo, 'digitado', COALESCE(p_digitado, false)));
  -- R1: a leitura no cliente confirma o embarque da unidade
  PERFORM public._fn_carga_unidade_confirmar_entrega(v_un.id, v_u, v_p.entrega_id);

  SELECT count(*)::int, count(ev.id)::int INTO v_tot, v_conf
    FROM carga_unidade cu LEFT JOIN entrega_volume ev ON ev.entrega_parada_id = v_p.id AND ev.carga_unidade_id = cu.id
   WHERE cu.carga_documento_id = v_p.carga_documento_id AND cu.status <> 'CANCELADA';

  RETURN jsonb_build_object('sucesso', true, 'codigo', CASE WHEN v_conf >= v_tot THEN 'ENTREGA_VOLUMES_COMPLETOS' ELSE 'ENTREGA_VOLUME_CONFERIDO' END,
    'mensagem', CASE WHEN v_conf >= v_tot THEN format('Todos os %s volume(s) conferidos.', v_tot)
                     ELSE format('%s lido (%s de %s).', COALESCE(v_un.descricao, v_un.codigo), v_conf, v_tot) END,
    'dados', jsonb_build_object('total', v_tot, 'conferidos', v_conf, 'codigo', v_un.codigo, 'entrega', public._fn_entrega_json(v_p.entrega_id)));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- R2 ----------
CREATE OR REPLACE FUNCTION public._fn_carga_fechar_pela_entrega(p_carga_id uuid, p_usuario_id uuid, p_entrega_id uuid, p_parada_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c record; v_outros text; v_aviso text; v_sem jsonb; v_onda uuid; v_n int := 0;
BEGIN
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id FOR UPDATE;
  IF v_c.id IS NULL OR v_c.modalidade <> 'PROPRIA' OR v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RETURN 'IGNORADA';
  END IF;

  -- só fecha pela entrega quando nenhum pedido ativo depende do embarque no coletor
  SELECT string_agg(DISTINCT COALESCE(ds.numero_pedido::text, ds.codigo_erp, '?'), ', ') INTO v_outros
    FROM carga_documento cd
    JOIN documento_saida ds ON ds.id = cd.documento_saida_id
    LEFT JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
    LEFT JOIN tipo_saida ts ON ts.id = COALESCE(ds.tipo_pedido_id, ms.tipo_saida)
   WHERE cd.carga_id = p_carga_id AND cd.ativo
     AND NOT (COALESCE(ts.realiza_entrega, false) AND ts.entrega_gerar_em = 'MONTADA');
  IF v_outros IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM carga_evento e WHERE e.carga_id = p_carga_id AND e.tipo = 'FECHAMENTO_PELA_ENTREGA_PENDENTE') THEN
      PERFORM public._fn_carga_registrar_evento(p_carga_id, 'FECHAMENTO_PELA_ENTREGA_PENDENTE', p_usuario_id,
        jsonb_build_object('entrega_id', p_entrega_id, 'pedidos_com_embarque', v_outros,
          'mensagem', 'Há pedidos que exigem o embarque no coletor; conclua o carregamento normalmente.'));
    END IF;
    RETURN 'PEDIDOS_EXIGEM_EMBARQUE';
  END IF;

  -- volumes × NF: a mercadoria já saiu, então a divergência vira aviso
  SELECT string_agg(format('pedido %s: %s no WMS, %s na NF %s', d->>'numero_pedido', d->>'wms_volumes', d->>'nf_qtd_volumes',
                           COALESCE(d->>'nota_fiscal', '?')), '; ')
    INTO v_aviso
    FROM (SELECT DISTINCT cd.documento_saida_id FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo) x
   CROSS JOIN LATERAL public._fn_volume_nf_conferir(x.documento_saida_id) d
   WHERE COALESCE((d->>'divergente')::boolean, false) AND d->>'regra' <> 'IGNORAR';

  SELECT COALESCE(jsonb_agg(cu.codigo ORDER BY cu.sequencia), '[]'::jsonb) INTO v_sem
    FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'PENDENTE';

  UPDATE carga SET status = 'FECHADA', fechada_em = now(), fechada_por = p_usuario_id, updated_by = p_usuario_id WHERE id = p_carga_id;
  FOR v_onda IN SELECT DISTINCT cd.movimento_saida_id FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo LOOP
    PERFORM public.fn_onda_concluir_etapa(v_c.tenant_id, v_onda, 3);
    v_n := v_n + 1;
  END LOOP;

  PERFORM public._fn_carga_registrar_evento(p_carga_id, 'CARGA_FECHADA_PELA_ENTREGA', p_usuario_id,
    jsonb_build_object('entrega_id', p_entrega_id, 'entrega_parada_id', p_parada_id, 'ondas_concluidas', v_n,
      'unidades_sem_leitura', v_sem, 'aviso_volumes_nf', v_aviso));
  RETURN 'FECHADA';
END $$;

CREATE OR REPLACE FUNCTION public._fn_trg_entrega_parada_fechar_carga()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_e record; v_u uuid := COALESCE(NEW.updated_by, NEW.entregue_por);
BEGIN
  SELECT e.id, e.carga_id, e.tenant_id, e.empresa_id, e.usuario_id INTO v_e FROM entrega e WHERE e.id = NEW.entrega_id;
  BEGIN
    PERFORM public._fn_carga_fechar_pela_entrega(v_e.carga_id, COALESCE(v_u, v_e.usuario_id), v_e.id, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
    VALUES (v_e.tenant_id, v_e.empresa_id, v_e.carga_id, 'ENTREGA_FALHA_FECHAMENTO', v_u,
            jsonb_build_object('erro', SQLERRM, 'entrega_id', v_e.id, 'entrega_parada_id', NEW.id), v_u);
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_entrega_parada_fechar_carga ON public.entrega_parada;
CREATE TRIGGER trg_entrega_parada_fechar_carga AFTER UPDATE OF status ON public.entrega_parada
  FOR EACH ROW WHEN (OLD.status = 'PENDENTE' AND NEW.status IN ('ENTREGUE','NAO_ENTREGUE'))
  EXECUTE FUNCTION public._fn_trg_entrega_parada_fechar_carga();

-- ---------- tarefas de embarque nunca lidas, ao concluir a entrega ----------
CREATE OR REPLACE FUNCTION public._fn_trg_entrega_concluida_tarefas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  BEGIN
    UPDATE tarefa t SET status = 'CANCELADA', cancelado_em = now(), cancelado_por = NEW.updated_by,
           cancelado_origem = 'ENTREGA_SEM_LEITURA'
      FROM carga_unidade cu JOIN carga c ON c.id = cu.carga_id
     WHERE cu.carga_id = NEW.carga_id AND c.status = 'FECHADA' AND cu.status = 'PENDENTE'
       AND t.id = cu.tarefa_id AND t.status NOT IN ('CONCLUIDA','CANCELADA');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
    VALUES (NEW.tenant_id, NEW.empresa_id, NEW.carga_id, 'ENTREGA_FALHA_FECHAMENTO', NEW.updated_by,
            jsonb_build_object('erro', SQLERRM, 'entrega_id', NEW.id, 'etapa', 'cancelar_tarefas_sem_leitura'), NEW.updated_by);
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_entrega_concluida_tarefas ON public.entrega;
CREATE TRIGGER trg_entrega_concluida_tarefas AFTER UPDATE OF status ON public.entrega
  FOR EACH ROW WHEN (NEW.status = 'CONCLUIDA' AND OLD.status IS DISTINCT FROM 'CONCLUIDA')
  EXECUTE FUNCTION public._fn_trg_entrega_concluida_tarefas();

REVOKE ALL ON FUNCTION public._fn_carga_unidade_confirmar_entrega(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_carga_fechar_pela_entrega(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_trg_entrega_parada_fechar_carga() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_trg_entrega_concluida_tarefas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.entrega_parada_conferir_volume(uuid, uuid, uuid, text, boolean, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrega_parada_conferir_volume(uuid, uuid, uuid, text, boolean, numeric, numeric) TO authenticated, service_role;

-- ---------- acerto das cargas já nessa situação (QA: carga 309) ----------
DO $$
DECLARE r record; v record; v_p uuid; v_auth uuid;
BEGIN
  FOR r IN SELECT DISTINCT e.id AS entrega_id, e.carga_id, e.usuario_id
             FROM entrega e JOIN carga c ON c.id = e.carga_id
            WHERE e.status <> 'CANCELADA' AND c.modalidade = 'PROPRIA' AND c.status IN ('LIBERADA','EM_CARREGAMENTO')
              AND EXISTS (SELECT 1 FROM entrega_parada p WHERE p.entrega_id = e.id AND p.status <> 'PENDENTE') LOOP
    -- sessão do entregador (as guardas de tenant de tarefa_execucao leem o usuário da sessão)
    SELECT u.auth_user_id INTO v_auth FROM usuario u WHERE u.id = r.usuario_id;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    FOR v IN SELECT ev.carga_unidade_id, ev.conferido_por FROM entrega_volume ev WHERE ev.entrega_id = r.entrega_id LOOP
      PERFORM public._fn_carga_unidade_confirmar_entrega(v.carga_unidade_id, COALESCE(v.conferido_por, r.usuario_id), r.entrega_id);
    END LOOP;
    SELECT p.id INTO v_p FROM entrega_parada p WHERE p.entrega_id = r.entrega_id AND p.status <> 'PENDENTE'
     ORDER BY p.finalizada_em NULLS LAST LIMIT 1;
    PERFORM public._fn_carga_fechar_pela_entrega(r.carga_id, r.usuario_id, r.entrega_id, v_p);
  END LOOP;
END $$;
