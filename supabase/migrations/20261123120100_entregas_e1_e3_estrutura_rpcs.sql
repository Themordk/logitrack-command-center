-- =====================================================================
-- Módulo de Entregas (E1 + E3) · 2026-11-23
-- ---------------------------------------------------------------------
-- Carga de veículo próprio (carga.modalidade = 'PROPRIA') que chega a FECHADA
-- gera uma ENTREGA para o usuário vinculado ao veículo (veiculos.usuario_id).
-- Cada pedido da carga vira uma PARADA. O entregador aceita no coletor,
-- confirma cada parada com foto do canhoto ou registra ocorrência com foto.
--
-- Decisões (plano aprovado em 23/11):
--   * Gatilho = carga FECHADA (não existe status CARREGADA).
--   * Ordem das paradas: carga_documento.sequencia é a ORDEM DE CARREGAMENTO
--     ("o primeiro da lista é o primeiro a subir no veículo, normalmente a última
--     entrega"). A parada 1 é o pedido carregado por último: sequencia de
--     entrega = ordem inversa da sequência da carga. A sequência original fica
--     em entrega_parada.sequencia_carga.
--   * Ocorrência usa ocorrencia_operacional (etapa ENTREGA) + ocorrencia_anexo.
--   * Fotos no bucket privado 'evidencias', caminho
--     {tenant_id}/entregas/{entrega_id}/{parada_id}/... ; a RPC confere o
--     caminho e se o arquivo existe antes de gravar.
--   * Alerta sonoro (RN17): a tabela entrega entra na publicação do Realtime;
--     o coletor escuta as mudanças das próprias entregas (e consulta a cada 30 s).
--   * Gravação só pelas RPCs (SECURITY DEFINER); leitura por RLS do tenant.
--   * Ações de supervisor exigem web.atividades.montagem-carga UPDATE.
-- Reversão: supabase/rollback/20261123_entregas_reverter.sql
-- =====================================================================

-- ---------- veículo: usuário entregador ----------
ALTER TABLE public.veiculos ADD COLUMN IF NOT EXISTS usuario_id uuid REFERENCES public.usuario(id);
CREATE INDEX IF NOT EXISTS idx_veiculos_usuario ON public.veiculos (usuario_id) WHERE usuario_id IS NOT NULL;
COMMENT ON COLUMN public.veiculos.usuario_id IS 'Entregas: usuário entregador do veículo. Cargas de veículo próprio fechadas geram a entrega para ele.';

-- ---------- motivo: impede a entrega? ----------
ALTER TABLE public.motivo_ocorrencia ADD COLUMN IF NOT EXISTS impede_entrega boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.motivo_ocorrencia.impede_entrega IS 'Etapa ENTREGA: true = a parada fica NAO_ENTREGUE; false = ocorrência informativa, a parada segue pendente.';

-- ---------- tabelas ----------
CREATE TABLE IF NOT EXISTS public.entrega (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id            uuid        NOT NULL REFERENCES public.empresa(id),
  carga_id              uuid        NOT NULL REFERENCES public.carga(id),
  veiculo_id            uuid        REFERENCES public.veiculos(id),
  usuario_id            uuid        NOT NULL REFERENCES public.usuario(id),
  status                text        NOT NULL DEFAULT 'AGUARDANDO_ACEITE'
                        CONSTRAINT ck_entrega_status CHECK (status IN ('AGUARDANDO_ACEITE','EM_ROTA','CONCLUIDA','CANCELADA')),
  atribuida_em          timestamptz NOT NULL DEFAULT now(),
  aceita_em             timestamptz,
  concluida_em          timestamptz,
  cancelada_em          timestamptz,
  cancelada_por         uuid        REFERENCES public.usuario(id),
  motivo_cancelamento   text,
  total_paradas         integer     NOT NULL DEFAULT 0,
  paradas_entregues     integer     NOT NULL DEFAULT 0,
  paradas_nao_entregues integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES public.usuario(id),
  updated_by            uuid        REFERENCES public.usuario(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_entrega_carga_ativa ON public.entrega (carga_id) WHERE status <> 'CANCELADA';
CREATE INDEX IF NOT EXISTS idx_entrega_usuario_status ON public.entrega (usuario_id, status);
CREATE INDEX IF NOT EXISTS idx_entrega_tenant ON public.entrega (tenant_id, empresa_id, status);

CREATE TABLE IF NOT EXISTS public.entrega_parada (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id            uuid        NOT NULL REFERENCES public.empresa(id),
  entrega_id            uuid        NOT NULL REFERENCES public.entrega(id) ON DELETE CASCADE,
  carga_documento_id    uuid        NOT NULL REFERENCES public.carga_documento(id),
  documento_saida_id    uuid        NOT NULL REFERENCES public.documento_saida(id),
  parceiro_id           uuid        REFERENCES public.parceiro(id),
  sequencia             integer     NOT NULL,
  sequencia_carga       integer     NOT NULL,
  status                text        NOT NULL DEFAULT 'PENDENTE'
                        CONSTRAINT ck_entrega_parada_status CHECK (status IN ('PENDENTE','ENTREGUE','NAO_ENTREGUE')),
  parceiro_nome         text,
  endereco              text,
  bairro                text,
  cidade                text,
  estado                text,
  cep                   text,
  telefone              text,
  contato               text,
  numero_pedido         text,
  numero_nf             text,
  serie_nf              text,
  entregue_em           timestamptz,
  entregue_por          uuid        REFERENCES public.usuario(id),
  recebedor_nome        text,
  foto_canhoto_path     text,
  finalizada_em         timestamptz,
  latitude              numeric(9,6),
  longitude             numeric(9,6),
  precisao_m            numeric,
  ultima_ocorrencia_id  uuid        REFERENCES public.ocorrencia_operacional(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid        REFERENCES public.usuario(id),
  updated_by            uuid        REFERENCES public.usuario(id),
  CONSTRAINT uq_entrega_parada_doc UNIQUE (entrega_id, carga_documento_id)
);
CREATE INDEX IF NOT EXISTS idx_entrega_parada_entrega ON public.entrega_parada (entrega_id, sequencia);
CREATE INDEX IF NOT EXISTS idx_entrega_parada_tenant ON public.entrega_parada (tenant_id, empresa_id);

CREATE TABLE IF NOT EXISTS public.entrega_evento (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id        uuid        NOT NULL REFERENCES public.empresa(id),
  entrega_id        uuid        NOT NULL REFERENCES public.entrega(id) ON DELETE CASCADE,
  entrega_parada_id uuid        REFERENCES public.entrega_parada(id) ON DELETE CASCADE,
  tipo              text        NOT NULL
                    CONSTRAINT ck_entrega_evento_tipo CHECK (tipo IN ('ATRIBUIDA','ACEITA','PARADA_ENTREGUE','OCORRENCIA','PARADA_ESTORNADA','REATRIBUIDA','CANCELADA','CONCLUIDA','REABERTA')),
  usuario_id        uuid        REFERENCES public.usuario(id),
  ocorrido_em       timestamptz NOT NULL DEFAULT now(),
  latitude          numeric(9,6),
  longitude         numeric(9,6),
  dados             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid        REFERENCES public.usuario(id)
);
CREATE INDEX IF NOT EXISTS idx_entrega_evento_entrega ON public.entrega_evento (entrega_id, ocorrido_em);

COMMENT ON TABLE public.entrega IS 'Entregas: demanda do entregador gerada pela carga de veículo próprio FECHADA (uma ativa por carga).';
COMMENT ON TABLE public.entrega_parada IS 'Entregas: um pedido da carga a entregar; endereço copiado do parceiro na geração.';
COMMENT ON TABLE public.entrega_evento IS 'Entregas: histórico imutável (só INSERT) de atribuição, aceite, confirmações, ocorrências e ações do supervisor.';
COMMENT ON COLUMN public.entrega_parada.sequencia IS 'Ordem de entrega (1 = primeira parada) = inverso da ordem de carregamento.';
COMMENT ON COLUMN public.entrega_parada.sequencia_carga IS 'carga_documento.sequencia no fechamento (ordem de carregamento).';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entrega','entrega_parada','entrega_evento'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_tenant', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (tenant_id = (SELECT public.get_current_tenant()))', t || '_select_tenant', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_criacao ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_criacao BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_criacao()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['entrega','entrega_parada'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- Histórico imutável
CREATE OR REPLACE FUNCTION public._fn_entrega_evento_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'ENTREGA_EVENTO_IMUTAVEL: o histórico da entrega não pode ser alterado.';
END $$;
DROP TRIGGER IF EXISTS trg_entrega_evento_imutavel ON public.entrega_evento;
CREATE TRIGGER trg_entrega_evento_imutavel BEFORE UPDATE ON public.entrega_evento
  FOR EACH ROW EXECUTE FUNCTION public._fn_entrega_evento_imutavel();

-- Realtime: o coletor ouve as próprias entregas para o alerta de aceite (RN17)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'entrega') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.entrega';
  END IF;
END $$;

-- ---------- permissões ----------
DO $$
DECLARE r record; v_mod uuid; v_perm uuid; v_acao text;
BEGIN
  FOR r IN SELECT t.id FROM tenant t LOOP
    INSERT INTO modulo (tenant_id, codigo, descricao, ambiente)
    VALUES (r.id, 'coletor.entregas', 'Entregas', 'COLETOR'::enum_ambiente_modulo)
    ON CONFLICT (tenant_id, codigo) DO NOTHING;
    SELECT id INTO v_mod FROM modulo WHERE tenant_id = r.id AND codigo = 'coletor.entregas';
    FOREACH v_acao IN ARRAY ARRAY['READ','EXECUTE'] LOOP
      INSERT INTO permissao (tenant_id, modulo_id, acao, descricao)
      VALUES (r.id, v_mod, v_acao::enum_acao_permissao, 'Entregas - ' || v_acao)
      ON CONFLICT (tenant_id, modulo_id, acao) DO NOTHING;
      SELECT id INTO v_perm FROM permissao WHERE tenant_id = r.id AND modulo_id = v_mod AND acao = v_acao::enum_acao_permissao;
      -- Só ADMINISTRADOR por padrão: o card não aparece para todo operador do armazém.
      -- O cliente concede ao perfil dos entregadores em Perfis de Acesso.
      INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
      SELECT r.id, p.id, v_perm FROM perfil p WHERE p.tenant_id = r.id AND p.nome = 'ADMINISTRADOR'
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- provisionamento de novos tenants
CREATE OR REPLACE FUNCTION public.fn_seed_rbac_para_tenant_bkp_entregas(p_tenant_id uuid) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
DO $$
DECLARE v_def text; v_n int;
  v_ancora text := $q$ARRAY['coletor.embarque', 'Embarque', 'COLETOR'],$q$;
BEGIN
  v_def := pg_get_functiondef('public.fn_seed_rbac_para_tenant(uuid)'::regprocedure);
  EXECUTE replace(v_def, 'FUNCTION public.fn_seed_rbac_para_tenant(', 'FUNCTION public.fn_seed_rbac_para_tenant_bkp_entregas(');
  IF position('coletor.entregas' IN v_def) = 0 THEN
    v_n := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
    IF v_n <> 1 THEN RAISE EXCEPTION 'Entregas: trecho coletor.embarque do seed RBAC encontrado % vezes.', v_n; END IF;
    v_def := replace(v_def, v_ancora, v_ancora || $q$
    ARRAY['coletor.entregas', 'Entregas', 'COLETOR'],$q$);
    EXECUTE v_def;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_seed_rbac_para_tenant_bkp_entregas(uuid) FROM PUBLIC, anon, authenticated;

-- ---------- funções internas ----------
-- Motivos padrão de entrega (criados quando o tenant vincula o primeiro entregador).
CREATE OR REPLACE FUNCTION public._fn_entrega_seed_motivos(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM motivo_ocorrencia m WHERE m.tenant_id = p_tenant_id AND m.etapa_ocorrencia = 'ENTREGA') THEN
    RETURN;
  END IF;
  INSERT INTO motivo_ocorrencia (tenant_id, descricao, etapa_ocorrencia, impede_entrega, exige_observacao, permite_corte, tipo_ocorrencia_padrao)
  VALUES
    (p_tenant_id, 'Cliente ausente / estabelecimento fechado', 'ENTREGA', true,  false, false, 'OUTROS'),
    (p_tenant_id, 'Recusa do cliente',                         'ENTREGA', true,  true,  false, 'OUTROS'),
    (p_tenant_id, 'Endereço não localizado',                   'ENTREGA', true,  true,  false, 'OUTROS'),
    (p_tenant_id, 'Mercadoria avariada (devolvida)',           'ENTREGA', true,  true,  false, 'AVARIA'),
    (p_tenant_id, 'Avaria parcial (entregue com ressalva)',    'ENTREGA', false, true,  false, 'AVARIA'),
    (p_tenant_id, 'Falta de volume',                           'ENTREGA', false, true,  false, 'FALTA'),
    (p_tenant_id, 'Fora do horário de recebimento',            'ENTREGA', true,  false, false, 'OUTROS'),
    (p_tenant_id, 'Outros',                                    'ENTREGA', true,  true,  false, 'OUTROS');
END $$;

-- Usuário pode ser entregador? (ativo, do tenant, com coletor.entregas EXECUTE)
CREATE OR REPLACE FUNCTION public._fn_entrega_usuario_elegivel(p_tenant_id uuid, p_usuario_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM usuario u WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id AND u.ativo)
     AND public.fn_usuario_tem_permissao(p_usuario_id, 'coletor.entregas', 'EXECUTE');
$$;

-- Validação do entregador no cadastro de veículos (RN01)
CREATE OR REPLACE FUNCTION public._fn_veiculo_entregador_validar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.usuario_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.usuario_id IS NOT DISTINCT FROM OLD.usuario_id) THEN
    RETURN NEW;
  END IF;
  IF NOT public._fn_entrega_usuario_elegivel(NEW.tenant_id, NEW.usuario_id) THEN
    RAISE EXCEPTION 'VEICULO_ENTREGADOR_INVALIDO: o usuário escolhido precisa estar ativo e ter a permissão Entregas no coletor.'
      USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._fn_entrega_seed_motivos(NEW.tenant_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_veiculo_entregador_validar ON public.veiculos;
CREATE TRIGGER trg_veiculo_entregador_validar BEFORE INSERT OR UPDATE OF usuario_id ON public.veiculos
  FOR EACH ROW EXECUTE FUNCTION public._fn_veiculo_entregador_validar();

-- Autoriza a chamada e devolve o usuário efetivo.
-- p_modo: COLETOR (coletor.entregas EXECUTE) | GESTOR (montagem de carga UPDATE) | LER (qualquer um dos dois ou leitura da montagem)
CREATE OR REPLACE FUNCTION public._fn_entrega_autorizar(p_tenant_id uuid, p_usuario_id uuid, p_modo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_col boolean; v_ges boolean;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_usuario_id IS NOT NULL THEN PERFORM public.assert_usuario_sessao(p_usuario_id); END IF;
  v_u := public._fn_gestor_sessao(p_usuario_id, p_tenant_id);
  IF v_u IS NULL OR NOT EXISTS (SELECT 1 FROM usuario u WHERE u.id = v_u AND u.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'ENTREGA_USUARIO_INVALIDO: usuário não identificado neste tenant.';
  END IF;
  v_col := public.fn_usuario_tem_permissao(v_u, 'coletor.entregas', 'EXECUTE');
  v_ges := public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE');
  IF p_modo = 'COLETOR' AND NOT v_col THEN
    RAISE EXCEPTION 'ENTREGA_SEM_PERMISSAO: seu perfil não tem permissão para entregas no coletor.';
  ELSIF p_modo = 'GESTOR' AND NOT v_ges THEN
    RAISE EXCEPTION 'ENTREGA_SEM_PERMISSAO: seu perfil não tem permissão para gerenciar entregas.';
  ELSIF p_modo = 'LER' AND NOT (v_col OR v_ges OR public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'READ')) THEN
    RAISE EXCEPTION 'ENTREGA_SEM_PERMISSAO: seu perfil não tem acesso às entregas.';
  END IF;
  RETURN v_u;
END $$;

CREATE OR REPLACE FUNCTION public._fn_entrega_evento(p_entrega_id uuid, p_parada_id uuid, p_tipo text, p_usuario_id uuid,
  p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL, p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO entrega_evento (tenant_id, empresa_id, entrega_id, entrega_parada_id, tipo, usuario_id, latitude, longitude, dados, created_by)
  SELECT e.tenant_id, e.empresa_id, e.id, p_parada_id, p_tipo, p_usuario_id, p_lat, p_lng, COALESCE(p_dados, '{}'::jsonb), p_usuario_id
    FROM entrega e WHERE e.id = p_entrega_id;
$$;

-- Recalcula contadores e conclui a entrega quando não há parada pendente (RN14).
CREATE OR REPLACE FUNCTION public._fn_entrega_recalcular(p_entrega_id uuid, p_usuario_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tot int; v_ent int; v_nao int; v_status text;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE status = 'ENTREGUE'), count(*) FILTER (WHERE status = 'NAO_ENTREGUE')
    INTO v_tot, v_ent, v_nao FROM entrega_parada WHERE entrega_id = p_entrega_id;
  UPDATE entrega SET total_paradas = v_tot, paradas_entregues = v_ent, paradas_nao_entregues = v_nao, updated_by = p_usuario_id
   WHERE id = p_entrega_id RETURNING status INTO v_status;
  IF v_status = 'EM_ROTA' AND v_tot > 0 AND v_ent + v_nao = v_tot THEN
    UPDATE entrega SET status = 'CONCLUIDA', concluida_em = now() WHERE id = p_entrega_id;
    PERFORM public._fn_entrega_evento(p_entrega_id, NULL, 'CONCLUIDA', p_usuario_id, NULL, NULL,
      jsonb_build_object('entregues', v_ent, 'nao_entregues', v_nao));
    v_status := 'CONCLUIDA';
  ELSIF v_status = 'CONCLUIDA' AND v_ent + v_nao < v_tot THEN
    UPDATE entrega SET status = 'EM_ROTA', concluida_em = NULL WHERE id = p_entrega_id;
    PERFORM public._fn_entrega_evento(p_entrega_id, NULL, 'REABERTA', p_usuario_id);
    v_status := 'EM_ROTA';
  END IF;
  RETURN v_status;
END $$;

-- Gera a entrega de uma carga (idempotente). Devolve o id ou NULL quando a carga não gera entrega.
CREATE OR REPLACE FUNCTION public._fn_entrega_gerar(p_carga_id uuid, p_usuario_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c record; v_ent uuid; v_usr uuid; v_n int;
BEGIN
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id;
  IF v_c.id IS NULL OR v_c.status <> 'FECHADA' OR v_c.modalidade <> 'PROPRIA' OR v_c.veiculo_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT e.id INTO v_ent FROM entrega e WHERE e.carga_id = p_carga_id AND e.status <> 'CANCELADA';
  IF v_ent IS NOT NULL THEN RETURN v_ent; END IF;
  SELECT v.usuario_id INTO v_usr FROM veiculos v WHERE v.id = v_c.veiculo_id;
  IF v_usr IS NULL THEN RETURN NULL; END IF;

  INSERT INTO entrega (tenant_id, empresa_id, carga_id, veiculo_id, usuario_id, status, atribuida_em, created_by, updated_by)
  VALUES (v_c.tenant_id, v_c.empresa_id, v_c.id, v_c.veiculo_id, v_usr, 'AGUARDANDO_ACEITE', now(), p_usuario_id, p_usuario_id)
  RETURNING id INTO v_ent;

  INSERT INTO entrega_parada (tenant_id, empresa_id, entrega_id, carga_documento_id, documento_saida_id, parceiro_id,
    sequencia, sequencia_carga, parceiro_nome, endereco, bairro, cidade, estado, cep, telefone, contato,
    numero_pedido, numero_nf, serie_nf, created_by, updated_by)
  SELECT v_c.tenant_id, v_c.empresa_id, v_ent, cd.id, ds.id, p.id,
         row_number() OVER (ORDER BY cd.sequencia DESC, cd.created_at DESC)::int, cd.sequencia,
         COALESCE(NULLIF(btrim(p.nome_fantasia), ''), p.razaosocial), p.endereco, p.bairro, p.cidade, p.estado, p.cep,
         p.telefone, p.contato,
         COALESCE(ds.numero_pedido::text, ds.codigo_erp), nf.numero_nf, nf.serie, p_usuario_id, p_usuario_id
    FROM carga_documento cd
    JOIN documento_saida ds ON ds.id = cd.documento_saida_id
    LEFT JOIN parceiro p ON p.id = ds.parceiro_id
    LEFT JOIN LATERAL (
      SELECT n.numero_nf, n.serie FROM documento_saida_nf n
       WHERE n.documento_saida_id = ds.id AND n.data_cancelamento IS NULL
       ORDER BY n.data_emissao DESC NULLS LAST, n.created_at DESC LIMIT 1) nf ON true
   WHERE cd.carga_id = p_carga_id AND cd.ativo;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE entrega SET total_paradas = v_n WHERE id = v_ent;
  PERFORM public._fn_entrega_evento(v_ent, NULL, 'ATRIBUIDA', p_usuario_id, NULL, NULL,
    jsonb_build_object('usuario_entregador_id', v_usr, 'paradas', v_n, 'numero_carga', v_c.numero_carga));
  INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
  VALUES (v_c.tenant_id, v_c.empresa_id, v_c.id, 'ENTREGA_GERADA', p_usuario_id,
          jsonb_build_object('entrega_id', v_ent, 'usuario_entregador_id', v_usr, 'paradas', v_n), p_usuario_id);
  RETURN v_ent;
END $$;

-- Gatilho: carga de veículo próprio fechada gera a entrega (RN03). Nunca bloqueia o fechamento.
CREATE OR REPLACE FUNCTION public._fn_trg_carga_entrega()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  BEGIN
    PERFORM public._fn_entrega_gerar(NEW.id, NEW.fechada_por);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO carga_evento (tenant_id, empresa_id, carga_id, tipo, usuario_id, dados, created_by)
    VALUES (NEW.tenant_id, NEW.empresa_id, NEW.id, 'ENTREGA_FALHA_GERACAO', NEW.fechada_por,
            jsonb_build_object('erro', SQLERRM), NEW.fechada_por);
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_carga_entrega_gerar ON public.carga;
CREATE TRIGGER trg_carga_entrega_gerar AFTER UPDATE OF status ON public.carga
  FOR EACH ROW WHEN (NEW.status = 'FECHADA' AND OLD.status IS DISTINCT FROM 'FECHADA' AND NEW.modalidade = 'PROPRIA')
  EXECUTE FUNCTION public._fn_trg_carga_entrega();

-- JSON de uma entrega com as paradas (ordem de entrega)
CREATE OR REPLACE FUNCTION public._fn_entrega_json(p_entrega_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'carga_id', e.carga_id, 'numero_carga', c.numero_carga, 'status', e.status,
    'usuario_id', e.usuario_id, 'usuario_nome', u.nome,
    'veiculo_id', e.veiculo_id, 'veiculo', v.descricao, 'placa', v.placa, 'tipo_veiculo', v.tipo_veiculo,
    'atribuida_em', e.atribuida_em, 'aceita_em', e.aceita_em, 'concluida_em', e.concluida_em,
    'cancelada_em', e.cancelada_em, 'motivo_cancelamento', e.motivo_cancelamento,
    'carga_fechada_em', c.fechada_em,
    'total_paradas', e.total_paradas, 'paradas_entregues', e.paradas_entregues, 'paradas_nao_entregues', e.paradas_nao_entregues,
    'proxima_parada_id', (SELECT p.id FROM entrega_parada p WHERE p.entrega_id = e.id AND p.status = 'PENDENTE' ORDER BY p.sequencia LIMIT 1),
    'paradas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'sequencia', p.sequencia, 'sequencia_carga', p.sequencia_carga, 'status', p.status,
        'documento_saida_id', p.documento_saida_id, 'parceiro_id', p.parceiro_id, 'parceiro_nome', p.parceiro_nome,
        'endereco', p.endereco, 'bairro', p.bairro, 'cidade', p.cidade, 'estado', p.estado, 'cep', p.cep,
        'telefone', p.telefone, 'contato', p.contato, 'numero_pedido', p.numero_pedido,
        'numero_nf', p.numero_nf, 'serie_nf', p.serie_nf,
        'entregue_em', p.entregue_em, 'recebedor_nome', p.recebedor_nome, 'foto_canhoto_path', p.foto_canhoto_path,
        'finalizada_em', p.finalizada_em,
        'ocorrencia', CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', o.id, 'numero', o.numero_ocorrencia, 'motivo', mo.descricao, 'observacao', o.observacao,
          'criada_em', o.criado_em, 'impede_entrega', mo.impede_entrega,
          'foto_path', (SELECT a.storage_path FROM ocorrencia_anexo a WHERE a.ocorrencia_id = o.id ORDER BY a.created_at DESC LIMIT 1)) END
      ) ORDER BY p.sequencia)
        FROM entrega_parada p
        LEFT JOIN ocorrencia_operacional o ON o.id = p.ultima_ocorrencia_id
        LEFT JOIN motivo_ocorrencia mo ON mo.id = o.motivo_ocorrencia_id
       WHERE p.entrega_id = e.id), '[]'::jsonb))
    FROM entrega e
    JOIN carga c ON c.id = e.carga_id
    LEFT JOIN usuario u ON u.id = e.usuario_id
    LEFT JOIN veiculos v ON v.id = e.veiculo_id
   WHERE e.id = p_entrega_id;
$$;

-- Confere se a foto foi enviada para o caminho da parada.
CREATE OR REPLACE FUNCTION public._fn_entrega_foto_valida(p_tenant_id uuid, p_entrega_id uuid, p_parada_id uuid, p_path text)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tam bigint;
BEGIN
  IF p_path IS NULL OR btrim(p_path) = '' THEN
    RAISE EXCEPTION 'ENTREGA_FOTO_OBRIGATORIA: tire a foto antes de gravar.';
  END IF;
  IF p_path NOT LIKE format('%s/entregas/%s/%s/%%', p_tenant_id, p_entrega_id, p_parada_id) OR position('..' IN p_path) > 0 THEN
    RAISE EXCEPTION 'ENTREGA_FOTO_INVALIDA: a foto não pertence a esta parada.';
  END IF;
  SELECT COALESCE((o.metadata->>'size')::bigint, 0) INTO v_tam
    FROM storage.objects o WHERE o.bucket_id = 'evidencias' AND o.name = p_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ENTREGA_FOTO_NAO_ENVIADA: a foto não chegou ao servidor. Verifique a conexão e tente de novo.';
  END IF;
  RETURN v_tam;
END $$;

-- Carrega e trava a parada do entregador, validando o estado (uso interno das RPCs do coletor).
CREATE OR REPLACE FUNCTION public._fn_entrega_parada_para_acao(p_tenant_id uuid, p_parada_id uuid, p_usuario_id uuid)
RETURNS public.entrega_parada LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_p public.entrega_parada; v_e record;
BEGIN
  SELECT p.* INTO v_p FROM entrega_parada p WHERE p.id = p_parada_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'ENTREGA_PARADA_NAO_ENCONTRADA: parada não encontrada.'; END IF;
  SELECT e.* INTO v_e FROM entrega e WHERE e.id = v_p.entrega_id FOR UPDATE;
  IF v_e.usuario_id <> p_usuario_id THEN
    RAISE EXCEPTION 'ENTREGA_DE_OUTRO_USUARIO: esta entrega está atribuída a outro entregador.';
  END IF;
  IF v_e.status = 'AGUARDANDO_ACEITE' THEN
    RAISE EXCEPTION 'ENTREGA_NAO_ACEITA: aceite a carga antes de registrar as entregas.';
  ELSIF v_e.status <> 'EM_ROTA' THEN
    RAISE EXCEPTION 'ENTREGA_ENCERRADA: esta entrega está %.', lower(replace(v_e.status, '_', ' '));
  END IF;
  IF v_p.status <> 'PENDENTE' THEN
    RAISE EXCEPTION 'ENTREGA_PARADA_FINALIZADA: esta parada já foi registrada como %.', CASE v_p.status WHEN 'ENTREGUE' THEN 'entregue' ELSE 'não entregue' END;
  END IF;
  RETURN v_p;
END $$;

-- ---------- RPCs do coletor ----------
CREATE OR REPLACE FUNCTION public.entrega_minhas_listar(p_tenant_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'COLETOR');
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', e.id, 'carga_id', e.carga_id, 'numero_carga', c.numero_carga, 'status', e.status,
      'veiculo', v.descricao, 'placa', v.placa, 'tipo_veiculo', v.tipo_veiculo,
      'atribuida_em', e.atribuida_em, 'aceita_em', e.aceita_em,
      'total_paradas', e.total_paradas, 'paradas_entregues', e.paradas_entregues, 'paradas_nao_entregues', e.paradas_nao_entregues)
      ORDER BY (e.status = 'AGUARDANDO_ACEITE') DESC, e.atribuida_em)
      FROM entrega e
      JOIN carga c ON c.id = e.carga_id
      LEFT JOIN veiculos v ON v.id = e.veiculo_id
     WHERE e.tenant_id = p_tenant_id AND e.usuario_id = v_u AND e.status IN ('AGUARDANDO_ACEITE','EM_ROTA')), '[]'::jsonb));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_detalhe(p_tenant_id uuid, p_usuario_id uuid, p_entrega_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_dono uuid;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'LER');
  SELECT e.usuario_id INTO v_dono FROM entrega e WHERE e.id = p_entrega_id AND e.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENTREGA_NAO_ENCONTRADA: entrega não encontrada.'; END IF;
  IF v_dono <> v_u AND NOT (public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'READ')
                            OR public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE')) THEN
    RAISE EXCEPTION 'ENTREGA_DE_OUTRO_USUARIO: esta entrega está atribuída a outro entregador.';
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', public._fn_entrega_json(p_entrega_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_aceitar(p_tenant_id uuid, p_usuario_id uuid, p_entrega_id uuid,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_e record;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'COLETOR');
  SELECT e.*, c.numero_carga INTO v_e FROM entrega e JOIN carga c ON c.id = e.carga_id
   WHERE e.id = p_entrega_id AND e.tenant_id = p_tenant_id FOR UPDATE OF e;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'ENTREGA_NAO_ENCONTRADA: entrega não encontrada.'; END IF;
  IF v_e.usuario_id <> v_u THEN RAISE EXCEPTION 'ENTREGA_DE_OUTRO_USUARIO: esta entrega está atribuída a outro entregador.'; END IF;
  IF v_e.status = 'EM_ROTA' THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'ENTREGA_JA_ACEITA', 'mensagem', format('A carga #%s já estava aceita.', v_e.numero_carga),
      'dados', public._fn_entrega_json(p_entrega_id));
  END IF;
  IF v_e.status <> 'AGUARDANDO_ACEITE' THEN
    RAISE EXCEPTION 'ENTREGA_ENCERRADA: esta entrega está %.', lower(replace(v_e.status, '_', ' '));
  END IF;
  UPDATE entrega SET status = 'EM_ROTA', aceita_em = now(), updated_by = v_u WHERE id = p_entrega_id;
  PERFORM public._fn_entrega_evento(p_entrega_id, NULL, 'ACEITA', v_u, p_latitude, p_longitude,
    jsonb_build_object('segundos_para_aceite', round(extract(epoch FROM now() - v_e.atribuida_em))));
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ENTREGA_ACEITA',
    'mensagem', format('Carga #%s aceita. Boa rota!', v_e.numero_carga), 'dados', public._fn_entrega_json(p_entrega_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_parada_confirmar(p_tenant_id uuid, p_usuario_id uuid, p_parada_id uuid,
  p_foto_path text, p_recebedor_nome text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL, p_precisao_m numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_p public.entrega_parada; v_fora boolean; v_status text;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'COLETOR');
  v_p := public._fn_entrega_parada_para_acao(p_tenant_id, p_parada_id, v_u);
  PERFORM public._fn_entrega_foto_valida(p_tenant_id, v_p.entrega_id, v_p.id, p_foto_path);
  v_fora := EXISTS (SELECT 1 FROM entrega_parada x WHERE x.entrega_id = v_p.entrega_id AND x.status = 'PENDENTE' AND x.sequencia < v_p.sequencia);

  UPDATE entrega_parada
     SET status = 'ENTREGUE', entregue_em = now(), entregue_por = v_u, finalizada_em = now(),
         recebedor_nome = NULLIF(btrim(left(p_recebedor_nome, 120)), ''), foto_canhoto_path = p_foto_path,
         latitude = p_latitude, longitude = p_longitude, precisao_m = p_precisao_m, updated_by = v_u
   WHERE id = v_p.id;
  PERFORM public._fn_entrega_evento(v_p.entrega_id, v_p.id, 'PARADA_ENTREGUE', v_u, p_latitude, p_longitude,
    jsonb_build_object('foto_path', p_foto_path, 'recebedor_nome', NULLIF(btrim(p_recebedor_nome), ''),
                       'fora_de_ordem', v_fora, 'sequencia', v_p.sequencia, 'precisao_m', p_precisao_m));
  v_status := public._fn_entrega_recalcular(v_p.entrega_id, v_u);
  RETURN jsonb_build_object('sucesso', true, 'codigo', CASE WHEN v_status = 'CONCLUIDA' THEN 'ENTREGA_CONCLUIDA' ELSE 'PARADA_ENTREGUE' END,
    'mensagem', CASE WHEN v_status = 'CONCLUIDA' THEN 'Entrega registrada. Todas as paradas foram finalizadas.'
                     ELSE format('Entrega para %s registrada.', COALESCE(v_p.parceiro_nome, 'o cliente')) END,
    'dados', public._fn_entrega_json(v_p.entrega_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_motivos_listar(p_tenant_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'COLETOR');
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', m.id, 'descricao', m.descricao,
             'exige_observacao', m.exige_observacao, 'impede_entrega', m.impede_entrega) ORDER BY m.impede_entrega DESC, m.descricao)
      FROM motivo_ocorrencia m
     WHERE m.tenant_id = p_tenant_id AND m.etapa_ocorrencia = 'ENTREGA' AND m.ativo
       AND (m.empresa_id IS NULL OR m.empresa_id = (SELECT u.empresa_id FROM usuario u WHERE u.id = v_u))), '[]'::jsonb));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_parada_ocorrencia(p_tenant_id uuid, p_usuario_id uuid, p_parada_id uuid,
  p_motivo_id uuid, p_observacao text, p_foto_path text,
  p_latitude numeric DEFAULT NULL, p_longitude numeric DEFAULT NULL, p_precisao_m numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_p public.entrega_parada; v_m record; v_tam bigint; v_r jsonb; v_oc uuid; v_status text; v_obs text;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'COLETOR');
  v_p := public._fn_entrega_parada_para_acao(p_tenant_id, p_parada_id, v_u);
  SELECT m.* INTO v_m FROM motivo_ocorrencia m
   WHERE m.id = p_motivo_id AND m.tenant_id = p_tenant_id AND m.etapa_ocorrencia = 'ENTREGA' AND m.ativo;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'ENTREGA_MOTIVO_INVALIDO: escolha um motivo de entrega ativo.'; END IF;
  v_obs := NULLIF(btrim(left(p_observacao, 1000)), '');
  IF v_m.exige_observacao AND (v_obs IS NULL OR length(v_obs) < 3) THEN
    RAISE EXCEPTION 'ENTREGA_OBSERVACAO_OBRIGATORIA: descreva o que aconteceu (motivo "%").', v_m.descricao;
  END IF;
  v_tam := public._fn_entrega_foto_valida(p_tenant_id, v_p.entrega_id, v_p.id, p_foto_path);

  v_r := public.registrar_ocorrencia_operacional(
    p_tenant_id => p_tenant_id, p_empresa_id => v_p.empresa_id, p_armazem_id => NULL,
    p_etapa_ocorrencia => 'ENTREGA', p_tipo_ocorrencia => NULL, p_motivo_ocorrencia_id => v_m.id,
    p_documento_origem_id => v_p.id, p_tipo_documento_origem => 'ENTREGA_PARADA',
    p_usuario_criador_id => v_u,
    p_observacao => concat_ws(' · ', format('Pedido %s · %s', COALESCE(v_p.numero_pedido, '?'), COALESCE(v_p.parceiro_nome, '?')), v_obs));
  IF NOT COALESCE((v_r->>'sucesso')::boolean, false) THEN
    RAISE EXCEPTION 'ENTREGA_OCORRENCIA_FALHOU: %', COALESCE(v_r->>'mensagem', 'não foi possível registrar a ocorrência.');
  END IF;
  v_oc := (v_r->>'ocorrencia_id')::uuid;
  INSERT INTO ocorrencia_anexo (tenant_id, ocorrencia_id, nome_arquivo, tipo_arquivo, tamanho_bytes, storage_path, origem, created_by)
  VALUES (p_tenant_id, v_oc, regexp_replace(p_foto_path, '^.*/', ''), 'image/jpeg', COALESCE(v_tam, 0), p_foto_path, 'COLETOR', v_u);

  UPDATE entrega_parada
     SET ultima_ocorrencia_id = v_oc, latitude = p_latitude, longitude = p_longitude, precisao_m = p_precisao_m,
         status = CASE WHEN v_m.impede_entrega THEN 'NAO_ENTREGUE' ELSE status END,
         finalizada_em = CASE WHEN v_m.impede_entrega THEN now() ELSE finalizada_em END,
         updated_by = v_u
   WHERE id = v_p.id;
  PERFORM public._fn_entrega_evento(v_p.entrega_id, v_p.id, 'OCORRENCIA', v_u, p_latitude, p_longitude,
    jsonb_build_object('ocorrencia_id', v_oc, 'numero_ocorrencia', v_r->'numero_ocorrencia', 'motivo_id', v_m.id,
                       'motivo', v_m.descricao, 'impede_entrega', v_m.impede_entrega, 'foto_path', p_foto_path));
  v_status := public._fn_entrega_recalcular(v_p.entrega_id, v_u);
  RETURN jsonb_build_object('sucesso', true,
    'codigo', CASE WHEN v_status = 'CONCLUIDA' THEN 'ENTREGA_CONCLUIDA' WHEN v_m.impede_entrega THEN 'PARADA_NAO_ENTREGUE' ELSE 'OCORRENCIA_REGISTRADA' END,
    'mensagem', format('Ocorrência #%s registrada. %s', v_r->>'numero_ocorrencia',
                       CASE WHEN v_m.impede_entrega THEN 'A parada ficou como não entregue.' ELSE 'A parada continua pendente para confirmar a entrega.' END),
    'dados', public._fn_entrega_json(v_p.entrega_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- RPCs da web (supervisor) ----------
CREATE OR REPLACE FUNCTION public.entrega_entregadores_listar(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'login', u.login) ORDER BY u.nome)
      FROM usuario u
     WHERE u.tenant_id = p_tenant_id AND u.ativo
       AND public.fn_usuario_tem_permissao(u.id, 'coletor.entregas', 'EXECUTE')), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.entrega_carga_detalhe(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_ent uuid; v_motivo text; v_veic record;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'LER');
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  SELECT e.id INTO v_ent FROM entrega e WHERE e.carga_id = p_carga_id ORDER BY (e.status <> 'CANCELADA') DESC, e.created_at DESC LIMIT 1;
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
    'veiculo_entregador', v_veic.usuario_nome,
    'motivo_sem_entrega', v_motivo,
    'pode_gerar', v_motivo IS NULL AND (v_ent IS NULL OR (SELECT status FROM entrega WHERE id = v_ent) = 'CANCELADA')
                  AND public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE'),
    'pode_gerenciar', public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE'),
    'eventos', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo', ev.tipo, 'ocorrido_em', ev.ocorrido_em, 'usuario', u.nome,
                                   'parada_id', ev.entrega_parada_id, 'dados', ev.dados) ORDER BY ev.ocorrido_em DESC)
                          FROM entrega_evento ev LEFT JOIN usuario u ON u.id = ev.usuario_id
                         WHERE ev.entrega_id = v_ent), '[]'::jsonb)));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_gerar_manual(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_ent uuid; v_veic_usr uuid;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'GESTOR');
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.modalidade <> 'PROPRIA' THEN RAISE EXCEPTION 'ENTREGA_CARGA_TERCEIRO: carga de transportadora não gera entrega.'; END IF;
  IF v_c.status <> 'FECHADA' THEN RAISE EXCEPTION 'ENTREGA_CARGA_NAO_FECHADA: conclua o carregamento antes de gerar a entrega.'; END IF;
  SELECT v.usuario_id INTO v_veic_usr FROM veiculos v WHERE v.id = v_c.veiculo_id;
  IF v_veic_usr IS NULL THEN
    RAISE EXCEPTION 'ENTREGA_VEICULO_SEM_ENTREGADOR: vincule um usuário entregador ao veículo em Dados Mestres › Veículos.';
  END IF;
  IF NOT public._fn_entrega_usuario_elegivel(p_tenant_id, v_veic_usr) THEN
    RAISE EXCEPTION 'ENTREGA_ENTREGADOR_INVALIDO: o entregador do veículo está inativo ou sem a permissão Entregas.';
  END IF;
  IF EXISTS (SELECT 1 FROM entrega e WHERE e.carga_id = p_carga_id AND e.status <> 'CANCELADA') THEN
    RAISE EXCEPTION 'ENTREGA_JA_GERADA: esta carga já tem entrega.';
  END IF;
  v_ent := public._fn_entrega_gerar(p_carga_id, v_u);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ENTREGA_GERADA',
    'mensagem', format('Entrega da carga #%s gerada e enviada ao entregador.', v_c.numero_carga),
    'dados', public._fn_entrega_json(v_ent));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_reatribuir(p_tenant_id uuid, p_usuario_id uuid, p_entrega_id uuid, p_novo_usuario_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_e record;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'GESTOR');
  IF length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'ENTREGA_MOTIVO_OBRIGATORIO: informe o motivo.'; END IF;
  SELECT e.* INTO v_e FROM entrega e WHERE e.id = p_entrega_id AND e.tenant_id = p_tenant_id FOR UPDATE;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'ENTREGA_NAO_ENCONTRADA: entrega não encontrada.'; END IF;
  IF v_e.status NOT IN ('AGUARDANDO_ACEITE','EM_ROTA') THEN
    RAISE EXCEPTION 'ENTREGA_ENCERRADA: esta entrega está %.', lower(replace(v_e.status, '_', ' '));
  END IF;
  IF p_novo_usuario_id = v_e.usuario_id THEN RAISE EXCEPTION 'ENTREGA_MESMO_ENTREGADOR: escolha outro entregador.'; END IF;
  IF NOT public._fn_entrega_usuario_elegivel(p_tenant_id, p_novo_usuario_id) THEN
    RAISE EXCEPTION 'ENTREGA_ENTREGADOR_INVALIDO: o usuário escolhido precisa estar ativo e ter a permissão Entregas no coletor.';
  END IF;
  UPDATE entrega SET usuario_id = p_novo_usuario_id, status = 'AGUARDANDO_ACEITE', atribuida_em = now(), aceita_em = NULL, updated_by = v_u
   WHERE id = p_entrega_id;
  PERFORM public._fn_entrega_evento(p_entrega_id, NULL, 'REATRIBUIDA', v_u, NULL, NULL,
    jsonb_build_object('de', v_e.usuario_id, 'para', p_novo_usuario_id, 'status_anterior', v_e.status, 'motivo', btrim(p_motivo)));
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ENTREGA_REATRIBUIDA',
    'mensagem', 'Entrega reatribuída. O novo entregador precisa aceitar a carga.', 'dados', public._fn_entrega_json(p_entrega_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_cancelar(p_tenant_id uuid, p_usuario_id uuid, p_entrega_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_e record;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'GESTOR');
  IF length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'ENTREGA_MOTIVO_OBRIGATORIO: informe o motivo.'; END IF;
  SELECT e.* INTO v_e FROM entrega e WHERE e.id = p_entrega_id AND e.tenant_id = p_tenant_id FOR UPDATE;
  IF v_e.id IS NULL THEN RAISE EXCEPTION 'ENTREGA_NAO_ENCONTRADA: entrega não encontrada.'; END IF;
  IF v_e.status NOT IN ('AGUARDANDO_ACEITE','EM_ROTA') THEN
    RAISE EXCEPTION 'ENTREGA_ENCERRADA: esta entrega está %.', lower(replace(v_e.status, '_', ' '));
  END IF;
  IF EXISTS (SELECT 1 FROM entrega_parada p WHERE p.entrega_id = p_entrega_id AND p.status <> 'PENDENTE') THEN
    RAISE EXCEPTION 'ENTREGA_COM_PARADA_FINALIZADA: há paradas já registradas; estorne-as antes de cancelar.';
  END IF;
  UPDATE entrega SET status = 'CANCELADA', cancelada_em = now(), cancelada_por = v_u, motivo_cancelamento = btrim(p_motivo), updated_by = v_u
   WHERE id = p_entrega_id;
  PERFORM public._fn_entrega_evento(p_entrega_id, NULL, 'CANCELADA', v_u, NULL, NULL,
    jsonb_build_object('status_anterior', v_e.status, 'motivo', btrim(p_motivo)));
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ENTREGA_CANCELADA', 'mensagem', 'Entrega cancelada.',
    'dados', public._fn_entrega_json(p_entrega_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.entrega_parada_estornar(p_tenant_id uuid, p_usuario_id uuid, p_parada_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_p public.entrega_parada; v_st text;
BEGIN
  v_u := public._fn_entrega_autorizar(p_tenant_id, p_usuario_id, 'GESTOR');
  IF length(btrim(COALESCE(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'ENTREGA_MOTIVO_OBRIGATORIO: informe o motivo.'; END IF;
  SELECT p.* INTO v_p FROM entrega_parada p WHERE p.id = p_parada_id AND p.tenant_id = p_tenant_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'ENTREGA_PARADA_NAO_ENCONTRADA: parada não encontrada.'; END IF;
  SELECT e.status INTO v_st FROM entrega e WHERE e.id = v_p.entrega_id FOR UPDATE;
  IF v_st NOT IN ('EM_ROTA','CONCLUIDA') THEN RAISE EXCEPTION 'ENTREGA_ENCERRADA: esta entrega está %.', lower(replace(v_st, '_', ' ')); END IF;
  IF v_p.status = 'PENDENTE' THEN RAISE EXCEPTION 'ENTREGA_PARADA_PENDENTE: esta parada ainda está pendente.'; END IF;
  UPDATE entrega_parada
     SET status = 'PENDENTE', entregue_em = NULL, entregue_por = NULL, finalizada_em = NULL, recebedor_nome = NULL,
         foto_canhoto_path = NULL, updated_by = v_u
   WHERE id = v_p.id;
  PERFORM public._fn_entrega_evento(v_p.entrega_id, v_p.id, 'PARADA_ESTORNADA', v_u, NULL, NULL,
    jsonb_build_object('status_anterior', v_p.status, 'foto_path', v_p.foto_canhoto_path, 'entregue_em', v_p.entregue_em,
                       'ocorrencia_id', v_p.ultima_ocorrencia_id, 'motivo', btrim(p_motivo)));
  PERFORM public._fn_entrega_recalcular(v_p.entrega_id, v_u);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'PARADA_ESTORNADA', 'mensagem', 'Parada estornada; volta a ficar pendente no coletor.',
    'dados', public._fn_entrega_json(v_p.entrega_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- badge do menu do coletor ----------
CREATE OR REPLACE FUNCTION public.fn_coletor_menu_badges(p_tenant_id uuid, p_empresa_id uuid, p_armazem_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_u uuid;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id); -- seguranca 2026-10-12 L2
  v_u := public._fn_gestor_sessao(NULL, p_tenant_id);
  RETURN public.fn_coletor_menu_badges__sem_checagem(p_tenant_id, p_empresa_id, p_armazem_id)
      || jsonb_build_object('embarque', (SELECT count(*) FROM carga c
            WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id AND c.status IN ('LIBERADA','EM_CARREGAMENTO'))) -- F6 2026-11-12
      || jsonb_build_object('entregas', CASE WHEN v_u IS NULL THEN 0 ELSE ( -- Entregas 2026-11-23: aguardando aceite + paradas pendentes do usuário
            (SELECT count(*) FROM entrega e WHERE e.tenant_id = p_tenant_id AND e.usuario_id = v_u AND e.status = 'AGUARDANDO_ACEITE')
          + (SELECT count(*) FROM entrega_parada p JOIN entrega e ON e.id = p.entrega_id
              WHERE e.tenant_id = p_tenant_id AND e.usuario_id = v_u AND e.status = 'EM_ROTA' AND p.status = 'PENDENTE')) END);
END;$function$;

-- ---------- grants ----------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._fn_entrega_seed_motivos(uuid)', 'public._fn_entrega_usuario_elegivel(uuid,uuid)',
    'public._fn_entrega_autorizar(uuid,uuid,text)', 'public._fn_entrega_evento(uuid,uuid,text,uuid,numeric,numeric,jsonb)',
    'public._fn_entrega_recalcular(uuid,uuid)', 'public._fn_entrega_gerar(uuid,uuid)', 'public._fn_entrega_json(uuid)',
    'public._fn_entrega_foto_valida(uuid,uuid,uuid,text)', 'public._fn_entrega_parada_para_acao(uuid,uuid,uuid)',
    'public._fn_trg_carga_entrega()', 'public._fn_veiculo_entregador_validar()', 'public._fn_entrega_evento_imutavel()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.entrega_minhas_listar(uuid,uuid)', 'public.entrega_detalhe(uuid,uuid,uuid)',
    'public.entrega_aceitar(uuid,uuid,uuid,numeric,numeric)',
    'public.entrega_parada_confirmar(uuid,uuid,uuid,text,text,numeric,numeric,numeric)',
    'public.entrega_motivos_listar(uuid,uuid)',
    'public.entrega_parada_ocorrencia(uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric)',
    'public.entrega_entregadores_listar(uuid)', 'public.entrega_carga_detalhe(uuid,uuid,uuid)',
    'public.entrega_gerar_manual(uuid,uuid,uuid)', 'public.entrega_reatribuir(uuid,uuid,uuid,uuid,text)',
    'public.entrega_cancelar(uuid,uuid,uuid,text)', 'public.entrega_parada_estornar(uuid,uuid,uuid,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
