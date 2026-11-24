-- =====================================================================
-- Módulo de Entregas · tentativas de entrega (aprovado em 23/11) · 2026-11-23
-- ---------------------------------------------------------------------
-- Problema (teste da carga #307): o estorno devolvia a parada a PENDENTE e o
-- resultado anterior ficava só no histórico de eventos; a seção Entrega mostrava
-- só a última saída; a ocorrência estornada continuava presa na parada; eventos
-- do mesmo instante saíam fora de ordem.
--
-- Padrão adotado:
--   * SAÍDA = entrega (cada vez que o veículo sai com o entregador). Cancelada continua existindo.
--   * TENTATIVA = cada registro na porta do cliente (ENTREGUE ou NAO_ENTREGUE), uma linha em
--     entrega_tentativa. Nunca é apagada nem alterada; o estorno só a marca como estornada
--     (quem, quando, por quê). É a base dos relatórios de saídas e por motivo.
--   * Ocorrência informativa (motivo que não impede a entrega) vira "ressalva" da tentativa
--     seguinte daquela parada.
-- A tentativa é gravada por gatilho na mudança de status da parada, então vale para qualquer
-- caminho (confirmar, ocorrência, estorno). Eventos ganham `seq` para ordem estável.
-- Histórico já existente é reconstruído a partir de entrega_evento (origem RECONSTRUIDA).
-- Reversão: supabase/rollback/20261123_entregas_tentativas_reverter.sql
-- =====================================================================

-- ---------- ordem estável dos eventos ----------
ALTER TABLE public.entrega_evento ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX IF NOT EXISTS idx_entrega_evento_seq ON public.entrega_evento (entrega_id, seq);

-- ---------- tabela de tentativas ----------
CREATE TABLE IF NOT EXISTS public.entrega_tentativa (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id            uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id           uuid        NOT NULL REFERENCES public.empresa(id),
  entrega_id           uuid        NOT NULL REFERENCES public.entrega(id),
  entrega_parada_id    uuid        NOT NULL REFERENCES public.entrega_parada(id),
  carga_id             uuid        NOT NULL REFERENCES public.carga(id),
  documento_saida_id   uuid        NOT NULL REFERENCES public.documento_saida(id),
  parceiro_id          uuid        REFERENCES public.parceiro(id),
  usuario_id           uuid        REFERENCES public.usuario(id),
  veiculo_id           uuid        REFERENCES public.veiculos(id),
  registrado_por       uuid        REFERENCES public.usuario(id),
  numero_tentativa     integer     NOT NULL,
  resultado            text        NOT NULL CONSTRAINT ck_entrega_tentativa_resultado CHECK (resultado IN ('ENTREGUE','NAO_ENTREGUE')),
  motivo_ocorrencia_id uuid        REFERENCES public.motivo_ocorrencia(id),
  ocorrencia_id        uuid        REFERENCES public.ocorrencia_operacional(id),
  ressalvas            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  foto_path            text,
  recebedor_nome       text,
  latitude             numeric(9,6),
  longitude            numeric(9,6),
  precisao_m           numeric,
  fora_de_ordem        boolean     NOT NULL DEFAULT false,
  registrada_em        timestamptz NOT NULL DEFAULT now(),
  estornada_em         timestamptz,
  estornada_por        uuid        REFERENCES public.usuario(id),
  motivo_estorno       text,
  origem               text        NOT NULL DEFAULT 'APP' CONSTRAINT ck_entrega_tentativa_origem CHECK (origem IN ('APP','RECONSTRUIDA')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        REFERENCES public.usuario(id)
);
CREATE INDEX IF NOT EXISTS idx_entrega_tentativa_periodo ON public.entrega_tentativa (tenant_id, empresa_id, registrada_em);
CREATE INDEX IF NOT EXISTS idx_entrega_tentativa_parada ON public.entrega_tentativa (entrega_parada_id, registrada_em);
CREATE INDEX IF NOT EXISTS idx_entrega_tentativa_documento ON public.entrega_tentativa (documento_saida_id);
CREATE INDEX IF NOT EXISTS idx_entrega_tentativa_usuario ON public.entrega_tentativa (usuario_id, registrada_em);
CREATE INDEX IF NOT EXISTS idx_entrega_tentativa_motivo ON public.entrega_tentativa (motivo_ocorrencia_id) WHERE motivo_ocorrencia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entrega_tentativa_carga ON public.entrega_tentativa (carga_id);
COMMENT ON TABLE public.entrega_tentativa IS 'Entregas: uma linha por tentativa na porta do cliente (ENTREGUE/NAO_ENTREGUE). Imutável; estorno só marca estornada_*. Base dos relatórios.';
COMMENT ON COLUMN public.entrega_tentativa.numero_tentativa IS 'Ordem da tentativa do pedido (documento_saida) entre as não estornadas, em todas as saídas.';
COMMENT ON COLUMN public.entrega_tentativa.ressalvas IS 'Ocorrências informativas (motivo que não impede a entrega) registradas antes desta tentativa: [{ocorrencia_id, numero, motivo_id, motivo}].';

ALTER TABLE public.entrega_tentativa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entrega_tentativa_select_tenant ON public.entrega_tentativa;
CREATE POLICY entrega_tentativa_select_tenant ON public.entrega_tentativa FOR SELECT USING (tenant_id = (SELECT public.get_current_tenant()));
REVOKE INSERT, UPDATE, DELETE ON public.entrega_tentativa FROM anon, authenticated;
GRANT SELECT ON public.entrega_tentativa TO authenticated;
DROP TRIGGER IF EXISTS trg_audit_criacao ON public.entrega_tentativa;
CREATE TRIGGER trg_audit_criacao BEFORE INSERT OR UPDATE ON public.entrega_tentativa FOR EACH ROW EXECUTE FUNCTION public.fn_audit_criacao();

-- Só os campos do estorno podem mudar, e uma única vez; nunca apaga.
CREATE OR REPLACE FUNCTION public._fn_entrega_tentativa_proteger()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ENTREGA_TENTATIVA_IMUTAVEL: tentativas de entrega não podem ser apagadas.';
  END IF;
  IF OLD.estornada_em IS NOT NULL
     OR (to_jsonb(NEW) - ARRAY['estornada_em','estornada_por','motivo_estorno','created_at','created_by'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estornada_em','estornada_por','motivo_estorno','created_at','created_by']) THEN
    RAISE EXCEPTION 'ENTREGA_TENTATIVA_IMUTAVEL: a tentativa de entrega só pode ser marcada como estornada, uma vez.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_entrega_tentativa_proteger ON public.entrega_tentativa;
CREATE TRIGGER trg_entrega_tentativa_proteger BEFORE UPDATE OR DELETE ON public.entrega_tentativa
  FOR EACH ROW EXECUTE FUNCTION public._fn_entrega_tentativa_proteger();

-- ---------- gravação ----------
-- Registra uma tentativa a partir da parada (estado já finalizado).
CREATE OR REPLACE FUNCTION public._fn_entrega_tentativa_registrar(
  p_parada public.entrega_parada, p_registrado_por uuid, p_em timestamptz DEFAULT now(),
  p_origem text DEFAULT 'APP', p_foto_path text DEFAULT NULL, p_fora_de_ordem boolean DEFAULT NULL,
  p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL, p_recebedor text DEFAULT NULL,
  p_ocorrencia_id uuid DEFAULT NULL, p_motivo_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_e record; v_num int; v_id uuid; v_oc uuid; v_mot uuid; v_foto text; v_ultima timestamptz; v_ressalvas jsonb;
BEGIN
  SELECT e.* INTO v_e FROM entrega e WHERE e.id = p_parada.entrega_id;
  SELECT 1 + count(*) INTO v_num FROM entrega_tentativa t
   WHERE t.documento_saida_id = p_parada.documento_saida_id AND t.estornada_em IS NULL;

  IF p_parada.status = 'NAO_ENTREGUE' THEN
    v_oc := COALESCE(p_ocorrencia_id, p_parada.ultima_ocorrencia_id);
    SELECT o.motivo_ocorrencia_id INTO v_mot FROM ocorrencia_operacional o WHERE o.id = v_oc;
    v_mot := COALESCE(p_motivo_id, v_mot);
    v_foto := COALESCE(p_foto_path, (SELECT a.storage_path FROM ocorrencia_anexo a WHERE a.ocorrencia_id = v_oc ORDER BY a.created_at DESC LIMIT 1));
  ELSE
    v_foto := COALESCE(p_foto_path, p_parada.foto_canhoto_path);
  END IF;

  -- ressalvas: ocorrências informativas desta parada desde a última tentativa dela
  SELECT max(t.registrada_em) INTO v_ultima FROM entrega_tentativa t WHERE t.entrega_parada_id = p_parada.id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('ocorrencia_id', ev.dados->>'ocorrencia_id', 'numero', ev.dados->'numero_ocorrencia',
                                               'motivo_id', ev.dados->>'motivo_id', 'motivo', ev.dados->>'motivo') ORDER BY ev.seq), '[]'::jsonb)
    INTO v_ressalvas
    FROM entrega_evento ev
   WHERE ev.entrega_parada_id = p_parada.id AND ev.tipo = 'OCORRENCIA'
     AND COALESCE((ev.dados->>'impede_entrega')::boolean, true) = false
     AND ev.ocorrido_em <= p_em AND (v_ultima IS NULL OR ev.ocorrido_em > v_ultima);

  INSERT INTO entrega_tentativa (tenant_id, empresa_id, entrega_id, entrega_parada_id, carga_id, documento_saida_id, parceiro_id,
    usuario_id, veiculo_id, registrado_por, numero_tentativa, resultado, motivo_ocorrencia_id, ocorrencia_id, ressalvas,
    foto_path, recebedor_nome, latitude, longitude, precisao_m, fora_de_ordem, registrada_em, origem, created_by)
  VALUES (p_parada.tenant_id, p_parada.empresa_id, p_parada.entrega_id, p_parada.id, v_e.carga_id, p_parada.documento_saida_id, p_parada.parceiro_id,
    v_e.usuario_id, v_e.veiculo_id, p_registrado_por, v_num, p_parada.status, v_mot, v_oc, v_ressalvas,
    v_foto, COALESCE(p_recebedor, CASE WHEN p_parada.status = 'ENTREGUE' THEN p_parada.recebedor_nome END),
    COALESCE(p_lat, p_parada.latitude), COALESCE(p_lng, p_parada.longitude), p_parada.precisao_m,
    COALESCE(p_fora_de_ordem, EXISTS (SELECT 1 FROM entrega_parada x WHERE x.entrega_id = p_parada.entrega_id AND x.status = 'PENDENTE' AND x.sequencia < p_parada.sequencia)),
    p_em, p_origem, p_registrado_por)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Marca como estornada a última tentativa válida da parada.
CREATE OR REPLACE FUNCTION public._fn_entrega_tentativa_estornar(p_parada_id uuid, p_usuario uuid, p_motivo text, p_em timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  SELECT t.id INTO v_id FROM entrega_tentativa t
   WHERE t.entrega_parada_id = p_parada_id AND t.estornada_em IS NULL
   ORDER BY t.registrada_em DESC, t.created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE entrega_tentativa SET estornada_em = p_em, estornada_por = p_usuario, motivo_estorno = NULLIF(btrim(p_motivo), '')
     WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

-- Gatilho na parada: finalizou -> nova tentativa; voltou a pendente -> estorna a última.
CREATE OR REPLACE FUNCTION public._fn_trg_entrega_parada_tentativa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status = 'PENDENTE' AND NEW.status IN ('ENTREGUE','NAO_ENTREGUE') THEN
    PERFORM public._fn_entrega_tentativa_registrar(NEW, NEW.updated_by);
  ELSIF OLD.status IN ('ENTREGUE','NAO_ENTREGUE') AND NEW.status = 'PENDENTE' THEN
    PERFORM public._fn_entrega_tentativa_estornar(NEW.id, NEW.updated_by,
      NULLIF(current_setting('logitrack.entrega_motivo_estorno', true), ''));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_entrega_parada_tentativa ON public.entrega_parada;
CREATE TRIGGER trg_entrega_parada_tentativa AFTER UPDATE OF status ON public.entrega_parada
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public._fn_trg_entrega_parada_tentativa();

-- ---------- estorno: limpa a ocorrência da parada e informa o motivo à tentativa ----------
CREATE OR REPLACE FUNCTION public.entrega_parada_estornar(p_tenant_id uuid, p_usuario_id uuid, p_parada_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_p public.entrega_parada; v_st text; v_tent uuid;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'GESTOR');
  IF length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'ENTREGA_MOTIVO_OBRIGATORIO: informe o motivo.'; END IF;
  SELECT p.* INTO v_p FROM entrega_parada p WHERE p.id = p_parada_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'ENTREGA_PARADA_NAO_ENCONTRADA: parada não encontrada.'; END IF;
  SELECT e.status INTO v_st FROM entrega e WHERE e.id = v_p.entrega_id FOR UPDATE;
  IF v_st NOT IN ('EM_ROTA','CONCLUIDA') THEN RAISE EXCEPTION 'ENTREGA_ENCERRADA: esta entrega está %.', lower(replace(v_st, '_', ' ')); END IF;
  IF v_p.status = 'PENDENTE' THEN RAISE EXCEPTION 'ENTREGA_PARADA_PENDENTE: esta parada ainda está pendente.'; END IF;
  SELECT t.id INTO v_tent FROM entrega_tentativa t WHERE t.entrega_parada_id = v_p.id AND t.estornada_em IS NULL
   ORDER BY t.registrada_em DESC, t.created_at DESC LIMIT 1;
  PERFORM set_config('logitrack.entrega_motivo_estorno', btrim(p_motivo), true);
  UPDATE entrega_parada
     SET status = 'PENDENTE', entregue_em = NULL, entregue_por = NULL, finalizada_em = NULL, recebedor_nome = NULL,
         foto_canhoto_path = NULL, ultima_ocorrencia_id = NULL, updated_by = v_u
   WHERE id = v_p.id;
  PERFORM set_config('logitrack.entrega_motivo_estorno', '', true);
  PERFORM public._fn_entrega_evento(v_p.entrega_id, v_p.id, 'PARADA_ESTORNADA', v_u, NULL, NULL,
    jsonb_build_object('status_anterior', v_p.status, 'foto_path', v_p.foto_canhoto_path, 'entregue_em', v_p.entregue_em,
                       'ocorrencia_id', v_p.ultima_ocorrencia_id, 'tentativa_id', v_tent, 'motivo', btrim(p_motivo)));
  PERFORM public._fn_entrega_recalcular(v_p.entrega_id, v_u);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'PARADA_ESTORNADA',
    'mensagem', 'Parada estornada; volta a ficar pendente no coletor. A tentativa continua no histórico, marcada como estornada.',
    'dados', public._fn_entrega_json(v_p.entrega_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- reconstrução do que já foi registrado ----------
DO $$
DECLARE ev record; v_p public.entrega_parada; v_t uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM entrega_tentativa) THEN RETURN; END IF;
  FOR ev IN
    SELECT x.* FROM entrega_evento x
     WHERE x.entrega_parada_id IS NOT NULL
       AND (x.tipo IN ('PARADA_ENTREGUE','PARADA_ESTORNADA')
            OR (x.tipo = 'OCORRENCIA' AND COALESCE((x.dados->>'impede_entrega')::boolean, true)))
     ORDER BY x.seq
  LOOP
    SELECT p.* INTO v_p FROM entrega_parada p WHERE p.id = ev.entrega_parada_id;
    IF ev.tipo = 'PARADA_ESTORNADA' THEN
      v_t := public._fn_entrega_tentativa_estornar(v_p.id, ev.usuario_id, ev.dados->>'motivo', ev.ocorrido_em);
    ELSE
      v_p.status := CASE WHEN ev.tipo = 'PARADA_ENTREGUE' THEN 'ENTREGUE' ELSE 'NAO_ENTREGUE' END;
      PERFORM public._fn_entrega_tentativa_registrar(
        v_p, ev.usuario_id, ev.ocorrido_em, 'RECONSTRUIDA', ev.dados->>'foto_path',
        (ev.dados->>'fora_de_ordem')::boolean, ev.latitude, ev.longitude, ev.dados->>'recebedor_nome',
        (ev.dados->>'ocorrencia_id')::uuid, (ev.dados->>'motivo_id')::uuid);
    END IF;
  END LOOP;
  -- parada pendente cuja última ação foi um estorno não aponta mais para a ocorrência estornada
  UPDATE entrega_parada p SET ultima_ocorrencia_id = NULL
   WHERE p.status = 'PENDENTE' AND p.ultima_ocorrencia_id IS NOT NULL
     AND (SELECT x.tipo FROM entrega_evento x WHERE x.entrega_parada_id = p.id ORDER BY x.seq DESC LIMIT 1) = 'PARADA_ESTORNADA';
END $$;

-- ---------- detalhe da carga: todas as saídas, tentativas e histórico em ordem ----------
CREATE OR REPLACE FUNCTION public._fn_entrega_tentativas_json(p_filtro_carga uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'entrega_id', t.entrega_id, 'parada_id', t.entrega_parada_id, 'numero_tentativa', t.numero_tentativa,
    'resultado', t.resultado, 'registrada_em', t.registrada_em, 'entregador', u.nome, 'cliente', p.parceiro_nome,
    'numero_pedido', p.numero_pedido, 'motivo', mo.descricao, 'ocorrencia_numero', o.numero_ocorrencia,
    'ressalvas', t.ressalvas, 'foto_path', t.foto_path, 'recebedor_nome', t.recebedor_nome, 'fora_de_ordem', t.fora_de_ordem,
    'estornada_em', t.estornada_em, 'estornada_por', ue.nome, 'motivo_estorno', t.motivo_estorno, 'origem', t.origem
  ) ORDER BY t.registrada_em, t.created_at), '[]'::jsonb)
  FROM entrega_tentativa t
  JOIN entrega_parada p ON p.id = t.entrega_parada_id
  LEFT JOIN usuario u ON u.id = t.usuario_id
  LEFT JOIN usuario ue ON ue.id = t.estornada_por
  LEFT JOIN motivo_ocorrencia mo ON mo.id = t.motivo_ocorrencia_id
  LEFT JOIN ocorrencia_operacional o ON o.id = t.ocorrencia_id
  WHERE t.carga_id = p_filtro_carga;
$$;

CREATE OR REPLACE FUNCTION public.entrega_carga_detalhe(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_ent uuid; v_motivo text; v_veic record; v_ativa boolean;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'LER');
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  SELECT e.id INTO v_ent FROM entrega e WHERE e.carga_id = p_carga_id ORDER BY (e.status <> 'CANCELADA') DESC, e.created_at DESC LIMIT 1;
  v_ativa := EXISTS (SELECT 1 FROM entrega e WHERE e.carga_id = p_carga_id AND e.status <> 'CANCELADA');
  SELECT v.descricao, v.placa, v.usuario_id, u.nome AS usuario_nome INTO v_veic
    FROM veiculos v LEFT JOIN usuario u ON u.id = v.usuario_id WHERE v.id = v_c.veiculo_id;
  v_motivo := CASE
    WHEN v_c.modalidade <> 'PROPRIA' THEN 'Carga de transportadora não gera entrega.'
    WHEN v_c.veiculo_id IS NULL THEN 'A carga não tem veículo próprio.'
    WHEN v_veic.usuario_id IS NULL THEN format('O veículo %s não tem usuário entregador vinculado (Dados Mestres › Veículos).', COALESCE(v_veic.descricao, ''))
    WHEN v_c.status <> 'FECHADA' THEN 'A entrega é gerada quando o carregamento for concluído.'
    ELSE NULL END;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', jsonb_build_object(
    'entrega', CASE WHEN v_ent IS NULL THEN NULL ELSE public._fn_entrega_json(v_ent) END,
    'saidas', COALESCE((SELECT jsonb_agg(public._fn_entrega_json(e.id) || jsonb_build_object('numero_saida', rn) ORDER BY e.created_at)
                          FROM (SELECT e.*, row_number() OVER (ORDER BY e.created_at) rn FROM entrega e WHERE e.carga_id = p_carga_id) e), '[]'::jsonb),
    'tentativas', public._fn_entrega_tentativas_json(p_carga_id),
    'veiculo_entregador', v_veic.usuario_nome,
    'motivo_sem_entrega', v_motivo,
    'pode_gerar', v_motivo IS NULL AND NOT v_ativa AND public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE'),
    'pode_gerenciar', public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE'),
    'eventos', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo', ev.tipo, 'ocorrido_em', ev.ocorrido_em, 'usuario', u.nome,
                                   'parada_id', ev.entrega_parada_id, 'entrega_id', ev.entrega_id, 'numero_saida', s.rn,
                                   'sequencia_parada', p.sequencia, 'dados', ev.dados) ORDER BY ev.seq DESC)
                          FROM entrega_evento ev
                          JOIN (SELECT e.id, row_number() OVER (ORDER BY e.created_at) rn FROM entrega e WHERE e.carga_id = p_carga_id) s ON s.id = ev.entrega_id
                          LEFT JOIN entrega_parada p ON p.id = ev.entrega_parada_id
                          LEFT JOIN usuario u ON u.id = ev.usuario_id), '[]'::jsonb)));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- grants ----------
REVOKE ALL ON FUNCTION public._fn_entrega_tentativa_registrar(public.entrega_parada,uuid,timestamptz,text,text,boolean,numeric,numeric,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_entrega_tentativa_estornar(uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_trg_entrega_parada_tentativa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_entrega_tentativa_proteger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_entrega_tentativas_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.entrega_parada_estornar(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrega_parada_estornar(uuid,uuid,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.entrega_carga_detalhe(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrega_carga_detalhe(uuid,uuid,uuid) TO authenticated, service_role;
