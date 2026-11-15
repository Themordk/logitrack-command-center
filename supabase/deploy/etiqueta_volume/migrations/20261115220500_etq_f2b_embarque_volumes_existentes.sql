-- Migration: 20261115220500_etq_f2b_embarque_volumes_existentes.sql
-- Plano: Etiqueta de Volume — ajuste da Fase 2 encontrado no teste do branch-qa.
-- Se as unidades de um pedido na carga foram canceladas mas os volumes do pedido
-- continuam existindo, o embarque gerava um segundo conjunto ("volume 1/2" repetido).
-- Agora recusa com EMBARQUE_PEDIDO_JA_TEM_VOLUMES e orienta a reimprimir.
-- Risco: baixo. Rollback: reaplicar embarque_gerar_volumes da migration 20261115220000.

CREATE OR REPLACE FUNCTION public.embarque_gerar_volumes(
  p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid, p_carga_documento_id uuid,
  p_quantidade integer, p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_u uuid; v_c record; v_cd record; v_ids uuid[] := '{}'; v_id uuid; i integer; v_vols jsonb;
        v_etapa text; v_excecao boolean; v_armazem uuid;
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
    PERFORM public.registrar_ocorrencia_operacional(
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
      p_prioridade := 'MEDIA');
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
REVOKE ALL ON FUNCTION public.embarque_gerar_volumes(uuid, uuid, uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embarque_gerar_volumes(uuid, uuid, uuid, uuid, integer, text) TO authenticated, service_role;
