CREATE OR REPLACE FUNCTION public.gerar_onda_separacao(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_documentos uuid[] DEFAULT NULL::uuid[], p_box_id uuid DEFAULT NULL::uuid, p_rota_id uuid DEFAULT NULL::uuid, p_veiculo_id uuid DEFAULT NULL::uuid, p_prioridade enum_prioridade_onda DEFAULT 'NORMAL'::enum_prioridade_onda, p_modo text DEFAULT 'MANUAL'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_registro            RECORD;
  v_mov_saida_id        uuid;
  v_tipo_saida_id       uuid;
  v_tipo_saida_count    integer;
  v_empresa_count       integer;
  v_docs_invalidos      integer;
  v_total_docs          integer;
  v_total_ondas         integer := 0;
  v_libera_mov_auto     boolean := false;
  v_prioridade          enum_prioridade_onda := 'NORMAL'::enum_prioridade_onda;
  v_resultado_lib       jsonb;
  v_ondas_geradas       jsonb := '[]'::jsonb;
  v_retorno             jsonb;
  v_grupo               RECORD;
  v_resultados          jsonb := '[]'::jsonb;
  v_mov_resultado       jsonb;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  IF p_usuario_id IS NULL THEN
    RAISE EXCEPTION 'p_usuario_id é obrigatório.';
  END IF;

  IF p_modo NOT IN ('MANUAL', 'AUTOMATICO') THEN
    RAISE EXCEPTION 'Modo inválido. Use MANUAL ou AUTOMATICO.';
  END IF;

  IF p_modo = 'MANUAL' THEN

    IF p_documentos IS NULL OR array_length(p_documentos, 1) IS NULL THEN
      RAISE EXCEPTION 'Nenhum documento de saída informado.';
    END IF;

    SELECT COUNT(*)
    INTO v_total_docs
    FROM public.documento_saida ds
    WHERE ds.id = ANY(p_documentos)
      AND ds.tenant_id = p_tenant_id;

    IF v_total_docs <> array_length(p_documentos, 1) THEN
      RAISE EXCEPTION 'Um ou mais documentos de saída não foram encontrados ou não pertencem a este tenant.';
    END IF;

    SELECT COUNT(*)
    INTO v_docs_invalidos
    FROM public.documento_saida ds
    WHERE ds.id = ANY(p_documentos)
      AND ds.tenant_id = p_tenant_id
      AND ds.status <> 0;

    IF v_docs_invalidos > 0 THEN
      RAISE EXCEPTION '% documento(s) já estão vinculados a uma onda de separação.', v_docs_invalidos;
    END IF;

    SELECT COUNT(DISTINCT ds.tipo_pedido_id)
    INTO v_tipo_saida_count
    FROM public.documento_saida ds
    WHERE ds.id = ANY(p_documentos)
      AND ds.tenant_id = p_tenant_id;

    IF v_tipo_saida_count > 1 THEN
      RAISE EXCEPTION 'Não é permitido agrupar documentos com tipos de saída diferentes na mesma onda.';
    END IF;

    SELECT COUNT(DISTINCT ds.empresa_id)
    INTO v_empresa_count
    FROM public.documento_saida ds
    WHERE ds.id = ANY(p_documentos)
      AND ds.tenant_id = p_tenant_id;

    IF v_empresa_count > 1 THEN
      RAISE EXCEPTION 'Não é permitido agrupar documentos de empresas diferentes na mesma onda.';
    END IF;

    -- Prioridade agora deriva do TIPO_SAIDA do documento (fallback NORMAL)
    SELECT ds.tipo_pedido_id,
           COALESCE(ts.libera_mov_automatico, false),
           COALESCE(ts.prioridade, 'NORMAL'::enum_prioridade_onda)
    INTO v_tipo_saida_id, v_libera_mov_auto, v_prioridade
    FROM public.documento_saida ds
    INNER JOIN public.tipo_saida ts
      ON ts.id = ds.tipo_pedido_id
      AND ts.tenant_id = ds.tenant_id
    WHERE ds.id = ANY(p_documentos)
      AND ds.tenant_id = p_tenant_id
    LIMIT 1;

    DROP TABLE IF EXISTS tmp_agrupamento;
    CREATE TEMP TABLE tmp_agrupamento AS
    SELECT *
    FROM public.agrupamento_separacao
    WHERE tenant_id = p_tenant_id
      AND empresa_id = p_empresa_id
    ORDER BY sequencia;

    DROP TABLE IF EXISTS tmp_docs;
    CREATE TEMP TABLE tmp_docs AS
    SELECT
      ds.id AS documento_saida_id,
      ds.numero_pedido,
      ds.parceiro_id,
      ds.rota_id,
      dsi.produto_id,
      dsi.quantidade,
      dsi.valor_unit,
      dsi.valor_total,
      pp.endereco_id AS picking,
      za.descricao
    FROM public.documento_saida ds
    JOIN public.documento_saida_item dsi ON dsi.documento_saida_id = ds.id
      AND dsi.tenant_id = ds.tenant_id
    LEFT JOIN LATERAL (
      SELECT endereco_id
      FROM public.picking_produto pp
      WHERE pp.produto_id = dsi.produto_id
        AND pp.tenant_id = p_tenant_id
        AND pp.tipo_picking IN ('FRACIONADO','PDV')
        AND pp.ativo = true
      LIMIT 1
    ) pp ON true
    LEFT JOIN public.endereco_zona_atividade eza
      ON eza.endereco_id = pp.endereco_id
      AND eza.tenant_id = p_tenant_id
    LEFT JOIN public.zona_atividade za
      ON za.id = eza.zona_atividade_id
      AND za.tenant_id = p_tenant_id
    WHERE ds.id = ANY(p_documentos)
      AND ds.tenant_id = p_tenant_id
      AND ds.status = 0;

    ALTER TABLE tmp_docs ADD COLUMN chave_agrupamento text;

    UPDATE tmp_docs t
    SET chave_agrupamento = (
      SELECT string_agg(valor, '|')
      FROM (
        SELECT
          CASE tipo_agrupamento
            WHEN 'ROTA'            THEN t.rota_id::text
            WHEN 'PARCEIRO'        THEN t.parceiro_id::text
            WHEN 'PRODUTO'         THEN t.produto_id::text
            WHEN 'DOCUMENTO'       THEN t.numero_pedido::text
            WHEN 'ZONA_ATIVIDADE'  THEN COALESCE(t.descricao, 'SEM_ZONA')
          END AS valor,
          sequencia
        FROM tmp_agrupamento
        ORDER BY sequencia
      ) x
    )
    WHERE t.documento_saida_id IS NOT NULL;

    FOR v_registro IN
      SELECT DISTINCT chave_agrupamento
      FROM tmp_docs
    LOOP

      INSERT INTO public.movimento_saida (
        tenant_id, empresa_id, box_id, rota_id, veiculo_id,
        data_emissao, prioridade, status, chave_agrupamento, tipo_saida
      )
      VALUES (
        p_tenant_id, p_empresa_id, p_box_id, p_rota_id, p_veiculo_id,
        now(), v_prioridade,
        'CRIADA'::enum_status_onda_carregamento,
        v_registro.chave_agrupamento,
        v_tipo_saida_id
      )
      RETURNING id INTO v_mov_saida_id;

      INSERT INTO public.movimento_saida_documento (
        tenant_id, movimento_saida_id, documento_saida_id, ordem
      )
      SELECT
        p_tenant_id,
        v_mov_saida_id,
        documento_saida_id,
        ROW_NUMBER() OVER ()
      FROM tmp_docs
      WHERE chave_agrupamento = v_registro.chave_agrupamento
      GROUP BY documento_saida_id;

      INSERT INTO public.movimento_saida_item (
        tenant_id, movimento_saida_id, produto_id,
        qtd_esperada, valor_unit, valor_total, status
      )
      SELECT
        p_tenant_id,
        v_mov_saida_id,
        produto_id,
        SUM(quantidade),
        AVG(valor_unit),
        SUM(valor_total),
        'PENDENTE'::enum_status_item_onda
      FROM tmp_docs
      WHERE chave_agrupamento = v_registro.chave_agrupamento
      GROUP BY produto_id;

      v_total_ondas := v_total_ondas + 1;

      IF v_libera_mov_auto THEN
        SELECT public.liberar_onda_separacao(
          p_tenant_id         := p_tenant_id,
          p_empresa_id        := p_empresa_id,
          p_movimento_saida_id := v_mov_saida_id,
          p_usuario_id        := p_usuario_id
        )
        INTO v_resultado_lib;

        v_ondas_geradas := v_ondas_geradas || jsonb_build_object(
          'movimento_saida_id', v_mov_saida_id,
          'chave_agrupamento',  v_registro.chave_agrupamento,
          'liberado_automatico', true,
          'liberacao',           v_resultado_lib
        );
      ELSE
        v_ondas_geradas := v_ondas_geradas || jsonb_build_object(
          'movimento_saida_id', v_mov_saida_id,
          'chave_agrupamento',  v_registro.chave_agrupamento,
          'liberado_automatico', false
        );
      END IF;

    END LOOP;

    UPDATE public.documento_saida ds
    SET status = 1
    WHERE ds.tenant_id = p_tenant_id
      AND ds.id IN (
        SELECT DISTINCT documento_saida_id FROM tmp_docs
      );

    DROP TABLE IF EXISTS tmp_docs;
    DROP TABLE IF EXISTS tmp_agrupamento;

    RETURN jsonb_build_object(
      'sucesso',             true,
      'modo',                'MANUAL',
      'tipo_saida_id',       v_tipo_saida_id,
      'prioridade',          v_prioridade,
      'total_documentos',    v_total_docs,
      'total_ondas',         v_total_ondas,
      'liberado_automatico', v_libera_mov_auto,
      'ondas',               v_ondas_geradas,
      'mensagem',            v_total_ondas || ' onda(s) gerada(s) com sucesso.' ||
                             CASE WHEN v_libera_mov_auto
                               THEN ' Liberação automática executada.'
                               ELSE '' END
    );

  ELSIF p_modo = 'AUTOMATICO' THEN

    FOR v_grupo IN
      SELECT
        ds.empresa_id,
        ds.tipo_pedido_id,
        array_agg(ds.id) AS doc_ids
      FROM public.documento_saida ds
      INNER JOIN public.tipo_saida ts
        ON ts.id = ds.tipo_pedido_id
        AND ts.tenant_id = ds.tenant_id
      WHERE ds.tenant_id = p_tenant_id
        AND ds.status = 0
        AND ts.gera_mov_automatico = true
        AND ts.ativo = true
      GROUP BY ds.empresa_id, ds.tipo_pedido_id
    LOOP

      BEGIN
        SELECT public.gerar_onda_separacao(
          p_tenant_id  := p_tenant_id,
          p_empresa_id := v_grupo.empresa_id,
          p_usuario_id := p_usuario_id,
          p_documentos := v_grupo.doc_ids,
          p_modo       := 'MANUAL'
        )
        INTO v_mov_resultado;

        v_resultados := v_resultados || v_mov_resultado;

      EXCEPTION WHEN OTHERS THEN
        DROP TABLE IF EXISTS tmp_docs;
        DROP TABLE IF EXISTS tmp_agrupamento;

        v_resultados := v_resultados || jsonb_build_object(
          'sucesso',        false,
          'empresa_id',     v_grupo.empresa_id,
          'tipo_saida_id',  v_grupo.tipo_pedido_id,
          'total_documentos', array_length(v_grupo.doc_ids, 1),
          'erro',           SQLERRM
        );
      END;

    END LOOP;

    RETURN jsonb_build_object(
      'sucesso',       true,
      'modo',          'AUTOMATICO',
      'total_grupos',  jsonb_array_length(v_resultados),
      'resultados',    v_resultados,
      'mensagem',      jsonb_array_length(v_resultados) || ' grupo(s) processado(s).'
    );

  END IF;

END;
$function$;