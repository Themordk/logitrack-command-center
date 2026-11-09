-- =====================================================================
-- 2026-11-09 · Relatórios · Histórico de Movimentações · Saldo GLOBAL do SKU
--
-- O que muda em rpc_historico_movimento_com_saldo:
-- 1. Duas novas colunas de retorno:
--      saldo_global_anterior  — saldo TOTAL do SKU na empresa antes do movimento
--      saldo_global_posterior — saldo TOTAL do SKU na empresa depois do movimento
--    "Global" = soma de estoque_geral.quantidade_total (inclui bloqueado) em
--    TODOS os endereços e armazéns da empresa.
-- 2. SKU passa a ser OBRIGATÓRIO e com busca EXATA (sem diferenciar maiúsculas
--    e espaços nas pontas). A tela já exigia SKU exato e filtrava no front.
-- 3. Ajuste de inventário aparece como tipo 6 (Inventário). Movimentos antigos
--    gravados como tipo 3 + documento INVENTARIO são exibidos/filtrados como 6.
--    Nos ajustes POSITIVOS antigos o saldo do endereço estava nas colunas de
--    origem; a leitura passa a exibi-lo nas colunas de destino.
-- 4. Doc. Origem passa a vir do próprio movimento (antes vinha só da tarefa,
--    e estornos — que não têm tarefa — saíam com "—"). Estornos da limpeza de
--    separação antigos (sem documento gravado) são exibidos como
--    LIMPEZA_SEPARACAO_ITEM.
-- 5. Nova coluna estorno_da_execucao_id; para estornos, os dados de tarefa
--    (código, status, execução) vêm da execução ORIGINAL que foi estornada.
--
-- Como o saldo global é calculado (sem gravar nada no ledger):
--   Parte do saldo ATUAL do SKU (estoque_geral) e "volta no tempo" desfazendo
--   o efeito de cada movimento, do mais recente para o mais antigo:
--     efeito  = +qtd se há endereço de destino, −qtd se há endereço de origem
--               (Entrada/Estorno somam; Saída subtrai; Transferência = 0;
--                Ajuste de inventário soma ou subtrai conforme o lado)
--     posterior(m) = saldo_atual − Σ efeito dos movimentos DEPOIS de m
--     anterior(m)  = posterior(m) − efeito(m)
--   Regra validada em 09/11/2026: o ledger somado bate com estoque_geral em
--   25.201 de 25.205 SKUs (os 4 divergentes são SKUs de teste).
--
-- IMPORTANTE: período, tipo e endereço são aplicados DEPOIS do cálculo — o
-- saldo global sempre considera o histórico completo do SKU.
--
-- Desempate: movimentos no mesmo instante são ordenados por id (mesma ordem
-- da tela), então a cadeia anterior→posterior fica sempre coerente.
--
-- Compatibilidade: mesmos parâmetros da versão de 20261018220000; colunas
-- antigas mantidas. DROP + CREATE porque o RETURNS TABLE mudou.
-- Reversão: recriar a definição salva em integracao.bkp_funcao_definicao.
-- =====================================================================

INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(),
       'public.rpc_historico_movimento_com_saldo(uuid,uuid,date,date,text,smallint,uuid,integer,integer,integer,integer)',
       pg_get_functiondef('public.rpc_historico_movimento_com_saldo(uuid,uuid,date,date,text,smallint,uuid,integer,integer,integer,integer)'::regprocedure),
       'Antes de 20261109182332_rpc_historico_movimento_saldo_global',
       now();

-- Busca exata de SKU (sem diferenciar maiúsculas/espaços). O histórico do
-- produto já é servido por idx_estoque_movimento_produto_id
-- (tenant_id, produto_id, criado_em DESC) — medido: ~1 ms para o SKU com
-- mais movimentos (90).
CREATE INDEX IF NOT EXISTS idx_produto_sku_exato
  ON public.produto (tenant_id, empresa_id, lower(btrim(sku)));

DROP FUNCTION public.rpc_historico_movimento_com_saldo(uuid, uuid, date, date, text, smallint, uuid, integer, integer, integer, integer);

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
  saldo_inicial numeric, saldo_final numeric,
  saldo_global_anterior numeric, saldo_global_posterior numeric,
  estorno_da_execucao_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_sku        text    := lower(NULLIF(btrim(p_sku), ''));
  v_filtra_end boolean := p_armazem_id IS NOT NULL OR p_rua IS NOT NULL OR p_predio IS NOT NULL
                          OR p_nivel IS NOT NULL OR p_apto IS NOT NULL;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório';
  END IF;
  IF v_sku IS NULL THEN
    RAISE EXCEPTION 'SKU obrigatório para o histórico de movimentações';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);

  RETURN QUERY
  WITH produtos AS (
    SELECT pr.id, pr.sku, pr.descricao
    FROM produto pr
    WHERE pr.tenant_id = p_tenant_id
      AND (p_empresa_id IS NULL OR pr.empresa_id = p_empresa_id)
      AND lower(btrim(pr.sku)) = v_sku
  ),
  saldo_atual AS (
    SELECT eg.empresa_id, eg.produto_id, SUM(eg.quantidade_total) AS saldo
    FROM estoque_geral eg
    JOIN produtos pr ON pr.id = eg.produto_id
    WHERE eg.tenant_id = p_tenant_id
      AND (p_empresa_id IS NULL OR eg.empresa_id = p_empresa_id)
    GROUP BY eg.empresa_id, eg.produto_id
  ),
  efeitos AS (
    SELECT em.*,
           (CASE WHEN em.endereco_destino_id IS NOT NULL THEN em.quantidade ELSE 0 END)
         - (CASE WHEN em.endereco_origem_id  IS NOT NULL THEN em.quantidade ELSE 0 END) AS efeito_global,
           (em.tipo_documento_origem = 'INVENTARIO')                                   AS eh_inventario,
           CASE WHEN em.tipo_documento_origem = 'INVENTARIO' THEN 6::smallint
                ELSE em.tipo_movimento END                                             AS tipo_efetivo
    FROM estoque_movimento em
    JOIN produtos pr ON pr.id = em.produto_id
    WHERE em.tenant_id = p_tenant_id
      AND (p_empresa_id IS NULL OR em.empresa_id = p_empresa_id)
  ),
  historico AS (
    SELECT ef.*,
           -- Σ efeitos deste movimento e de todos os posteriores (mais recente primeiro)
           SUM(ef.efeito_global) OVER (
             PARTITION BY ef.empresa_id, ef.produto_id
             ORDER BY ef.criado_em DESC, ef.id DESC
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS efeito_acumulado
    FROM efeitos ef
  )
  SELECT
    h.id,
    h.criado_em,
    h.tipo_efetivo AS tipo_movimento,
    h.quantidade,
    h.lote,
    h.hu_id,
    pr.sku,
    pr.descricao AS produto_descricao,
    eo.descricao AS endereco_origem,
    ed.descricao AS endereco_destino,
    u.nome       AS usuario_nome,
    COALESCE(
      h.tipo_documento_origem,
      CASE WHEN h.tipo_movimento = 99 AND h.estorno_da_execucao_id IS NOT NULL
           THEN 'LIMPEZA_SEPARACAO_ITEM' END,
      t.tipo_documento_origem
    ) AS tipo_documento_origem,
    tt.codigo    AS tipo_tarefa_codigo,
    tt.descricao AS tipo_tarefa_descricao,
    COALESCE(h.tarefa_execucao_id, h.estorno_da_execucao_id) AS tarefa_execucao_id,
    te.status::text AS tarefa_execucao_status,
    -- Ajuste positivo de inventário antigo: saldo estava gravado em "origem"
    CASE WHEN h.eh_inventario AND h.endereco_origem_id IS NULL THEN NULL
         ELSE h.saldo_anterior_origem END AS saldo_anterior_origem,
    CASE WHEN h.eh_inventario AND h.endereco_origem_id IS NULL THEN NULL
         ELSE h.saldo_posterior_origem END AS saldo_posterior_origem,
    CASE WHEN h.eh_inventario AND h.endereco_destino_id IS NOT NULL
         THEN COALESCE(h.saldo_anterior_destino, h.saldo_anterior_origem)
         ELSE h.saldo_anterior_destino END AS saldo_anterior_destino,
    CASE WHEN h.eh_inventario AND h.endereco_destino_id IS NOT NULL
         THEN COALESCE(h.saldo_posterior_destino, h.saldo_posterior_origem)
         ELSE h.saldo_posterior_destino END AS saldo_posterior_destino,

    CASE
      WHEN h.eh_inventario AND h.endereco_destino_id IS NOT NULL
        THEN COALESCE(h.saldo_anterior_destino, h.saldo_anterior_origem, 0)
      WHEN h.eh_inventario THEN COALESCE(h.saldo_anterior_origem, 0)
      WHEN h.tipo_movimento IN (2, 5) THEN COALESCE(h.saldo_anterior_origem, 0)
      WHEN h.tipo_movimento IN (1, 4, 99) THEN COALESCE(h.saldo_anterior_destino, 0)
      WHEN h.tipo_movimento = 3 THEN
        CASE
          WHEN h.endereco_origem_id IS NOT NULL AND h.endereco_destino_id IS NOT NULL
            THEN COALESCE(h.saldo_anterior_origem, 0)
          WHEN h.endereco_destino_id IS NOT NULL
            THEN COALESCE(h.saldo_anterior_destino, 0)
          ELSE COALESCE(h.saldo_anterior_origem, 0)
        END
      ELSE 0
    END AS saldo_inicial,

    CASE
      WHEN h.eh_inventario AND h.endereco_destino_id IS NOT NULL
        THEN COALESCE(h.saldo_posterior_destino, h.saldo_posterior_origem, 0)
      WHEN h.eh_inventario THEN COALESCE(h.saldo_posterior_origem, 0)
      WHEN h.tipo_movimento IN (2, 5) THEN COALESCE(h.saldo_posterior_origem, 0)
      WHEN h.tipo_movimento IN (1, 4, 99) THEN COALESCE(h.saldo_posterior_destino, 0)
      WHEN h.tipo_movimento = 3 THEN
        CASE
          WHEN h.endereco_origem_id IS NOT NULL AND h.endereco_destino_id IS NOT NULL
            THEN COALESCE(h.saldo_posterior_origem, 0)
          WHEN h.endereco_destino_id IS NOT NULL
            THEN COALESCE(h.saldo_posterior_destino, 0)
          ELSE COALESCE(h.saldo_posterior_origem, 0)
        END
      ELSE 0
    END AS saldo_final,

    COALESCE(sa.saldo, 0) - h.efeito_acumulado                      AS saldo_global_anterior,
    COALESCE(sa.saldo, 0) - h.efeito_acumulado + h.efeito_global    AS saldo_global_posterior,
    h.estorno_da_execucao_id

  FROM historico h
  JOIN produtos pr               ON pr.id = h.produto_id
  LEFT JOIN saldo_atual sa       ON sa.empresa_id = h.empresa_id AND sa.produto_id = h.produto_id
  LEFT JOIN endereco        eo   ON eo.id = h.endereco_origem_id
  LEFT JOIN endereco        ed   ON ed.id = h.endereco_destino_id
  LEFT JOIN usuario         u    ON u.id  = h.usuario_id
  LEFT JOIN tarefa_execucao te   ON te.id = COALESCE(h.tarefa_execucao_id, h.estorno_da_execucao_id)
  LEFT JOIN tarefa          t    ON t.id  = te.tarefa_id
  LEFT JOIN tipo_tarefa     tt   ON tt.id = t.tipo_tarefa_id
  WHERE h.criado_em >= p_data_inicio::timestamptz
    AND h.criado_em <  (p_data_fim + INTERVAL '1 day')
    AND (p_tipo_mov IS NULL OR h.tipo_efetivo = p_tipo_mov)
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
  ORDER BY h.criado_em DESC, h.id DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_historico_movimento_com_saldo(uuid, uuid, date, date, text, smallint, uuid, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_historico_movimento_com_saldo(uuid, uuid, date, date, text, smallint, uuid, integer, integer, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
