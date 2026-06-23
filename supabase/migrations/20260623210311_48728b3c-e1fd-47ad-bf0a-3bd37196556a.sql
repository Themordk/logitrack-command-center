
CREATE OR REPLACE FUNCTION public.liberar_recebimento_erro_transporte(
  p_movimento_entrada_id uuid,
  p_tenant_id uuid,
  p_usuario_id uuid,
  p_motivo_ocorrencia_id uuid,
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov      RECORD;
  v_tv       numeric;
  v_tvc      numeric;
  v_diff     numeric;
  v_oco_id   uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_movimento_entrada_id IS NULL OR p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetros obrigatórios ausentes.';
  END IF;

  IF p_motivo_ocorrencia_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Selecione um motivo de ocorrência.');
  END IF;

  SELECT me.id, me.tenant_id, me.empresa_id, me.armazem_id, me.status,
         me.total_volume, me.total_volume_conferido
    INTO v_mov
    FROM movimento_entrada me
   WHERE me.id = p_movimento_entrada_id
     AND me.tenant_id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'mensagem', 'Movimento de entrada não encontrado.');
  END IF;

  IF v_mov.status NOT IN ('GERADO', 'LIBERADO', 'EM_CONFERENCIA', 'EM CONFERENCIA') THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', format('Movimento no status "%s" não pode ser liberado com erro no transporte.', v_mov.status)
    );
  END IF;

  v_tv  := COALESCE(v_mov.total_volume, 0);
  v_tvc := COALESCE(v_mov.total_volume_conferido, 0);

  IF v_tv = v_tvc THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'mensagem', 'A conferência dos volumes está correta. Não é necessário liberar com erro no transporte.'
    );
  END IF;

  v_diff := ABS(v_tv - v_tvc);

  INSERT INTO ocorrencia_operacional (
    tenant_id, empresa_id, armazem_id,
    etapa_ocorrencia, tipo_ocorrencia, motivo_ocorrencia_id,
    documento_origem_id, tipo_documento_origem,
    produto_id,
    quantidade_esperada, quantidade_real, quantidade_divergente,
    status, prioridade,
    observacao, resolucao,
    resolvido_por, resolvido_em,
    criado_por
  ) VALUES (
    p_tenant_id, v_mov.empresa_id, v_mov.armazem_id,
    'RECEBIMENTO'::enum_etapa_ocorrencia,
    'OUTROS'::enum_tipo_ocorrencia,
    p_motivo_ocorrencia_id,
    p_movimento_entrada_id, 'MOVIMENTO_ENTRADA',
    NULL,
    v_tv, v_tvc, v_diff,
    'RESOLVIDA'::enum_status_ocorrencia,
    'ALTA'::enum_prioridade_ocorrencia,
    COALESCE(NULLIF(TRIM(p_observacao), ''), 'Liberação de recebimento com erro no transporte.'),
    'Aprovada pelo supervisor — liberação com erro no transporte.',
    p_usuario_id, now(),
    p_usuario_id
  )
  RETURNING id INTO v_oco_id;

  UPDATE movimento_entrada
     SET status            = 'LIBERADO'::enum_status_mov_entrada,
         motivo_ocorrencia = p_motivo_ocorrencia_id,
         usuario_autorizou = p_usuario_id,
         autorizado_em     = CURRENT_DATE
   WHERE id = p_movimento_entrada_id
     AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'sucesso', true,
    'ocorrencia_id', v_oco_id,
    'volume_esperado', v_tv,
    'volume_conferido', v_tvc,
    'diferenca', v_diff,
    'mensagem', 'Recebimento liberado com erro no transporte e ocorrência registrada.'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.liberar_recebimento_erro_transporte(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;
