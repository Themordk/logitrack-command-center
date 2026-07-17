
CREATE OR REPLACE VIEW public.vw_volume_expedicao_lista
WITH (security_invoker = true) AS
SELECT
  ve.id,
  ve.codigo_volume,
  ve.status,
  ve.peso_bruto,
  ve.m3,
  ve.created_at,
  ve.tenant_id,
  ve.empresa_id,
  ve.movimento_saida_id,
  ve.documento_saida_id,
  ms.numero_onda,
  ms.destino_carga,
  ms.rota_id,
  ms.motorista,
  ds.parceiro_id,
  p.razaosocial AS parceiro_nome,
  (SELECT COUNT(*) FROM public.volume_expedicao v2 WHERE v2.movimento_saida_id = ve.movimento_saida_id) AS total_volumes_movimento
FROM public.volume_expedicao ve
LEFT JOIN public.movimento_saida ms ON ms.id = ve.movimento_saida_id
LEFT JOIN public.documento_saida ds ON ds.id = ve.documento_saida_id
LEFT JOIN public.parceiro p ON p.id = ds.parceiro_id;

GRANT SELECT ON public.vw_volume_expedicao_lista TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_excluir_volume_expedicao(
  p_volume_id uuid,
  p_usuario_id uuid,
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vol RECORD;
  v_total_antes int;
  v_total_depois int;
  v_ocorr jsonb;
  v_armazem_id uuid;
  v_desc text;
BEGIN
  SELECT ve.*, ms.numero_onda
    INTO v_vol
  FROM public.volume_expedicao ve
  LEFT JOIN public.movimento_saida ms ON ms.id = ve.movimento_saida_id
  WHERE ve.id = p_volume_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Volume não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_vol.status <> 'ABERTO' THEN
    RAISE EXCEPTION 'Somente volumes em status ABERTO podem ser excluídos (status atual: %).', v_vol.status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_total_antes
  FROM public.volume_expedicao
  WHERE movimento_saida_id = v_vol.movimento_saida_id;

  SELECT id INTO v_armazem_id FROM public.armazem
    WHERE tenant_id = v_vol.tenant_id AND empresa_id = v_vol.empresa_id
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

  DELETE FROM public.volume_expedicao WHERE id = p_volume_id;

  v_total_depois := v_total_antes - 1;

  v_desc := format(
    'Exclusão do volume %s (onda %s). Movimento tinha %s volume(s) antes da exclusão e passa a ter %s.',
    v_vol.codigo_volume,
    COALESCE(v_vol.numero_onda::text, '—'),
    v_total_antes,
    v_total_depois
  );
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
    p_usuario_criador_id := p_usuario_id,
    p_usuario_causador_id := p_usuario_id,
    p_prioridade := 'MEDIA'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'codigo_volume', v_vol.codigo_volume,
    'total_antes', v_total_antes,
    'total_depois', v_total_depois,
    'ocorrencia', v_ocorr
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_excluir_volume_expedicao(uuid, uuid, text) TO authenticated;
