-- Migration: 20261115220000_etq_f2_regras_geracao.sql
-- Plano: Etiqueta de Volume de Expedição — Fase 2 (regras de geração)
-- Ações: A9 (volume sempre por pedido, trava da onda, unicidade, empresa da onda — V8),
--        A10 (validação do tipo de saída), D3 (embarque fora da configuração = exceção
--        com motivo obrigatório e ocorrência registrada)
-- Decisões aplicadas: D1 (volume pertence a um único pedido), D3
-- Risco: médio — muda a assinatura de gerar_volumes_expedicao e embarque_gerar_volumes
--        (novo parâmetro opcional; chamadas atuais continuam válidas).
--        Ordem de deploy: FRONTEND ANTES do banco (o coletor novo funciona com o banco
--        antigo; o coletor antigo não sabe pedir motivo no embarque fora da configuração).
-- Rollback: definições anteriores em ops.rollback_definicao (migration = este arquivo).

-- ============================================================
-- Cópia das definições anteriores
-- ============================================================
DO $do$
BEGIN
  -- só na primeira execução (depois do DROP as assinaturas antigas deixam de existir)
  IF to_regprocedure('public.gerar_volumes_expedicao(uuid,uuid,uuid,integer,text)') IS NOT NULL THEN
    INSERT INTO ops.rollback_definicao (migration, objeto, definicao)
    SELECT '20261115220000_etq_f2_regras_geracao', o.objeto, o.def
      FROM (VALUES
        ('function public.gerar_volumes_expedicao', pg_get_functiondef('public.gerar_volumes_expedicao(uuid,uuid,uuid,integer,text)'::regprocedure)),
        ('function public.embarque_gerar_volumes', pg_get_functiondef('public.embarque_gerar_volumes(uuid,uuid,uuid,uuid,integer)'::regprocedure)),
        ('data tipo_saida gera_volume_etapa', COALESCE((SELECT string_agg(format('UPDATE public.tipo_saida SET gera_volume_etapa = %L WHERE id = %L;', ts.gera_volume_etapa, ts.id), E'\n')
            FROM public.tipo_saida ts
           WHERE (ts.gera_volume_etapa = 'CONFERÊNCIA' AND NOT COALESCE(ts.realiza_conferencia, false))
              OR (ts.gera_volume_etapa = 'CARREGAMENTO' AND NOT COALESCE(ts.realiza_embarque, false))), '-- nenhum'))
      ) AS o(objeto, def)
     WHERE NOT EXISTS (SELECT 1 FROM ops.rollback_definicao r
                        WHERE r.migration = '20261115220000_etq_f2_regras_geracao' AND r.objeto = o.objeto);
  END IF;
END $do$;

-- ============================================================
-- A10 — Tipo de saída: etapa de geração de volume coerente com as etapas
-- que o tipo realmente executa. Os tipos incoerentes nunca geravam volume
-- (a etapa não acontecia), então passam a NENHUMA: comportamento igual ao atual.
-- ============================================================
UPDATE public.tipo_saida
   SET gera_volume_etapa = 'NENHUMA'
 WHERE (gera_volume_etapa = 'CONFERÊNCIA' AND NOT COALESCE(realiza_conferencia, false))
    OR (gera_volume_etapa = 'CARREGAMENTO' AND NOT COALESCE(realiza_embarque, false));

UPDATE public.tipo_saida SET gera_volume_etapa = 'NENHUMA' WHERE gera_volume_etapa IS NULL;

CREATE OR REPLACE FUNCTION public.tg_tipo_saida_valida_volume()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.gera_volume_etapa := COALESCE(NEW.gera_volume_etapa, 'NENHUMA');
  IF NEW.gera_volume_etapa = 'CONFERÊNCIA' AND NOT COALESCE(NEW.realiza_conferencia, false) THEN
    RAISE EXCEPTION 'TIPO_SAIDA_VOLUME_SEM_CONFERENCIA: o tipo de saída gera volume na conferência, mas não realiza conferência. Ative a conferência ou escolha outra etapa.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.gera_volume_etapa = 'CARREGAMENTO' AND NOT COALESCE(NEW.realiza_embarque, false) THEN
    RAISE EXCEPTION 'TIPO_SAIDA_VOLUME_SEM_EMBARQUE: o tipo de saída gera volume no carregamento, mas não realiza embarque. Ative o embarque ou escolha outra etapa.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_tipo_saida_valida_volume() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tipo_saida_valida_volume ON public.tipo_saida;
CREATE TRIGGER trg_tipo_saida_valida_volume
  BEFORE INSERT OR UPDATE OF gera_volume_etapa, realiza_conferencia, realiza_embarque ON public.tipo_saida
  FOR EACH ROW EXECUTE FUNCTION public.tg_tipo_saida_valida_volume();

-- ============================================================
-- A9 — Unicidade: um número de volume por pedido dentro da onda
-- (dados atuais conferidos: nenhuma repetição com número preenchido)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_volume_expedicao_pedido_numero
  ON public.volume_expedicao (movimento_saida_id, documento_saida_id, numero_volume)
  WHERE numero_volume IS NOT NULL AND documento_saida_id IS NOT NULL;

-- ============================================================
-- A9 — gerar_volumes_expedicao: volume sempre por pedido.
-- Onda com 1 pedido: igual a hoje (quantidade única). Onda com 2+ pedidos:
-- sem p_quantidades devolve INFORMAR_VOLUMES_POR_PEDIDO com a lista de pedidos;
-- com p_quantidades = [{"documento_saida_id": "...", "quantidade": n}, ...] gera.
-- A onda fica travada durante a geração (sem conjunto duplicado em toque duplo).
-- A empresa vem da onda, não do aparelho (p_empresa_id mantido por compatibilidade).
-- ============================================================
DROP FUNCTION IF EXISTS public.gerar_volumes_expedicao(uuid, uuid, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.gerar_volumes_expedicao(
  p_tenant_id uuid,
  p_empresa_id uuid,
  p_movimento_saida_id uuid,
  p_quantidade_volumes integer,
  p_etapa_origem text DEFAULT 'CONFERÊNCIA',
  p_quantidades jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ms             record;
  v_etapa          text;
  v_pedidos        jsonb;
  v_n_pedidos      int;
  v_itens          jsonb;
  v_item           jsonb;
  v_doc            uuid;
  v_qtd            int;
  v_num_pedido     bigint;
  v_total          int := 0;
  v_codigo         text;
  v_volume_id      uuid;
  v_volumes        jsonb := '[]'::jsonb;
  i                int;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  -- Trava a onda até o fim da transação
  SELECT ms.id, ms.empresa_id, ms.tipo_saida
    INTO v_ms
    FROM public.movimento_saida ms
   WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id
   FOR UPDATE;

  IF v_ms.id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOVIMENTO_NAO_ENCONTRADO',
      'mensagem', 'Movimento de saída não encontrado.');
  END IF;

  SELECT ts.gera_volume_etapa::text INTO v_etapa
    FROM public.tipo_saida ts
   WHERE ts.id = v_ms.tipo_saida AND ts.tenant_id = p_tenant_id;

  IF v_etapa IS NULL OR v_etapa = 'NENHUMA' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TIPO_SAIDA_SEM_VOLUME',
      'mensagem', 'Este tipo de saída não está configurado para gerar volumes.');
  END IF;

  IF v_etapa <> p_etapa_origem THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ETAPA_DIFERENTE',
      'mensagem', format('Geração de volume configurada para a etapa %s, não %s.', v_etapa, p_etapa_origem));
  END IF;

  IF EXISTS (SELECT 1 FROM public.volume_expedicao
              WHERE movimento_saida_id = p_movimento_saida_id AND tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VOLUMES_JA_GERADOS',
      'mensagem', 'Volumes já foram gerados para esta onda.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'documento_saida_id', ds.id,
           'numero_pedido', ds.numero_pedido,
           'parceiro_nome', p.razaosocial) ORDER BY msd.ordem NULLS LAST, ds.numero_pedido), '[]'::jsonb),
         count(*)
    INTO v_pedidos, v_n_pedidos
    FROM public.movimento_saida_documento msd
    JOIN public.documento_saida ds ON ds.id = msd.documento_saida_id
    LEFT JOIN public.parceiro p ON p.id = ds.parceiro_id
   WHERE msd.movimento_saida_id = p_movimento_saida_id;

  IF v_n_pedidos = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_SEM_PEDIDOS',
      'mensagem', 'A onda não tem pedidos vinculados.');
  END IF;

  IF p_quantidades IS NULL THEN
    IF v_n_pedidos > 1 THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'INFORMAR_VOLUMES_POR_PEDIDO',
        'mensagem', format('Esta onda tem %s pedidos. Informe a quantidade de volumes de cada pedido.', v_n_pedidos),
        'pedidos', v_pedidos);
    END IF;
    IF p_quantidade_volumes IS NULL OR p_quantidade_volumes <= 0 OR p_quantidade_volumes > 999 THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'QUANTIDADE_INVALIDA',
        'mensagem', 'Informe de 1 a 999 volumes.');
    END IF;
    v_itens := jsonb_build_array(jsonb_build_object(
      'documento_saida_id', v_pedidos->0->>'documento_saida_id', 'quantidade', p_quantidade_volumes));
  ELSE
    v_itens := p_quantidades;
    -- Cada pedido da onda exatamente uma vez, nenhum pedido de fora, 1 a 999 por pedido
    IF jsonb_typeof(v_itens) <> 'array'
       OR jsonb_array_length(v_itens) <> v_n_pedidos
       OR (SELECT count(DISTINCT x->>'documento_saida_id') FROM jsonb_array_elements(v_itens) x) <> v_n_pedidos
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_itens) x
                   WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pedidos) pd
                                      WHERE pd->>'documento_saida_id' = x->>'documento_saida_id')
                      OR (x->>'quantidade') !~ '^[0-9]+$'
                      OR (x->>'quantidade')::int NOT BETWEEN 1 AND 999) THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'QUANTIDADES_INVALIDAS',
        'mensagem', 'Informe de 1 a 999 volumes para cada pedido da onda.',
        'pedidos', v_pedidos);
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_itens) LOOP
    v_doc := (v_item->>'documento_saida_id')::uuid;
    v_qtd := (v_item->>'quantidade')::int;
    SELECT (pd->>'numero_pedido')::bigint INTO v_num_pedido
      FROM jsonb_array_elements(v_pedidos) pd WHERE pd->>'documento_saida_id' = v_doc::text;

    FOR i IN 1..v_qtd LOOP
      v_codigo := 'VOL-' || lpad(nextval('volume_expedicao_codigo_seq')::text, 6, '0');
      INSERT INTO public.volume_expedicao (
        tenant_id, empresa_id, movimento_saida_id, documento_saida_id,
        codigo_volume, numero_volume, status)
      VALUES (p_tenant_id, v_ms.empresa_id, p_movimento_saida_id, v_doc,
        v_codigo, i, 'ABERTO'::enum_status_volume)
      RETURNING id INTO v_volume_id;

      v_volumes := v_volumes || jsonb_build_object(
        'id', v_volume_id,
        'codigo_volume', v_codigo,
        'numero_volume', i,
        'total_volumes', v_qtd,
        'documento_saida_id', v_doc,
        'numero_pedido', v_num_pedido,
        'identificacao_volume', i::text || '/' || v_qtd::text);
    END LOOP;
    v_total := v_total + v_qtd;
  END LOOP;

  RETURN jsonb_build_object(
    'sucesso', true,
    'mensagem', format('%s volume(s) gerado(s) com sucesso.', v_total),
    'total_volumes', v_total,
    'volumes', v_volumes);
END;
$$;
REVOKE ALL ON FUNCTION public.gerar_volumes_expedicao(uuid, uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_volumes_expedicao(uuid, uuid, uuid, integer, text, jsonb) TO authenticated, service_role;

-- ============================================================
-- D3 — embarque_gerar_volumes: gerar no embarque um pedido cujo tipo de saída
-- não está configurado para CARREGAMENTO é exceção. Exige motivo (o coletor
-- pede quando recebe EMBARQUE_MOTIVO_OBRIGATORIO) e registra ocorrência.
-- ============================================================
DROP FUNCTION IF EXISTS public.embarque_gerar_volumes(uuid, uuid, uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.embarque_gerar_volumes(
  p_tenant_id uuid, p_carga_id uuid, p_usuario_id uuid, p_carga_documento_id uuid,
  p_quantidade integer, p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_u uuid; v_c record; v_cd record; v_ids uuid[] := '{}'; v_id uuid; i integer; v_vols jsonb;
        v_etapa text; v_excecao boolean; v_armazem uuid;
BEGIN
  v_u := public._fn_carga_autorizar(p_tenant_id, p_usuario_id, true);
  PERFORM public._fn_embarque_checar_responsavel(p_carga_id, v_u);
  SELECT c.* INTO v_c FROM carga c WHERE c.id = p_carga_id AND c.tenant_id = p_tenant_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'CARGA_NAO_ENCONTRADA: carga não encontrada.'; END IF;
  IF v_c.status NOT IN ('LIBERADA','EM_CARREGAMENTO') THEN
    RAISE EXCEPTION 'EMBARQUE_CARGA_INDISPONIVEL: a carga #% está em %.', v_c.numero_carga, v_c.status;
  END IF;
  PERFORM public._fn_embarque_checar_veiculo(p_carga_id);
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 999 THEN
    RAISE EXCEPTION 'EMBARQUE_QUANTIDADE_INVALIDA: informe de 1 a 999 volumes.';
  END IF;
  SELECT cd.*, ds.numero_pedido, ds.tipo_pedido_id, ms.numero_onda INTO v_cd FROM carga_documento cd
    JOIN documento_saida ds ON ds.id = cd.documento_saida_id JOIN movimento_saida ms ON ms.id = cd.movimento_saida_id
   WHERE cd.id = p_carga_documento_id AND cd.carga_id = p_carga_id AND cd.ativo;
  IF v_cd.id IS NULL THEN RAISE EXCEPTION 'EMBARQUE_PEDIDO_FORA_DA_CARGA: o pedido não faz parte desta carga.'; END IF;
  IF EXISTS (SELECT 1 FROM carga_unidade cu WHERE cu.carga_documento_id = v_cd.id AND cu.status <> 'CANCELADA') THEN
    RAISE EXCEPTION 'EMBARQUE_VOLUMES_JA_GERADOS: o pedido % já tem volumes; bipe as etiquetas dele.', v_cd.numero_pedido;
  END IF;

  -- D3: exceção quando o tipo de saída não gera volume no carregamento
  SELECT ts.gera_volume_etapa::text INTO v_etapa FROM tipo_saida ts
   WHERE ts.id = v_cd.tipo_pedido_id AND ts.tenant_id = p_tenant_id;
  v_excecao := COALESCE(v_etapa, 'NENHUMA') <> 'CARREGAMENTO';
  IF v_excecao AND (p_motivo IS NULL OR length(btrim(p_motivo)) < 5) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'EMBARQUE_MOTIVO_OBRIGATORIO',
      'mensagem', format('O pedido %s é de um tipo de saída que gera volume em %s, não no carregamento. Informe o motivo para gerar aqui (mínimo 5 caracteres).',
                         v_cd.numero_pedido, COALESCE(v_etapa, 'NENHUMA')));
  END IF;

  FOR i IN 1..p_quantidade LOOP
    INSERT INTO volume_expedicao (tenant_id, empresa_id, movimento_saida_id, documento_saida_id, codigo_volume, numero_volume, status, created_by)
    VALUES (v_c.tenant_id, v_c.empresa_id, v_cd.movimento_saida_id, v_cd.documento_saida_id,
            'VOL-' || lpad(nextval('volume_expedicao_codigo_seq')::text, 6, '0'), i, 'ABERTO', v_u)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;
  PERFORM public._fn_carga_gerar_unidades(p_carga_id, ARRAY[v_cd.movimento_saida_id]);
  PERFORM public._fn_carga_recalcular(p_carga_id);
  PERFORM public._fn_carga_registrar_evento(p_carga_id, 'VOLUMES_GERADOS', v_u,
    jsonb_build_object('carga_documento_id', v_cd.id, 'documento_saida_id', v_cd.documento_saida_id,
                       'quantidade', p_quantidade, 'excecao', v_excecao, 'motivo', p_motivo));

  IF v_excecao THEN
    SELECT b.armazem_id INTO v_armazem FROM box b WHERE b.id = v_c.box_id;
    PERFORM public.registrar_ocorrencia_operacional(
      p_tenant_id := v_c.tenant_id,
      p_empresa_id := v_c.empresa_id,
      p_armazem_id := v_armazem,
      p_tipo_ocorrencia := 'OUTROS',
      p_categoria := 'CORRETIVA',
      p_etapa_ocorrencia := 'EXPEDICAO',
      p_observacao := format('Volumes gerados no embarque fora da configuração: pedido %s, carga #%s, %s volume(s); tipo de saída gera volume em %s. Motivo: %s',
                             v_cd.numero_pedido, v_c.numero_carga, p_quantidade, COALESCE(v_etapa, 'NENHUMA'), btrim(p_motivo)),
      p_documento_origem_id := v_cd.documento_saida_id,
      p_tipo_documento_origem := 'DOCUMENTO_SAIDA',
      p_usuario_criador_id := v_u,
      p_usuario_causador_id := v_u,
      p_prioridade := 'MEDIA');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', v.id, 'codigo_volume', v.codigo_volume, 'numero_volume', v.numero_volume,
           'total_volumes', p_quantidade, 'numero_pedido', v_cd.numero_pedido, 'numero_onda', v_cd.numero_onda) ORDER BY v.numero_volume)
    INTO v_vols FROM volume_expedicao v WHERE v.id = ANY(v_ids);
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'EMBARQUE_VOLUMES_GERADOS',
    'mensagem', format('%s volume(s) gerado(s) para o pedido %s. Cole as etiquetas e bipe cada uma ao carregar.', p_quantidade, v_cd.numero_pedido)
                || CASE WHEN v_excecao THEN ' Exceção registrada como ocorrência.' ELSE '' END,
    'dados', jsonb_build_object('volumes', v_vols, 'excecao', v_excecao));
EXCEPTION WHEN raise_exception THEN RETURN public._fn_carga_erro(SQLERRM);
END $function$;
REVOKE ALL ON FUNCTION public.embarque_gerar_volumes(uuid, uuid, uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.embarque_gerar_volumes(uuid, uuid, uuid, uuid, integer, text) TO authenticated, service_role;

-- ========== ROLLBACK (manual) ==========
-- DROP FUNCTION public.gerar_volumes_expedicao(uuid,uuid,uuid,integer,text,jsonb);
-- DROP FUNCTION public.embarque_gerar_volumes(uuid,uuid,uuid,uuid,integer,text);
-- Executar as definições guardadas em ops.rollback_definicao (migration = '20261115220000_etq_f2_regras_geracao')
--   e refazer GRANT EXECUTE TO authenticated, service_role.
-- Tipos de saída: executar a linha 'data tipo_saida gera_volume_etapa' guardada no mesmo lugar.
-- DROP TRIGGER trg_tipo_saida_valida_volume ON public.tipo_saida; DROP FUNCTION public.tg_tipo_saida_valida_volume();
-- DROP INDEX public.uq_volume_expedicao_pedido_numero;
