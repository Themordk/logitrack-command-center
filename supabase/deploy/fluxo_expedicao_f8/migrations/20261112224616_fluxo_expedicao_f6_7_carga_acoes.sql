-- =====================================================================
-- Fluxo de Expedição — F6.7 Ações da carga (como nas ondas) · 2026-11-12
--   1. Limpar conferência do carregamento (volumes voltam a aguardar; histórico mantido)
--   2. Prioridade da carga (ordem da lista do coletor)
--   3. Responsáveis pelo carregamento (convocação: sem convocados = livre para qualquer
--      operador com permissão de embarque; com convocados = só eles veem e executam a carga)
-- =====================================================================

-- ---------- 2. prioridade ----------
ALTER TABLE public.carga ADD COLUMN IF NOT EXISTS prioridade public.enum_prioridade_onda NOT NULL DEFAULT 'NORMAL';

CREATE OR REPLACE FUNCTION public._fn_prioridade_ordem(p public.enum_prioridade_onda)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p WHEN 'URGENTE' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END;
$$;

-- carga nova herda a maior prioridade das suas ondas
CREATE OR REPLACE FUNCTION public.tg_carga_documento_prioridade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE carga c SET prioridade = ms.prioridade
    FROM movimento_saida ms
   WHERE c.id = NEW.carga_id AND ms.id = NEW.movimento_saida_id AND c.status = 'EM_MONTAGEM'
     AND ms.prioridade IS NOT NULL AND public._fn_prioridade_ordem(ms.prioridade) < public._fn_prioridade_ordem(c.prioridade);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_carga_documento_prioridade ON public.carga_documento;
CREATE TRIGGER trg_carga_documento_prioridade AFTER INSERT ON public.carga_documento
  FOR EACH ROW EXECUTE FUNCTION public.tg_carga_documento_prioridade();

CREATE OR REPLACE FUNCTION public.carga_definir_prioridade(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid, p_prioridade text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);
  IF p_prioridade IS NULL OR p_prioridade NOT IN ('URGENTE','ALTA','NORMAL','BAIXA') THEN
    RAISE EXCEPTION 'CARGA_PRIORIDADE_INVALIDA: use URGENTE, ALTA, NORMAL ou BAIXA.';
  END IF;
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status IN ('FECHADA','CANCELADA') THEN
    RAISE EXCEPTION 'CARGA_NAO_EDITAVEL: a carga #% está em % e não aceita alterações.', v_c.numero_carga, v_c.status;
  END IF;
  UPDATE carga SET prioridade = p_prioridade::public.enum_prioridade_onda, updated_by = v_u WHERE id = p_carga_id;
  PERFORM public._fn_carga_registrar_evento(p_carga_id, 'PRIORIDADE_ALTERADA', v_u,
    jsonb_build_object('de', v_c.prioridade, 'para', p_prioridade));
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_PRIORIDADE_ALTERADA',
    'mensagem', format('Carga #%s com prioridade %s.', v_c.numero_carga, p_prioridade));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- 3. responsáveis ----------
CREATE TABLE IF NOT EXISTS public.carga_responsavel (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id  uuid        NOT NULL REFERENCES public.empresa(id),
  carga_id    uuid        NOT NULL REFERENCES public.carga(id) ON DELETE CASCADE,
  usuario_id  uuid        NOT NULL REFERENCES public.usuario(id),
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.usuario(id),
  removido_em timestamptz,
  removido_por uuid       REFERENCES public.usuario(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_carga_responsavel_ativo ON public.carga_responsavel (carga_id, usuario_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_carga_responsavel_usuario ON public.carga_responsavel (usuario_id) WHERE ativo;
ALTER TABLE public.carga_responsavel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carga_responsavel_select_tenant ON public.carga_responsavel;
CREATE POLICY carga_responsavel_select_tenant ON public.carga_responsavel FOR SELECT USING (tenant_id = (SELECT get_current_tenant()));
REVOKE INSERT, UPDATE, DELETE ON public.carga_responsavel FROM anon, authenticated;
GRANT SELECT ON public.carga_responsavel TO authenticated;
COMMENT ON TABLE public.carga_responsavel IS 'Operadores convocados para o carregamento da carga. Sem convocado ativo = carga livre no coletor.';

CREATE OR REPLACE FUNCTION public._fn_carga_usuario_elegivel(p_carga_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN u.id IS NULL OR NOT u.ativo THEN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_INATIVO', 'mensagem', 'Usuário inativo.')
    WHEN u.tenant_id <> c.tenant_id THEN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_OUTRO_TENANT', 'mensagem', 'Usuário de outro ambiente.')
    WHEN u.empresa_id IS NOT NULL AND u.empresa_id <> c.empresa_id
         AND NOT public.fn_usuario_tem_permissao(u.id, 'web.atividades.montagem-carga', 'UPDATE')
      THEN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_OUTRA_EMPRESA', 'mensagem', 'Usuário de outra empresa.')
    WHEN NOT public.fn_usuario_tem_permissao(u.id, 'coletor.embarque', 'EXECUTE')
      THEN jsonb_build_object('elegivel', false, 'codigo', 'USUARIO_SEM_PERMISSAO', 'mensagem', 'Sem permissão de embarque no coletor.')
    ELSE jsonb_build_object('elegivel', true, 'codigo', 'ELEGIVEL', 'mensagem', null) END
  FROM carga c LEFT JOIN usuario u ON u.id = p_usuario_id WHERE c.id = p_carga_id;
$$;

-- No coletor: carga convocada só para os convocados
CREATE OR REPLACE FUNCTION public._fn_embarque_checar_responsavel(p_carga_id uuid, p_usuario_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_nomes text; v_num bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.ativo) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.ativo AND r.usuario_id = p_usuario_id) THEN RETURN; END IF;
  SELECT c.numero_carga, (SELECT string_agg(u.nome, ', ' ORDER BY u.nome) FROM carga_responsavel r JOIN usuario u ON u.id = r.usuario_id
                           WHERE r.carga_id = c.id AND r.ativo)
    INTO v_num, v_nomes FROM carga c WHERE c.id = p_carga_id;
  RAISE EXCEPTION 'EMBARQUE_NAO_CONVOCADO: a carga #% está convocada para %.', v_num, v_nomes;
END $$;

CREATE OR REPLACE FUNCTION public.carga_operadores_elegiveis(p_tenant_id uuid, p_carga_id uuid, p_busca text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'CARGA_NAO_ENCONTRADA', 'mensagem', 'Carga não encontrada.');
  END IF;
  SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.elegivel DESC, x.convocado DESC, x.logado DESC, x.nome), '[]'::jsonb) INTO v FROM (
    SELECT u.nome, (el->>'elegivel')::boolean AS elegivel, COALESCE(s.logado, false) AS logado,
           EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.usuario_id = u.id AND r.ativo) AS convocado,
           jsonb_build_object('usuario_id', u.id, 'nome', u.nome, 'login', u.login, 'logado', COALESCE(s.logado, false),
             'convocado', EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.usuario_id = u.id AND r.ativo),
             'volumes_carregados', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.embarcada_por = u.id AND cu.status = 'EMBARCADA'),
             'elegivel', (el->>'elegivel')::boolean, 'motivo', el->>'codigo', 'mensagem', el->>'mensagem') AS obj
      FROM usuario u
      CROSS JOIN LATERAL public._fn_carga_usuario_elegivel(p_carga_id, u.id) el
      LEFT JOIN LATERAL (SELECT true AS logado FROM log_sessao_usuario ls
                          WHERE ls.usuario_id = u.id AND ls.fim_sessao IS NULL
                            AND COALESCE(ls.ultimo_heartbeat, ls.inicio_sessao) > now() - interval '15 minutes' LIMIT 1) s ON true
     WHERE u.tenant_id = p_tenant_id AND u.ativo
       AND (p_busca IS NULL OR u.nome ILIKE '%' || p_busca || '%' OR u.login ILIKE '%' || p_busca || '%')) x;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_OPERADORES', 'dados', v);
END $$;

CREATE OR REPLACE FUNCTION public.carga_responsaveis_salvar(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid,
  p_usuarios uuid[], p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_antes uuid[]; v_novos uuid[] := COALESCE(p_usuarios, '{}'); v_id uuid; v_el jsonb; v_nomes text;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status IN ('FECHADA','CANCELADA') THEN
    RAISE EXCEPTION 'CARGA_NAO_EDITAVEL: a carga #% está em % e não aceita alterações.', v_c.numero_carga, v_c.status;
  END IF;
  SELECT COALESCE(array_agg(r.usuario_id ORDER BY r.usuario_id), '{}') INTO v_antes FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.ativo;
  IF v_c.status = 'EM_CARREGAMENTO' AND NULLIF(btrim(p_motivo), '') IS NULL
     AND EXISTS (SELECT 1 FROM unnest(v_antes) a WHERE a <> ALL (v_novos)) THEN
    RAISE EXCEPTION 'CARGA_MOTIVO_OBRIGATORIO: a carga já está em carregamento; informe o motivo para retirar um responsável.';
  END IF;
  FOREACH v_id IN ARRAY v_novos LOOP
    v_el := public._fn_carga_usuario_elegivel(p_carga_id, v_id);
    IF NOT (v_el->>'elegivel')::boolean THEN
      RAISE EXCEPTION 'CARGA_RESPONSAVEL_INELEGIVEL: % (%).', (SELECT nome FROM usuario WHERE id = v_id), v_el->>'mensagem';
    END IF;
  END LOOP;

  UPDATE carga_responsavel SET ativo = false, removido_em = now(), removido_por = v_u
   WHERE carga_id = p_carga_id AND ativo AND usuario_id <> ALL (v_novos);
  INSERT INTO carga_responsavel (tenant_id, empresa_id, carga_id, usuario_id, created_by)
  SELECT v_c.tenant_id, v_c.empresa_id, p_carga_id, x, v_u FROM unnest(v_novos) x
   WHERE NOT EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = p_carga_id AND r.usuario_id = x AND r.ativo);

  PERFORM public._fn_carga_registrar_evento(p_carga_id, 'RESPONSAVEIS_ALTERADOS', v_u,
    jsonb_build_object('antes', to_jsonb(v_antes), 'depois', to_jsonb(v_novos), 'motivo', NULLIF(btrim(p_motivo), '')));
  SELECT string_agg(u.nome, ', ' ORDER BY u.nome) INTO v_nomes FROM usuario u WHERE u.id = ANY (v_novos);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_RESPONSAVEIS_SALVOS',
    'mensagem', CASE WHEN array_length(v_novos, 1) IS NULL
                     THEN format('Carga #%s livre: qualquer operador com permissão de embarque pode carregar.', v_c.numero_carga)
                     ELSE format('Carga #%s convocada para %s.', v_c.numero_carga, v_nomes) END);
EXCEPTION WHEN raise_exception OR unique_violation THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- 1. limpar conferência do carregamento ----------
CREATE OR REPLACE FUNCTION public.carga_limpar_conferencia(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_unid uuid[]; v_n integer;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);
  IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'CARGA_MOTIVO_OBRIGATORIO: informe o motivo da limpeza da conferência.'; END IF;
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'CARGA_LIMPEZA_INDISPONIVEL: a carga #% está em %; só é possível limpar a conferência de carga liberada ou em carregamento.', v_c.numero_carga, v_c.status;
  END IF;

  SELECT COALESCE(array_agg(cu.id), '{}') INTO v_unid FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'EMBARCADA';
  v_n := COALESCE(array_length(v_unid, 1), 0);

  UPDATE tarefa_execucao te SET status = 'CANCELADA'
    FROM carga_unidade cu WHERE cu.id = ANY (v_unid) AND te.tarefa_id = cu.tarefa_id AND te.status = 'CONCLUIDA';
  UPDATE tarefa t SET status = 'CRIADA', quantidade_executada = 0, concluido_em = NULL
    FROM carga_unidade cu WHERE cu.id = ANY (v_unid) AND t.id = cu.tarefa_id;
  UPDATE volume_expedicao v SET status = 'ABERTO'
    FROM carga_unidade cu WHERE cu.id = ANY (v_unid) AND cu.tipo = 'VOLUME' AND v.id = cu.referencia_id AND v.status = 'EXPEDIDO';
  UPDATE carga_unidade SET status = 'PENDENTE', embarcada_em = NULL, embarcada_por = NULL, updated_by = v_u WHERE id = ANY (v_unid);
  UPDATE carga_documento SET embarcado_em = NULL, updated_by = v_u WHERE carga_id = p_carga_id AND embarcado_em IS NOT NULL;
  -- a onda continua EM_CARREGAMENTO de propósito: voltar para CONFERIDO dispararia de novo o retorno ao ERP
  UPDATE carga SET status = 'LIBERADA', iniciada_em = NULL, veiculo_confirmado_em = NULL, veiculo_confirmado_por = NULL, updated_by = v_u
   WHERE id = p_carga_id;

  PERFORM public._fn_carga_registrar_evento(p_carga_id, 'CONFERENCIA_LIMPA', v_u,
    jsonb_build_object('volumes', v_n, 'motivo', btrim(p_motivo), 'status_anterior', v_c.status));
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_CONFERENCIA_LIMPA',
    'mensagem', format('Conferência da carga #%s limpa: %s volume(s) voltaram a aguardar carregamento.', v_c.numero_carga, v_n));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- coletor respeita os responsáveis; lista mostra prioridade ----------
DO $$
DECLARE f text; d text; n text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.embarque_confirmar_veiculo(uuid,uuid,uuid,text)',
                           'public.embarque_bipar_unidade(uuid,uuid,uuid,text,uuid,boolean)',
                           'public.embarque_gerar_volumes(uuid,uuid,uuid,uuid,integer)',
                           'public.embarque_fechar_carga(uuid,uuid,uuid)'] LOOP
    d := pg_get_functiondef(f::regprocedure);
    n := replace(d, 'v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);',
                    'v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  PERFORM public._fn_embarque_checar_responsavel(p_carga_id, v_u);');
    IF n = d THEN RAISE EXCEPTION '%: padrão não encontrado', f; END IF;
    EXECUTE n;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.embarque_buscar_cargas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb; v_u uuid;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);
  v_u := public._fn_gestor_sessao(p_usuario_id, p_tenant_id);
  SELECT COALESCE(jsonb_agg(x.obj ORDER BY x.st, x.pr, x.num), '[]'::jsonb) INTO v FROM (
    SELECT CASE c.status WHEN 'EM_CARREGAMENTO' THEN 1 ELSE 2 END AS st, public._fn_prioridade_ordem(c.prioridade) AS pr, c.numero_carga AS num,
      jsonb_build_object(
      'id', c.id, 'numero_carga', c.numero_carga, 'status', c.status, 'unidade_embarque', c.unidade_embarque,
      'prioridade', c.prioridade,
      'convocado', EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = c.id AND r.ativo AND r.usuario_id = v_u),
      'modalidade', c.modalidade, 'transportadora', COALESCE(tp.nome_fantasia, tp.razaosocial),
      'veiculo', v.descricao, 'placa', COALESCE(c.placa, v.placa), 'box', b.descricao, 'motorista', c.motorista,
      'documentos', (SELECT count(*) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'unidades_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status <> 'CANCELADA'),
      'unidades_embarcadas', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA')) AS obj
      FROM carga c
      LEFT JOIN veiculos v ON v.id = c.veiculo_id
      LEFT JOIN parceiro tp ON tp.id = c.transportadora_id
      LEFT JOIN box b ON b.id = c.box_id
     WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id AND c.status IN ('LIBERADA','EM_CARREGAMENTO')
       AND (NOT EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = c.id AND r.ativo)
            OR EXISTS (SELECT 1 FROM carga_responsavel r WHERE r.carga_id = c.id AND r.ativo AND r.usuario_id = v_u))) x;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_CARGAS', 'dados', v);
END $$;

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.carga_listar(uuid,uuid,text[],integer)'::regprocedure);
  n := replace(d, '''modalidade'', c.modalidade, ''transportadora''',
    '''prioridade'', c.prioridade,
      ''responsaveis'', (SELECT COALESCE(jsonb_agg(jsonb_build_object(''usuario_id'', u.id, ''nome'', u.nome) ORDER BY u.nome), ''[]''::jsonb)
                         FROM carga_responsavel r JOIN usuario u ON u.id = r.usuario_id WHERE r.carga_id = c.id AND r.ativo),
      ''modalidade'', c.modalidade, ''transportadora''');
  IF n = d THEN RAISE EXCEPTION 'carga_listar: padrão não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public._fn_carga_detalhe(uuid)'::regprocedure);
  n := replace(d, '''modalidade'', c.modalidade, ''exige_confirmacao_veiculo''',
    '''prioridade'', c.prioridade, ''modalidade'', c.modalidade, ''exige_confirmacao_veiculo''');
  IF n = d THEN RAISE EXCEPTION '_fn_carga_detalhe: padrão não encontrado'; END IF;
  EXECUTE n;
END $$;

-- ---------- grants ----------
REVOKE ALL ON FUNCTION public._fn_carga_usuario_elegivel(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_embarque_checar_responsavel(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.carga_definir_prioridade(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carga_definir_prioridade(uuid,uuid,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.carga_operadores_elegiveis(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carga_operadores_elegiveis(uuid,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.carga_responsaveis_salvar(uuid,uuid,uuid,uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carga_responsaveis_salvar(uuid,uuid,uuid,uuid[],text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.carga_limpar_conferencia(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carga_limpar_conferencia(uuid,uuid,uuid,text) TO authenticated, service_role;
