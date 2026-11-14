CREATE OR REPLACE FUNCTION public.carga_sugerir(p_tenant_id uuid, p_empresa_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_crit text; v_ondas jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  SELECT rc.criterio::text INTO v_crit FROM roteiro_saida_criterio rc
   WHERE rc.tenant_id = p_tenant_id AND rc.empresa_id = p_empresa_id AND rc.nivel = 'EMBARQUE'
   ORDER BY rc.sequencia LIMIT 1;

  WITH elegiveis AS (
    SELECT ms.* FROM movimento_saida ms
     WHERE ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id
       AND ms.status IN ('CONFERIDO','SEPARADO')
       AND NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.movimento_saida_id = ms.id AND cd.ativo)
       AND public._fn_carga_onda_motivo(ms.id) IS NULL
  ), base AS (
    SELECT e.id, e.numero_onda, e.status::text AS status, e.veiculo_id, e.box_id, e.rota_id, e.peso_total, e.m3,
           e.prioridade::text AS prioridade, e.created_at,
           v.descricao AS veiculo, v.placa, b.descricao AS box, r.descricao AS rota, ts.descricao AS tipo_saida,
           (SELECT count(*) FROM movimento_saida_documento msd WHERE msd.movimento_saida_id = e.id) AS documentos,
           (SELECT count(*) FROM volume_expedicao ve WHERE ve.movimento_saida_id = e.id) AS volumes,
           (SELECT CASE WHEN count(DISTINCT ds.parceiro_id) = 1 THEN min(ds.parceiro_id::text) ELSE 'VARIOS' END
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
             WHERE msd.movimento_saida_id = e.id) AS parceiro_chave,
           (SELECT string_agg(DISTINCT COALESCE(p.nome_fantasia, p.razaosocial), ', ')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              LEFT JOIN parceiro p ON p.id = ds.parceiro_id WHERE msd.movimento_saida_id = e.id) AS parceiros
      FROM elegiveis e
      LEFT JOIN veiculos v ON v.id = e.veiculo_id
      LEFT JOIN box b ON b.id = e.box_id
      LEFT JOIN rotas r ON r.id = e.rota_id
      LEFT JOIN tipo_saida ts ON ts.id = e.tipo_saida
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'movimento_saida_id', id, 'numero_onda', numero_onda, 'status', status, 'prioridade', prioridade,
           'veiculo_id', veiculo_id, 'veiculo', veiculo, 'placa', placa, 'box_id', box_id, 'box', box,
           'rota', rota, 'tipo_saida', tipo_saida, 'parceiros', parceiros,
           'peso_total', peso_total, 'm3', m3, 'documentos', documentos, 'volumes', volumes, 'created_at', created_at,
           'grupo_chave', concat_ws('|', CASE v_crit WHEN 'ROTA' THEN COALESCE(rota_id::text, 'SEM_ROTA')
                                                     WHEN 'PARCEIRO' THEN parceiro_chave END,
                                    COALESCE(veiculo_id::text, 'SEM_VEICULO'), COALESCE(box_id::text, 'SEM_BOX')),
           'grupo_rotulo', concat_ws(' · ', CASE v_crit WHEN 'ROTA' THEN COALESCE(rota, 'Sem rota')
                                                        WHEN 'PARCEIRO' THEN CASE WHEN parceiro_chave = 'VARIOS' THEN 'Vários parceiros' ELSE parceiros END END,
                                     COALESCE(veiculo || COALESCE(' (' || placa || ')', ''), 'Sem veículo'), COALESCE(box, 'Sem box'))
         ) ORDER BY numero_onda), '[]'::jsonb)
    INTO v_ondas FROM base;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_SUGESTAO',
    'dados', jsonb_build_object('criterio', v_crit, 'ondas', v_ondas));
END $$;

CREATE OR REPLACE FUNCTION public.carga_listar(p_tenant_id uuid, p_empresa_id uuid, p_status text[] DEFAULT NULL, p_limite integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'numero_carga')::bigint DESC), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'numero_carga', c.numero_carga, 'status', c.status, 'unidade_embarque', c.unidade_embarque,
      'veiculo', v.descricao, 'placa', v.placa, 'box', b.descricao, 'motorista', c.motorista,
      'peso_total', c.peso_total, 'm3_total', c.m3_total,
      'ondas', (SELECT count(DISTINCT cd.movimento_saida_id) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'documentos', (SELECT count(*) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'unidades_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status <> 'CANCELADA'),
      'unidades_embarcadas', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA'),
      'created_at', c.created_at, 'liberada_em', c.liberada_em, 'fechada_em', c.fechada_em) AS x
      FROM carga c
      LEFT JOIN veiculos v ON v.id = c.veiculo_id
      LEFT JOIN box b ON b.id = c.box_id
     WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id
       AND (p_status IS NULL OR c.status = ANY(p_status))
     ORDER BY c.numero_carga DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limite, 100), 1), 500)) s;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_LISTA', 'dados', v);
END $$;

CREATE OR REPLACE FUNCTION public.carga_obter(p_tenant_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'CARGA_NAO_ENCONTRADA', 'mensagem', 'Carga não encontrada.');
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_DETALHE', 'dados', public._fn_carga_detalhe(p_carga_id));
END $$;

-- Cria a carga (p_carga_id NULL) ou acrescenta ondas / altera cabeçalho
CREATE OR REPLACE FUNCTION public.carga_montar(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid,
  p_carga_id uuid DEFAULT NULL, p_ondas uuid[] DEFAULT '{}',
  p_veiculo_id uuid DEFAULT NULL, p_box_id uuid DEFAULT NULL,
  p_motorista text DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_u uuid; v_c record; v_carga uuid := p_carga_id; v_onda record; v_motivo text; v_status text;
  v_c_veic uuid; v_c_box uuid; v_numero bigint;
  v_veics uuid[]; v_boxes uuid[]; v_seq integer; v_novas uuid[] := '{}'; v_avisos jsonb := '[]'::jsonb; v_det jsonb;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);

  IF p_empresa_id IS NULL OR NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'CARGA_EMPRESA_INVALIDA: empresa não encontrada neste tenant.';
  END IF;
  IF p_veiculo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM veiculos v WHERE v.id = p_veiculo_id AND v.tenant_id = p_tenant_id AND COALESCE(v.ativo, true)) THEN
    RAISE EXCEPTION 'CARGA_VEICULO_INVALIDO: veículo não encontrado ou inativo.';
  END IF;
  IF p_box_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM box b WHERE b.id = p_box_id AND b.tenant_id = p_tenant_id AND COALESCE(b.ativo, true)) THEN
    RAISE EXCEPTION 'CARGA_BOX_INVALIDO: box não encontrado ou inativo.';
  END IF;

  IF v_carga IS NOT NULL THEN
    SELECT c.* INTO v_c FROM carga c WHERE c.id = v_carga AND c.tenant_id = p_tenant_id FOR UPDATE;
    IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
    IF v_c.empresa_id <> p_empresa_id THEN RAISE EXCEPTION 'CARGA_EMPRESA_DIVERGENTE: a carga é de outra empresa.'; END IF;
    IF v_c.status NOT IN ('EM_MONTAGEM','LIBERADA') THEN
      RAISE EXCEPTION 'CARGA_NAO_EDITAVEL: a carga #% está em % e não aceita alterações.', v_c.numero_carga, v_c.status;
    END IF;
    v_c_veic := v_c.veiculo_id; v_c_box := v_c.box_id; v_status := v_c.status; v_numero := v_c.numero_carga;
  END IF;

  -- ondas: trava, valida elegibilidade e se já estão em outra carga
  FOR v_onda IN SELECT ms.id, ms.numero_onda, ms.empresa_id, ms.veiculo_id, ms.box_id FROM movimento_saida ms
                 WHERE ms.id = ANY(COALESCE(p_ondas, '{}')) ORDER BY ms.numero_onda FOR UPDATE LOOP
    IF v_onda.empresa_id <> p_empresa_id THEN
      RAISE EXCEPTION 'CARGA_EMPRESA_DIVERGENTE: a onda #% é de outra empresa.', v_onda.numero_onda;
    END IF;
    IF EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.movimento_saida_id = v_onda.id AND cd.ativo AND cd.carga_id IS DISTINCT FROM v_carga) THEN
      RAISE EXCEPTION 'CARGA_ONDA_EM_OUTRA_CARGA: a onda #% já está na carga #%.', v_onda.numero_onda,
        (SELECT c2.numero_carga FROM carga_documento cd JOIN carga c2 ON c2.id = cd.carga_id WHERE cd.movimento_saida_id = v_onda.id AND cd.ativo LIMIT 1);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.movimento_saida_id = v_onda.id AND cd.ativo AND cd.carga_id = v_carga) THEN
      v_motivo := public._fn_carga_onda_motivo(v_onda.id);
      IF v_motivo IS NOT NULL THEN RAISE EXCEPTION 'CARGA_ONDA_INELEGIVEL: %.', v_motivo; END IF;
      v_novas := v_novas || v_onda.id;
    END IF;
  END LOOP;
  IF array_length(p_ondas, 1) IS NOT NULL AND (SELECT count(*) FROM movimento_saida ms WHERE ms.id = ANY(p_ondas) AND ms.tenant_id = p_tenant_id) <> (SELECT count(DISTINCT x) FROM unnest(p_ondas) x) THEN
    RAISE EXCEPTION 'CARGA_ONDA_INVALIDA: uma ou mais ondas não foram encontradas.';
  END IF;

  -- veículo e box precisam ser os mesmos entre ondas (quando informados) e a carga
  SELECT array_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL) INTO v_veics FROM (
    SELECT ms.veiculo_id AS x FROM movimento_saida ms WHERE ms.id = ANY(v_novas)
    UNION ALL SELECT ms.veiculo_id FROM movimento_saida ms JOIN carga_documento cd ON cd.movimento_saida_id = ms.id AND cd.ativo WHERE cd.carga_id = v_carga
    UNION ALL SELECT COALESCE(p_veiculo_id, v_c_veic)) z;
  IF COALESCE(array_length(v_veics, 1), 0) > 1 THEN
    RAISE EXCEPTION 'CARGA_VEICULO_DIVERGENTE: as ondas e a carga indicam veículos diferentes; uma carga sai num veículo só.';
  END IF;
  SELECT array_agg(DISTINCT x) FILTER (WHERE x IS NOT NULL) INTO v_boxes FROM (
    SELECT ms.box_id AS x FROM movimento_saida ms WHERE ms.id = ANY(v_novas)
    UNION ALL SELECT ms.box_id FROM movimento_saida ms JOIN carga_documento cd ON cd.movimento_saida_id = ms.id AND cd.ativo WHERE cd.carga_id = v_carga
    UNION ALL SELECT COALESCE(p_box_id, v_c_box)) z;
  IF COALESCE(array_length(v_boxes, 1), 0) > 1 THEN
    RAISE EXCEPTION 'CARGA_BOX_DIVERGENTE: as ondas e a carga indicam boxes diferentes.';
  END IF;

  IF v_carga IS NULL THEN
    IF array_length(v_novas, 1) IS NULL THEN RAISE EXCEPTION 'CARGA_SEM_ONDAS: escolha ao menos uma onda para montar a carga.'; END IF;
    INSERT INTO carga (tenant_id, empresa_id, veiculo_id, box_id, motorista, observacao, montada_por)
    VALUES (p_tenant_id, p_empresa_id, v_veics[1], v_boxes[1], NULLIF(btrim(p_motorista), ''), NULLIF(btrim(p_observacao), ''), v_u)
    RETURNING id, numero_carga, status INTO v_carga, v_numero, v_status;
  ELSE
    UPDATE carga SET veiculo_id = COALESCE(v_veics[1], veiculo_id), box_id = COALESCE(v_boxes[1], box_id),
                     motorista = COALESCE(NULLIF(btrim(p_motorista), ''), motorista),
                     observacao = COALESCE(NULLIF(btrim(p_observacao), ''), observacao), updated_by = v_u
     WHERE id = v_carga;
  END IF;

  -- pedidos das novas ondas no fim da ordem atual
  SELECT COALESCE(max(cd.sequencia), 0) INTO v_seq FROM carga_documento cd WHERE cd.carga_id = v_carga AND cd.ativo;
  INSERT INTO carga_documento (tenant_id, empresa_id, carga_id, movimento_saida_id, documento_saida_id, sequencia)
  SELECT p_tenant_id, p_empresa_id, v_carga, msd.movimento_saida_id, msd.documento_saida_id,
         v_seq + row_number() OVER (ORDER BY ms.numero_onda, msd.ordem NULLS LAST, msd.created_at)
    FROM movimento_saida_documento msd JOIN movimento_saida ms ON ms.id = msd.movimento_saida_id
   WHERE msd.movimento_saida_id = ANY(v_novas);

  IF v_status = 'LIBERADA' AND array_length(v_novas, 1) IS NOT NULL THEN
    PERFORM public._fn_carga_gerar_unidades(v_carga, v_novas);
  END IF;
  PERFORM public._fn_carga_recalcular(v_carga);

  v_det := public._fn_carga_detalhe(v_carga);
  IF (v_det #>> '{capacidade,excedida}')::boolean THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'CARGA_EXCEDE_CAPACIDADE',
      'mensagem', 'A carga passou da capacidade do veículo (peso, m³ ou paletes).');
  END IF;
  IF v_det -> 'veiculo' = 'null'::jsonb THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'CARGA_SEM_VEICULO', 'mensagem', 'Informe o veículo antes de liberar.');
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'codigo', CASE WHEN p_carga_id IS NULL THEN 'CARGA_CRIADA' ELSE 'CARGA_ATUALIZADA' END,
    'mensagem', CASE WHEN p_carga_id IS NULL THEN format('Carga #%s montada.', v_numero) ELSE format('Carga #%s atualizada.', v_numero) END,
    'avisos', v_avisos, 'dados', v_det);
EXCEPTION WHEN raise_exception OR unique_violation THEN
  RETURN public._fn_carga_erro(CASE WHEN SQLSTATE = '23505' THEN 'CARGA_ONDA_EM_OUTRA_CARGA: um dos pedidos já entrou em outra carga; atualize a tela.' ELSE SQLERRM END);
END $$;

CREATE OR REPLACE FUNCTION public.carga_remover_onda(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid, p_movimento_saida_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'CARGA_NAO_EDITAVEL: a carga #% está em %.', v_c.numero_carga, v_c.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.movimento_saida_id = p_movimento_saida_id AND cd.ativo) THEN
    RAISE EXCEPTION 'CARGA_ONDA_FORA_DA_CARGA: a onda não está nesta carga.';
  END IF;
  IF EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.movimento_saida_id = p_movimento_saida_id AND cu.status = 'EMBARCADA') THEN
    RAISE EXCEPTION 'CARGA_ONDA_JA_EMBARCADA: a onda já tem unidades embarcadas e não pode sair da carga.';
  END IF;

  PERFORM public._fn_carga_cancelar_unidades(p_carga_id, ARRAY[p_movimento_saida_id], 'CARGA_ONDA_REMOVIDA');
  UPDATE carga_documento SET ativo = false, updated_by = v_u
   WHERE carga_id = p_carga_id AND movimento_saida_id = p_movimento_saida_id AND ativo;
  -- renumera mantendo a ordem relativa
  WITH o AS (SELECT cd.id, row_number() OVER (ORDER BY cd.sequencia) AS n FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo)
  UPDATE carga_documento cd SET sequencia = o.n FROM o WHERE o.id = cd.id AND cd.sequencia <> o.n;
  UPDATE carga_unidade cu SET sequencia = cd.sequencia FROM carga_documento cd
   WHERE cd.id = cu.carga_documento_id AND cu.carga_id = p_carga_id AND cu.status = 'PENDENTE' AND cu.sequencia <> cd.sequencia;
  UPDATE tarefa t SET ordem_tarefa = cu.sequencia FROM carga_unidade cu
   WHERE cu.tarefa_id = t.id AND cu.carga_id = p_carga_id AND cu.status = 'PENDENTE' AND t.ordem_tarefa IS DISTINCT FROM cu.sequencia;
  PERFORM public._fn_carga_recalcular(p_carga_id);

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_ONDA_REMOVIDA', 'mensagem', 'Onda retirada da carga.',
    'dados', public._fn_carga_detalhe(p_carga_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- p_documentos: carga_documento_id na nova ordem (todos os pedidos ativos da carga)
CREATE OR REPLACE FUNCTION public.carga_reordenar_documentos(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid, p_documentos uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_ativos integer; v_n integer;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'CARGA_NAO_EDITAVEL: a carga #% está em % e a ordem não muda mais.', v_c.numero_carga, v_c.status;
  END IF;
  SELECT count(*) INTO v_ativos FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo;
  SELECT count(*) INTO v_n FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo AND cd.id = ANY(p_documentos);
  IF v_n <> v_ativos OR COALESCE(array_length(p_documentos, 1), 0) <> v_ativos
     OR (SELECT count(DISTINCT x) FROM unnest(p_documentos) x) <> v_ativos THEN
    RAISE EXCEPTION 'CARGA_ORDEM_INCOMPLETA: a nova ordem precisa listar cada pedido da carga uma única vez; atualize a tela.';
  END IF;

  UPDATE carga_documento cd SET sequencia = o.n, updated_by = v_u
    FROM unnest(p_documentos) WITH ORDINALITY AS o(id, n)
   WHERE cd.id = o.id AND cd.sequencia <> o.n;
  UPDATE carga_unidade cu SET sequencia = cd.sequencia FROM carga_documento cd
   WHERE cd.id = cu.carga_documento_id AND cu.carga_id = p_carga_id AND cu.status = 'PENDENTE' AND cu.sequencia <> cd.sequencia;
  UPDATE tarefa t SET ordem_tarefa = cu.sequencia FROM carga_unidade cu
   WHERE cu.tarefa_id = t.id AND cu.carga_id = p_carga_id AND cu.status = 'PENDENTE' AND t.ordem_tarefa IS DISTINCT FROM cu.sequencia;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_REORDENADA', 'mensagem', 'Ordem de embarque atualizada.',
    'dados', public._fn_carga_detalhe(p_carga_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.carga_liberar(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_unid public.enum_unidade_embarque; v_n integer; v_inelegivel text;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status <> 'EM_MONTAGEM' THEN RAISE EXCEPTION 'CARGA_JA_LIBERADA: a carga #% está em %.', v_c.numero_carga, v_c.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo) THEN
    RAISE EXCEPTION 'CARGA_SEM_ONDAS: a carga não tem pedidos.';
  END IF;
  IF v_c.veiculo_id IS NULL THEN RAISE EXCEPTION 'CARGA_SEM_VEICULO: informe o veículo antes de liberar a carga.'; END IF;
  -- revalida: uma onda pode ter mudado de status desde a montagem
  SELECT string_agg(m, '; ') INTO v_inelegivel FROM (
    SELECT DISTINCT public._fn_carga_onda_motivo(cd.movimento_saida_id) AS m
      FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo) z WHERE m IS NOT NULL;
  IF v_inelegivel IS NOT NULL THEN RAISE EXCEPTION 'CARGA_ONDA_INELEGIVEL: %.', v_inelegivel; END IF;

  SELECT re.unidade_embarque INTO v_unid FROM roteiro_saida_embarque re
   WHERE re.tenant_id = p_tenant_id AND re.empresa_id = v_c.empresa_id;
  UPDATE carga SET status = 'LIBERADA', unidade_embarque = COALESCE(v_unid, 'CONFIRMACAO'),
                   liberada_em = now(), liberada_por = v_u, updated_by = v_u
   WHERE id = p_carga_id;
  v_n := public._fn_carga_gerar_unidades(p_carga_id, NULL);
  PERFORM public._fn_carga_recalcular(p_carga_id);

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_LIBERADA',
    'mensagem', format('Carga #%s liberada para o embarque com %s unidade(s).', v_c.numero_carga, v_n),
    'dados', public._fn_carga_detalhe(p_carga_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.carga_cancelar(p_tenant_id uuid, p_usuario_id uuid, p_carga_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, false);
  IF NULLIF(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'CARGA_MOTIVO_OBRIGATORIO: informe o motivo do cancelamento.'; END IF;
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status IN ('FECHADA','CANCELADA') THEN RAISE EXCEPTION 'CARGA_NAO_EDITAVEL: a carga #% já está %.', v_c.numero_carga, v_c.status; END IF;
  IF EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'EMBARCADA') THEN
    RAISE EXCEPTION 'CARGA_COM_EMBARQUE: já há unidades embarcadas; descarregue e retire as ondas embarcadas antes de cancelar.';
  END IF;
  PERFORM public._fn_carga_cancelar_unidades(p_carga_id, NULL, 'CARGA_CANCELADA');
  UPDATE carga_documento SET ativo = false, updated_by = v_u WHERE carga_id = p_carga_id AND ativo;
  UPDATE carga SET status = 'CANCELADA', cancelada_em = now(), cancelada_por = v_u,
                   motivo_cancelamento = btrim(p_motivo), updated_by = v_u
   WHERE id = p_carga_id;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_CANCELADA',
    'mensagem', format('Carga #%s cancelada. As ondas voltaram para a montagem.', v_c.numero_carga),
    'dados', public._fn_carga_detalhe(p_carga_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.carga_romaneio(p_tenant_id uuid, p_carga_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  SELECT jsonb_build_object(
    'empresa', jsonb_build_object('razaosocial', e.razaosocial, 'cnpj', e.cnpj, 'url_logo', e.url_logo),
    'carga', public._fn_carga_detalhe(c.id),
    'operadores', COALESCE((SELECT jsonb_agg(DISTINCT u.nome) FROM carga_unidade cu JOIN usuario u ON u.id = cu.embarcada_por WHERE cu.carga_id = c.id), '[]'::jsonb),
    'emitido_em', now())
  INTO v
  FROM carga c JOIN empresa e ON e.id = c.empresa_id
  WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id;
  IF v IS NULL THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'CARGA_NAO_ENCONTRADA', 'mensagem', 'Carga não encontrada.'); END IF;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_ROMANEIO', 'dados', v);
END $$;

-- ---------- RPCs do coletor ----------
CREATE OR REPLACE FUNCTION public.embarque_buscar_cargas(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'status') DESC, (x->>'numero_carga')::bigint), '[]'::jsonb) INTO v FROM (
    SELECT jsonb_build_object(
      'id', c.id, 'numero_carga', c.numero_carga, 'status', c.status, 'unidade_embarque', c.unidade_embarque,
      'veiculo', v.descricao, 'placa', v.placa, 'box', b.descricao, 'motorista', c.motorista,
      'documentos', (SELECT count(*) FROM carga_documento cd WHERE cd.carga_id = c.id AND cd.ativo),
      'unidades_total', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status <> 'CANCELADA'),
      'unidades_embarcadas', (SELECT count(*) FROM carga_unidade cu WHERE cu.carga_id = c.id AND cu.status = 'EMBARCADA')) AS x
      FROM carga c
      LEFT JOIN veiculos v ON v.id = c.veiculo_id
      LEFT JOIN box b ON b.id = c.box_id
     WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id AND c.status IN ('LIBERADA','EM_CARREGAMENTO')) s;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_CARGAS', 'dados', v);
END $$;

CREATE OR REPLACE FUNCTION public.embarque_obter_carga(p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c record; v_unid jsonb; v_prox jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  PERFORM public.assert_usuario_sessao(p_usuario_id);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'CARGA_NAO_ENCONTRADA', 'mensagem', 'Carga não encontrada.'); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', cu.id, 'tipo', cu.tipo, 'codigo', cu.codigo, 'descricao', cu.descricao, 'sequencia', cu.sequencia,
           'status', cu.status, 'embarcada_em', cu.embarcada_em,
           'numero_pedido', ds.numero_pedido, 'parceiro', COALESCE(p.nome_fantasia, p.razaosocial), 'cidade', p.cidade,
           'numero_onda', ms.numero_onda) ORDER BY cu.sequencia, cu.codigo), '[]'::jsonb)
    INTO v_unid
    FROM carga_unidade cu
    JOIN movimento_saida ms ON ms.id = cu.movimento_saida_id
    LEFT JOIN carga_documento cd ON cd.id = cu.carga_documento_id
    LEFT JOIN documento_saida ds ON ds.id = cd.documento_saida_id
    LEFT JOIN parceiro p ON p.id = ds.parceiro_id
   WHERE cu.carga_id = p_carga_id AND cu.status <> 'CANCELADA';
  SELECT e.value INTO v_prox FROM jsonb_array_elements(v_unid) WITH ORDINALITY AS e(value, n)
   WHERE e.value->>'status' = 'PENDENTE' ORDER BY e.n LIMIT 1;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_CARGA',
    'dados', public._fn_carga_detalhe(p_carga_id) || jsonb_build_object('unidades', v_unid, 'proxima', v_prox));
END $$;

-- Bipa (p_codigo) ou confirma (p_carga_unidade_id) uma unidade da carga
CREATE OR REPLACE FUNCTION public.embarque_bipar_unidade(
  p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid,
  p_codigo text DEFAULT NULL, p_carga_unidade_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_u uuid; v_c record; v_cod text := upper(btrim(COALESCE(p_codigo, ''))); v_un record; v_outra bigint;
  v_aviso jsonb; v_total integer; v_emb integer; v_doc_completo boolean := false;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  IF v_cod = '' AND p_carga_unidade_id IS NULL THEN RAISE EXCEPTION 'EMBARQUE_CODIGO_VAZIO: leia o código da unidade.'; END IF;

  -- trava a carga: bips da mesma carga são processados um por vez
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em % e não aceita embarque.', v_c.numero_carga, v_c.status;
  END IF;

  SELECT cu.* INTO v_un
    FROM carga_unidade cu
    LEFT JOIN carga_documento cd ON cd.id = cu.carga_documento_id
    LEFT JOIN documento_saida ds ON ds.id = cd.documento_saida_id
   WHERE cu.carga_id = p_carga_id AND cu.status <> 'CANCELADA'
     AND (cu.id = p_carga_unidade_id
          OR (v_cod <> '' AND (upper(cu.codigo) = v_cod
              OR (cu.tipo IN ('DOCUMENTO','CONFIRMACAO') AND upper(COALESCE(ds.codigo_erp, '')) = v_cod))))
   ORDER BY (cu.status = 'PENDENTE') DESC, cu.sequencia
   LIMIT 1;

  IF v_un.id IS NULL THEN
    SELECT c2.numero_carga INTO v_outra
      FROM carga_unidade cu JOIN carga c2 ON c2.id = cu.carga_id
     WHERE cu.tenant_id = p_tenant_id AND cu.status <> 'CANCELADA' AND upper(cu.codigo) = v_cod
       AND c2.id <> p_carga_id AND c2.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO')
     LIMIT 1;
    IF v_outra IS NOT NULL THEN
      RAISE EXCEPTION 'EMBARQUE_UNIDADE_OUTRA_CARGA: esta unidade pertence à carga #%. Não embarque neste veículo.', v_outra;
    END IF;
    RAISE EXCEPTION 'EMBARQUE_CODIGO_NAO_ENCONTRADO: o código % não faz parte desta carga.', COALESCE(NULLIF(v_cod, ''), '(vazio)');
  END IF;
  IF v_un.status = 'EMBARCADA' THEN
    RAISE EXCEPTION 'EMBARQUE_JA_EMBARCADA: % já foi embarcada.', COALESCE(v_un.descricao, v_un.codigo);
  END IF;

  IF EXISTS (SELECT 1 FROM carga_unidade x WHERE x.carga_id = p_carga_id AND x.status = 'PENDENTE' AND x.sequencia < v_un.sequencia) THEN
    v_aviso := jsonb_build_object('codigo', 'EMBARQUE_FORA_DE_ORDEM',
      'mensagem', 'Unidade embarcada fora da ordem definida para a carga.');
  END IF;

  INSERT INTO tarefa_execucao (tenant_id, tarefa_id, usuario_id, status, atribuido_em, iniciado_em, concluido_em, quantidade_executada, hu)
  VALUES (p_tenant_id, v_un.tarefa_id, v_u, 'CONCLUIDA', now(), now(), now(), 1, CASE WHEN v_un.tipo = 'HU' THEN v_un.referencia_id END);
  UPDATE tarefa SET status = 'CONCLUIDA', quantidade_executada = 1, concluido_em = now()
   WHERE id = v_un.tarefa_id AND status <> 'CONCLUIDA';
  UPDATE carga_unidade SET status = 'EMBARCADA', embarcada_em = now(), embarcada_por = v_u, updated_by = v_u WHERE id = v_un.id;
  IF v_un.tipo = 'VOLUME' THEN
    UPDATE volume_expedicao SET status = 'EXPEDIDO' WHERE id = v_un.referencia_id AND status <> 'EXPEDIDO';
  END IF;

  IF v_c.status = 'LIBERADA' THEN
    UPDATE carga SET status = 'EM_CARREGAMENTO', iniciada_em = now(), updated_by = v_u WHERE id = p_carga_id;
  END IF;
  UPDATE movimento_saida SET status = 'EM_CARREGAMENTO'
   WHERE id = v_un.movimento_saida_id AND status IN ('CONFERIDO','SEPARADO');

  IF v_un.carga_documento_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM carga_unidade x WHERE x.carga_documento_id = v_un.carga_documento_id AND x.status = 'PENDENTE') THEN
    UPDATE carga_documento SET embarcado_em = now(), updated_by = v_u WHERE id = v_un.carga_documento_id AND embarcado_em IS NULL;
    v_doc_completo := true;
  END IF;

  SELECT count(*) FILTER (WHERE status <> 'CANCELADA'), count(*) FILTER (WHERE status = 'EMBARCADA')
    INTO v_total, v_emb FROM carga_unidade WHERE carga_id = p_carga_id;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_REGISTRADO',
    'mensagem', format('%s embarcada.', COALESCE(v_un.descricao, v_un.codigo)),
    'aviso', v_aviso,
    'dados', jsonb_build_object('unidade_id', v_un.id, 'codigo', v_un.codigo, 'descricao', v_un.descricao,
      'documento_completo', v_doc_completo, 'total', v_total, 'embarcadas', v_emb, 'carga_completa', v_total = v_emb));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.embarque_fechar_carga(p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_u uuid; v_c record; v_pend integer; v_onda uuid; v_n integer := 0;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status = 'FECHADA' THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_JA_FECHADA', 'mensagem', format('Carga #%s já estava fechada.', v_c.numero_carga),
      'dados', public._fn_carga_detalhe(p_carga_id));
  END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em %.', v_c.numero_carga, v_c.status;
  END IF;
  SELECT count(*) INTO v_pend FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'PENDENTE';
  IF v_pend > 0 THEN
    RAISE EXCEPTION 'EMBARQUE_PENDENTE: ainda faltam % unidade(s) para embarcar.', v_pend;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_id = p_carga_id AND cu.status = 'EMBARCADA') THEN
    RAISE EXCEPTION 'EMBARQUE_PENDENTE: nenhuma unidade foi embarcada.';
  END IF;

  UPDATE carga SET status = 'FECHADA', fechada_em = now(), fechada_por = v_u, updated_by = v_u WHERE id = p_carga_id;
  FOR v_onda IN SELECT DISTINCT cd.movimento_saida_id FROM carga_documento cd WHERE cd.carga_id = p_carga_id AND cd.ativo LOOP
    PERFORM public.fn_onda_concluir_etapa(p_tenant_id, v_onda, 3);
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_FECHADA',
    'mensagem', format('Carga #%s fechada; %s onda(s) concluída(s).', v_c.numero_carga, v_n),
    'dados', public._fn_carga_detalhe(p_carga_id));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $$;

-- ---------- coerência quando a onda muda por fora ----------
CREATE OR REPLACE FUNCTION public.tg_carga_onda_cancelada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT cd.carga_id FROM carga_documento cd JOIN carga c ON c.id = cd.carga_id
            WHERE cd.movimento_saida_id = NEW.id AND cd.ativo AND c.status IN ('EM_MONTAGEM','LIBERADA','EM_CARREGAMENTO') LOOP
    PERFORM public._fn_carga_cancelar_unidades(r.carga_id, ARRAY[NEW.id], 'ONDA_CANCELADA');
    UPDATE carga_documento SET ativo = false WHERE carga_id = r.carga_id AND movimento_saida_id = NEW.id AND ativo;
    PERFORM public._fn_carga_recalcular(r.carga_id);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_carga_onda_cancelada ON public.movimento_saida;
CREATE TRIGGER trg_carga_onda_cancelada AFTER UPDATE OF status ON public.movimento_saida
  FOR EACH ROW WHEN (NEW.status = 'CANCELADA' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.tg_carga_onda_cancelada();

CREATE OR REPLACE FUNCTION public.tg_carga_documento_removido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT cd.id, cd.carga_id FROM carga_documento cd
            WHERE cd.documento_saida_id = OLD.documento_saida_id AND cd.movimento_saida_id = OLD.movimento_saida_id AND cd.ativo LOOP
    PERFORM set_config('app.cancelamento_origem', 'DOCUMENTO_REMOVIDO_DA_ONDA', true);
    UPDATE tarefa t SET status = 'CANCELADA' FROM carga_unidade cu
     WHERE cu.carga_documento_id = r.id AND cu.status = 'PENDENTE' AND cu.tarefa_id = t.id AND t.status NOT IN ('CONCLUIDA','CANCELADA');
    UPDATE carga_unidade SET status = 'CANCELADA' WHERE carga_documento_id = r.id AND status = 'PENDENTE';
    UPDATE carga_documento SET ativo = false WHERE id = r.id;
    PERFORM public._fn_carga_recalcular(r.carga_id);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_carga_documento_removido ON public.movimento_saida_documento;
CREATE TRIGGER trg_carga_documento_removido AFTER DELETE ON public.movimento_saida_documento
  FOR EACH ROW EXECUTE FUNCTION public.tg_carga_documento_removido();

-- ---------- badge do coletor ----------
CREATE OR REPLACE FUNCTION public.fn_coletor_menu_badges(p_tenant_id uuid, p_empresa_id uuid, p_armazem_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id); -- seguranca 2026-10-12 L2
  RETURN public.fn_coletor_menu_badges__sem_checagem(p_tenant_id, p_empresa_id, p_armazem_id)
      || jsonb_build_object('embarque', (SELECT count(*) FROM carga c
            WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id AND c.status IN ('LIBERADA','EM_CARREGAMENTO'))); -- F6 2026-11-12
END;$function$;

-- ---------- grants ----------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    '_fn_carga_autorizar(uuid,uuid,boolean)', '_fn_carga_erro(text)', '_fn_carga_onda_motivo(uuid)', '_fn_carga_onda_hus(uuid)',
    '_fn_carga_recalcular(uuid)', '_fn_carga_gerar_unidades(uuid,uuid[])', '_fn_carga_cancelar_unidades(uuid,uuid[],text)',
    '_fn_carga_detalhe(uuid)', 'tg_carga_onda_cancelada()', 'tg_carga_documento_removido()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'carga_sugerir(uuid,uuid)', 'carga_listar(uuid,uuid,text[],integer)', 'carga_obter(uuid,uuid)',
    'carga_montar(uuid,uuid,uuid,uuid,uuid[],uuid,uuid,text,text)', 'carga_remover_onda(uuid,uuid,uuid,uuid)',
    'carga_reordenar_documentos(uuid,uuid,uuid,uuid[])', 'carga_liberar(uuid,uuid,uuid)', 'carga_cancelar(uuid,uuid,uuid,text)',
    'carga_romaneio(uuid,uuid)', 'embarque_buscar_cargas(uuid,uuid,uuid)', 'embarque_obter_carga(uuid,uuid,uuid)',
    'embarque_bipar_unidade(uuid,uuid,uuid,text,uuid)', 'embarque_fechar_carga(uuid,uuid,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;
