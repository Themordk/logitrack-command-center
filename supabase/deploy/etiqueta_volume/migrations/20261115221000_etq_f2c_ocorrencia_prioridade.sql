-- Migration: 20261115221000_etq_f2c_ocorrencia_prioridade.sql
-- Plano: Etiqueta de Volume — defeito antigo encontrado no teste do branch-qa (B14).
-- fn_excluir_volume_expedicao (desde 17/07/2026) e o novo embarque_gerar_volumes chamavam
-- registrar_ocorrencia_operacional com prioridade 'MEDIA', que não existe
-- (valores: BAIXA, NORMAL, ALTA, CRITICA). A função de ocorrência devolvia erro sem
-- interromper, então NENHUMA exclusão de volume foi auditada (produção: 0 ocorrências).
-- Correção: prioridade NORMAL e, se a ocorrência falhar, a operação é desfeita.
-- Risco: baixo. Rollback: reaplicar as funções das migrations 20261115213000 e 20261115220500.

CREATE OR REPLACE FUNCTION public.fn_excluir_volume_expedicao(
  p_volume_id uuid,
  p_usuario_id uuid,              -- mantido por compatibilidade; IGNORADO (usa a sessão)
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := public.get_current_tenant();
  v_usuario uuid;
  v_vol RECORD;
  v_total_antes int;
  v_total_depois int;
  v_ocorr jsonb;
  v_armazem_id uuid;
  v_desc text;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_SESSAO',
      'mensagem', 'Sessão sem tenant válido.');
  END IF;

  SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = auth.uid() LIMIT 1;

  IF NOT public.fn_usuario_tem_permissao(v_usuario, 'web.atividades.volumes', 'DELETE') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_PERMISSAO',
      'mensagem', 'Seu perfil não tem permissão para excluir volumes.');
  END IF;

  SELECT ve.*, ms.numero_onda
    INTO v_vol
  FROM public.volume_expedicao ve
  LEFT JOIN public.movimento_saida ms ON ms.id = ve.movimento_saida_id
  WHERE ve.id = p_volume_id
    AND ve.tenant_id = v_tenant
  FOR UPDATE OF ve;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO',
      'mensagem', 'Volume não encontrado.');
  END IF;

  IF v_vol.status <> 'ABERTO' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'STATUS_INVALIDO',
      'mensagem', format('Somente volumes em status ABERTO podem ser excluídos (status atual: %s).', v_vol.status));
  END IF;

  IF EXISTS (SELECT 1 FROM public.carga_unidade cu
             WHERE cu.tenant_id = v_tenant AND cu.tipo = 'VOLUME'
               AND cu.referencia_id = p_volume_id AND cu.status <> 'CANCELADA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUME_EM_CARGA',
      'mensagem', 'O volume está numa carga. Remova-o da carga antes de excluir.');
  END IF;

  SELECT COUNT(*) INTO v_total_antes
  FROM public.volume_expedicao
  WHERE tenant_id = v_tenant AND movimento_saida_id = v_vol.movimento_saida_id;

  SELECT id INTO v_armazem_id FROM public.armazem
    WHERE tenant_id = v_vol.tenant_id AND empresa_id = v_vol.empresa_id
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

  DELETE FROM public.volume_expedicao WHERE id = p_volume_id AND tenant_id = v_tenant;

  v_total_depois := v_total_antes - 1;

  v_desc := format(
    'Exclusão do volume %s (onda %s). Movimento tinha %s volume(s) antes da exclusão e passa a ter %s.',
    v_vol.codigo_volume, COALESCE(v_vol.numero_onda::text, '—'), v_total_antes, v_total_depois);
  IF p_observacao IS NOT NULL AND btrim(p_observacao) <> '' THEN
    v_desc := v_desc || ' | Observação: ' || p_observacao;
  END IF;

  v_ocorr := public.registrar_ocorrencia_operacional(
    p_tenant_id := v_vol.tenant_id,
    p_empresa_id := v_vol.empresa_id,
    p_armazem_id := v_armazem_id,
    p_tipo_ocorrencia := 'OUTROS',
    p_categoria := 'CORRETIVA',
    p_etapa_ocorrencia := 'EXPEDICAO',
    p_observacao := v_desc,
    p_documento_origem_id := v_vol.movimento_saida_id,
    p_tipo_documento_origem := 'MOVIMENTO_SAIDA',
    p_usuario_criador_id := v_usuario,
    p_usuario_causador_id := v_usuario,
    p_prioridade := 'NORMAL'
  );
  -- Sem registro de auditoria, a exclusão não acontece (desfeita pelo bloco EXCEPTION)
  IF NOT COALESCE((v_ocorr->>'sucesso')::boolean, false) THEN
    RAISE EXCEPTION 'Falha ao registrar ocorrência da exclusão: %', v_ocorr->>'mensagem';
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true, 'codigo', 'VOLUME_EXCLUIDO',
    'mensagem', format('Volume %s excluído com sucesso.', v_vol.codigo_volume),
    'dados', jsonb_build_object('codigo_volume', v_vol.codigo_volume,
      'total_antes', v_total_antes, 'total_depois', v_total_depois, 'ocorrencia', v_ocorr));

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fn_excluir_volume_expedicao(%): % %', p_volume_id, SQLSTATE, SQLERRM;
  RETURN jsonb_build_object('sucesso', false, 'codigo', 'ERRO_INTERNO',
    'mensagem', 'Erro ao excluir volume. Tente novamente ou acione o suporte.');
END;
$$;

CREATE OR REPLACE FUNCTION public.embarque_gerar_volumes(
  p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid, p_carga_documento_id uuid,
  p_quantidade integer, p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_u uuid; v_c record; v_cd record; v_ids uuid[] := '{}'; v_id uuid; i integer; v_vols jsonb;
        v_etapa text; v_excecao boolean; v_armazem uuid; v_ocorr jsonb;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  PERFORM public._fn_embarque_checar_responsavel(p_carga_id, v_u);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em %.', v_c.numero_carga, v_c.status;
  END IF;
  PERFORM public._fn_embarque_checar_veiculo(p_carga_id);
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 999 THEN
    RAISE EXCEPTION 'EMBARQUE_QUANTIDADE_INVALIDA: informe de 1 a 999 volumes.';
  END IF;
  SELECT cd.*, ds.numero_pedido, ds.tipo_pedido_id, ms.numero_onda INTO v_cd FROM carga_documento cd
    JOIN documento_saida ds ON ds.id = cd.documento_saida_id JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
   WHERE cd.id = p_carga_documento_id AND cd.carga_id = p_carga_id AND cd.ativo;
  IF v_cd.id IS NULL THEN RAISE EXCEPTION 'EMBARQUE_PEDIDO_FORA_DA_CARGA: o pedido não faz parte desta carga.'; END IF;
  IF EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_documento_id = v_cd.id AND cu.status <> 'CANCELADA') THEN
    RAISE EXCEPTION 'EMBARQUE_VOLUMES_JA_GERADOS: o pedido % já tem volumes; bipe as etiquetas dele.', v_cd.numero_pedido;
  END IF;
  -- Volumes do pedido já existem (gerados antes, com as unidades da carga canceladas):
  -- gerar de novo criaria um segundo "volume 1" do mesmo pedido.
  IF EXISTS (SELECT 1 FROM volume_expedicao ve
              WHERE ve.movimento_saida_id = v_cd.movimento_saida_id
                AND ve.documento_saida_id = v_cd.documento_saida_id) THEN
    RAISE EXCEPTION 'EMBARQUE_PEDIDO_JA_TEM_VOLUMES: o pedido % já tem % volume(s) gerado(s). Reimprima as etiquetas na tela Volumes em vez de gerar de novo.',
      v_cd.numero_pedido, (SELECT count(*) FROM volume_expedicao ve WHERE ve.movimento_saida_id = v_cd.movimento_saida_id AND ve.documento_saida_id = v_cd.documento_saida_id);
  END IF;

  -- D3: exceção quando o tipo de saída não gera volume no carregamento
  SELECT ts.gera_volume_etapa::text INTO v_etapa FROM tipo_saida ts
   WHERE ts.id = v_cd.tipo_pedido_id AND ts.tenant_id = p_tenant_id;
  v_excecao := COALESCE(v_etapa, 'NENHUMA') <> 'CARREGAMENTO';
  IF v_excecao AND (p_motivo IS NULL OR length(btrim(p_motivo)) < 5) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'EMBARQUE_MOTIVO_OBRIGATORIO',
      'mensagem', format('O pedido %s é de um tipo de saída que gera volume em %s, não no carregamento. Informe o motivo para gerar aqui (mínimo 5 caracteres).',
                         v_cd.numero_pedido, COALESCE(v_etapa, 'NENHUMA')));
  END IF;

  FOR i IN 1..p_quantidade LOOP
    INSERT INTO volume_expedicao (tenant_id, empresa_id, movimento_saida_id, documento_saida_id, codigo_volume, numero_volume, status, created_by)
    VALUES (v_c.tenant_id, v_c.empresa_id, v_cd.movimento_saida_id, v_cd.documento_saida_id,
            'VOL-' || lpad(nextval('volume_expedicao_codigo_seq')::text, 6, '0'), i, 'ABERTO', v_u)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;
  PERFORM public._fn_carga_gerar_unidades(p_carga_id, ARRAY[v_cd.movimento_saida_id]);
  PERFORM public._fn_carga_recalcular(p_carga_id);
  PERFORM public._fn_carga_registrar_evento(p_carga_id, 'VOLUMES_GERADOS', v_u,
    jsonb_build_object('carga_documento_id', v_cd.id, 'documento_saida_id', v_cd.documento_saida_id,
                       'quantidade', p_quantidade, 'excecao', v_excecao, 'motivo', p_motivo));

  IF v_excecao THEN
    SELECT b.armazem_id INTO v_armazem FROM box b WHERE b.id = v_c.box_id;
    SELECT public.registrar_ocorrencia_operacional(
      p_tenant_id := v_c.tenant_id,
      p_empresa_id := v_c.empresa_id,
      p_armazem_id := v_armazem,
      p_tipo_ocorrencia := 'OUTROS',
      p_categoria := 'CORRETIVA',
      p_etapa_ocorrencia := 'EXPEDICAO',
      p_observacao := format('Volumes gerados no embarque fora da configuração: pedido %s, carga #%s, %s volume(s); tipo de saída gera volume em %s. Motivo: %s',
                             v_cd.numero_pedido, v_c.numero_carga, p_quantidade, COALESCE(v_etapa, 'NENHUMA'), btrim(p_motivo)),
      p_documento_origem_id := v_cd.documento_saida_id,
      p_tipo_documento_origem := 'DOCUMENTO_SAIDA',
      p_usuario_criador_id := v_u,
      p_usuario_causador_id := v_u,
      p_prioridade := 'NORMAL') INTO v_ocorr;
    -- D3: sem ocorrência registrada, os volumes não são gerados (bloco desfeito)
    IF NOT COALESCE((v_ocorr->>'sucesso')::boolean, false) THEN
      RAISE EXCEPTION 'EMBARQUE_OCORRENCIA_FALHOU: não foi possível registrar a ocorrência da exceção (%).', v_ocorr->>'mensagem';
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', v.id, 'codigo_volume', v.codigo_volume, 'numero_volume', v.numero_volume,
           'total_volumes', p_quantidade, 'numero_pedido', v_cd.numero_pedido, 'numero_onda', v_cd.numero_onda) ORDER BY v.numero_volume)
    INTO v_vols FROM volume_expedicao v WHERE v.id = ANY(v_ids);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_VOLUMES_GERADOS',
    'mensagem', format('%s volume(s) gerado(s) para o pedido %s. Cole as etiquetas e bipe cada uma ao carregar.', p_quantidade, v_cd.numero_pedido)
                || CASE WHEN v_excecao THEN ' Exceção registrada como ocorrência.' ELSE '' END,
    'dados', jsonb_build_object('volumes', v_vols, 'excecao', v_excecao));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $function$;

REVOKE ALL ON FUNCTION public.fn_excluir_volume_expedicao(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_excluir_volume_expedicao(uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.embarque_gerar_volumes(uuid, uuid, uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embarque_gerar_volumes(uuid, uuid, uuid, uuid, integer, text) TO authenticated, service_role;
