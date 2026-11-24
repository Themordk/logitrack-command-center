-- =====================================================================
-- 2026-11-23 · Retorno ao ERP · eventos de embarque e entrega (por pedido)
--
-- Catálogo: 8 eventos novos de documento_saida, disparados pelas tabelas de
-- carga e entrega (não pela troca de status da onda, que segue como antes):
--   saida.carga_montada       carga liberada (ou pedido incluído em carga já liberada)
--   saida.pedido_embarcado    todas as unidades do pedido embarcadas (coletor ou leitura na entrega)
--   saida.carga_fechada       carga fechada (origem COLETOR ou ENTREGA)
--   saida.retirado_da_carga   pedido sai de carga já liberada ou a carga é cancelada
--   saida.saiu_para_entrega   entregador aceitou a carga
--   saida.entregue            tentativa ENTREGUE
--   saida.nao_entregue        tentativa NAO_ENTREGUE
--   saida.entrega_estornada   tentativa estornada (correção)
-- Contexto: fn_retorno_contexto ganha os blocos `carga` e `entrega` em todo
-- evento de saída; eventos de tentativa levam a tentativa do momento em
-- `evento_dados` (o estorno não manda o resultado já corrigido).
-- Disparo: só grava se a empresa tem fluxo ativo para o evento
-- (fn_retorno_emitir_extra). Gatilhos de carga/carga_documento são
-- constraint triggers DEFERRABLE INITIALLY DEFERRED (rodam no commit, com o
-- estado final: ex. carga_cancelar desativa os pedidos antes de mudar o
-- status). Nada bloqueia a operação: falha vira retorno_evento erro_contexto.
-- Reverter: supabase/rollback/20261123_retorno_eventos_embarque_entrega_reverter.sql
-- =====================================================================

-- ---------- 1. catálogo ----------
INSERT INTO integracao.retorno_evento_catalogo (codigo, entidade, origem_tabela, status_origem, nome, descricao, ordem, ativo) VALUES
 ('saida.carga_montada', 'documento_saida', 'carga', 'LIBERADA', 'Saída · Pedido em carga montada',
  'A carga com o pedido foi liberada para o embarque (ou o pedido entrou numa carga já liberada). Traz carga, veículo e motorista.', 142, true),
 ('saida.pedido_embarcado', 'documento_saida', 'carga_documento', 'EMBARCADO', 'Saída · Pedido embarcado',
  'Todos os volumes do pedido foram embarcados no veículo (bip no coletor ou leitura na entrega).', 155, true),
 ('saida.carga_fechada', 'documento_saida', 'carga', 'FECHADA', 'Saída · Carga fechada',
  'A carga do pedido foi fechada (carregada/expedida). carga.fechamento_origem = COLETOR ou ENTREGA (1ª parada registrada).', 158, true),
 ('saida.saiu_para_entrega', 'documento_saida', 'entrega', 'EM_ROTA', 'Saída · Saiu para entrega',
  'O entregador aceitou a carga e o pedido está em rota (veículo próprio).', 161, true),
 ('saida.entregue', 'documento_saida', 'entrega_tentativa', 'ENTREGUE', 'Saída · Entregue',
  'Entrega confirmada com foto do canhoto. evento_dados traz recebedor, horário, localização e ressalvas.', 162, true),
 ('saida.nao_entregue', 'documento_saida', 'entrega_tentativa', 'NAO_ENTREGUE', 'Saída · Não entregue',
  'Tentativa sem sucesso por ocorrência que impede a entrega. evento_dados traz o motivo e a observação.', 163, true),
 ('saida.entrega_estornada', 'documento_saida', 'entrega_tentativa', 'ESTORNADA', 'Saída · Entrega estornada',
  'O supervisor corrigiu uma tentativa já registrada (entregue ou não entregue). Use para desfazer no ERP.', 164, true),
 ('saida.retirado_da_carga', 'documento_saida', 'carga_documento', 'RETIRADO', 'Saída · Pedido retirado da carga',
  'O pedido saiu de uma carga já liberada ou a carga foi cancelada. evento_dados.motivo = PEDIDO_RETIRADO ou CARGA_CANCELADA.', 166, true)
ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, ordem = EXCLUDED.ordem,
  origem_tabela = EXCLUDED.origem_tabela, status_origem = EXCLUDED.status_origem, ativo = true;

-- ---------- 2. blocos de contexto ----------
CREATE OR REPLACE FUNCTION integracao.fn_retorno_contexto_carga(p_documento_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'integracao' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'numero', c.numero_carga, 'status', c.status, 'modalidade', c.modalidade,
    'pedido_ativo', cd.ativo, 'sequencia_carregamento', cd.sequencia,
    'veiculo', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id', v.id, 'descricao', v.descricao, 'placa', v.placa, 'tipo', v.tipo_veiculo) END,
    'placa', COALESCE(NULLIF(btrim(c.placa), ''), v.placa),
    'motorista', c.motorista, 'motorista_documento', c.motorista_documento,
    'transportadora', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id', t.id, 'codigo_erp', t.codigo_erp,
                        'documento', t.cnpj, 'razao_social', t.razaosocial) END,
    'liberada_em', c.liberada_em, 'iniciada_em', c.iniciada_em, 'fechada_em', c.fechada_em,
    'cancelada_em', c.cancelada_em, 'motivo_cancelamento', c.motivo_cancelamento,
    'fechamento_origem', CASE WHEN c.status <> 'FECHADA' THEN NULL
                              WHEN EXISTS (SELECT 1 FROM carga_evento e WHERE e.carga_id = c.id AND e.tipo = 'CARGA_FECHADA_PELA_ENTREGA') THEN 'ENTREGA'
                              ELSE 'COLETOR' END,
    'pedido_embarcado_em', cd.embarcado_em,
    'volumes_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_documento_id = cd.id AND cu.status <> 'CANCELADA'),
    'volumes_embarcados', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_documento_id = cd.id AND cu.status = 'EMBARCADA'))
  FROM carga_documento cd
  JOIN carga c ON c.id = cd.carga_id
  LEFT JOIN veiculos v ON v.id = c.veiculo_id
  LEFT JOIN parceiro t ON t.id = c.transportadora_id
  WHERE cd.documento_saida_id = p_documento_id
  ORDER BY cd.ativo DESC, (c.status <> 'CANCELADA') DESC, c.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION integracao.fn_retorno_tentativa_json(p_tentativa_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'integracao' AS $$
  SELECT jsonb_build_object(
    'id', t.id, 'numero', t.numero_tentativa, 'resultado', t.resultado, 'registrada_em', t.registrada_em,
    'entregador', (SELECT jsonb_build_object('id', u.id, 'login', u.login, 'nome', u.nome) FROM usuario u WHERE u.id = t.usuario_id),
    'motivo', CASE WHEN mo.id IS NULL THEN NULL ELSE jsonb_build_object('id', mo.id, 'descricao', mo.descricao, 'impede_entrega', mo.impede_entrega) END,
    'ocorrencia', CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id', o.id, 'numero', o.numero_ocorrencia, 'observacao', o.observacao) END,
    'ressalvas', COALESCE(t.ressalvas, '[]'::jsonb),
    'recebedor_nome', t.recebedor_nome, 'foto_canhoto_path', t.foto_path,
    'latitude', t.latitude, 'longitude', t.longitude, 'precisao_m', t.precisao_m, 'fora_de_ordem', t.fora_de_ordem,
    'estornada', t.estornada_em IS NOT NULL, 'estornada_em', t.estornada_em,
    'estornada_por', (SELECT jsonb_build_object('id', u.id, 'login', u.login, 'nome', u.nome) FROM usuario u WHERE u.id = t.estornada_por),
    'motivo_estorno', t.motivo_estorno)
  FROM entrega_tentativa t
  LEFT JOIN motivo_ocorrencia mo ON mo.id = t.motivo_ocorrencia_id
  LEFT JOIN ocorrencia_operacional o ON o.id = t.ocorrencia_id
  WHERE t.id = p_tentativa_id;
$$;

CREATE OR REPLACE FUNCTION integracao.fn_retorno_contexto_entrega(p_documento_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'integracao' AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'numero_saida', (SELECT count(*) FROM entrega x WHERE x.carga_id = e.carga_id AND x.created_at <= e.created_at),
    'status', e.status,
    'entregador', (SELECT jsonb_build_object('id', u.id, 'login', u.login, 'nome', u.nome) FROM usuario u WHERE u.id = e.usuario_id),
    'atribuida_em', e.atribuida_em, 'aceita_em', e.aceita_em, 'concluida_em', e.concluida_em,
    'cancelada_em', e.cancelada_em, 'motivo_cancelamento', e.motivo_cancelamento,
    'parada', jsonb_build_object(
      'id', p.id, 'sequencia', p.sequencia, 'status', p.status, 'entregue_em', p.entregue_em, 'finalizada_em', p.finalizada_em,
      'recebedor_nome', p.recebedor_nome, 'foto_canhoto_path', p.foto_canhoto_path,
      'latitude', p.latitude, 'longitude', p.longitude, 'confere_volume', p.confere_volume,
      'volumes_lidos', (SELECT count(*) FROM entrega_volume ev WHERE ev.entrega_parada_id = p.id)),
    'tentativas', (SELECT count(*) FROM entrega_tentativa t WHERE t.documento_saida_id = p_documento_id AND t.estornada_em IS NULL),
    'ultima_tentativa', (SELECT integracao.fn_retorno_tentativa_json(t.id) FROM entrega_tentativa t
                          WHERE t.documento_saida_id = p_documento_id AND t.estornada_em IS NULL
                          ORDER BY t.registrada_em DESC LIMIT 1))
  FROM entrega_parada p
  JOIN entrega e ON e.id = p.entrega_id
  WHERE p.documento_saida_id = p_documento_id
  ORDER BY (e.status <> 'CANCELADA') DESC, e.created_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION integracao.fn_retorno_contexto(p_entidade text, p_documento_id uuid, p_evento text, p_movimento_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'integracao' AS $function$
DECLARE
  v_base jsonb;
  v_emp  uuid;
BEGIN
  IF p_entidade = 'documento_saida' THEN
    v_base := fn_retorno_contexto_saida(p_documento_id, p_movimento_id);
    IF v_base IS NOT NULL THEN
      v_base := v_base || jsonb_build_object('carga', fn_retorno_contexto_carga(p_documento_id),
                                             'entrega', fn_retorno_contexto_entrega(p_documento_id));
    END IF;
    SELECT empresa_id INTO v_emp FROM documento_saida WHERE id = p_documento_id;
  ELSIF p_entidade = 'documento_entrada' THEN
    v_base := fn_retorno_contexto_entrada(p_documento_id, p_movimento_id);
    SELECT empresa_id INTO v_emp FROM documento_entrada WHERE id = p_documento_id;
  ELSE
    RAISE EXCEPTION 'RETORNO_ENTIDADE_INVALIDA: %', p_entidade USING ERRCODE = '22023';
  END IF;
  IF v_base IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'versao_contexto', 1,
    'evento', p_evento,
    'evento_nome', (SELECT c.nome FROM retorno_evento_catalogo c WHERE c.codigo = p_evento),
    'ocorrido_em', to_char(now() AT TIME ZONE 'America/Fortaleza', 'YYYY-MM-DD"T"HH24:MI:SS"-03:00"'),
    'ocorrido_em_utc', now(),
    'empresa', (SELECT jsonb_build_object('id', e.id, 'codigo', e.codigo, 'cnpj', e.cnpj, 'razao_social', e.razaosocial)
                FROM empresa e WHERE e.id = v_emp),
    'operador', (SELECT jsonb_build_object('id', u.id, 'login', u.login, 'nome', u.nome)
                 FROM usuario u WHERE u.auth_user_id = auth.uid() LIMIT 1)
  ) || v_base;
END;
$function$;

-- ---------- 3. emissão segura ----------
CREATE OR REPLACE FUNCTION integracao.fn_retorno_saida_emitir(p_documento_id uuid, p_evento text, p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'integracao' AS $$
DECLARE v_t uuid; v_e uuid;
BEGIN
  SELECT ds.tenant_id, ds.empresa_id INTO v_t, v_e FROM documento_saida ds WHERE ds.id = p_documento_id;
  IF v_t IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM retorno_fluxo rf WHERE rf.tenant_id = v_t AND rf.empresa_id = v_e AND rf.evento = p_evento
                   AND rf.ativo AND rf.versao_publicada IS NOT NULL) THEN
    RETURN;
  END IF;
  BEGIN
    PERFORM fn_retorno_emitir_extra(v_t, v_e, p_evento, p_documento_id,
      jsonb_build_object('evento_dados', COALESCE(p_dados, '{}'::jsonb)));
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO retorno_evento (tenant_id, empresa_id, evento, entidade, documento_id, status, erro, disparado_por)
      VALUES (v_t, v_e, p_evento, 'documento_saida', p_documento_id, 'erro_contexto', left(SQLSTATE || ': ' || SQLERRM, 1000), auth.uid());
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[retorno] falha ao registrar % (%): %', p_evento, p_documento_id, SQLERRM;
    END;
  END;
END $$;

-- ---------- 4. gatilhos de carga (no commit) ----------
CREATE OR REPLACE FUNCTION integracao.trg_retorno_carga()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'integracao' AS $$
DECLARE v_c record; v_doc uuid; v_ev text; v_origem text;
BEGIN
  BEGIN
    SELECT c.* INTO v_c FROM carga c WHERE c.id = NEW.id;
    IF v_c.status IS DISTINCT FROM NEW.status THEN RETURN NULL; END IF;  -- mudou de novo na mesma transação
    IF NEW.status = 'LIBERADA' THEN
      v_ev := 'saida.carga_montada';
    ELSIF NEW.status = 'FECHADA' THEN
      v_ev := 'saida.carga_fechada';
      v_origem := CASE WHEN EXISTS (SELECT 1 FROM carga_evento e WHERE e.carga_id = NEW.id AND e.tipo = 'CARGA_FECHADA_PELA_ENTREGA')
                       THEN 'ENTREGA' ELSE 'COLETOR' END;
    ELSE
      RETURN NULL;
    END IF;
    FOR v_doc IN SELECT DISTINCT cd.documento_saida_id FROM carga_documento cd WHERE cd.carga_id = NEW.id AND cd.ativo LOOP
      PERFORM fn_retorno_saida_emitir(v_doc, v_ev,
        jsonb_build_object('carga_id', NEW.id, 'carga_numero', NEW.numero_carga, 'status_carga', NEW.status, 'fechamento_origem', v_origem));
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[retorno] carga %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_zz_retorno_carga ON public.carga;
CREATE CONSTRAINT TRIGGER trg_zz_retorno_carga AFTER UPDATE OF status ON public.carga
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('LIBERADA','FECHADA'))
  EXECUTE FUNCTION integracao.trg_retorno_carga();

CREATE OR REPLACE FUNCTION integracao.trg_retorno_carga_documento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'integracao' AS $$
DECLARE v_cd record; v_c record;
BEGIN
  BEGIN
    SELECT cd.* INTO v_cd FROM carga_documento cd WHERE cd.id = NEW.id;
    SELECT c.* INTO v_c FROM carga c WHERE c.id = NEW.carga_id;
    IF v_cd.id IS NULL OR v_c.id IS NULL THEN RETURN NULL; END IF;

    IF TG_ARGV[0] = 'embarcado' THEN
      IF v_cd.embarcado_em IS NOT NULL AND v_cd.ativo THEN
        PERFORM fn_retorno_saida_emitir(NEW.documento_saida_id, 'saida.pedido_embarcado',
          jsonb_build_object('carga_id', v_c.id, 'carga_numero', v_c.numero_carga, 'embarcado_em', v_cd.embarcado_em));
      END IF;
    ELSIF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.ativo AND NOT OLD.ativo) THEN
      -- pedido entrou em carga já liberada (liberada nesta transação: o gatilho da carga já emite)
      IF v_cd.ativo AND v_c.status IN ('LIBERADA','EM_CARREGAMENTO') AND v_c.liberada_em < now() THEN
        PERFORM fn_retorno_saida_emitir(NEW.documento_saida_id, 'saida.carga_montada',
          jsonb_build_object('carga_id', v_c.id, 'carga_numero', v_c.numero_carga, 'status_carga', v_c.status, 'incluido_apos_liberacao', true));
      END IF;
    ELSIF TG_OP = 'UPDATE' AND OLD.ativo AND NOT NEW.ativo THEN
      IF NOT v_cd.ativo AND v_c.liberada_em IS NOT NULL THEN
        PERFORM fn_retorno_saida_emitir(NEW.documento_saida_id, 'saida.retirado_da_carga',
          jsonb_build_object('carga_id', v_c.id, 'carga_numero', v_c.numero_carga,
            'motivo', CASE WHEN v_c.status = 'CANCELADA' THEN 'CARGA_CANCELADA' ELSE 'PEDIDO_RETIRADO' END,
            'motivo_cancelamento', v_c.motivo_cancelamento));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[retorno] carga_documento %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_zz_retorno_carga_documento ON public.carga_documento;
CREATE CONSTRAINT TRIGGER trg_zz_retorno_carga_documento AFTER INSERT OR UPDATE OF ativo ON public.carga_documento
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION integracao.trg_retorno_carga_documento('vinculo');
DROP TRIGGER IF EXISTS trg_zz_retorno_carga_documento_embarcado ON public.carga_documento;
CREATE CONSTRAINT TRIGGER trg_zz_retorno_carga_documento_embarcado AFTER UPDATE OF embarcado_em ON public.carga_documento
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.embarcado_em IS NULL AND NEW.embarcado_em IS NOT NULL)
  EXECUTE FUNCTION integracao.trg_retorno_carga_documento('embarcado');

-- ---------- 5. gatilhos de entrega ----------
CREATE OR REPLACE FUNCTION integracao.trg_retorno_entrega_aceite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'integracao' AS $$
DECLARE v_doc uuid;
BEGIN
  BEGIN
    FOR v_doc IN SELECT p.documento_saida_id FROM entrega_parada p WHERE p.entrega_id = NEW.id AND p.status = 'PENDENTE' ORDER BY p.sequencia LOOP
      PERFORM fn_retorno_saida_emitir(v_doc, 'saida.saiu_para_entrega',
        jsonb_build_object('entrega_id', NEW.id, 'aceita_em', NEW.aceita_em));
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[retorno] entrega %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_zz_retorno_entrega_aceite ON public.entrega;
CREATE TRIGGER trg_zz_retorno_entrega_aceite AFTER UPDATE OF status ON public.entrega
  FOR EACH ROW WHEN (OLD.status = 'AGUARDANDO_ACEITE' AND NEW.status = 'EM_ROTA')
  EXECUTE FUNCTION integracao.trg_retorno_entrega_aceite();

CREATE OR REPLACE FUNCTION integracao.trg_retorno_entrega_tentativa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'integracao' AS $$
DECLARE v_ev text;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.origem = 'RECONSTRUIDA' THEN RETURN NULL; END IF;
      v_ev := CASE NEW.resultado WHEN 'ENTREGUE' THEN 'saida.entregue' ELSE 'saida.nao_entregue' END;
    ELSE
      v_ev := 'saida.entrega_estornada';
    END IF;
    PERFORM fn_retorno_saida_emitir(NEW.documento_saida_id, v_ev,
      jsonb_build_object('tentativa', fn_retorno_tentativa_json(NEW.id), 'entrega_id', NEW.entrega_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[retorno] tentativa %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_zz_retorno_entrega_tentativa_ins ON public.entrega_tentativa;
CREATE TRIGGER trg_zz_retorno_entrega_tentativa_ins AFTER INSERT ON public.entrega_tentativa
  FOR EACH ROW EXECUTE FUNCTION integracao.trg_retorno_entrega_tentativa();
DROP TRIGGER IF EXISTS trg_zz_retorno_entrega_tentativa_est ON public.entrega_tentativa;
CREATE TRIGGER trg_zz_retorno_entrega_tentativa_est AFTER UPDATE OF estornada_em ON public.entrega_tentativa
  FOR EACH ROW WHEN (OLD.estornada_em IS NULL AND NEW.estornada_em IS NOT NULL)
  EXECUTE FUNCTION integracao.trg_retorno_entrega_tentativa();

-- ---------- 6. permissões ----------
REVOKE ALL ON FUNCTION integracao.fn_retorno_contexto_carga(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION integracao.fn_retorno_contexto_entrega(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION integracao.fn_retorno_tentativa_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION integracao.fn_retorno_saida_emitir(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION integracao.trg_retorno_carga() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION integracao.trg_retorno_carga_documento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION integracao.trg_retorno_entrega_aceite() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION integracao.trg_retorno_entrega_tentativa() FROM PUBLIC, anon, authenticated;
