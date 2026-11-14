-- =====================================================================
-- Fluxo de Expedição — F5.1 · 2026-11-12
-- roteiro_saida_salvar v2: "conferir por Grupo de separação" sem critério de
-- separação deixa de ser bloqueio (ROTEIRO_DEPENDENCIA) e vira aviso, porque
-- desde a F4 os grupos também nascem do limite de SKUs e da quebra por armazém.
-- Reversão: reaplicar roteiro_saida_salvar de 20261112_fluxo_expedicao_f2_config.sql
-- =====================================================================
CREATE OR REPLACE FUNCTION public.roteiro_saida_salvar(p_tenant_id uuid, p_empresa_id uuid, p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nivel   text;
  v_item    jsonb;
  v_crit    public.enum_criterio_roteiro_saida;
  v_seq     integer;
  v_avisos  jsonb := '[]'::jsonb;
  v_sep_qtd integer;
  v_max_sku numeric;
  v_unid    text;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF p_empresa_id IS NULL OR NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ROTEIRO_EMPRESA_INVALIDA',
      'mensagem', 'Empresa não encontrada neste tenant.');
  END IF;

  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ROTEIRO_CONFIG_INVALIDA',
      'mensagem', 'Configuração ausente ou em formato inválido.');
  END IF;

  -- Critérios por nível
  FOREACH v_nivel IN ARRAY ARRAY['movimento','separacao','conferencia','embarque'] LOOP
    CONTINUE WHEN NOT (p_config ? v_nivel);

    IF jsonb_typeof(p_config -> v_nivel) <> 'array' THEN
      RAISE EXCEPTION 'ROTEIRO_CONFIG_INVALIDA: "%" deve ser uma lista.', v_nivel USING ERRCODE = 'P0001';
    END IF;

    IF (SELECT COUNT(*) <> COUNT(DISTINCT value) FROM jsonb_array_elements_text(p_config -> v_nivel)) THEN
      RAISE EXCEPTION 'ROTEIRO_CRITERIO_DUPLICADO: há critério repetido em "%".', v_nivel USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM roteiro_saida_criterio
     WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
       AND nivel = upper(v_nivel)::public.enum_nivel_roteiro_saida;

    v_seq := 0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_config -> v_nivel) LOOP
      v_seq := v_seq + 1;
      BEGIN
        v_crit := (v_item #>> '{}')::public.enum_criterio_roteiro_saida;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'ROTEIRO_CRITERIO_DESCONHECIDO: critério "%" não existe.', v_item #>> '{}' USING ERRCODE = 'P0001';
      END;

      IF upper(v_nivel) IN ('SEPARACAO','CONFERENCIA') AND v_crit IN ('DOCUMENTO','PARCEIRO','ROTA') THEN
        RAISE EXCEPTION 'ROTEIRO_CRITERIO_HERDADO: % só vale abaixo do movimento quando está no nível Movimento, e nesse caso já é herdado.', v_crit
          USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO roteiro_saida_criterio (tenant_id, empresa_id, nivel, criterio, sequencia)
      VALUES (p_tenant_id, p_empresa_id, upper(v_nivel)::public.enum_nivel_roteiro_saida, v_crit, v_seq);
    END LOOP;
  END LOOP;

  -- Limites
  IF p_config ? 'limites' THEN
    DELETE FROM roteiro_saida_limite WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id;
    v_max_sku := NULLIF(p_config #>> '{limites,separacao,MAX_SKU}', '')::numeric;
    IF v_max_sku IS NOT NULL THEN
      IF v_max_sku <= 0 OR v_max_sku <> trunc(v_max_sku) THEN
        RAISE EXCEPTION 'ROTEIRO_LIMITE_INVALIDO: o máximo de SKUs deve ser um número inteiro maior que zero.' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO roteiro_saida_limite (tenant_id, empresa_id, nivel, tipo_limite, valor)
      VALUES (p_tenant_id, p_empresa_id, 'SEPARACAO', 'MAX_SKU', v_max_sku);
    END IF;
  END IF;

  -- Parâmetros de embarque
  IF p_config ? 'embarque_config' THEN
    v_unid := COALESCE(p_config #>> '{embarque_config,unidade_embarque}', 'CONFIRMACAO');
    BEGIN
      INSERT INTO roteiro_saida_embarque (tenant_id, empresa_id, unidade_embarque, template_romaneio_id)
      VALUES (p_tenant_id, p_empresa_id, v_unid::public.enum_unidade_embarque,
              NULLIF(p_config #>> '{embarque_config,template_romaneio_id}', '')::uuid)
      ON CONFLICT (tenant_id, empresa_id) DO UPDATE
        SET unidade_embarque = EXCLUDED.unidade_embarque,
            template_romaneio_id = EXCLUDED.template_romaneio_id;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'ROTEIRO_UNIDADE_EMBARQUE_INVALIDA: unidade "%" não existe.', v_unid USING ERRCODE = 'P0001';
    END;
  END IF;

  -- Coerência entre níveis
  SELECT COUNT(*) INTO v_sep_qtd FROM roteiro_saida_criterio
   WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id AND nivel = 'SEPARACAO';

  -- v2 (2026-11-12): grupos também nascem do limite de SKUs e da quebra por armazém -> aviso, não bloqueio
  IF v_sep_qtd = 0
     AND NOT EXISTS (SELECT 1 FROM roteiro_saida_limite
                     WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id AND nivel = 'SEPARACAO')
     AND EXISTS (SELECT 1 FROM roteiro_saida_criterio
                 WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
                   AND nivel = 'CONFERENCIA' AND criterio = 'GRUPO_SEPARACAO') THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'ROTEIRO_AVISO_GRUPO_UNICO',
      'mensagem', 'Sem critério nem limite na separação, cada onda terá um grupo por armazém; a conferência por grupo só divide ondas com mais de um armazém.');
  END IF;

  IF EXISTS (SELECT 1 FROM roteiro_saida_criterio
      WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
        AND nivel = 'CONFERENCIA' AND criterio = 'HU_VOLUME')
     AND EXISTS (SELECT 1 FROM tipo_saida ts
      WHERE ts.tenant_id = p_tenant_id AND COALESCE(ts.ativo, true)
        AND (ts.empresa_id IS NULL OR ts.empresa_id = p_empresa_id)
        AND COALESCE(ts.realiza_conferencia, false)
        AND COALESCE(ts.gera_volume_etapa::text, 'NENHUMA') = 'NENHUMA') THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'ROTEIRO_AVISO_SEM_VOLUME',
      'mensagem', 'Há tipos de saída que conferem mas não geram volume; a conferência por HU usa a HU informada na coleta, e o que for coletado sem HU fica numa unidade "Sem HU".');
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ROTEIRO_SALVO',
    'mensagem', 'Roteiro salvo.',
    'avisos', v_avisos,
    'dados', public.roteiro_saida_obter(p_tenant_id, p_empresa_id) -> 'dados');

EXCEPTION
  WHEN raise_exception OR unique_violation OR check_violation OR foreign_key_violation THEN
    RETURN jsonb_build_object('sucesso', false,
      'codigo', COALESCE(NULLIF(split_part(SQLERRM, ':', 1), SQLERRM), 'ROTEIRO_ERRO_VALIDACAO'),
      'mensagem', SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION public.roteiro_saida_salvar(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roteiro_saida_salvar(uuid, uuid, jsonb) TO authenticated, service_role;
