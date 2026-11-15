-- 2026-11-14 · Fluxo de Expedição · correções do N5 apontadas pela bateria de 83 cenários
-- 1) carga_sugerir: rota cai para a rota dos pedidos quando a onda não tem rota ("VARIAS" se diferentes)
--    criar_movimento_saida_registro: grava a rota na onda quando todos os pedidos são da mesma rota
-- 2) roteiro_saida_simular: Parceiro/Rota do N5 usam "VARIOS"/"VARIAS" como a sugestão real
-- 3) carga_sugerir: usa todos os critérios de EMBARQUE, na ordem (antes só o 1º)
-- Down: recriar a partir das funções _bkp_n5_* (mesmo corpo, outro nome)
DO $$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['carga_sugerir(uuid,uuid)',
                           'roteiro_saida_simular(uuid,uuid,jsonb,integer)',
                           'criar_movimento_saida_registro(uuid,uuid,text,uuid,enum_prioridade_onda,uuid,uuid,uuid)'] LOOP
    d := pg_get_functiondef(f::regprocedure);
    d := regexp_replace(d, 'FUNCTION public\.(\w+)\(', 'FUNCTION public._bkp_n5_\1(');
    EXECUTE d;
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated',
                   regexp_replace(f, '^(\w+)', '_bkp_n5_\1'));
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.criar_movimento_saida_registro(p_tenant_id uuid, p_empresa_id uuid, p_chave_agrupamento text, p_tipo_saida_id uuid, p_prioridade enum_prioridade_onda, p_box_id uuid DEFAULT NULL::uuid, p_rota_id uuid DEFAULT NULL::uuid, p_veiculo_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov_saida_id uuid;
  v_rota_id uuid := p_rota_id;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id); -- seguranca 2026-10-12 L2

  -- N5 (2026-11-14): sem rota informada, herda a rota quando todos os pedidos têm a mesma
  IF v_rota_id IS NULL THEN
    SELECT CASE WHEN count(*) > 0 AND count(ds.rota_id) = count(*) AND count(DISTINCT ds.rota_id) = 1
                THEN min(ds.rota_id::text)::uuid END
      INTO v_rota_id
      FROM public.documento_saida ds
     WHERE ds.tenant_id = p_tenant_id
       AND ds.id IN (SELECT t.documento_saida_id FROM tmp_docs t WHERE t.chave_agrupamento = p_chave_agrupamento);
  END IF;

  INSERT INTO public.movimento_saida (
    tenant_id, empresa_id, box_id, rota_id, veiculo_id,
    data_emissao, prioridade, status, chave_agrupamento, tipo_saida
  )
  VALUES (
    p_tenant_id, p_empresa_id, p_box_id, v_rota_id, p_veiculo_id,
    now(), p_prioridade,
    'CRIADA'::enum_status_onda_carregamento,
    p_chave_agrupamento,
    p_tipo_saida_id
  )
  RETURNING id INTO v_mov_saida_id;

  INSERT INTO public.movimento_saida_documento (
    tenant_id, movimento_saida_id, documento_saida_id, ordem
  )
  SELECT p_tenant_id, v_mov_saida_id, documento_saida_id, ROW_NUMBER() OVER ()
  FROM tmp_docs
  WHERE chave_agrupamento = p_chave_agrupamento
  GROUP BY documento_saida_id;

  INSERT INTO public.movimento_saida_item (
    tenant_id, movimento_saida_id, produto_id,
    qtd_esperada, valor_unit, valor_total, status
  )
  SELECT p_tenant_id, v_mov_saida_id, produto_id,
    SUM(quantidade), AVG(valor_unit), SUM(valor_total), 'PENDENTE'::enum_status_item_onda
  FROM tmp_docs
  WHERE chave_agrupamento = p_chave_agrupamento
  GROUP BY produto_id;

  RETURN v_mov_saida_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.carga_sugerir(p_tenant_id uuid, p_empresa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_crit text; v_crits text[]; v_ondas jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  -- N5 (2026-11-14): todos os critérios de EMBARQUE, na ordem; 'criterio' mantido (1º) por compatibilidade
  v_crits := ARRAY(SELECT rc.criterio::text FROM roteiro_saida_criterio rc
                    WHERE rc.tenant_id = p_tenant_id AND rc.empresa_id = p_empresa_id AND rc.nivel = 'EMBARQUE'
                    ORDER BY rc.sequencia);
  v_crit := v_crits[1];

  WITH elegiveis AS (
    SELECT ms.* FROM movimento_saida ms
     WHERE ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id
       AND ms.status IN ('CONFERIDO','SEPARADO')
       AND NOT EXISTS (SELECT 1 FROM carga_documento cd WHERE cd.movimento_saida_id = ms.id AND cd.ativo)
       AND public._fn_carga_onda_motivo(ms.id) IS NULL
  ), base AS (
    SELECT e.id, e.numero_onda, e.status::text AS status, e.veiculo_id, e.box_id, e.rota_id, pm.peso AS peso_total, pm.m3 AS m3,
           e.prioridade::text AS prioridade, e.created_at,
           v.descricao AS veiculo, v.placa, b.descricao AS box, r.descricao AS rota, ts.descricao AS tipo_saida,
           public._fn_carga_onda_transportadoras(e.id) AS transps,
           (SELECT count(*) FROM movimento_saida_documento msd WHERE msd.movimento_saida_id = e.id) AS documentos,
           (SELECT count(*) FROM volume_expedicao ve WHERE ve.movimento_saida_id = e.id) AS volumes,
           (SELECT CASE WHEN count(DISTINCT ds.parceiro_id) = 1 THEN min(ds.parceiro_id::text) ELSE 'VARIOS' END
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
             WHERE msd.movimento_saida_id = e.id) AS parceiro_chave,
           (SELECT CASE WHEN count(ds.rota_id) = 0 THEN NULL
                        WHEN count(ds.rota_id) = count(*) AND count(DISTINCT ds.rota_id) = 1 THEN min(ds.rota_id::text)
                        ELSE 'VARIAS' END
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
             WHERE msd.movimento_saida_id = e.id) AS rota_docs_chave,
           (SELECT string_agg(DISTINCT rd.descricao, ', ')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              JOIN rotas rd ON rd.id = ds.rota_id WHERE msd.movimento_saida_id = e.id) AS rotas_docs,
           (SELECT string_agg(DISTINCT COALESCE(p.nome_fantasia, p.razaosocial), ', ')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              LEFT JOIN parceiro p ON p.id = ds.parceiro_id WHERE msd.movimento_saida_id = e.id) AS parceiros,
           e.tipo_saida AS tipo_saida_id,
           (SELECT string_agg(ds.numero_pedido::text, ', ' ORDER BY ds.numero_pedido)
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
             WHERE msd.movimento_saida_id = e.id) AS pedidos,
           (SELECT string_agg(DISTINCT NULLIF(btrim(p.cidade), ''), ', ')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              JOIN parceiro p ON p.id = ds.parceiro_id WHERE msd.movimento_saida_id = e.id) AS cidades,
           (SELECT string_agg(DISTINCT NULLIF(btrim(p.bairro), ''), ', ')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              JOIN parceiro p ON p.id = ds.parceiro_id WHERE msd.movimento_saida_id = e.id) AS bairros,
           (SELECT string_agg(DISTINCT rp.descricao, ', ')
              FROM movimento_saida_documento msd JOIN documento_saida ds ON ds.id = msd.documento_saida_id
              JOIN parceiro p ON p.id = ds.parceiro_id JOIN rotas rp ON rp.id = p.rota_id
             WHERE msd.movimento_saida_id = e.id) AS rotas_parceiros
      FROM elegiveis e
      CROSS JOIN LATERAL public._fn_onda_peso_m3(e.id) pm
      LEFT JOIN veiculos v ON v.id = e.veiculo_id
      LEFT JOIN box b ON b.id = e.box_id
      LEFT JOIN rotas r ON r.id = e.rota_id
      LEFT JOIN tipo_saida ts ON ts.id = e.tipo_saida
  ), comp AS (
    SELECT base.*,
           CASE WHEN array_length(transps, 1) = 1 THEN transps[1] END AS transp_id,
           COALESCE(array_length(transps, 1), 0) AS n_transps,
           public._fn_carga_nome_parceiros(transps) AS transp_nome,
           COALESCE(rota_id::text, rota_docs_chave, 'SEM_ROTA') AS rota_chave,
           COALESCE(rota, CASE WHEN rota_docs_chave = 'VARIAS' THEN 'Várias rotas' ELSE rotas_docs END, 'Sem rota') AS rota_rotulo
      FROM base
  ), crit AS (
    SELECT comp.*,
           (SELECT string_agg(CASE c.cr WHEN 'ROTA' THEN comp.rota_chave WHEN 'PARCEIRO' THEN comp.parceiro_chave END, '|' ORDER BY c.o)
              FROM unnest(v_crits) WITH ORDINALITY c(cr, o)) AS crit_chave,
           (SELECT string_agg(CASE c.cr WHEN 'ROTA' THEN comp.rota_rotulo
                                        WHEN 'PARCEIRO' THEN CASE WHEN comp.parceiro_chave = 'VARIOS' THEN 'Vários parceiros' ELSE comp.parceiros END END,
                              ' · ' ORDER BY c.o)
              FROM unnest(v_crits) WITH ORDINALITY c(cr, o)) AS crit_rotulo
      FROM comp
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'movimento_saida_id', id, 'numero_onda', numero_onda, 'status', status, 'prioridade', prioridade,
           'veiculo_id', veiculo_id, 'veiculo', veiculo, 'placa', placa, 'box_id', box_id, 'box', box,
           'transportadora_id', transp_id, 'transportadora', transp_nome, 'transportadoras', n_transps,
           'rota', COALESCE(rota, rotas_docs, rotas_parceiros), 'tipo_saida', tipo_saida, 'tipo_saida_id', tipo_saida_id, 'parceiros', parceiros,
           'pedidos', pedidos, 'cidades', cidades, 'bairros', bairros,
           'peso_total', peso_total, 'm3', m3, 'documentos', documentos, 'volumes', volumes, 'created_at', created_at,
           'grupo_chave', concat_ws('|', crit_chave,
                                    CASE WHEN n_transps > 1 THEN 'VARIAS_TRANSP'
                                         WHEN transp_id IS NOT NULL THEN 'T:' || transp_id
                                         ELSE 'V:' || COALESCE(veiculo_id::text, 'SEM_VEICULO') END,
                                    COALESCE(box_id::text, 'SEM_BOX')),
           'grupo_rotulo', concat_ws(' · ', crit_rotulo,
                                     CASE WHEN n_transps > 1 THEN 'Várias transportadoras (separe por transportadora)'
                                          WHEN transp_id IS NOT NULL THEN 'Transportadora ' || transp_nome
                                          ELSE COALESCE('Veículo ' || veiculo || COALESCE(' (' || placa || ')', ''), 'Sem veículo/transportadora') END,
                                     COALESCE(box, 'Sem box'))
         ) ORDER BY numero_onda), '[]'::jsonb)
    INTO v_ondas FROM crit;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CARGA_SUGESTAO',
    'dados', jsonb_build_object('criterio', v_crit, 'criterios', to_jsonb(v_crits), 'ondas', v_ondas));
END $function$;

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('roteiro_saida_simular(uuid,uuid,jsonb,integer)'::regprocedure);
  n := replace(d,
    'count(*) AS pedidos, min(dm.rota_id::text) AS rota, min(dm.parceiro_id::text) AS parceiro',
    'count(*) AS pedidos,
           CASE WHEN count(dm.rota_id) = 0 THEN NULL
                WHEN count(dm.rota_id) = count(*) AND count(DISTINCT dm.rota_id) = 1 THEN min(dm.rota_id::text)
                ELSE ''VARIAS'' END AS rota,
           CASE WHEN count(DISTINCT dm.parceiro_id) = 1 THEN min(dm.parceiro_id::text) ELSE ''VARIOS'' END AS parceiro');
  IF n = d THEN RAISE EXCEPTION 'padrão da simulação não encontrado'; END IF;
  EXECUTE n;
END $$;