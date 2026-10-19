-- =====================================================================
-- 2026-10-18 · Relatórios · Filtros de localização (Rua, Prédio, Nível, Apto)
--
-- 1. Índice de localização em endereco (serve aos relatórios de Posição de
--    Estoque e Histórico de Movimentações).
-- 2. rpc_historico_movimento_com_saldo ganha filtros opcionais:
--      p_armazem_id, p_rua, p_predio, p_nivel, p_apto
--    Regra: a movimentação entra quando o endereço de ORIGEM ou o de DESTINO
--    atende a TODOS os filtros de endereço informados (no mesmo endereço).
-- 3. SKU passa a aceitar busca parcial (antes exigia o SKU exato, e a tela
--    "Buscar SKU..." voltava vazia com parte do código).
-- 4. Checagem de tenant (assert_tenant_access) e desempate por id na ordenação
--    (paginação estável via .range()).
--
-- Compatibilidade: os novos parâmetros têm DEFAULT NULL, então a chamada atual
-- (6 parâmetros nomeados) continua funcionando. DROP + CREATE na mesma
-- transação para não existirem duas versões (ambiguidade no PostgREST).
-- =====================================================================

INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(),
       'public.rpc_historico_movimento_com_saldo(uuid,uuid,date,date,text,smallint)',
       pg_get_functiondef('public.rpc_historico_movimento_com_saldo(uuid,uuid,date,date,text,smallint)'::regprocedure),
       'Antes de 20261018220000_rpc_historico_movimento_filtro_endereco',
       now();

CREATE INDEX IF NOT EXISTS idx_endereco_localizacao
  ON public.endereco (tenant_id, armazem_id, rua, predio, nivel, apto);

DROP FUNCTION public.rpc_historico_movimento_com_saldo(uuid, uuid, date, date, text, smallint);

CREATE FUNCTION public.rpc_historico_movimento_com_saldo(
  p_tenant_id   uuid,
  p_empresa_id  uuid,
  p_data_inicio date,
  p_data_fim    date,
  p_sku         text     DEFAULT NULL,
  p_tipo_mov    smallint DEFAULT NULL,
  p_armazem_id  uuid     DEFAULT NULL,
  p_rua         integer  DEFAULT NULL,
  p_predio      integer  DEFAULT NULL,
  p_nivel       integer  DEFAULT NULL,
  p_apto        integer  DEFAULT NULL
)
RETURNS TABLE(
  id uuid, criado_em timestamp with time zone, tipo_movimento smallint, quantidade numeric,
  lote text, hu_id uuid, sku text, produto_descricao text,
  endereco_origem text, endereco_destino text, usuario_nome text,
  tipo_documento_origem text, tipo_tarefa_codigo text, tipo_tarefa_descricao text,
  tarefa_execucao_id uuid, tarefa_execucao_status text,
  saldo_anterior_origem numeric, saldo_posterior_origem numeric,
  saldo_anterior_destino numeric, saldo_posterior_destino numeric,
  saldo_inicial numeric, saldo_final numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_sku        text    := NULLIF(btrim(p_sku), '');
  v_filtra_end boolean := p_armazem_id IS NOT NULL OR p_rua IS NOT NULL OR p_predio IS NOT NULL
                          OR p_nivel IS NOT NULL OR p_apto IS NOT NULL;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);

  RETURN QUERY
  SELECT
    em.id,
    em.criado_em,
    em.tipo_movimento,
    em.quantidade,
    em.lote,
    em.hu_id,
    p.sku,
    p.descricao AS produto_descricao,
    eo.descricao AS endereco_origem,
    ed.descricao AS endereco_destino,
    u.nome       AS usuario_nome,
    t.tipo_documento_origem,
    tt.codigo    AS tipo_tarefa_codigo,
    tt.descricao AS tipo_tarefa_descricao,
    em.tarefa_execucao_id,
    te.status::text AS tarefa_execucao_status,
    em.saldo_anterior_origem,
    em.saldo_posterior_origem,
    em.saldo_anterior_destino,
    em.saldo_posterior_destino,

    CASE
      WHEN em.tipo_movimento IN (2, 5) THEN COALESCE(em.saldo_anterior_origem, 0)
      WHEN em.tipo_movimento IN (1, 4, 99) THEN COALESCE(em.saldo_anterior_destino, 0)
      WHEN em.tipo_movimento = 3 THEN
        CASE
          WHEN em.endereco_origem_id IS NOT NULL AND em.endereco_destino_id IS NOT NULL
            THEN COALESCE(em.saldo_anterior_origem, 0)
          WHEN em.endereco_destino_id IS NOT NULL
            THEN COALESCE(em.saldo_anterior_destino, 0)
          ELSE COALESCE(em.saldo_anterior_origem, 0)
        END
      ELSE 0
    END AS saldo_inicial,

    CASE
      WHEN em.tipo_movimento IN (2, 5) THEN COALESCE(em.saldo_posterior_origem, 0)
      WHEN em.tipo_movimento IN (1, 4, 99) THEN COALESCE(em.saldo_posterior_destino, 0)
      WHEN em.tipo_movimento = 3 THEN
        CASE
          WHEN em.endereco_origem_id IS NOT NULL AND em.endereco_destino_id IS NOT NULL
            THEN COALESCE(em.saldo_posterior_origem, 0)
          WHEN em.endereco_destino_id IS NOT NULL
            THEN COALESCE(em.saldo_posterior_destino, 0)
          ELSE COALESCE(em.saldo_posterior_origem, 0)
        END
      ELSE 0
    END AS saldo_final

  FROM estoque_movimento em
  LEFT JOIN produto         p  ON p.id  = em.produto_id
  LEFT JOIN endereco        eo ON eo.id = em.endereco_origem_id
  LEFT JOIN endereco        ed ON ed.id = em.endereco_destino_id
  LEFT JOIN usuario         u  ON u.id  = em.usuario_id
  LEFT JOIN tarefa_execucao te ON te.id = em.tarefa_execucao_id
  LEFT JOIN tarefa          t  ON t.id  = te.tarefa_id
  LEFT JOIN tipo_tarefa     tt ON tt.id = t.tipo_tarefa_id
  WHERE em.tenant_id  = p_tenant_id
    AND (p_empresa_id IS NULL OR em.empresa_id = p_empresa_id)
    AND em.criado_em >= p_data_inicio::timestamptz
    AND em.criado_em <  (p_data_fim + INTERVAL '1 day')
    AND (v_sku       IS NULL OR strpos(lower(p.sku), lower(v_sku)) > 0)
    AND (p_tipo_mov  IS NULL OR em.tipo_movimento = p_tipo_mov)
    AND (
      NOT v_filtra_end
      OR (eo.id IS NOT NULL
          AND (p_armazem_id IS NULL OR eo.armazem_id = p_armazem_id)
          AND (p_rua        IS NULL OR eo.rua        = p_rua)
          AND (p_predio     IS NULL OR eo.predio     = p_predio)
          AND (p_nivel      IS NULL OR eo.nivel      = p_nivel)
          AND (p_apto       IS NULL OR eo.apto       = p_apto))
      OR (ed.id IS NOT NULL
          AND (p_armazem_id IS NULL OR ed.armazem_id = p_armazem_id)
          AND (p_rua        IS NULL OR ed.rua        = p_rua)
          AND (p_predio     IS NULL OR ed.predio     = p_predio)
          AND (p_nivel      IS NULL OR ed.nivel      = p_nivel)
          AND (p_apto       IS NULL OR ed.apto       = p_apto))
    )
  ORDER BY em.criado_em DESC, em.id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_historico_movimento_com_saldo(uuid, uuid, date, date, text, smallint, uuid, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_historico_movimento_com_saldo(uuid, uuid, date, date, text, smallint, uuid, integer, integer, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
