CREATE OR REPLACE FUNCTION public.fn_preview_inventario(
  p_tenant_id uuid,
  p_empresa_id uuid,
  p_armazem_id uuid,
  p_tipo_inventario public.enum_tipo_inventario,
  p_zona_atividade_id uuid DEFAULT NULL,
  p_endereco_id uuid DEFAULT NULL,
  p_produto_id uuid DEFAULT NULL,
  p_grupo_produto_id uuid DEFAULT NULL,
  p_criterio_selecao public.enum_criterio_selecao_inventario DEFAULT NULL,
  p_curva public.enum_curva DEFAULT NULL,
  p_data_inicio_analise date DEFAULT NULL,
  p_data_fim_analise date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_tenant uuid;
  v_enderecos_cadastrados integer := 0;
  v_skus_cadastrados integer := 0;
  v_enderecos_elegiveis integer := 0;
  v_skus_elegiveis integer := 0;
  v_codigo text := 'OK';
BEGIN
  v_auth_tenant := public.get_current_tenant();
  IF auth.uid() IS NULL OR v_auth_tenant IS NULL OR v_auth_tenant <> p_tenant_id THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'CONTEXTO_TENANT_INVALIDO');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.empresa e
    WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id AND e.ativo = true
  ) THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'EMPRESA_INVALIDA');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.armazem a
    WHERE a.id = p_armazem_id AND a.tenant_id = p_tenant_id
      AND a.empresa_id = p_empresa_id AND a.ativo = true
  ) THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'ARMAZEM_INVALIDO');
  END IF;

  SELECT COUNT(*)::integer INTO v_enderecos_cadastrados
  FROM public.endereco e
  WHERE e.tenant_id = p_tenant_id
    AND e.empresa_id = p_empresa_id
    AND e.armazem_id = p_armazem_id
    AND e.ativo = true;

  SELECT COUNT(*)::integer INTO v_skus_cadastrados
  FROM public.produto p
  WHERE p.tenant_id = p_tenant_id
    AND p.empresa_id = p_empresa_id
    AND p.ativo = true;

  IF p_tipo_inventario = 'GERAL' THEN
    IF v_enderecos_cadastrados = 0 THEN v_codigo := 'SEM_ENDERECOS';
    ELSIF v_skus_cadastrados = 0 THEN v_codigo := 'SEM_PRODUTOS';
    END IF;
    RETURN json_build_object(
      'sucesso', true, 'codigo', v_codigo,
      'enderecos_cadastrados', v_enderecos_cadastrados,
      'skus_cadastrados', v_skus_cadastrados,
      'enderecos_elegiveis', v_enderecos_cadastrados,
      'skus_elegiveis', v_skus_cadastrados,
      'contagem_livre', true
    );
  END IF;

  SELECT COUNT(DISTINCT eg.endereco_id)::integer,
         COUNT(DISTINCT eg.produto_id)::integer
    INTO v_enderecos_elegiveis, v_skus_elegiveis
  FROM public.estoque_geral eg
  JOIN public.endereco e
    ON e.id = eg.endereco_id
   AND e.tenant_id = eg.tenant_id
  LEFT JOIN public.produto prod
    ON prod.id = eg.produto_id
   AND prod.tenant_id = eg.tenant_id
  WHERE eg.tenant_id = p_tenant_id
    AND eg.empresa_id = p_empresa_id
    AND e.empresa_id = p_empresa_id
    AND e.armazem_id = p_armazem_id
    AND e.ativo = true
    AND eg.quantidade_total > 0
    AND (
      (p_tipo_inventario = 'ENDERECO' AND eg.endereco_id = p_endereco_id)
      OR (p_tipo_inventario = 'PRODUTO' AND eg.produto_id = p_produto_id)
      OR (p_tipo_inventario = 'GRUPO_PRODUTO' AND prod.grupo_id = p_grupo_produto_id)
      OR (p_tipo_inventario = 'ZONA' AND EXISTS (
        SELECT 1 FROM public.endereco_zona_atividade eza
        WHERE eza.tenant_id = p_tenant_id
          AND eza.endereco_id = e.id
          AND eza.zona_atividade_id = p_zona_atividade_id
      ))
      OR (p_tipo_inventario = 'ROTATIVO' AND (
        (p_criterio_selecao = 'CURVA_VENDAS' AND prod.curva_venda = p_curva)
        OR (p_criterio_selecao = 'CURVA_ACESSO' AND prod.curva_acesso = p_curva)
        OR (p_criterio_selecao = 'CORTES' AND EXISTS (
          SELECT 1 FROM public.estoque_movimento em
          WHERE em.tenant_id = p_tenant_id
            AND em.empresa_id = p_empresa_id
            AND em.produto_id = eg.produto_id
            AND em.tipo_movimento < 0
            AND em.criado_em >= p_data_inicio_analise::timestamptz
            AND em.criado_em < (p_data_fim_analise + 1)::timestamptz
        ))
        OR (p_criterio_selecao = 'ESTORNOS' AND EXISTS (
          SELECT 1 FROM public.tarefa_execucao te
          JOIN public.tarefa t ON t.id = te.tarefa_id
          WHERE te.tenant_id = p_tenant_id
            AND t.empresa_id = p_empresa_id
            AND t.produto_id = eg.produto_id
            AND te.status = 'CANCELADA'
            AND COALESCE(te.concluido_em, te.iniciado_em, te.atribuido_em) >= p_data_inicio_analise::timestamptz
            AND COALESCE(te.concluido_em, te.iniciado_em, te.atribuido_em) < (p_data_fim_analise + 1)::timestamptz
        ))
      ))
    );

  IF v_enderecos_cadastrados = 0 THEN v_codigo := 'SEM_ENDERECOS';
  ELSIF v_skus_cadastrados = 0 THEN v_codigo := 'SEM_PRODUTOS';
  ELSIF v_enderecos_elegiveis = 0 THEN v_codigo := 'SEM_ESTOQUE';
  END IF;

  RETURN json_build_object(
    'sucesso', true, 'codigo', v_codigo,
    'enderecos_cadastrados', v_enderecos_cadastrados,
    'skus_cadastrados', v_skus_cadastrados,
    'enderecos_elegiveis', v_enderecos_elegiveis,
    'skus_elegiveis', v_skus_elegiveis,
    'contagem_livre', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_preview_inventario(uuid, uuid, uuid, public.enum_tipo_inventario, uuid, uuid, uuid, uuid, public.enum_criterio_selecao_inventario, public.enum_curva, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_preview_inventario(uuid, uuid, uuid, public.enum_tipo_inventario, uuid, uuid, uuid, uuid, public.enum_criterio_selecao_inventario, public.enum_curva, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_criar_inventario_v2(
  p_tenant_id uuid,
  p_empresa_id uuid,
  p_armazem_id uuid,
  p_usuario_id uuid,
  p_descricao text,
  p_tipo_inventario public.enum_tipo_inventario,
  p_tipo_execucao public.enum_execucao_inventario,
  p_bloquear_movimentacao boolean DEFAULT true,
  p_data_planejada date DEFAULT NULL,
  p_zona_atividade_id uuid DEFAULT NULL,
  p_endereco_id uuid DEFAULT NULL,
  p_produto_id uuid DEFAULT NULL,
  p_grupo_produto_id uuid DEFAULT NULL,
  p_criterio_selecao public.enum_criterio_selecao_inventario DEFAULT NULL,
  p_curva public.enum_curva DEFAULT NULL,
  p_max_enderecos_dia integer DEFAULT NULL,
  p_priorizar_picking boolean DEFAULT false,
  p_data_inicio_analise date DEFAULT NULL,
  p_data_fim_analise date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventario_id uuid;
  v_considerar_saldo boolean;
  v_status_inicial public.enum_status_inventario;
  v_bloquear boolean;
  v_proximo_passo text;
  v_auth_tenant uuid;
BEGIN
  v_auth_tenant := public.get_current_tenant();
  IF auth.uid() IS NULL OR v_auth_tenant IS NULL OR v_auth_tenant <> p_tenant_id THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'CONTEXTO_TENANT_INVALIDO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresa e WHERE e.id=p_empresa_id AND e.tenant_id=p_tenant_id AND e.ativo=true) THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'EMPRESA_INVALIDA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.armazem a WHERE a.id=p_armazem_id AND a.tenant_id=p_tenant_id AND a.empresa_id=p_empresa_id AND a.ativo=true) THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'ARMAZEM_INVALIDO');
  END IF;
  IF p_usuario_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuario u
    WHERE u.id=p_usuario_id AND u.auth_user_id=auth.uid()
      AND u.tenant_id=p_tenant_id AND u.empresa_id=p_empresa_id AND u.ativo=true
  ) THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'USUARIO_INVALIDO');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventario_tipo_tarefa itt
    JOIN public.tipo_tarefa tt ON tt.id=itt.tipo_tarefa_id
    WHERE itt.tenant_id=p_tenant_id AND itt.tipo_execucao=p_tipo_execucao
      AND tt.tenant_id=p_tenant_id AND tt.ativo=true
  ) THEN
    RETURN json_build_object('sucesso', false, 'codigo', 'TIPO_TAREFA_NAO_CONFIGURADO');
  END IF;
  IF p_tipo_inventario='ZONA' AND p_zona_atividade_id IS NULL THEN RETURN json_build_object('sucesso',false,'codigo','ESCOPO_ZONA_OBRIGATORIO'); END IF;
  IF p_tipo_inventario='ENDERECO' AND p_endereco_id IS NULL THEN RETURN json_build_object('sucesso',false,'codigo','ESCOPO_ENDERECO_OBRIGATORIO'); END IF;
  IF p_tipo_inventario='PRODUTO' AND p_produto_id IS NULL THEN RETURN json_build_object('sucesso',false,'codigo','ESCOPO_PRODUTO_OBRIGATORIO'); END IF;
  IF p_tipo_inventario='GRUPO_PRODUTO' AND p_grupo_produto_id IS NULL THEN RETURN json_build_object('sucesso',false,'codigo','ESCOPO_GRUPO_OBRIGATORIO'); END IF;
  IF p_tipo_inventario='ROTATIVO' AND p_criterio_selecao IS NULL THEN RETURN json_build_object('sucesso',false,'codigo','CRITERIO_ROTATIVO_OBRIGATORIO'); END IF;
  IF p_tipo_inventario='ROTATIVO' AND p_criterio_selecao IN ('CURVA_VENDAS','CURVA_ACESSO') AND p_curva IS NULL THEN RETURN json_build_object('sucesso',false,'codigo','CURVA_OBRIGATORIA'); END IF;
  IF p_tipo_inventario='ROTATIVO' AND p_criterio_selecao IN ('CORTES','ESTORNOS') AND (p_data_inicio_analise IS NULL OR p_data_fim_analise IS NULL) THEN RETURN json_build_object('sucesso',false,'codigo','PERIODO_OBRIGATORIO'); END IF;

  v_considerar_saldo := (p_tipo_execucao='ATUALIZACAO');
  IF p_tipo_inventario='GERAL' THEN
    v_status_inicial := 'EM_CONTAGEM'; v_bloquear := false; v_proximo_passo := 'PRONTO';
  ELSE
    v_status_inicial := 'CRIADO'; v_bloquear := p_bloquear_movimentacao; v_proximo_passo := 'fn_gerar_tarefas_inventario';
  END IF;

  INSERT INTO public.inventario (
    tenant_id,empresa_id,armazem_id,descricao,tipo_inventario,tipo_execucao,origem,status,
    criado_por,bloquear_movimentacao,considerar_saldo_atual,data_planejada,zona_atividade_id,
    endereco_id,produto_id,grupo_produto_id,criterio_selecao,curva,max_enderecos_dia,
    priorizar_picking,data_inicio_analise,data_fim_analise,total_itens,cursor_processamento,iniciado_em
  ) VALUES (
    p_tenant_id,p_empresa_id,p_armazem_id,p_descricao,p_tipo_inventario,p_tipo_execucao,'MANUAL',v_status_inicial,
    p_usuario_id,v_bloquear,v_considerar_saldo,p_data_planejada,p_zona_atividade_id,p_endereco_id,
    p_produto_id,p_grupo_produto_id,p_criterio_selecao,p_curva,p_max_enderecos_dia,p_priorizar_picking,
    p_data_inicio_analise,p_data_fim_analise,0,0,now()
  ) RETURNING id INTO v_inventario_id;

  RETURN json_build_object('sucesso',true,'inventario_id',v_inventario_id,'proximo_passo',v_proximo_passo);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_criar_inventario_v2(uuid, uuid, uuid, uuid, text, public.enum_tipo_inventario, public.enum_execucao_inventario, boolean, date, uuid, uuid, uuid, uuid, public.enum_criterio_selecao_inventario, public.enum_curva, integer, boolean, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_criar_inventario_v2(uuid, uuid, uuid, uuid, text, public.enum_tipo_inventario, public.enum_execucao_inventario, boolean, date, uuid, uuid, uuid, uuid, public.enum_criterio_selecao_inventario, public.enum_curva, integer, boolean, date, date) TO authenticated, service_role;