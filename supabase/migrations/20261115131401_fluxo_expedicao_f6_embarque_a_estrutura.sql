-- =====================================================================
-- Fluxo de Expedição — F6 Embarque · 2026-11-12
-- ---------------------------------------------------------------------
-- Carga (N5): o supervisor junta ondas que aguardam embarque, define veículo,
-- box e a ordem dos pedidos, e libera para o coletor. Cada unidade bipada
-- (volume, HU, pedido ou confirmação) é uma tarefa EMB rastreável. Fechar a
-- carga encerra a etapa de embarque das ondas (fn_onda_concluir_etapa ordem 3).
--
-- Regras:
--   * A carga recebe ondas INTEIRAS (os itens da onda não guardam o pedido de origem,
--     então HU e volume sem pedido só se ligam à onda).
--   * Onda elegível: etapa EMB ligada e status CONFERIDO, ou SEPARADO com conferência desligada.
--   * Ondas da mesma carga: mesma empresa; veículo e box iguais quando informados.
--   * Um pedido só pode estar em uma carga ativa (índice único parcial).
--   * Unidade de embarque congelada na liberação (roteiro_saida_embarque; padrão CONFIRMACAO).
--     Onda sem volume/HU cai para DOCUMENTO.
--   * Bip fora da ordem é aceito com aviso; bip de unidade de outra carga é recusado.
--   * Fechar exige 100% embarcado.
-- Reversão: 20261112_fluxo_expedicao_f6_down.sql
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS public.carga_numero_seq;

-- ---------- tabelas ----------
CREATE TABLE IF NOT EXISTS public.carga (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id          uuid        NOT NULL REFERENCES public.empresa(id),
  numero_carga        bigint      NOT NULL DEFAULT nextval('public.carga_numero_seq'),
  status              text        NOT NULL DEFAULT 'EM_MONTAGEM'
                      CHECK (status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO','FECHADA','CANCELADA')),
  veiculo_id          uuid        REFERENCES public.veiculos(id),
  box_id              uuid        REFERENCES public.box(id),
  motorista           text,
  observacao          text,
  unidade_embarque    public.enum_unidade_embarque,
  peso_total          numeric     NOT NULL DEFAULT 0,
  m3_total            numeric     NOT NULL DEFAULT 0,
  volumes_total       integer     NOT NULL DEFAULT 0,
  pallets_total       integer     NOT NULL DEFAULT 0,
  montada_por         uuid        REFERENCES public.usuario(id),
  liberada_em         timestamptz,
  liberada_por        uuid        REFERENCES public.usuario(id),
  iniciada_em         timestamptz,
  fechada_em          timestamptz,
  fechada_por         uuid        REFERENCES public.usuario(id),
  cancelada_em        timestamptz,
  cancelada_por       uuid        REFERENCES public.usuario(id),
  motivo_cancelamento text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid        REFERENCES public.usuario(id),
  updated_by          uuid        REFERENCES public.usuario(id),
  CONSTRAINT uq_carga_numero UNIQUE (tenant_id, numero_carga)
);
CREATE INDEX IF NOT EXISTS idx_carga_tenant_empresa_status ON public.carga (tenant_id, empresa_id, status);

CREATE TABLE IF NOT EXISTS public.carga_documento (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id          uuid        NOT NULL REFERENCES public.empresa(id),
  carga_id            uuid        NOT NULL REFERENCES public.carga(id) ON DELETE CASCADE,
  movimento_saida_id  uuid        NOT NULL REFERENCES public.movimento_saida(id),
  documento_saida_id  uuid        NOT NULL REFERENCES public.documento_saida(id),
  sequencia           integer     NOT NULL,
  ativo               boolean     NOT NULL DEFAULT true,
  embarcado_em        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid        REFERENCES public.usuario(id),
  updated_by          uuid        REFERENCES public.usuario(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_carga_documento_ativo ON public.carga_documento (documento_saida_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_carga_documento_carga ON public.carga_documento (carga_id, sequencia) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_carga_documento_onda ON public.carga_documento (movimento_saida_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_carga_documento_tenant ON public.carga_documento (tenant_id, empresa_id);

CREATE TABLE IF NOT EXISTS public.carga_unidade (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id          uuid        NOT NULL REFERENCES public.empresa(id),
  carga_id            uuid        NOT NULL REFERENCES public.carga(id) ON DELETE CASCADE,
  carga_documento_id  uuid        REFERENCES public.carga_documento(id),
  movimento_saida_id  uuid        NOT NULL REFERENCES public.movimento_saida(id),
  tipo                public.enum_unidade_embarque NOT NULL,
  referencia_id       uuid,
  codigo              text        NOT NULL,
  descricao           text,
  sequencia           integer     NOT NULL,
  status              text        NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','EMBARCADA','CANCELADA')),
  tarefa_id           uuid        REFERENCES public.tarefa(id),
  embarcada_em        timestamptz,
  embarcada_por       uuid        REFERENCES public.usuario(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid        REFERENCES public.usuario(id),
  updated_by          uuid        REFERENCES public.usuario(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_carga_unidade_codigo ON public.carga_unidade (carga_id, codigo) WHERE status <> 'CANCELADA';
CREATE INDEX IF NOT EXISTS idx_carga_unidade_carga ON public.carga_unidade (carga_id, status, sequencia);
CREATE INDEX IF NOT EXISTS idx_carga_unidade_codigo ON public.carga_unidade (tenant_id, codigo) WHERE status <> 'CANCELADA';
CREATE INDEX IF NOT EXISTS idx_carga_unidade_documento ON public.carga_unidade (carga_documento_id);

COMMENT ON TABLE public.carga IS 'Fluxo de Expedição N5: carga de embarque (ondas inteiras num veículo/box).';
COMMENT ON TABLE public.carga_documento IS 'Pedidos da carga e a ordem de embarque definida pelo supervisor.';
COMMENT ON TABLE public.carga_unidade IS 'Unidades bipadas no embarque (volume, HU, pedido ou confirmação); cada uma gera uma tarefa EMB.';

-- RLS: leitura por tenant; gravação somente pelas RPCs (SECURITY DEFINER)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['carga','carga_documento','carga_unidade'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_tenant', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (tenant_id = (SELECT public.get_current_tenant()))', t || '_select_tenant', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_criacao ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_criacao BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_criacao()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_validar_empresa_usuario ON public.carga;
CREATE TRIGGER trg_validar_empresa_usuario BEFORE INSERT OR UPDATE ON public.carga
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_empresa_usuario();

-- ---------- permissões ----------
DO $$
DECLARE r record; v_mod uuid; v_perm uuid; v_acao text; v_m text[];
  v_mods text[][] := ARRAY[
    ARRAY['web.atividades.montagem-carga', 'Montagem de Carga', 'WEB'],
    ARRAY['coletor.embarque', 'Embarque', 'COLETOR']];
BEGIN
  FOR r IN SELECT t.id FROM tenant t LOOP
    FOREACH v_m SLICE 1 IN ARRAY v_mods LOOP
      INSERT INTO modulo (tenant_id, codigo, descricao, ambiente)
      VALUES (r.id, v_m[1], v_m[2], v_m[3]::enum_ambiente_modulo)
      ON CONFLICT (tenant_id, codigo) DO NOTHING;
      SELECT id INTO v_mod FROM modulo WHERE tenant_id = r.id AND codigo = v_m[1];
      FOREACH v_acao IN ARRAY CASE WHEN v_m[3] = 'COLETOR' THEN ARRAY['READ','EXECUTE'] ELSE ARRAY['CREATE','READ','UPDATE','DELETE'] END LOOP
        INSERT INTO permissao (tenant_id, modulo_id, acao, descricao)
        VALUES (r.id, v_mod, v_acao::enum_acao_permissao, v_m[2] || ' - ' || v_acao)
        ON CONFLICT (tenant_id, modulo_id, acao) DO NOTHING;
        SELECT id INTO v_perm FROM permissao WHERE tenant_id = r.id AND modulo_id = v_mod AND acao = v_acao::enum_acao_permissao;
        -- ADMINISTRADOR: tudo; SUPERVISOR: READ web + coletor; OPERADOR: coletor
        INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
        SELECT r.id, p.id, v_perm FROM perfil p
         WHERE p.tenant_id = r.id
           AND (p.nome = 'ADMINISTRADOR'
                OR (p.nome = 'SUPERVISOR' AND (v_m[3] = 'COLETOR' OR v_acao = 'READ'))
                OR (p.nome = 'OPERADOR' AND v_m[3] = 'COLETOR'))
        ON CONFLICT DO NOTHING;
        -- continuidade: quem já opera Ondas de Carregamento (UPDATE) ou Conferência no coletor (EXECUTE) recebe o equivalente
        INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
        SELECT DISTINCT r.id, pp.perfil_id, v_perm
          FROM perfil_permissao pp
          JOIN permissao pe ON pe.id = pp.permissao_id
          JOIN modulo mo ON mo.id = pe.modulo_id
         WHERE pp.tenant_id = r.id
           AND ((v_m[3] = 'WEB' AND mo.codigo = 'web.atividades.mov-saida' AND pe.acao = 'UPDATE')
             OR (v_m[3] = 'COLETOR' AND mo.codigo = 'coletor.conferencia' AND pe.acao = 'EXECUTE'))
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- provisionamento de novos tenants
CREATE OR REPLACE FUNCTION public.fn_seed_rbac_para_tenant_bkp_f6(p_tenant_id uuid) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
DO $$
DECLARE v_def text; v_n int;
BEGIN
  v_def := pg_get_functiondef('public.fn_seed_rbac_para_tenant(uuid)'::regprocedure);
  EXECUTE replace(v_def, 'FUNCTION public.fn_seed_rbac_para_tenant(', 'FUNCTION public.fn_seed_rbac_para_tenant_bkp_f6(');
  IF position('web.atividades.montagem-carga' IN v_def) = 0 THEN
    v_n := (length(v_def) - length(replace(v_def, $q$ARRAY['web.atividades.mov-saida', 'Ondas de Carregamento', 'WEB'],$q$, ''))) / length($q$ARRAY['web.atividades.mov-saida', 'Ondas de Carregamento', 'WEB'],$q$);
    IF v_n <> 1 THEN RAISE EXCEPTION 'F6: trecho mov-saida do seed RBAC encontrado % vezes.', v_n; END IF;
    v_def := replace(v_def, $q$ARRAY['web.atividades.mov-saida', 'Ondas de Carregamento', 'WEB'],$q$,
      $q$ARRAY['web.atividades.mov-saida', 'Ondas de Carregamento', 'WEB'],
    ARRAY['web.atividades.montagem-carga', 'Montagem de Carga', 'WEB'],$q$);
    v_n := (length(v_def) - length(replace(v_def, $q$ARRAY['coletor.conferencia', 'Conferência', 'COLETOR'],$q$, ''))) / length($q$ARRAY['coletor.conferencia', 'Conferência', 'COLETOR'],$q$);
    IF v_n <> 1 THEN RAISE EXCEPTION 'F6: trecho coletor.conferencia do seed RBAC encontrado % vezes.', v_n; END IF;
    v_def := replace(v_def, $q$ARRAY['coletor.conferencia', 'Conferência', 'COLETOR'],$q$,
      $q$ARRAY['coletor.conferencia', 'Conferência', 'COLETOR'],
    ARRAY['coletor.embarque', 'Embarque', 'COLETOR'],$q$);
    EXECUTE v_def;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_seed_rbac_para_tenant_bkp_f6(uuid) FROM PUBLIC, anon, authenticated;

-- ---------- funções internas ----------
-- Autoriza a chamada e devolve o usuário efetivo. p_coletor: permissão do coletor (ou da tela web).
CREATE OR REPLACE FUNCTION public._fn_carga_autorizar(p_tenant_id uuid, p_usuario_id uuid, p_coletor boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_usuario_id IS NOT NULL THEN PERFORM public.assert_usuario_sessao(p_usuario_id); END IF;
  v_u := public._fn_gestor_sessao(p_usuario_id, p_tenant_id);
  IF v_u IS NULL OR NOT EXISTS (SELECT 1 FROM usuario u WHERE u.id = v_u AND u.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'CARGA_USUARIO_INVALIDO: usuário não identificado neste tenant.';
  END IF;
  IF p_coletor THEN
    IF NOT (public.fn_usuario_tem_permissao(v_u, 'coletor.embarque', 'EXECUTE')
            OR public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE')) THEN
      RAISE EXCEPTION 'CARGA_SEM_PERMISSAO: seu perfil não tem permissão para executar o embarque.';
    END IF;
  ELSE
    IF NOT (public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'UPDATE')
            OR public.fn_usuario_tem_permissao(v_u, 'web.atividades.montagem-carga', 'CREATE')) THEN
      RAISE EXCEPTION 'CARGA_SEM_PERMISSAO: seu perfil não tem permissão para montar cargas.';
    END IF;
  END IF;
  RETURN v_u;
END $$;

CREATE OR REPLACE FUNCTION public._fn_carga_erro(p_sqlerrm text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('sucesso', false,
    'codigo', CASE WHEN p_sqlerrm ~ '^[A-Z_]+:' THEN split_part(p_sqlerrm, ':', 1) ELSE 'CARGA_ERRO' END,
    'mensagem', CASE WHEN p_sqlerrm ~ '^[A-Z_]+:' THEN btrim(substr(p_sqlerrm, position(':' IN p_sqlerrm) + 1)) ELSE p_sqlerrm END);
$$;

-- NULL = onda aguarda embarque; texto = motivo de não estar elegível
CREATE OR REPLACE FUNCTION public._fn_carga_onda_motivo(p_movimento_saida_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ms record; v_emb boolean; v_conf boolean;
BEGIN
  SELECT ms.id, ms.tenant_id, ms.status::text AS status, ms.numero_onda INTO v_ms FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  IF v_ms.id IS NULL THEN RETURN 'onda não encontrada'; END IF;
  SELECT i.ativa INTO v_emb FROM tipo_tarefa tt CROSS JOIN LATERAL public.fn_onda_etapa_info(v_ms.id, tt.id) i
   WHERE tt.tenant_id = v_ms.tenant_id AND tt.codigo = 'EMB';
  IF NOT COALESCE(v_emb, false) THEN RETURN format('a onda #%s não passa pela etapa de embarque', v_ms.numero_onda); END IF;
  IF v_ms.status = 'CONFERIDO' THEN RETURN NULL; END IF;
  IF v_ms.status = 'SEPARADO' THEN
    SELECT i.ativa INTO v_conf FROM tipo_tarefa tt CROSS JOIN LATERAL public.fn_onda_etapa_info(v_ms.id, tt.id) i
     WHERE tt.tenant_id = v_ms.tenant_id AND tt.codigo = 'SEP-CONF';
    IF NOT COALESCE(v_conf, true) THEN RETURN NULL; END IF;
    RETURN format('a onda #%s ainda aguarda a conferência', v_ms.numero_onda);
  END IF;
  RETURN format('a onda #%s está em %s', v_ms.numero_onda, v_ms.status);
END $$;

-- HUs da onda: as da conferência quando houver, senão as da separação
CREATE OR REPLACE FUNCTION public._fn_carga_onda_hus(p_movimento_saida_id uuid)
RETURNS TABLE(hu_id uuid, codigo_hu text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH ex AS (
    SELECT DISTINCT tt.codigo AS etapa, h.id, h.codigo_hu::text AS codigo_hu
      FROM movimento_saida_item i
      JOIN tarefa t ON t.id_documento_origem = i.id AND t.tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM' AND t.status <> 'CANCELADA'
      JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo IN ('SEP','SEP-CONF')
      JOIN tarefa_execucao te ON te.tarefa_id = t.id AND te.status = 'CONCLUIDA' AND te.hu IS NOT NULL
      JOIN hu h ON h.id = te.hu
     WHERE i.movimento_saida_id = p_movimento_saida_id)
  SELECT id, codigo_hu FROM ex
   WHERE etapa = CASE WHEN EXISTS (SELECT 1 FROM ex WHERE etapa = 'SEP-CONF') THEN 'SEP-CONF' ELSE 'SEP' END;
$$;

CREATE OR REPLACE FUNCTION public._fn_carga_recalcular(p_carga_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ondas uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT cd.movimento_saida_id), '{}') INTO v_ondas
    FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo;
  UPDATE carga SET
    peso_total    = COALESCE((SELECT sum(ms.peso_total) FROM movimento_saida ms WHERE ms.id = ANY(v_ondas)), 0),
    m3_total      = COALESCE((SELECT sum(ms.m3) FROM movimento_saida ms WHERE ms.id = ANY(v_ondas)), 0),
    volumes_total = (SELECT count(*) FROM volume_expedicao v WHERE v.movimento_saida_id = ANY(v_ondas)),
    pallets_total = (SELECT count(DISTINCT h.hu_id) FROM unnest(v_ondas) o(id) CROSS JOIN LATERAL public._fn_carga_onda_hus(o.id) h)
  WHERE id = p_carga_id;
END $$;

-- Gera unidades e tarefas EMB das ondas indicadas (todas, se NULL) de uma carga liberada
CREATE OR REPLACE FUNCTION public._fn_carga_gerar_unidades(p_carga_id uuid, p_ondas uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_c record; v_emb uuid; v_onda uuid; v_tipo public.enum_unidade_embarque; v_n integer := 0; v_ins integer;
  v_cd_primeiro uuid; v_seq_primeiro integer; u record; v_tarefa uuid; v_armazem uuid;
BEGIN
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id;
  SELECT tt.id INTO v_emb FROM tipo_tarefa tt WHERE tt.tenant_id = v_c.tenant_id AND tt.codigo = 'EMB';
  IF v_emb IS NULL THEN RAISE EXCEPTION 'CARGA_SEM_TIPO_EMB: tipo de tarefa EMB não encontrado para o tenant.'; END IF;
  SELECT b.armazem_id INTO v_armazem FROM box b WHERE b.id = v_c.box_id;

  FOR v_onda IN SELECT DISTINCT cd.movimento_saida_id FROM carga_documento cd
                 WHERE cd.carga_id = p_carga_id AND cd.ativo AND (p_ondas IS NULL OR cd.movimento_saida_id = ANY(p_ondas)) LOOP
    SELECT cd.id, cd.sequencia INTO v_cd_primeiro, v_seq_primeiro FROM carga_documento cd
     WHERE cd.carga_id = p_carga_id AND cd.ativo AND cd.movimento_saida_id = v_onda ORDER BY cd.sequencia LIMIT 1;
    v_tipo := COALESCE(v_c.unidade_embarque, 'CONFIRMACAO');
    v_ins := 0;

    IF v_tipo = 'VOLUME' THEN
      INSERT INTO carga_unidade (tenant_id, empresa_id, carga_id, carga_documento_id, movimento_saida_id, tipo, referencia_id, codigo, descricao, sequencia)
      SELECT v_c.tenant_id, v_c.empresa_id, p_carga_id, COALESCE(cd.id, v_cd_primeiro), v_onda, 'VOLUME', v.id, v.codigo_volume::text,
             format('Volume %s', COALESCE(v.numero_volume::text, v.codigo_volume::text)), COALESCE(cd.sequencia, v_seq_primeiro)
        FROM volume_expedicao v
        LEFT JOIN carga_documento cd ON cd.carga_id = p_carga_id AND cd.ativo AND cd.documento_saida_id = v.documento_saida_id
       WHERE v.movimento_saida_id = v_onda AND v.codigo_volume IS NOT NULL
      ON CONFLICT (carga_id, codigo) WHERE status <> 'CANCELADA' DO NOTHING;
      GET DIAGNOSTICS v_ins = ROW_COUNT;
    ELSIF v_tipo = 'HU' THEN
      INSERT INTO carga_unidade (tenant_id, empresa_id, carga_id, carga_documento_id, movimento_saida_id, tipo, referencia_id, codigo, descricao, sequencia)
      SELECT v_c.tenant_id, v_c.empresa_id, p_carga_id, v_cd_primeiro, v_onda, 'HU', h.hu_id, h.codigo_hu, format('HU %s', h.codigo_hu), v_seq_primeiro
        FROM public._fn_carga_onda_hus(v_onda) h
      ON CONFLICT (carga_id, codigo) WHERE status <> 'CANCELADA' DO NOTHING;
      GET DIAGNOSTICS v_ins = ROW_COUNT;
    END IF;

    IF v_ins = 0 AND NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.movimento_saida_id = v_onda AND cu.status <> 'CANCELADA') THEN
      -- DOCUMENTO / CONFIRMACAO, ou onda sem volume/HU
      INSERT INTO carga_unidade (tenant_id, empresa_id, carga_id, carga_documento_id, movimento_saida_id, tipo, referencia_id, codigo, descricao, sequencia)
      SELECT v_c.tenant_id, v_c.empresa_id, p_carga_id, cd.id, v_onda,
             CASE WHEN v_tipo = 'CONFIRMACAO' THEN 'CONFIRMACAO' ELSE 'DOCUMENTO' END::public.enum_unidade_embarque,
             ds.id, COALESCE(ds.numero_pedido::text, ds.codigo_erp, left(ds.id::text, 8)),
             format('Pedido %s', COALESCE(ds.numero_pedido::text, ds.codigo_erp, '—')), cd.sequencia
        FROM carga_documento cd JOIN documento_saida ds ON ds.id = cd.documento_saida_id
       WHERE cd.carga_id = p_carga_id AND cd.ativo AND cd.movimento_saida_id = v_onda
      ON CONFLICT (carga_id, codigo) WHERE status <> 'CANCELADA' DO NOTHING;
      GET DIAGNOSTICS v_ins = ROW_COUNT;
    END IF;
    v_n := v_n + v_ins;
  END LOOP;

  -- uma tarefa EMB por unidade nova
  FOR u IN SELECT cu.* FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'PENDENTE' AND cu.tarefa_id IS NULL LOOP
    INSERT INTO tarefa (tenant_id, empresa_id, tipo_tarefa_id, id_documento_origem, tipo_documento_origem,
                        quantidade_requerida, status, ordem_tarefa, armazem_id, criado_por)
    VALUES (v_c.tenant_id, v_c.empresa_id, v_emb, u.id, 'CARGA_UNIDADE', 1, 'CRIADA', u.sequencia, v_armazem,
            public.fn_audit_usuario_atual())
    RETURNING id INTO v_tarefa;
    UPDATE carga_unidade SET tarefa_id = v_tarefa WHERE id = u.id;
  END LOOP;
  RETURN v_n;
END $$;

-- Cancela unidades pendentes (e suas tarefas) das ondas indicadas
CREATE OR REPLACE FUNCTION public._fn_carga_cancelar_unidades(p_carga_id uuid, p_ondas uuid[], p_origem text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  PERFORM set_config('app.cancelamento_origem', p_origem, true);
  UPDATE tarefa t SET status = 'CANCELADA'
    FROM carga_unidade cu
   WHERE cu.carga_id = p_carga_id AND cu.status = 'PENDENTE' AND cu.tarefa_id = t.id
     AND (p_ondas IS NULL OR cu.movimento_saida_id = ANY(p_ondas))
     AND t.status NOT IN ('CONCLUIDA','CANCELADA');
  UPDATE carga_unidade cu SET status = 'CANCELADA'
   WHERE cu.carga_id = p_carga_id AND cu.status = 'PENDENTE'
     AND (p_ondas IS NULL OR cu.movimento_saida_id = ANY(p_ondas));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public._fn_carga_detalhe(p_carga_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'numero_carga', c.numero_carga, 'status', c.status, 'empresa_id', c.empresa_id,
    'motorista', c.motorista, 'observacao', c.observacao, 'unidade_embarque', c.unidade_embarque,
    'peso_total', c.peso_total, 'm3_total', c.m3_total, 'volumes_total', c.volumes_total, 'pallets_total', c.pallets_total,
    'created_at', c.created_at, 'liberada_em', c.liberada_em, 'iniciada_em', c.iniciada_em, 'fechada_em', c.fechada_em,
    'cancelada_em', c.cancelada_em, 'motivo_cancelamento', c.motivo_cancelamento,
    'montada_por_nome', um.nome, 'fechada_por_nome', uf.nome,
    'veiculo', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id', v.id, 'descricao', v.descricao, 'placa', v.placa,
                 'm3', v.m3, 'peso_total', v.peso_total, 'total_pallet', v.total_pallet) END,
    'box', CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('id', b.id, 'descricao', b.descricao) END,
    'capacidade', jsonb_build_object(
       'peso_pct',    CASE WHEN COALESCE(v.peso_total, 0) > 0 THEN round(c.peso_total / v.peso_total * 100, 1) END,
       'm3_pct',      CASE WHEN COALESCE(v.m3, 0) > 0 THEN round(c.m3_total / v.m3 * 100, 1) END,
       'pallets_pct', CASE WHEN COALESCE(v.total_pallet, 0) > 0 THEN round(c.pallets_total::numeric / v.total_pallet * 100, 1) END,
       'excedida', (COALESCE(v.peso_total, 0) > 0 AND c.peso_total > v.peso_total)
                OR (COALESCE(v.m3, 0) > 0 AND c.m3_total > v.m3)
                OR (COALESCE(v.total_pallet, 0) > 0 AND c.pallets_total > v.total_pallet)),
    'progresso', (SELECT jsonb_build_object('total', count(*) FILTER (WHERE cu.status <> 'CANCELADA'),
                                            'embarcadas', count(*) FILTER (WHERE cu.status = 'EMBARCADA'))
                    FROM carga_unidade cu WHERE cu.carga_id = c.id),
    'ondas', COALESCE((SELECT jsonb_agg(jsonb_build_object('movimento_saida_id', ms.id, 'numero_onda', ms.numero_onda,
                         'status', ms.status, 'peso_total', ms.peso_total, 'm3', ms.m3,
                         'documentos', (SELECT count(*) FROM carga_documento x WHERE x.carga_id = c.id AND x.ativo AND x.movimento_saida_id = ms.id)
                       ) ORDER BY ms.numero_onda)
                FROM movimento_saida ms
               WHERE ms.id IN (SELECT cd.movimento_saida_id FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo)), '[]'::jsonb),
    'documentos', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'carga_documento_id', cd.id, 'sequencia', cd.sequencia, 'documento_saida_id', ds.id,
                         'numero_pedido', ds.numero_pedido, 'codigo_erp', ds.codigo_erp, 'valor_pedido', ds.valor_pedido,
                         'parceiro', COALESCE(p.nome_fantasia, p.razaosocial), 'cidade', p.cidade, 'uf', p.estado,
                         'movimento_saida_id', cd.movimento_saida_id, 'numero_onda', ms.numero_onda,
                         'unidades_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_documento_id = cd.id AND cu.status <> 'CANCELADA'),
                         'unidades_embarcadas', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_documento_id = cd.id AND cu.status = 'EMBARCADA'),
                         'embarcado_em', cd.embarcado_em) ORDER BY cd.sequencia)
                FROM carga_documento cd
                JOIN documento_saida ds ON ds.id = cd.documento_saida_id
                JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
                LEFT JOIN parceiro p ON p.id = ds.parceiro_id
               WHERE cd.carga_id = c.id AND cd.ativo), '[]'::jsonb),
    'acoes', jsonb_build_object(
       'editar',    c.status IN ('EM_MONTAGEM','LIBERADA'),
       'reordenar', c.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO'),
       'liberar',   c.status = 'EM_MONTAGEM',
       'fechar',    c.status IN ('LIBERADA','EM_CARREGAMENTO'),
       'cancelar',  c.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO')
                    AND NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA'))
  )
  FROM carga c
  LEFT JOIN veiculos v ON v.id = c.veiculo_id
  LEFT JOIN box b ON b.id = c.box_id
  LEFT JOIN usuario um ON um.id = c.montada_por
  LEFT JOIN usuario uf ON uf.id = c.fechada_por
  WHERE c.id = p_carga_id;
$$;

-- ---------- RPCs da tela (web) ----------