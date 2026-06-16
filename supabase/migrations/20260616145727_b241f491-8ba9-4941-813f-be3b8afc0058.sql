
-- 1) Colunas de período de análise
ALTER TABLE public.inventario
  ADD COLUMN IF NOT EXISTS data_inicio_analise date,
  ADD COLUMN IF NOT EXISTS data_fim_analise    date;

-- 2) fn_criar_inventario_v2: novos parâmetros + validação
CREATE OR REPLACE FUNCTION public.fn_criar_inventario_v2(
    p_tenant_id uuid,
    p_empresa_id uuid,
    p_armazem_id uuid,
    p_usuario_id uuid,
    p_descricao text,
    p_tipo_inventario enum_tipo_inventario,
    p_tipo_execucao enum_execucao_inventario,
    p_bloquear_movimentacao boolean DEFAULT true,
    p_data_planejada date DEFAULT NULL,
    p_zona_atividade_id uuid DEFAULT NULL,
    p_endereco_id uuid DEFAULT NULL,
    p_produto_id uuid DEFAULT NULL,
    p_grupo_produto_id uuid DEFAULT NULL,
    p_criterio_selecao enum_criterio_selecao_inventario DEFAULT NULL,
    p_curva enum_curva DEFAULT NULL,
    p_max_enderecos_dia integer DEFAULT NULL,
    p_priorizar_picking boolean DEFAULT false,
    p_data_inicio_analise date DEFAULT NULL,
    p_data_fim_analise    date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_inventario_id    uuid;
    v_considerar_saldo boolean;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'TENANT_OBRIGATORIO');
    END IF;
    IF p_armazem_id IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'ARMAZEM_OBRIGATORIO');
    END IF;

    IF p_tipo_inventario = 'ZONA'          AND p_zona_atividade_id IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'ESCOPO_ZONA_OBRIGATORIO');
    END IF;
    IF p_tipo_inventario = 'ENDERECO'      AND p_endereco_id IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'ESCOPO_ENDERECO_OBRIGATORIO');
    END IF;
    IF p_tipo_inventario = 'PRODUTO'       AND p_produto_id IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'ESCOPO_PRODUTO_OBRIGATORIO');
    END IF;
    IF p_tipo_inventario = 'GRUPO_PRODUTO' AND p_grupo_produto_id IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'ESCOPO_GRUPO_OBRIGATORIO');
    END IF;
    IF p_tipo_inventario = 'ROTATIVO'      AND p_criterio_selecao IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'CRITERIO_ROTATIVO_OBRIGATORIO');
    END IF;

    IF p_tipo_inventario = 'ROTATIVO'
       AND p_criterio_selecao IN ('CURVA_VENDAS', 'CURVA_ACESSO')
       AND p_curva IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'CURVA_OBRIGATORIA');
    END IF;

    IF p_tipo_inventario = 'ROTATIVO'
       AND p_criterio_selecao IN ('CORTES', 'ESTORNOS')
       AND (p_data_inicio_analise IS NULL OR p_data_fim_analise IS NULL) THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'PERIODO_OBRIGATORIO');
    END IF;

    v_considerar_saldo := (p_tipo_execucao = 'ATUALIZACAO');

    INSERT INTO public.inventario (
        tenant_id, empresa_id, armazem_id, descricao, tipo_inventario, tipo_execucao,
        origem, status, criado_por, bloquear_movimentacao, considerar_saldo_atual,
        data_planejada, zona_atividade_id, endereco_id, produto_id, grupo_produto_id,
        criterio_selecao, curva, max_enderecos_dia, priorizar_picking,
        data_inicio_analise, data_fim_analise,
        total_itens, cursor_processamento, iniciado_em
    )
    VALUES (
        p_tenant_id, p_empresa_id, p_armazem_id, p_descricao, p_tipo_inventario, p_tipo_execucao,
        'MANUAL', 'CRIADO', p_usuario_id, p_bloquear_movimentacao, v_considerar_saldo,
        p_data_planejada, p_zona_atividade_id, p_endereco_id, p_produto_id, p_grupo_produto_id,
        p_criterio_selecao, p_curva, p_max_enderecos_dia, p_priorizar_picking,
        p_data_inicio_analise, p_data_fim_analise,
        0, 0, now()
    )
    RETURNING id INTO v_inventario_id;

    RETURN json_build_object(
        'sucesso', true,
        'inventario_id', v_inventario_id,
        'proximo_passo', 'fn_gerar_tarefas_inventario'
    );
END;
$function$;

-- 3) fn_gerar_tarefas_inventario: CORTES/ESTORNOS com período + enforcement do max_enderecos_dia
CREATE OR REPLACE FUNCTION public.fn_gerar_tarefas_inventario(
    p_tenant_id uuid,
    p_inventario_id uuid,
    p_chunk_size integer DEFAULT 200
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_inventario     RECORD;
    v_tipo_tarefa_id uuid;
    v_total_gerado   integer := 0;
    v_last_cursor    numeric;
    v_distintos_atual integer := 0;
    v_chunk_efetivo  integer;
    v_finalizado_max boolean := false;
BEGIN
    SELECT
        inv.id, inv.tenant_id, inv.empresa_id, inv.armazem_id,
        inv.tipo_inventario, inv.tipo_execucao, inv.bloquear_movimentacao,
        inv.considerar_saldo_atual, inv.zona_atividade_id, inv.endereco_id,
        inv.produto_id, inv.grupo_produto_id, inv.criterio_selecao, inv.curva,
        inv.priorizar_picking, inv.status,
        inv.max_enderecos_dia,
        inv.data_inicio_analise,
        inv.data_fim_analise,
        COALESCE(inv.cursor_processamento, 0) AS cursor_processamento
    INTO v_inventario
    FROM public.inventario inv
    WHERE inv.id = p_inventario_id AND inv.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'INVENTARIO_NAO_ENCONTRADO');
    END IF;

    IF v_inventario.status NOT IN ('CRIADO', 'GERANDO_TAREFAS') THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'INVENTARIO_STATUS_INVALIDO');
    END IF;

    SELECT tipo_tarefa_id INTO v_tipo_tarefa_id
    FROM public.inventario_tipo_tarefa
    WHERE tipo_execucao = v_inventario.tipo_execucao
      AND tenant_id     = p_tenant_id
    LIMIT 1;

    IF v_tipo_tarefa_id IS NULL THEN
        RETURN json_build_object('sucesso', false, 'codigo', 'TIPO_TAREFA_NAO_CONFIGURADO');
    END IF;

    UPDATE public.inventario
    SET status = 'GERANDO_TAREFAS', updated_at = now()
    WHERE id = p_inventario_id AND status = 'CRIADO';

    -- Enforcement do max_enderecos_dia
    v_chunk_efetivo := p_chunk_size;
    IF v_inventario.max_enderecos_dia IS NOT NULL THEN
        SELECT COUNT(DISTINCT id_local_origem)
          INTO v_distintos_atual
          FROM public.tarefa
         WHERE id_documento_origem = p_inventario_id
           AND tenant_id = p_tenant_id;

        IF v_distintos_atual >= v_inventario.max_enderecos_dia THEN
            UPDATE public.inventario
               SET status = 'EM_CONTAGEM', updated_at = now()
             WHERE id = p_inventario_id;
            RETURN json_build_object(
                'sucesso', true,
                'inventario_id', p_inventario_id,
                'tarefas_geradas', 0,
                'proximo_cursor', v_inventario.cursor_processamento,
                'finalizado', true
            );
        END IF;
    END IF;

    WITH dados_origem AS (
        SELECT
            eg.tenant_id, eg.empresa_id, eg.endereco_id, eg.produto_id, eg.quantidade_total,
            e.codigo_endereco,
            (
                COALESCE(oe.sequencia, 999) * 1000000 +
                COALESCE(e.predio, 0)       * 10000   +
                COALESCE(e.nivel, 0)        * 100     +
                COALESCE(e.apto, 0)
            )::numeric AS ordem_execucao
        FROM public.estoque_geral eg
        JOIN public.endereco e ON e.id = eg.endereco_id
        LEFT JOIN public.endereco_zona_atividade eza ON eza.endereco_id = e.id
        LEFT JOIN public.ordem_expedicao oe
          ON oe.rua = e.rua AND oe.tenant_id = eg.tenant_id
        LEFT JOIN public.produto prod
          ON prod.id = eg.produto_id AND prod.tenant_id = eg.tenant_id
        WHERE eg.tenant_id   = p_tenant_id
          AND eg.empresa_id  = v_inventario.empresa_id
          AND e.armazem_id   = v_inventario.armazem_id
          AND e.codigo_endereco > v_inventario.cursor_processamento
          AND (
                v_inventario.tipo_inventario = 'GERAL'
             OR (v_inventario.tipo_inventario = 'ZONA'
                 AND eza.zona_atividade_id = v_inventario.zona_atividade_id)
             OR (v_inventario.tipo_inventario = 'ENDERECO'
                 AND eg.endereco_id = v_inventario.endereco_id)
             OR (v_inventario.tipo_inventario = 'PRODUTO'
                 AND eg.produto_id = v_inventario.produto_id)
             OR (v_inventario.tipo_inventario = 'GRUPO_PRODUTO'
                 AND eg.produto_id IN (
                     SELECT id FROM public.produto
                     WHERE grupo_id = v_inventario.grupo_produto_id
                       AND tenant_id = p_tenant_id
                 ))
             OR (v_inventario.tipo_inventario = 'ROTATIVO'
                 AND (
                     (v_inventario.criterio_selecao = 'CURVA_VENDAS'
                      AND prod.curva_venda = v_inventario.curva)
                  OR (v_inventario.criterio_selecao = 'CURVA_ACESSO'
                      AND prod.curva_acesso = v_inventario.curva)
                  OR (v_inventario.criterio_selecao = 'CORTES'
                      AND eg.produto_id IN (
                          SELECT DISTINCT produto_id
                          FROM public.estoque_movimento
                          WHERE tenant_id  = p_tenant_id
                            AND empresa_id = v_inventario.empresa_id
                            AND tipo_movimento < 0
                            AND criado_em >= v_inventario.data_inicio_analise::timestamptz
                            AND criado_em <  (v_inventario.data_fim_analise + INTERVAL '1 day')
                      ))
                  OR (v_inventario.criterio_selecao = 'ESTORNOS'
                      AND eg.produto_id IN (
                          SELECT DISTINCT t.produto_id
                          FROM public.tarefa_execucao te
                          JOIN public.tarefa t ON t.id = te.tarefa_id
                          WHERE te.tenant_id = p_tenant_id
                            AND te.status = 'CANCELADA'
                            AND t.empresa_id = v_inventario.empresa_id
                            AND COALESCE(te.concluido_em, te.iniciado_em, te.atribuido_em)
                                >= v_inventario.data_inicio_analise::timestamptz
                            AND COALESCE(te.concluido_em, te.iniciado_em, te.atribuido_em)
                                <  (v_inventario.data_fim_analise + INTERVAL '1 day')
                      ))
                 ))
          )
        ORDER BY
            CASE WHEN v_inventario.priorizar_picking AND e.tipo_endereco = 'PICKING' THEN 0 ELSE 1 END,
            e.codigo_endereco, eg.produto_id
        LIMIT v_chunk_efetivo
        FOR UPDATE OF eg, e SKIP LOCKED
    ),
    dados_limitados AS (
        SELECT d.*
        FROM dados_origem d
        WHERE v_inventario.max_enderecos_dia IS NULL
           OR d.endereco_id IN (
                SELECT endereco_id
                FROM (
                    SELECT DISTINCT endereco_id, MIN(codigo_endereco) OVER (PARTITION BY endereco_id) cod
                    FROM dados_origem
                ) x
                ORDER BY cod
                LIMIT GREATEST(v_inventario.max_enderecos_dia - v_distintos_atual, 0)
           )
    ),
    tarefas_inseridas AS (
        INSERT INTO public.tarefa (
            id, tenant_id, empresa_id, armazem_id, tipo_documento_origem, tipo_tarefa_id,
            id_local_origem, produto_id, quantidade_requerida, id_documento_origem,
            ordem_tarefa, contagem_inventario, status, criado_em, criado_por
        )
        SELECT
            gen_random_uuid(), d.tenant_id, d.empresa_id, v_inventario.armazem_id,
            'INVENTARIO', v_tipo_tarefa_id, d.endereco_id, d.produto_id, d.quantidade_total,
            p_inventario_id, d.ordem_execucao, 1, 'CRIADA', now(), NULL
        FROM dados_limitados d
        RETURNING id_local_origem
    ),
    bloqueio AS (
        UPDATE public.endereco e
        SET situacao = 'BLOQUEADO_INVENTARIO'
        WHERE e.id IN (SELECT DISTINCT id_local_origem FROM tarefas_inseridas)
          AND v_inventario.bloquear_movimentacao = true
    )
    SELECT MAX(codigo_endereco), COUNT(*)::integer
    INTO v_last_cursor, v_total_gerado
    FROM dados_limitados;

    UPDATE public.inventario
    SET total_itens = COALESCE(total_itens, 0) + v_total_gerado,
        cursor_processamento = COALESCE(v_last_cursor, cursor_processamento),
        updated_at = now()
    WHERE id = p_inventario_id;

    -- Checa se atingiu o max_enderecos_dia após o chunk
    IF v_inventario.max_enderecos_dia IS NOT NULL THEN
        SELECT COUNT(DISTINCT id_local_origem) INTO v_distintos_atual
          FROM public.tarefa
         WHERE id_documento_origem = p_inventario_id
           AND tenant_id = p_tenant_id;
        v_finalizado_max := (v_distintos_atual >= v_inventario.max_enderecos_dia);
    END IF;

    IF v_total_gerado < v_chunk_efetivo OR v_finalizado_max THEN
        UPDATE public.inventario
        SET status = 'EM_CONTAGEM', updated_at = now()
        WHERE id = p_inventario_id;
    END IF;

    RETURN json_build_object(
        'sucesso', true,
        'inventario_id', p_inventario_id,
        'tarefas_geradas', v_total_gerado,
        'proximo_cursor', COALESCE(v_last_cursor, v_inventario.cursor_processamento),
        'finalizado', (v_total_gerado < v_chunk_efetivo OR v_finalizado_max)
    );
END;
$function$;
