CREATE OR REPLACE FUNCTION public.cortar_item_separacao(
    p_tenant_id uuid,
    p_tarefa_id uuid,
    p_usuario uuid,
    p_motivo_ocorrencia uuid,
    p_observacao text DEFAULT NULL
)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_quantidade_requerida     numeric;
    v_quantidade_separada      numeric;
    v_quantidade_a_cortar      numeric;

    v_movimento_saida_item_id  uuid;
    v_movimento_saida_id       uuid;

    v_total_pendentes          integer;
    v_total_itens_movimento    integer;

    v_status_item              text;

    v_empresa_id               uuid;
    v_armazem_id               uuid;
    v_produto_id               uuid;
    v_ocorrencia_id            uuid;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  SELECT
      t.quantidade_requerida,
      t.id_documento_origem,
      t.quantidade_executada,
      t.empresa_id,
      t.armazem_id,
      t.produto_id
  INTO
      v_quantidade_requerida,
      v_movimento_saida_item_id,
      v_quantidade_separada,
      v_empresa_id,
      v_armazem_id,
      v_produto_id
  FROM tarefa t
  WHERE t.id        = p_tarefa_id
    AND t.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
      RAISE EXCEPTION 'Tarefa não encontrada';
  END IF;

  v_quantidade_a_cortar := v_quantidade_requerida - COALESCE(v_quantidade_separada, 0);

  IF v_quantidade_a_cortar <= 0 THEN
      RAISE EXCEPTION 'Não existe saldo para corte';
  END IF;

  IF v_quantidade_a_cortar = v_quantidade_requerida THEN
      v_status_item := 'CORTE_TOTAL'::enum_status_item_onda;
  ELSE
      v_status_item := 'SEPARADO'::enum_status_item_onda;
  END IF;

  UPDATE tarefa
  SET
      status             = 'CONCLUIDA',
      quantidade_cortada = v_quantidade_a_cortar,
      motivo_ocorrencia  = p_motivo_ocorrencia,
      usuario_cortou     = p_usuario
  WHERE id        = p_tarefa_id
    AND tenant_id = p_tenant_id;

  UPDATE movimento_saida_item
  SET
      qtde_cortada      = v_quantidade_a_cortar,
      qtd_separada      = v_quantidade_separada,
      motivo_ocorrencia = p_motivo_ocorrencia,
      usuario_autorizou = p_usuario,
      autorizado_em     = now(),
      status            = v_status_item::enum_status_item_onda
  WHERE id        = v_movimento_saida_item_id
    AND tenant_id = p_tenant_id
  RETURNING movimento_saida_id
  INTO v_movimento_saida_id;

  SELECT COUNT(*)
  INTO v_total_itens_movimento
  FROM movimento_saida_item
  WHERE movimento_saida_id = v_movimento_saida_id
    AND tenant_id          = p_tenant_id;

  SELECT COUNT(*)
  INTO v_total_pendentes
  FROM tarefa t
  JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
  JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
  WHERE msi.movimento_saida_id = v_movimento_saida_id
    AND t.tenant_id            = p_tenant_id
    AND tt.codigo              = 'SEP'
    AND t.status              <> 'CONCLUIDA';

  IF v_total_pendentes = 0 THEN
      IF v_total_itens_movimento = 1
         AND v_quantidade_a_cortar = v_quantidade_requerida THEN
          UPDATE movimento_saida
          SET status = 'CONCLUIDA'
          WHERE id        = v_movimento_saida_id
            AND tenant_id = p_tenant_id;
      ELSE
          UPDATE movimento_saida
          SET status = 'SEPARADO'
          WHERE id        = v_movimento_saida_id
            AND tenant_id = p_tenant_id;
      END IF;
  END IF;

  -- Registra ocorrência operacional vinculada ao corte
  INSERT INTO public.ocorrencia_operacional (
      tenant_id, empresa_id, armazem_id,
      etapa_ocorrencia, tipo_ocorrencia, motivo_ocorrencia_id,
      documento_origem_id, tipo_documento_origem,
      produto_id,
      quantidade_esperada, quantidade_real, quantidade_divergente,
      status, prioridade,
      observacao, criado_por
  ) VALUES (
      p_tenant_id, v_empresa_id, v_armazem_id,
      'SEPARACAO', 'OUTROS', p_motivo_ocorrencia,
      v_movimento_saida_id, 'MOVIMENTO_SAIDA',
      v_produto_id,
      v_quantidade_requerida, COALESCE(v_quantidade_separada, 0), v_quantidade_a_cortar,
      'ABERTA', 'ALTA',
      p_observacao, p_usuario
  )
  RETURNING id INTO v_ocorrencia_id;

  RETURN json_build_object(
      'sucesso',              true,
      'tarefa_id',            p_tarefa_id,
      'ocorrencia_id',        v_ocorrencia_id,
      'quantidade_requerida', v_quantidade_requerida,
      'quantidade_separada',  v_quantidade_separada,
      'quantidade_cortada',   v_quantidade_a_cortar,
      'status_item',          v_status_item,
      'movimento_finalizado', (v_total_pendentes = 0)
  );
END;
$function$;