-- Fluxo de Expedição · F7 — simulação do fluxo (somente leitura)
-- 2026-11-14 (QA). Reversão: DROP FUNCTION public.roteiro_saida_simular(uuid, uuid, jsonb, integer);
-- Aplica a configuração ainda NÃO salva (mesmo formato de roteiro_saida_salvar) sobre pedidos reais:
-- os pendentes (status 0) da empresa ou, se não houver, os dos últimos p_dias dias.
-- Movimento e grupos seguem as mesmas chaves de preparar_dados_agrupamento e fn_montar_grupos_separacao
-- (endereço de picking do produto, zona, tipo de posição, tipo de separação, máx. de SKUs).
CREATE OR REPLACE FUNCTION public.roteiro_saida_simular(p_tenant_id uuid, p_empresa_id uuid, p_config jsonb, p_dias integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov text[]; v_sep text[]; v_conf text[]; v_emb text[]; v_max integer; v_dias integer;
  v_origem text; v_arm_cfg uuid; v_res jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = p_empresa_id AND e.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ROTEIRO_EMPRESA_INVALIDA', 'mensagem', 'Empresa não encontrada neste tenant.');
  END IF;

  v_mov  := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_config -> 'movimento', '[]')));
  v_sep  := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_config -> 'separacao', '[]')));
  v_conf := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_config -> 'conferencia', '[]')));
  v_emb  := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_config -> 'embarque', '[]')));
  v_max  := NULLIF(p_config #>> '{limites,separacao,MAX_SKU}', '')::numeric::integer;
  IF v_max IS NOT NULL AND v_max <= 0 THEN v_max := NULL; END IF;
  v_dias := LEAST(GREATEST(COALESCE(p_dias, 7), 1), 60);

  SELECT ac.armazem_id INTO v_arm_cfg FROM armazem_config ac
   WHERE ac.tenant_id = p_tenant_id AND ac.empresa_id = p_empresa_id AND ac.ativo = true LIMIT 1;

  -- amostra de pedidos
  v_origem := CASE WHEN EXISTS (
      SELECT 1 FROM documento_saida ds
       WHERE ds.tenant_id = p_tenant_id AND ds.empresa_id = p_empresa_id AND ds.status = 0
         AND EXISTS (SELECT 1 FROM documento_saida_item i WHERE i.documento_saida_id = ds.id))
    THEN 'PENDENTES' ELSE 'PERIODO' END;

  WITH docs AS (
    SELECT ds.id, ds.parceiro_id, ds.rota_id, ds.tipo_pedido_id,
           COALESCE(ts.realiza_conferencia, true) AS confere, COALESCE(ts.realiza_embarque, false) AS embarca,
           COALESCE(ts.descricao, 'Sem tipo') AS tipo
      FROM documento_saida ds
      LEFT JOIN tipo_saida ts ON ts.id = ds.tipo_pedido_id
     WHERE ds.tenant_id = p_tenant_id AND ds.empresa_id = p_empresa_id
       AND EXISTS (SELECT 1 FROM documento_saida_item i WHERE i.documento_saida_id = ds.id)
       AND CASE WHEN v_origem = 'PENDENTES' THEN ds.status = 0
                ELSE ds.created_at >= now() - make_interval(days => v_dias) END
  ), doc_mov AS (
    -- N1 (empresa + tipo de saída) + N2 (critérios de cabeçalho)
    SELECT d.*,
           COALESCE(d.tipo_pedido_id::text, 'SEM_TIPO') || '#' || COALESCE((
             SELECT string_agg(CASE c.crit
                      WHEN 'DOCUMENTO' THEN d.id::text
                      WHEN 'PARCEIRO'  THEN COALESCE(d.parceiro_id::text, 'SEM_PARCEIRO')
                      WHEN 'ROTA'      THEN COALESCE(d.rota_id::text, 'SEM_ROTA') END, '|' ORDER BY c.ord)
               FROM unnest(v_mov) WITH ORDINALITY c(crit, ord)), 'UNICO') AS mov
      FROM docs d
  ), itens AS (
    SELECT dm.mov, dm.tipo, dm.confere, i.produto_id,
           COALESCE(COALESCE(e.armazem_id, v_arm_cfg)::text, 'SEM_ARMAZEM') || COALESCE((
             SELECT string_agg('|' || CASE c.crit
                      WHEN 'ZONA_ATIVIDADE'     THEN COALESCE(z.zona_atividade_id::text, 'SEM_ZONA')
                      WHEN 'TIPO_POSICAO'       THEN COALESCE(e.tipo_endereco::text, 'SEM_ENDERECO')
                      WHEN 'TIPO_SEPARACAO_SKU' THEN COALESCE(p.tipo_separacao::text, 'SEM_TIPO') END, '' ORDER BY c.ord)
               FROM unnest(v_sep) WITH ORDINALITY c(crit, ord)), '') AS grupo
      FROM doc_mov dm
      JOIN documento_saida_item i ON i.documento_saida_id = dm.id
      JOIN produto p ON p.id = i.produto_id
      LEFT JOIN LATERAL (SELECT pp.endereco_id FROM picking_produto pp
                          WHERE pp.produto_id = i.produto_id AND pp.tenant_id = p_tenant_id
                            AND pp.tipo_picking IN ('FRACIONADO','PDV') AND pp.ativo = true LIMIT 1) pk ON true
      LEFT JOIN endereco e ON e.id = pk.endereco_id
      LEFT JOIN LATERAL (SELECT eza.zona_atividade_id FROM endereco_zona_atividade eza
                          WHERE eza.endereco_id = pk.endereco_id AND eza.tenant_id = p_tenant_id
                          ORDER BY eza.zona_atividade_id LIMIT 1) z ON true
  ), grupos AS (
    -- N3: grupo = armazém + critérios, rompido pelo máx. de SKUs
    SELECT mov, grupo, count(DISTINCT produto_id) AS skus,
           CASE WHEN v_max IS NULL THEN 1 ELSE ceil(count(DISTINCT produto_id)::numeric / v_max)::int END AS blocos
      FROM itens GROUP BY mov, grupo
  ), movs0 AS (
    SELECT dm.mov, min(dm.tipo) AS tipo, bool_or(dm.confere) AS confere, bool_or(dm.embarca) AS embarca,
           count(*) AS pedidos, min(dm.rota_id::text) AS rota, min(dm.parceiro_id::text) AS parceiro
      FROM doc_mov dm GROUP BY dm.mov
  ), movs AS (
    -- N5: chave de sugestão da carga (Rota / Parceiro); sem critério depende do veículo e box da onda
    SELECT m.*,
           CASE WHEN cardinality(v_emb) = 0 THEN NULL ELSE COALESCE((
             SELECT string_agg(CASE c.crit WHEN 'ROTA' THEN COALESCE(m.rota, 'SEM_ROTA')
                                           WHEN 'PARCEIRO' THEN COALESCE(m.parceiro, 'SEM_PARCEIRO') END, '|' ORDER BY c.ord)
               FROM unnest(v_emb) WITH ORDINALITY c(crit, ord)), 'UNICO') END AS carga
      FROM movs0 m
  ), por_mov AS (
    SELECT m.*, COALESCE(g.grupos, 0) AS grupos,
           CASE WHEN NOT m.confere THEN 0
                WHEN 'GRUPO_SEPARACAO' = ANY (v_conf) THEN GREATEST(COALESCE(g.grupos, 0), 1)
                ELSE 1 END AS unidades
      FROM movs m
      LEFT JOIN (SELECT mov, sum(blocos)::int AS grupos FROM grupos GROUP BY mov) g ON g.mov = m.mov
  )
  SELECT jsonb_build_object(
    'origem', v_origem, 'dias', v_dias,
    'pedidos', COALESCE(sum(pedidos), 0)::int,
    'itens', (SELECT count(*) FROM itens),
    'skus', (SELECT count(DISTINCT produto_id) FROM itens),
    'movimentos', count(*)::int,
    'grupos_separacao', COALESCE(sum(grupos), 0)::int,
    'unidades_conferencia', COALESCE(sum(unidades), 0)::int,
    'movimentos_conferidos', count(*) FILTER (WHERE confere)::int,
    'conferencia_por_hu', 'HU_VOLUME' = ANY (v_conf),
    'movimentos_com_embarque', count(*) FILTER (WHERE embarca)::int,
    'cargas_sugeridas', CASE WHEN cardinality(v_emb) = 0 THEN NULL
                             ELSE (SELECT count(DISTINCT carga) FROM por_mov p2 WHERE p2.embarca)::int END,
    'por_tipo', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo', t.tipo, 'pedidos', t.pedidos, 'movimentos', t.movimentos,
                                                'grupos_separacao', t.grupos, 'unidades_conferencia', t.unidades) ORDER BY t.tipo)
                            FROM (SELECT tipo, sum(pedidos)::int AS pedidos, count(*)::int AS movimentos,
                                         sum(grupos)::int AS grupos, sum(unidades)::int AS unidades
                                    FROM por_mov GROUP BY tipo) t), '[]'::jsonb))
    INTO v_res
    FROM por_mov;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ROTEIRO_SIMULACAO', 'dados', v_res);
END;
$function$;
REVOKE ALL ON FUNCTION public.roteiro_saida_simular(uuid, uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roteiro_saida_simular(uuid, uuid, jsonb, integer) TO authenticated, service_role;
