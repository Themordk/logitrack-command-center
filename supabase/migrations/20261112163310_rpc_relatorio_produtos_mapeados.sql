-- =====================================================================
-- 2026-11-12 · Relatórios · Produtos Mapeados em Picking — RPC server-side
-- Aplicada em produção como versão 20261112163310.
--
-- Substitui produtosMapeados.service.ts, que baixava TODOS os picking_produto
-- ativos da empresa (páginas de 1000, sequenciais, sem ORDER BY, com embeds de
-- produto → parceiro e endereco) e filtrava SKU/marca/parceiro no navegador.
-- Medido em produção: 7 requisições, ~8 s no tenant com 6.875 mapeamentos.
--
-- Regras:
--  1. Mapeamentos ativos (picking_produto.ativo) da empresa; armazém opcional.
--  2. Filtros: SKU (parcial), marca (exata, vem da lista de marcas), parceiro,
--     endereço (rua/prédio/nível/apto) e intervalo da data do mapeamento.
--  3. Data do mapeamento = picking_produto.created_at; usuário = created_by
--     (usuario.id), gravados por fn_audit_criacao no INSERT. Mapeamentos
--     anteriores à auditoria não têm data/usuário: aparecem com "—" e ficam
--     fora quando há filtro de data. O filtro compara a data no fuso p_fuso.
--  4. Ordem: SKU, endereço, id (paginação estável).
--  5. p_empresa_id obrigatório.
--
-- Retorno: linhas paginadas (p_limit/p_offset) + total_registros em cada linha.
-- Segurança: SECURITY INVOKER (RLS vale) + assert_tenant_access.
-- Índices: nenhum novo (~7 mil mapeamentos no maior tenant).
-- =====================================================================

DROP FUNCTION IF EXISTS public.rpc_relatorio_produtos_mapeados(
  uuid, uuid, uuid, text, text, uuid, date, date, integer, integer, integer, integer, integer, integer, text
);

CREATE FUNCTION public.rpc_relatorio_produtos_mapeados(
  p_tenant_id      uuid,
  p_empresa_id     uuid,
  p_armazem_id     uuid    DEFAULT NULL,
  p_sku            text    DEFAULT NULL,   -- busca parcial
  p_marca          text    DEFAULT NULL,   -- exata (sem diferenciar maiúsculas)
  p_parceiro_id    uuid    DEFAULT NULL,
  p_data_inicio    date    DEFAULT NULL,   -- data do mapeamento (inclusive)
  p_data_fim       date    DEFAULT NULL,   -- data do mapeamento (inclusive)
  p_rua            integer DEFAULT NULL,
  p_predio         integer DEFAULT NULL,
  p_nivel          integer DEFAULT NULL,
  p_apto           integer DEFAULT NULL,
  p_limit          integer DEFAULT 100,
  p_offset         integer DEFAULT 0,
  p_fuso           text    DEFAULT 'America/Fortaleza'
)
RETURNS TABLE(
  picking_id          uuid,
  produto_id          uuid,
  sku                 text,
  referencia          text,
  descricao           text,
  marca               text,
  parceiro_id         uuid,
  parceiro_nome       text,
  endereco_id         uuid,
  endereco_descricao  text,
  rua                 integer,
  predio              integer,
  nivel               integer,
  apto                integer,
  est_minimo          numeric,
  est_maximo          numeric,
  tipo_picking        text,
  mapeado_em          timestamptz,
  mapeado_por         text,
  total_registros     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_sku   text := NULLIF(btrim(p_sku), '');
  v_marca text := NULLIF(btrim(p_marca), '');
  v_fuso  text := COALESCE(NULLIF(btrim(p_fuso), ''), 'America/Fortaleza');
  v_ini   timestamptz;
  v_fim   timestamptz;
BEGIN
  -- ---------- validações ----------
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatório' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL AND p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Data final não pode ser anterior à data inicial' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit deve estar entre 1 e 1000' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset não pode ser negativo' USING ERRCODE = '22023';
  END IF;
  BEGIN
    -- [início 00:00, fim+1 00:00) no fuso local, para comparar com created_at.
    v_ini := CASE WHEN p_data_inicio IS NULL THEN NULL
                  ELSE p_data_inicio::timestamp AT TIME ZONE v_fuso END;
    v_fim := CASE WHEN p_data_fim IS NULL THEN NULL
                  ELSE (p_data_fim + 1)::timestamp AT TIME ZONE v_fuso END;
    PERFORM now() AT TIME ZONE v_fuso;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Fuso horário inválido: %', v_fuso USING ERRCODE = '22023';
  END;

  RETURN QUERY
  WITH base AS MATERIALIZED (
    SELECT pp.id, pp.produto_id, pp.endereco_id, pp.created_at, pp.created_by,
           p.sku, e.descricao AS end_desc
    FROM picking_produto pp
    JOIN produto p       ON p.id = pp.produto_id
    LEFT JOIN endereco e ON e.id = pp.endereco_id
    WHERE pp.tenant_id  = p_tenant_id
      AND pp.empresa_id = p_empresa_id
      AND pp.ativo
      AND (p_armazem_id  IS NULL OR pp.armazem_id = p_armazem_id)
      AND (v_sku         IS NULL OR p.sku ILIKE '%' || v_sku || '%')
      AND (v_marca       IS NULL OR lower(p.marca) = lower(v_marca))
      AND (p_parceiro_id IS NULL OR p.parceiro_id = p_parceiro_id)
      AND (p_rua         IS NULL OR e.rua    = p_rua)
      AND (p_predio      IS NULL OR e.predio = p_predio)
      AND (p_nivel       IS NULL OR e.nivel  = p_nivel)
      AND (p_apto        IS NULL OR e.apto   = p_apto)
      AND (v_ini         IS NULL OR pp.created_at >= v_ini)
      AND (v_fim         IS NULL OR pp.created_at <  v_fim)
  ),
  pagina AS (
    SELECT b.*,
           count(*) OVER () AS total,
           row_number() OVER (ORDER BY b.sku, b.end_desc NULLS LAST, b.id) AS rn
    FROM base b
    ORDER BY rn
    LIMIT p_limit OFFSET p_offset
  )
  -- Descrições, parceiro e usuário só para as linhas da página.
  SELECT pg.id, pg.produto_id, p.sku, p.referencia, p.descricao, p.marca,
         p.parceiro_id, pa.razaosocial,
         pg.endereco_id, COALESCE(e.descricao, ''),
         e.rua, e.predio, e.nivel, e.apto,
         COALESCE(pp.est_minimo, 0), COALESCE(pp.est_maximo, 0), COALESCE(pp.tipo_picking::text, ''),
         pg.created_at, u.nome,
         pg.total
  FROM pagina pg
  JOIN picking_produto pp ON pp.id = pg.id
  JOIN produto p          ON p.id  = pg.produto_id
  LEFT JOIN parceiro pa   ON pa.id = p.parceiro_id
  LEFT JOIN endereco e    ON e.id  = pg.endereco_id
  LEFT JOIN usuario u     ON u.id  = pg.created_by
  ORDER BY pg.rn;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_produtos_mapeados(
  uuid, uuid, uuid, text, text, uuid, date, date, integer, integer, integer, integer, integer, integer, text
) IS 'Relatório Produtos Mapeados em Picking (paginado). Filtros de produto, parceiro, endereço e data do mapeamento (created_at no fuso informado); usuário = created_by.';

REVOKE ALL ON FUNCTION public.rpc_relatorio_produtos_mapeados(
  uuid, uuid, uuid, text, text, uuid, date, date, integer, integer, integer, integer, integer, integer, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_produtos_mapeados(
  uuid, uuid, uuid, text, text, uuid, date, date, integer, integer, integer, integer, integer, integer, text
) TO authenticated, service_role;
