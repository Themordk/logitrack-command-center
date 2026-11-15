-- =====================================================================
-- Fluxo de Expedição — F3: geração do movimento de saída corrigida
-- Versão 1 · 2026-11-12
-- preparar_dados_agrupamento passa a:
--   * ler roteiro_saida_criterio (nivel = MOVIMENTO), não mais agrupamento_separacao;
--   * calcular a chave por DOCUMENTO (nunca parte um pedido em dois movimentos);
--   * usar documento_saida.id (não numero_pedido) no critério Documento;
--   * gerar a chave 'UNICO' quando não há critério (antes a chave ficava NULL
--     e o movimento nascia vazio).
-- A estrutura de tmp_docs / tmp_agrupamento é mantida para gerar_onda_separacao
-- e criar_movimento_saida_registro, que não mudam.
-- Reversão: recriar a função a partir de preparar_dados_agrupamento_bkp_20261112.
-- =====================================================================

-- 1. Backup da versão atual (padrão _bkp_ do projeto)
CREATE OR REPLACE FUNCTION public.preparar_dados_agrupamento_bkp_20261112(p_tenant_id uuid, p_empresa_id uuid, p_documentos uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id); -- seguranca 2026-10-12 L2

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
    ds.id              AS documento_saida_id,
    ds.numero_pedido,
    ds.parceiro_id,
    ds.rota_id,
    dsi.produto_id,
    dsi.quantidade,
    dsi.valor_unit,
    dsi.valor_total,
    pp.endereco_id     AS picking,
    za.descricao
  FROM public.documento_saida ds
  JOIN public.documento_saida_item dsi
    ON dsi.documento_saida_id = ds.id
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
END;
$function$;
REVOKE ALL ON FUNCTION public.preparar_dados_agrupamento_bkp_20261112(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- 2. Nova versão
CREATE OR REPLACE FUNCTION public.preparar_dados_agrupamento(p_tenant_id uuid, p_empresa_id uuid, p_documentos uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v2 (2026-11-12) Fluxo de Expedição F3: chave por documento, lida de roteiro_saida_criterio (MOVIMENTO).
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  -- 1. Critérios do nível Movimento (só cabeçalho: DOCUMENTO, PARCEIRO, ROTA)
  DROP TABLE IF EXISTS tmp_agrupamento;
  CREATE TEMP TABLE tmp_agrupamento AS
  SELECT rc.criterio::text AS tipo_agrupamento, rc.sequencia
  FROM public.roteiro_saida_criterio rc
  WHERE rc.tenant_id = p_tenant_id
    AND rc.empresa_id = p_empresa_id
    AND rc.nivel = 'MOVIMENTO'
  ORDER BY rc.sequencia;

  -- 2. Itens dos documentos (mesmas colunas da v1)
  DROP TABLE IF EXISTS tmp_docs;
  CREATE TEMP TABLE tmp_docs AS
  SELECT
    ds.id              AS documento_saida_id,
    ds.numero_pedido,
    ds.parceiro_id,
    ds.rota_id,
    dsi.produto_id,
    dsi.quantidade,
    dsi.valor_unit,
    dsi.valor_total,
    pp.endereco_id     AS picking,
    za.descricao
  FROM public.documento_saida ds
  JOIN public.documento_saida_item dsi
    ON dsi.documento_saida_id = ds.id
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
    AND ds.empresa_id = p_empresa_id
    AND ds.status = 0;

  ALTER TABLE tmp_docs ADD COLUMN chave_agrupamento text;

  -- 3. Chave por documento: todos os itens de um pedido recebem a mesma chave
  WITH chave_doc AS (
    SELECT d.documento_saida_id,
           COALESCE(
             (SELECT string_agg(
                       CASE a.tipo_agrupamento
                         WHEN 'DOCUMENTO' THEN d.documento_saida_id::text
                         WHEN 'PARCEIRO'  THEN COALESCE(d.parceiro_id::text, 'SEM_PARCEIRO')
                         WHEN 'ROTA'      THEN COALESCE(d.rota_id::text, 'SEM_ROTA')
                       END, '|' ORDER BY a.sequencia)
              FROM tmp_agrupamento a),
             'UNICO') AS chave
    FROM (SELECT DISTINCT documento_saida_id, parceiro_id, rota_id FROM tmp_docs) d
  )
  UPDATE tmp_docs t
     SET chave_agrupamento = c.chave
    FROM chave_doc c
   WHERE c.documento_saida_id = t.documento_saida_id;
END;
$function$;
