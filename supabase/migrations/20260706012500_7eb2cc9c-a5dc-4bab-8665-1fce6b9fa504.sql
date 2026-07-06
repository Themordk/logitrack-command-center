CREATE OR REPLACE FUNCTION public.fn_inventario_contagem_livre(
    p_tenant_id uuid,
    p_inventario_id uuid,
    p_usuario_id uuid,
    p_endereco_codigo numeric,
    p_ean text,
    p_quantidade numeric,
    p_lote text DEFAULT '',
    p_validade date DEFAULT '1900-01-01',
    p_fabricacao date DEFAULT '1900-01-01'
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inv              RECORD;
    v_endereco         RECORD;
    v_embalagem        RECORD;
    v_produto          RECORD;
    v_tarefa_existente RECORD;
    v_tipo_tarefa_id   uuid;
    v_saldo_sistema    numeric := 0;
    v_qtd_final        numeric;
    v_tarefa_id        uuid;
    v_execucao_id      uuid;
    v_resultado        text;
    v_divergencia      numeric;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'TENANT_OBRIGATORIO');
    END IF;

    SELECT inv.id, inv.tenant_id, inv.empresa_id, inv.armazem_id,
           inv.tipo_inventario, inv.tipo_execucao, inv.status,
           inv.considerar_saldo_atual
      INTO v_inv
      FROM public.inventario inv
     WHERE inv.id = p_inventario_id
       AND inv.tenant_id = p_tenant_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'INVENTARIO_NAO_ENCONTRADO');
    END IF;
    IF v_inv.tipo_inventario <> 'GERAL' THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'INVENTARIO_NAO_GERAL',
               'mensagem', 'Esta função é exclusiva para inventários do tipo GERAL');
    END IF;
    IF v_inv.status <> 'EM_CONTAGEM' THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'INVENTARIO_STATUS_INVALIDO',
               'mensagem', 'Inventário não está em contagem');
    END IF;

    SELECT e.id, e.codigo_endereco, e.descricao, e.armazem_id
      INTO v_endereco
      FROM public.endereco e
     WHERE e.codigo_endereco = p_endereco_codigo
       AND e.tenant_id = p_tenant_id
       AND e.ativo = true
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'ENDERECO_NAO_ENCONTRADO',
               'mensagem', 'Endereço não encontrado ou inativo');
    END IF;
    IF v_endereco.armazem_id <> v_inv.armazem_id THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'ENDERECO_ARMAZEM_INVALIDO',
               'mensagem', 'Endereço não pertence ao armazém deste inventário');
    END IF;

    SELECT pe.produto_id, pe.fator, pe.embalagem, pe.ean
      INTO v_embalagem
      FROM public.produto_embalagem pe
     WHERE pe.ean = p_ean
       AND pe.tenant_id = p_tenant_id
       AND pe.ativo = true
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'EAN_NAO_ENCONTRADO',
               'mensagem', 'EAN não cadastrado ou inativo');
    END IF;

    SELECT p.id, p.sku, p.descricao
      INTO v_produto
      FROM public.produto p
     WHERE p.id = v_embalagem.produto_id
       AND p.tenant_id = p_tenant_id
       AND p.empresa_id = v_inv.empresa_id
       AND p.ativo = true;

    IF NOT FOUND THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'PRODUTO_EMPRESA_INVALIDO',
               'mensagem', 'Produto não pertence à empresa deste inventário');
    END IF;

    v_qtd_final := p_quantidade * COALESCE(v_embalagem.fator, 1);

    SELECT tipo_tarefa_id INTO v_tipo_tarefa_id
      FROM public.inventario_tipo_tarefa
     WHERE tipo_execucao = v_inv.tipo_execucao
       AND tenant_id     = p_tenant_id
     LIMIT 1;

    IF v_tipo_tarefa_id IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'TIPO_TAREFA_NAO_CONFIGURADO');
    END IF;

    SELECT COALESCE(SUM(eg.quantidade_total), 0)
      INTO v_saldo_sistema
      FROM public.estoque_geral eg
     WHERE eg.endereco_id = v_endereco.id
       AND eg.produto_id  = v_embalagem.produto_id
       AND eg.tenant_id   = p_tenant_id
       AND eg.empresa_id  = v_inv.empresa_id;

    SELECT t.id, t.status, t.quantidade_executada
      INTO v_tarefa_existente
      FROM public.tarefa t
     WHERE t.id_documento_origem   = p_inventario_id
       AND t.tipo_documento_origem = 'INVENTARIO'
       AND t.id_local_origem       = v_endereco.id
       AND t.produto_id            = v_embalagem.produto_id
       AND t.tenant_id             = p_tenant_id
       FOR UPDATE;

    IF FOUND THEN
        IF v_tarefa_existente.status IN ('CONCLUIDA', 'DIVERGENTE') THEN
            RETURN json_build_object(
                'sucesso', false,
                'codigo', 'JA_CONTADO',
                'mensagem', 'Este produto já foi contado neste endereço',
                'tarefa_id', v_tarefa_existente.id,
                'quantidade_anterior', v_tarefa_existente.quantidade_executada
            );
        END IF;
        v_tarefa_id := v_tarefa_existente.id;
    ELSE
        INSERT INTO public.tarefa (
            id, tenant_id, empresa_id, armazem_id,
            tipo_documento_origem, tipo_tarefa_id,
            id_local_origem, produto_id,
            quantidade_requerida, id_documento_origem,
            ordem_tarefa, contagem_inventario,
            status, criado_em, criado_por
        )
        VALUES (
            gen_random_uuid(), p_tenant_id, v_inv.empresa_id, v_inv.armazem_id,
            'INVENTARIO', v_tipo_tarefa_id,
            v_endereco.id, v_embalagem.produto_id,
            v_saldo_sistema, p_inventario_id,
            0, 1,
            'ATRIBUIDA', now(), p_usuario_id
        )
        RETURNING id INTO v_tarefa_id;

        INSERT INTO public.tarefa_atribuicao (
            tenant_id, empresa_id, tarefa_id,
            usuario_id, tipo_convocacao, status
        )
        VALUES (
            p_tenant_id, v_inv.empresa_id, v_tarefa_id,
            p_usuario_id, 'AUTO_CONVOCADO', 'ATIVO'
        );
    END IF;

    v_divergencia := v_qtd_final - v_saldo_sistema;

    IF v_divergencia = 0 THEN
        v_resultado := 'SEM_DIVERGENCIA';
    ELSE
        v_resultado := 'DIVERGENCIA';
    END IF;

    UPDATE public.tarefa
       SET quantidade_executada  = v_qtd_final,
           quantidade_executada4 = v_qtd_final,
           contagem_inventario   = 1,
           status                = 'CONCLUIDA',
           concluido_em          = now()
     WHERE id = v_tarefa_id
       AND tenant_id = p_tenant_id;

    INSERT INTO public.tarefa_execucao (
        tenant_id, tarefa_id, usuario_id, status,
        atribuido_em, iniciado_em, concluido_em,
        quantidade_executada, endereco_origem_id,
        lote, validade, fabricacao
    )
    VALUES (
        p_tenant_id, v_tarefa_id, p_usuario_id, 'CONCLUIDA',
        now(), now(), now(),
        v_qtd_final, v_endereco.id,
        COALESCE(NULLIF(p_lote, ''), NULL),
        NULLIF(p_validade, DATE '1900-01-01'),
        NULLIF(p_fabricacao, DATE '1900-01-01')
    )
    RETURNING id INTO v_execucao_id;

    IF v_inv.tipo_execucao = 'ATUALIZACAO' THEN
        PERFORM public.processar_movimento_estoque(v_execucao_id);
    END IF;

    UPDATE public.inventario
       SET total_itens         = COALESCE(total_itens, 0) + 1,
           total_divergencias  = COALESCE(total_divergencias, 0) +
                                 CASE WHEN v_divergencia <> 0 THEN 1 ELSE 0 END,
           updated_at          = now()
     WHERE id = p_inventario_id
       AND tenant_id = p_tenant_id;

    RETURN json_build_object(
        'sucesso',            true,
        'tarefa_id',          v_tarefa_id,
        'resultado',          v_resultado,
        'produto_sku',        v_produto.sku,
        'produto_descricao',  v_produto.descricao,
        'embalagem',          v_embalagem.embalagem,
        'fator',              v_embalagem.fator,
        'quantidade_contada', v_qtd_final,
        'saldo_sistema',      v_saldo_sistema,
        'divergencia',        v_divergencia
    );
END;
$function$;