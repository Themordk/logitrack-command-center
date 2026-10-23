-- =====================================================================
-- CORE LogiTrack — Produtos: filtros avançados + exportação
-- Data: 2026-10-22
-- Rota: /dados-mestres/produtos
--
-- Conteúdo:
--   1. Índices de apoio em produto_embalagem (tem_ean, filtro "sem EAN", busca por EAN)
--   2. RPC public.rpc_produto_listagem (listagem paginada + exportação)
--   3. Correção de drift: vw_produto_listagem com security_invoker e sem grant a anon
--   4. Remoção da policy RLS duplicada em produto
--
-- Observações de deploy:
--   * Os índices abaixo NÃO usam CONCURRENTLY porque migrations rodam em transação.
--     Em produção, rode antes (fora do horário de pico) pelo SQL Editor:
--       CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_produto_embalagem_produto_ativo
--         ON public.produto_embalagem (produto_id)
--         WHERE ativo = true AND ean IS NOT NULL AND ean <> '';
--       CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_produto_embalagem_ean_trgm
--         ON public.produto_embalagem USING gin (ean gin_trgm_ops);
--     Depois, esta migration apenas confirma (IF NOT EXISTS) e segue.
--   * Após aplicar, rode separadamente (fora de transação):
--       VACUUM (ANALYZE) public.produto;
--       VACUUM (ANALYZE) public.produto_embalagem;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Índices
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- EXISTS por produto (tem_ean / filtro "sem código de barras")
CREATE INDEX IF NOT EXISTS idx_produto_embalagem_produto_ativo
  ON public.produto_embalagem (produto_id)
  WHERE ativo = true AND ean IS NOT NULL AND ean <> '';

-- Busca parcial por EAN (ilike '%...%')
CREATE INDEX IF NOT EXISTS idx_produto_embalagem_ean_trgm
  ON public.produto_embalagem USING gin (ean gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 2. RPC de listagem
-- ---------------------------------------------------------------------
-- SECURITY INVOKER: a RLS de produto/parceiro/grupo/subgrupo/embalagem continua valendo.
-- SQL dinâmico com parâmetros ($n via USING): monta só os predicados usados,
-- evitando plano genérico ruim com "(param IS NULL OR ...)". Sem concatenação
-- de valores do usuário — sem risco de SQL injection.
DROP FUNCTION IF EXISTS public.rpc_produto_listagem(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text, boolean, integer, integer
);
DROP FUNCTION IF EXISTS public.rpc_produto_listagem(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text, boolean, integer, integer, boolean
);

CREATE OR REPLACE FUNCTION public.rpc_produto_listagem(
  p_tenant_id    uuid,
  p_empresa_id   uuid,
  p_sku          text    DEFAULT NULL,
  p_descricao    text    DEFAULT NULL,
  p_referencia   text    DEFAULT NULL,
  p_parceiro_id  uuid    DEFAULT NULL,
  p_grupo_id     uuid    DEFAULT NULL,
  p_subgrupo_id  uuid    DEFAULT NULL,
  p_marca        text    DEFAULT NULL,
  p_ean          text    DEFAULT NULL,
  p_sem_ean      boolean DEFAULT false,
  p_limit        integer DEFAULT 15,
  p_offset       integer DEFAULT 0,
  p_com_total    boolean DEFAULT true
)
RETURNS TABLE (
  id                 uuid,
  tenant_id          uuid,
  empresa_id         uuid,
  grupo_id           uuid,
  subgrupo_id        uuid,
  parceiro_id        uuid,
  sku                text,
  descricao          text,
  referencia         text,
  marca              text,
  curva_venda        public.enum_curva,
  curva_acesso       public.enum_curva,
  foto               text,
  url_imagem         text,
  preco_custo        numeric,
  tipo_controle      public.enum_tipo_controle,
  peso_variavel      boolean,
  tolerancia         numeric,
  peso_bruto         numeric,
  peso_liquido       numeric,
  dias_shelf         integer,
  shelf_entrada      numeric,
  shelf_devolucao    numeric,
  lastro             integer,
  camada             integer,
  fator_caixa        integer,
  usa_picking        boolean,
  tipo_separacao     public.enum_tipo_separacao,
  varios_pickings    boolean,
  ativo              boolean,
  codigo_erp         text,
  tem_ean            boolean,
  parceiro_nome      text,
  grupo_descricao    text,
  subgrupo_descricao text,
  total_count        bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sku        text := NULLIF(btrim(p_sku), '');
  v_descricao  text := NULLIF(btrim(p_descricao), '');
  v_referencia text := NULLIF(btrim(p_referencia), '');
  v_marca      text := NULLIF(btrim(p_marca), '');
  v_ean        text := NULLIF(regexp_replace(COALESCE(p_ean, ''), '\s', '', 'g'), '');
  v_limit      integer := LEAST(GREATEST(COALESCE(p_limit, 15), 1), 1000);
  v_offset     integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_where      text := 'p.tenant_id = $1 AND p.empresa_id = $2';
  v_total_expr text;
  v_sql        text;
BEGIN
  -- Validação de contexto (multi-tenant)
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id e empresa_id são obrigatórios'
      USING ERRCODE = '22023';
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.get_current_tenant() THEN
    RAISE EXCEPTION 'Acesso negado ao tenant informado'
      USING ERRCODE = '42501';
  END IF;

  -- Filtros textuais (índices trigram em sku/descricao/referencia)
  IF v_sku IS NOT NULL THEN
    v_where := v_where || ' AND p.sku ILIKE ''%'' || $3 || ''%''';
  END IF;
  IF v_descricao IS NOT NULL THEN
    v_where := v_where || ' AND p.descricao ILIKE ''%'' || $4 || ''%''';
  END IF;
  IF v_referencia IS NOT NULL THEN
    v_where := v_where || ' AND p.referencia ILIKE ''%'' || $5 || ''%''';
  END IF;

  -- Filtros por FK
  IF p_parceiro_id IS NOT NULL THEN
    v_where := v_where || ' AND p.parceiro_id = $6';
  END IF;
  IF p_grupo_id IS NOT NULL THEN
    v_where := v_where || ' AND p.grupo_id = $7';
  END IF;
  IF p_subgrupo_id IS NOT NULL THEN
    v_where := v_where || ' AND p.subgrupo_id = $8';
  END IF;

  -- Marca (mesmo critério de fn_produto_marcas_distintas: trim)
  IF v_marca IS NOT NULL THEN
    v_where := v_where || ' AND btrim(p.marca) = $9';
  END IF;

  -- EAN: só dígitos e >= 8 caracteres => exato (índice tenant_id+ean); senão parcial (trigram)
  IF v_ean IS NOT NULL THEN
    IF v_ean ~ '^\d{8,}$' THEN
      v_where := v_where || ' AND p.id IN (SELECT pe.produto_id FROM produto_embalagem pe'
                         || ' WHERE pe.tenant_id = $1 AND pe.ativo = true AND pe.ean = $10)';
    ELSE
      v_where := v_where || ' AND p.id IN (SELECT pe.produto_id FROM produto_embalagem pe'
                         || ' WHERE pe.tenant_id = $1 AND pe.ativo = true'
                         || ' AND pe.ean ILIKE ''%'' || $10 || ''%'')';
    END IF;
  END IF;

  -- Sem código de barras (mesmo critério do totalizador da tela: apenas ativos)
  IF COALESCE(p_sem_ean, false) THEN
    v_where := v_where || ' AND p.ativo = true AND NOT EXISTS (SELECT 1 FROM produto_embalagem pe'
                       || ' WHERE pe.produto_id = p.id AND pe.ativo = true'
                       || ' AND pe.ean IS NOT NULL AND pe.ean <> '''')';
  END IF;

  -- Total filtrado na mesma passada (count(*) OVER ()). Medido em produção: uma
  -- passada só é ~2x mais rápida que count + página separados quando há filtro de texto.
  -- A exportação passa p_com_total = false a partir do 2º bloco (evita recontar).
  v_total_expr := CASE WHEN COALESCE(p_com_total, true)
                       THEN 'count(*) OVER ()'
                       ELSE 'NULL::bigint' END;

  v_sql := format($q$
    WITH pagina AS (
      SELECT p.id, p.descricao, %s AS total_count
        FROM produto p
       WHERE %s
       ORDER BY p.descricao, p.id
       LIMIT $11 OFFSET $12
    )
    SELECT
      p.id, p.tenant_id, p.empresa_id, p.grupo_id, p.subgrupo_id, p.parceiro_id,
      p.sku, p.descricao, p.referencia, p.marca,
      p.curva_venda, p.curva_acesso, p.foto, p.url_imagem, p.preco_custo,
      p.tipo_controle, p.peso_variavel, p.tolerancia, p.peso_bruto, p.peso_liquido,
      p.dias_shelf, p.shelf_entrada, p.shelf_devolucao, p.lastro, p.camada, p.fator_caixa,
      p.usa_picking, p.tipo_separacao, p.varios_pickings, p.ativo, p.codigo_erp,
      EXISTS (
        SELECT 1 FROM produto_embalagem pe
         WHERE pe.produto_id = p.id AND pe.ativo = true
           AND pe.ean IS NOT NULL AND pe.ean <> ''
      ) AS tem_ean,
      pa.razaosocial  AS parceiro_nome,
      g.descricao     AS grupo_descricao,
      sg.descricao    AS subgrupo_descricao,
      pg.total_count
    FROM pagina pg
    JOIN produto p                ON p.id  = pg.id
    LEFT JOIN parceiro pa         ON pa.id = p.parceiro_id
    LEFT JOIN grupo_produto g     ON g.id  = p.grupo_id
    LEFT JOIN subgrupo_produto sg ON sg.id = p.subgrupo_id
    ORDER BY pg.descricao, pg.id
  $q$, v_total_expr, v_where);

  RETURN QUERY EXECUTE v_sql
    USING p_tenant_id,      -- $1
          p_empresa_id,     -- $2
          v_sku,            -- $3
          v_descricao,      -- $4
          v_referencia,     -- $5
          p_parceiro_id,    -- $6
          p_grupo_id,       -- $7
          p_subgrupo_id,    -- $8
          v_marca,          -- $9
          v_ean,            -- $10
          v_limit,          -- $11
          v_offset;         -- $12
END;
$$;

COMMENT ON FUNCTION public.rpc_produto_listagem(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text, boolean, integer, integer, boolean
) IS 'Listagem paginada de produtos (/dados-mestres/produtos) com filtros por SKU, descrição, referência, parceiro, grupo, subgrupo, marca, EAN e sem-EAN. Ordenação estável (descricao, id). total_count = total filtrado (NULL quando p_com_total = false). p_limit máx. 1000.';

REVOKE ALL ON FUNCTION public.rpc_produto_listagem(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text, boolean, integer, integer, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_produto_listagem(
  uuid, uuid, text, text, text, uuid, uuid, uuid, text, text, boolean, integer, integer, boolean
) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Drift da view: a migration 20260723163151 recriou a view sem
--    security_invoker e com GRANT a anon. Produção já foi corrigida
--    manualmente; isto garante o mesmo estado em qualquer ambiente.
-- ---------------------------------------------------------------------
ALTER VIEW public.vw_produto_listagem SET (security_invoker = true);
REVOKE ALL ON public.vw_produto_listagem FROM anon;

-- ---------------------------------------------------------------------
-- 4. Policy duplicada em produto (mesma regra avaliada duas vezes)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'produto' AND policyname = 'tenant_full_access')
     AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'produto' AND policyname = 'tenant_full_access_produto') THEN
    DROP POLICY "tenant_full_access_produto" ON public.produto;
  END IF;
END;
$$;
