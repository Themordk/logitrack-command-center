-- Fluxo de Expedição · F4.3b — Marca, Grupo e Subgrupo de produto como critérios do N3 + cobertura do cadastro
-- 2026-11-14 (QA). Pré-requisito: F4.3a (valores novos do enum).
-- Reversão: voltar fn_roteiro_criterio_permitido sem os três critérios (configurações antigas não mudam).

-- 0) backups das funções alteradas
DO $$
DECLARE f text; v_def text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fn_montar_grupos_separacao','roteiro_saida_obter','roteiro_saida_salvar','roteiro_saida_simular','_fn_onda_unidades_resumo','_fn_unidade_conf_descricao'] LOOP
    IF to_regproc('public.' || f || '_bkp_f43') IS NULL THEN
      SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = f;
      EXECUTE replace(v_def, 'FUNCTION public.' || f || '(', 'FUNCTION public.' || f || '_bkp_f43(');
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC, anon, authenticated', f || '_bkp_f43');
    END IF;
  END LOOP;
END $$;

-- 1) marca é texto livre: chave sem acento, maiúscula e com espaços normalizados
CREATE OR REPLACE FUNCTION public._fn_normalizar_marca(p_marca text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public' AS $$
  SELECT NULLIF(regexp_replace(upper(translate(btrim(COALESCE(p_marca, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '\s+', ' ', 'g'), '');
$$;

-- 2) critérios permitidos por nível
CREATE OR REPLACE FUNCTION public.fn_roteiro_criterio_permitido(p_nivel enum_nivel_roteiro_saida, p_criterio enum_criterio_roteiro_saida)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE p_nivel
    WHEN 'MOVIMENTO'   THEN p_criterio IN ('DOCUMENTO','PARCEIRO','ROTA')
    WHEN 'SEPARACAO'   THEN p_criterio IN ('ZONA_ATIVIDADE','TIPO_POSICAO','TIPO_SEPARACAO_SKU','MARCA','GRUPO_PRODUTO','SUBGRUPO_PRODUTO')
    WHEN 'CONFERENCIA' THEN p_criterio IN ('GRUPO_SEPARACAO','HU_VOLUME')
    WHEN 'EMBARQUE'    THEN p_criterio IN ('ROTA','PARCEIRO')
    ELSE false
  END;
$function$;

DO $$
DECLARE d text; n text;
BEGIN
  -- 3) montagem dos grupos de separação
  d := pg_get_functiondef('public.fn_montar_grupos_separacao'::regproc);
  n := replace(d, $a$           p.tipo_separacao::text AS tipo_separacao_sku$a$,
                  $b$           p.tipo_separacao::text AS tipo_separacao_sku,
           public._fn_normalizar_marca(p.marca) AS marca_chave, NULLIF(btrim(p.marca), '') AS marca_nome,
           p.grupo_id, p.subgrupo_id$b$);
  n := replace(n, $a$                           WHEN 'TIPO_SEPARACAO_SKU' THEN COALESCE(b.tipo_separacao_sku, 'SEM_TIPO')$a$,
                  $b$                           WHEN 'TIPO_SEPARACAO_SKU' THEN COALESCE(b.tipo_separacao_sku, 'SEM_TIPO')
                           WHEN 'MARCA'              THEN COALESCE(b.marca_chave, 'SEM_MARCA')
                           WHEN 'GRUPO_PRODUTO'      THEN COALESCE(b.grupo_id::text, 'SEM_GRUPO')
                           WHEN 'SUBGRUPO_PRODUTO'   THEN COALESCE(b.subgrupo_id::text, 'SEM_SUBGRUPO')$b$);
  n := replace(n, $a$             MIN(tipo_separacao_sku)             AS tipo_separacao_sku,$a$,
                  $b$             MIN(tipo_separacao_sku)             AS tipo_separacao_sku,
             MIN(marca_nome)                     AS marca_nome,
             MIN(grupo_id::text)::uuid           AS grupo_id,
             MIN(subgrupo_id::text)::uuid        AS subgrupo_id,$b$);
  n := replace(n, $a$             'tipo_separacao_sku', CASE WHEN 'TIPO_SEPARACAO_SKU' = ANY (v_crit) THEN x.tipo_separacao_sku END,$a$,
                  $b$             'tipo_separacao_sku', CASE WHEN 'TIPO_SEPARACAO_SKU' = ANY (v_crit) THEN x.tipo_separacao_sku END,
             'marca',            CASE WHEN 'MARCA' = ANY (v_crit) THEN COALESCE(x.marca_nome, 'Sem marca') END,
             'grupo_produto',    CASE WHEN 'GRUPO_PRODUTO' = ANY (v_crit) THEN COALESCE((SELECT gp.descricao FROM grupo_produto gp WHERE gp.id = x.grupo_id), 'Sem grupo') END,
             'subgrupo_produto', CASE WHEN 'SUBGRUPO_PRODUTO' = ANY (v_crit) THEN COALESCE((SELECT sp.descricao FROM subgrupo_produto sp WHERE sp.id = x.subgrupo_id), 'Sem subgrupo') END,$b$);
  IF (length(n) - length(d)) < 900 OR position('marca_chave' in n) = 0 OR position('SEM_SUBGRUPO' in n) = 0
     OR position('MIN(marca_nome)' in n) = 0 OR position('''grupo_produto'',' in n) = 0 THEN
    RAISE EXCEPTION 'F4.3: padrões do fn_montar_grupos_separacao não encontrados (%)', length(n) - length(d);
  END IF;
  EXECUTE n;

  -- 4) simulação usa as mesmas chaves
  d := pg_get_functiondef('public.roteiro_saida_simular'::regproc);
  n := replace(d, $a$                      WHEN 'TIPO_SEPARACAO_SKU' THEN COALESCE(p.tipo_separacao::text, 'SEM_TIPO') END, '' ORDER BY c.ord)$a$,
                  $b$                      WHEN 'TIPO_SEPARACAO_SKU' THEN COALESCE(p.tipo_separacao::text, 'SEM_TIPO')
                      WHEN 'MARCA'              THEN COALESCE(public._fn_normalizar_marca(p.marca), 'SEM_MARCA')
                      WHEN 'GRUPO_PRODUTO'      THEN COALESCE(p.grupo_id::text, 'SEM_GRUPO')
                      WHEN 'SUBGRUPO_PRODUTO'   THEN COALESCE(p.subgrupo_id::text, 'SEM_SUBGRUPO') END, '' ORDER BY c.ord)$b$);
  IF n = d THEN RAISE EXCEPTION 'F4.3: padrão do roteiro_saida_simular não encontrado'; END IF;
  EXECUTE n;

  -- 5) obter: critérios novos + cobertura do cadastro de produtos
  d := pg_get_functiondef('public.roteiro_saida_obter'::regproc);
  n := replace(d, 'v_lim jsonb; v_emb_cfg jsonb;', 'v_lim jsonb; v_emb_cfg jsonb; v_cob jsonb;');
  n := replace(n, $a$jsonb_build_array('ZONA_ATIVIDADE','TIPO_POSICAO','TIPO_SEPARACAO_SKU')$a$,
                  $b$jsonb_build_array('ZONA_ATIVIDADE','TIPO_POSICAO','TIPO_SEPARACAO_SKU','MARCA','GRUPO_PRODUTO','SUBGRUPO_PRODUTO')$b$);
  n := replace(n, $a$  RETURN jsonb_build_object(
    'sucesso', true, 'codigo', 'OK', 'mensagem', 'Roteiro carregado.',$a$,
                  $b$  SELECT jsonb_build_object(
           'produtos', count(*),
           'MARCA', CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(public._fn_normalizar_marca(p.marca)) / count(*)) END,
           'GRUPO_PRODUTO', CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(p.grupo_id) / count(*)) END,
           'SUBGRUPO_PRODUTO', CASE WHEN count(*) = 0 THEN 0 ELSE round(100.0 * count(p.subgrupo_id) / count(*)) END)
    INTO v_cob
    FROM produto p
   WHERE p.tenant_id = p_tenant_id AND (p.empresa_id IS NULL OR p.empresa_id = p_empresa_id) AND COALESCE(p.ativo, true);

  RETURN jsonb_build_object(
    'sucesso', true, 'codigo', 'OK', 'mensagem', 'Roteiro carregado.',$b$);
  n := replace(n, $a$      'criterios_permitidos', jsonb_build_object($a$,
                  $b$      'cobertura', v_cob,
      'criterios_permitidos', jsonb_build_object($b$);
  IF position('v_cob jsonb' in n) = 0 OR position('''cobertura'', v_cob' in n) = 0 OR position('SUBGRUPO_PRODUTO'')' in n) = 0
     OR position('INTO v_cob' in n) = 0 THEN
    RAISE EXCEPTION 'F4.3: padrões do roteiro_saida_obter não encontrados';
  END IF;
  EXECUTE n;

  -- 6) salvar: aviso de redundância Grupo + Subgrupo
  d := pg_get_functiondef('public.roteiro_saida_salvar(uuid, uuid, jsonb)'::regprocedure);
  n := replace(d, $a$  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ROTEIRO_SALVO',$a$,
                  $b$  IF (SELECT count(*) FROM roteiro_saida_criterio
       WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id AND nivel = 'SEPARACAO'
         AND criterio IN ('GRUPO_PRODUTO','SUBGRUPO_PRODUTO')) = 2 THEN
    v_avisos := v_avisos || jsonb_build_object('codigo', 'ROTEIRO_AVISO_GRUPO_SUBGRUPO',
      'mensagem', 'Grupo e Subgrupo juntos: o subgrupo já pertence a um grupo, então marcar os dois não divide mais do que só o Subgrupo.');
  END IF;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'ROTEIRO_SALVO',$b$);
  IF n = d THEN RAISE EXCEPTION 'F4.3: padrão do roteiro_saida_salvar não encontrado'; END IF;
  EXECUTE n;
END $$;

-- 7) nome do grupo no coletor (separação e conferência por grupo)
CREATE OR REPLACE FUNCTION public._fn_grupo_sep_detalhe(p_atributos jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT NULLIF(concat_ws(' · ', p_atributos->>'marca', p_atributos->>'grupo_produto', p_atributos->>'subgrupo_produto'), '');
$$;

CREATE OR REPLACE FUNCTION public._fn_unidade_conf_descricao(p_grupo_conferencia_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT concat_ws(' · ',
           CASE WHEN gc.grupo_separacao_id IS NOT NULL
                  THEN concat_ws(' · ', 'Grupo de separação ' || gs.sequencia, public._fn_grupo_sep_detalhe(gs.atributos))
                WHEN 'GRUPO_SEPARACAO' = ANY (gc.criterios) THEN 'Sem grupo' END,
           CASE WHEN gc.hu_id IS NOT NULL THEN 'HU ' || COALESCE(h.codigo_hu, gc.hu_id::text)
                WHEN 'HU_VOLUME' = ANY (gc.criterios) THEN 'Sem HU' END)
    FROM grupo_conferencia gc
    LEFT JOIN grupo_separacao gs ON gs.id = gc.grupo_separacao_id
    LEFT JOIN hu h ON h.id = gc.hu_id
   WHERE gc.id = p_grupo_conferencia_id;
$$;
REVOKE ALL ON FUNCTION public._fn_unidade_conf_descricao(uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public._fn_onda_unidades_resumo'::regproc);
  n := replace(d, $a$concat_ws(' · ', 'Grupo ' || g.sequencia, za.descricao)$a$,
                  $b$concat_ws(' · ', 'Grupo ' || g.sequencia, za.descricao, public._fn_grupo_sep_detalhe(g.atributos))$b$);
  IF n = d THEN RAISE EXCEPTION 'F4.3: padrão do _fn_onda_unidades_resumo não encontrado'; END IF;
  EXECUTE n;
END $$;
