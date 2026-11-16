-- Migration: 20261116140000_hu_h2_armazenagem.sql
-- Plano HU — Fase H2 (cadeia até o estoque).
-- Resolve: H1 (armazenagem não levava a HU ao estoque) e o restante de H2 (endereço e status Armazenada).
-- Decisões aplicadas: D2 (HU inteira num endereço só), D5 (HU que vai para picking ou esvazia fica Desmontada).
-- Regras:
--   * rpc_coletor_armazenar_hu armazena TODOS os itens da HU num endereço, com uma execução por item
--     (reaproveita finalizar_armazenagem: picking, capacidade, bloqueio, status do movimento).
--     Endereço de pulmão: estoque com hu_id e HU Armazenada no endereço. Endereço de picking: estoque sem HU
--     e HU Desmontada (D5). Qualquer recusa desfaz a HU inteira.
--   * finalizar_armazenagem recusa p_hu fora desse caminho e não deixa armazenar avulso a quantidade que
--     está dentro de HU ainda não armazenada.
--   * Gatilho em estoque_geral: HU Armazenada que fica sem saldo → Desmontada; saldo todo num endereço novo
--     → endereço da HU atualizado (evento MOVIDA).
--   * Armazenagem automática do movimento: estoque vai sem HU, então as HUs do movimento ficam Desmontadas.
-- Risco: médio (altera finalizar_armazenagem e fn_liberar_armz_executar_automatica por inserção de trecho).
-- Rollback: bloco no fim; definições anteriores em ops.rollback_definicao.

INSERT INTO ops.rollback_definicao (migration, objeto, definicao)
SELECT '20261116140000_hu_h2_armazenagem', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('finalizar_armazenagem', 'fn_liberar_armz_executar_automatica');

ALTER TABLE public.hu_evento DROP CONSTRAINT IF EXISTS hu_evento_evento_check;
ALTER TABLE public.hu_evento ADD CONSTRAINT hu_evento_evento_check CHECK (evento IN (
  'CRIADA','EDITADA','ITEM_ADICIONADO','ITEM_REMOVIDO','FECHADA','REABERTA',
  'ARMAZENADA','MOVIDA','DESMONTADA','EXPEDIDA','DESCARTADA','IMPRESSA'));

-- ============================================================
-- 1. Itens da HU com a tarefa de armazenagem correspondente
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_hu_itens_armazenagem(p_tenant uuid, p_hu uuid)
RETURNS TABLE (hu_item_id uuid, produto_id uuid, sku text, descricao text, quantidade numeric,
               lote text, validade date, fabricacao date, movimento_entrada_id uuid,
               tarefa_armz_id uuid, armz_restante numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT hi.id, hi.produto_id, p.sku, p.descricao, hi.quantidade,
         te.lote, te.validade, te.fabricacao, mei.movimento_entrada_id,
         ta.id, (ta.quantidade_requerida - COALESCE(ta.quantidade_executada, 0))
  FROM public.hu_item hi
  JOIN public.produto p ON p.id = hi.produto_id
  LEFT JOIN public.tarefa_execucao te ON te.id = hi.tarefa_execucao_id
  LEFT JOIN public.tarefa tc ON tc.id = te.tarefa_id
  LEFT JOIN public.movimento_entrada_item mei ON mei.id = tc.id_documento_origem
  LEFT JOIN LATERAL (
    SELECT t.id, t.quantidade_requerida, t.quantidade_executada
    FROM public.tarefa t JOIN public.tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'ENTR-ARMZ'
    WHERE t.tenant_id = p_tenant AND t.id_documento_origem = mei.id AND t.status IN ('CRIADA', 'EM_ANDAMENTO')
    ORDER BY t.criado_em LIMIT 1) ta ON true
  WHERE hi.hu_id = p_hu AND hi.tenant_id = p_tenant
  ORDER BY p.descricao, hi.created_at;
$$;
REVOKE ALL ON FUNCTION public._fn_hu_itens_armazenagem(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 2. Coletor: o que a HU tem e se já pode ser armazenada
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_coletor_hu_armazenagem(p_codigo_hu text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_hu record; v_itens jsonb; v_pend int; v_end text;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['coletor.armazenagem:EXECUTE','coletor.armazenagem:READ']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;
  SELECT h.* INTO v_hu FROM public.hu h
   WHERE h.tenant_id = v_tenant AND h.codigo_hu = upper(btrim(p_codigo_hu)) AND h.id <> public.hu_padrao();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada: ' || p_codigo_hu);
  END IF;
  SELECT e.descricao INTO v_end FROM public.endereco e WHERE e.id = v_hu.endereco_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('hu_item_id', i.hu_item_id, 'produto_id', i.produto_id, 'sku', i.sku,
           'descricao', i.descricao, 'quantidade', i.quantidade, 'lote', i.lote, 'validade', i.validade,
           'liberado', i.tarefa_armz_id IS NOT NULL AND i.armz_restante >= i.quantidade)), '[]'::jsonb),
         count(*) FILTER (WHERE i.tarefa_armz_id IS NULL OR i.armz_restante < i.quantidade)
    INTO v_itens, v_pend
  FROM public._fn_hu_itens_armazenagem(v_tenant, v_hu.id) i;

  RETURN jsonb_build_object('sucesso', true,
    'hu', jsonb_build_object('hu_id', v_hu.id, 'codigo_hu', v_hu.codigo_hu, 'tipo_hu', v_hu.tipo_hu,
                             'tamanho', v_hu.tamanho, 'status', v_hu.status, 'endereco', v_end),
    'itens', v_itens,
    'pode_armazenar', v_hu.status IN ('ABERTA','FECHADA') AND jsonb_array_length(v_itens) > 0 AND v_pend = 0,
    'motivo', CASE
      WHEN v_hu.status NOT IN ('ABERTA','FECHADA') THEN format('A HU já está %s%s.', lower(v_hu.status::text),
             CASE WHEN v_end IS NOT NULL THEN ' em ' || v_end ELSE '' END)
      WHEN jsonb_array_length(v_itens) = 0 THEN 'A HU está vazia.'
      WHEN v_pend > 0 THEN format('%s item(ns) da HU ainda não foram liberados para armazenagem.', v_pend)
    END);
END $$;
REVOKE ALL ON FUNCTION public.rpc_coletor_hu_armazenagem(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_hu_armazenagem(text) TO authenticated;

-- ============================================================
-- 3. Coletor: armazenar a HU inteira num endereço (D2/D5)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_coletor_armazenar_hu(
  p_hu_id uuid, p_endereco_destino_id uuid,
  p_picking_tipo enum_tipo_picking DEFAULT NULL, p_picking_est_minimo numeric DEFAULT NULL,
  p_picking_est_maximo numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_hu record; v_end record; v_i record; v_r jsonb;
        v_n int := 0; v_picking boolean; v_hu_estoque uuid; v_novo text; v_itens jsonb := '[]'::jsonb;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['coletor.armazenagem:EXECUTE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;

  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu_id AND h.tenant_id = v_tenant AND h.id <> public.hu_padrao() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada.'); END IF;
  IF v_hu.status NOT IN ('ABERTA', 'FECHADA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_JA_ARMAZENADA',
      'mensagem', format('A HU %s já está %s.', v_hu.codigo_hu, lower(v_hu.status::text)));
  END IF;

  SELECT e.id, e.descricao, e.tipo_endereco, e.armazem_id INTO v_end
    FROM public.endereco e WHERE e.id = p_endereco_destino_id AND e.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ENDERECO_NAO_ENCONTRADO', 'mensagem', 'Endereço destino não encontrado.');
  END IF;
  IF v_hu.armazem_id IS NOT NULL AND v_end.armazem_id IS DISTINCT FROM v_hu.armazem_id THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_OUTRO_ARMAZEM',
      'mensagem', format('O endereço %s é de outro armazém.', v_end.descricao));
  END IF;
  v_picking := v_end.tipo_endereco = 'PICKING';
  v_hu_estoque := CASE WHEN v_picking THEN public.hu_padrao() ELSE v_hu.id END;

  IF NOT EXISTS (SELECT 1 FROM public.hu_item WHERE hu_id = v_hu.id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_VAZIA', 'mensagem', 'A HU está vazia.');
  END IF;
  IF EXISTS (SELECT 1 FROM public._fn_hu_itens_armazenagem(v_tenant, v_hu.id) i
              WHERE i.tarefa_armz_id IS NULL OR i.armz_restante < i.quantidade) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_ITEM_NAO_LIBERADO',
      'mensagem', 'Há item da HU ainda não liberado para armazenagem. Finalize a conferência e libere a armazenagem.');
  END IF;

  -- HU aberta fecha aqui (o mercado fecha antes de armazenar)
  IF v_hu.status = 'ABERTA' THEN
    UPDATE public.hu SET status = 'FECHADA', fechada_em = now(), updated_by = v_usuario WHERE id = v_hu.id;
    PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'FECHADA', 'ABERTA', 'FECHADA', v_usuario, 'Fechada na armazenagem');
  END IF;

  PERFORM set_config('logitrack.hu_armazenando', v_hu.id::text, true);
  FOR v_i IN SELECT * FROM public._fn_hu_itens_armazenagem(v_tenant, v_hu.id) LOOP
    v_r := public.finalizar_armazenagem(v_tenant, v_i.tarefa_armz_id, v_i.movimento_entrada_id, v_usuario,
             v_i.quantidade, p_endereco_destino_id, v_i.lote, v_i.validade, v_i.fabricacao, v_hu_estoque,
             p_picking_tipo, p_picking_est_minimo, p_picking_est_maximo);
    IF NOT COALESCE((v_r->>'sucesso')::boolean, false) THEN
      PERFORM set_config('logitrack.hu_armazenando', '', true);
      RAISE EXCEPTION '%', json_build_object('codigo', COALESCE(v_r->>'codigo', 'ERRO'),
        'mensagem', format('%s: %s', v_i.sku, COALESCE(v_r->>'mensagem', 'não foi possível armazenar.')),
        'dados', v_r->'dados')::text USING ERRCODE = 'P0001';
    END IF;
    v_n := v_n + 1;
    v_itens := v_itens || jsonb_build_object('sku', v_i.sku, 'quantidade', v_i.quantidade, 'lote', v_i.lote);
  END LOOP;
  PERFORM set_config('logitrack.hu_armazenando', '', true);

  v_novo := CASE WHEN v_picking THEN 'DESMONTADA' ELSE 'ARMAZENADA' END;
  UPDATE public.hu SET status = v_novo::enum_status_hu, endereco_id = p_endereco_destino_id,
         armazem_id = COALESCE(armazem_id, v_end.armazem_id), updated_by = v_usuario,
         encerrada_em = CASE WHEN v_picking THEN now() ELSE encerrada_em END
   WHERE id = v_hu.id;
  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, v_novo, 'FECHADA', v_novo, v_usuario,
    CASE WHEN v_picking THEN 'Armazenada em picking: o estoque fica sem HU' END,
    jsonb_build_object('endereco_id', p_endereco_destino_id, 'endereco', v_end.descricao, 'itens', v_itens));

  RETURN jsonb_build_object('sucesso', true, 'status', v_novo, 'endereco', v_end.descricao, 'itens', v_n,
    'resultado', v_r->>'resultado',
    'mensagem', CASE WHEN v_picking
      THEN format('HU %s armazenada no picking %s (%s item(ns)); a HU foi desmontada.', v_hu.codigo_hu, v_end.descricao, v_n)
      ELSE format('HU %s armazenada em %s (%s item(ns)).', v_hu.codigo_hu, v_end.descricao, v_n) END);
END $$;
REVOKE ALL ON FUNCTION public.rpc_coletor_armazenar_hu(uuid, uuid, enum_tipo_picking, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_armazenar_hu(uuid, uuid, enum_tipo_picking, numeric, numeric) TO authenticated;

-- ============================================================
-- 4. finalizar_armazenagem: HU só pelo caminho da HU; avulso não leva quantidade que está em HU
-- ============================================================
DO $do$
DECLARE v_def text; v_novo text;
  v_marca text := E'  -- =====================================================\n  -- 2. VALIDAR ENDERECO DESTINO';
  v_trecho text := $t$  -- hu-h2 (16/11/2026): armazenagem com HU só pela HU inteira (rpc_coletor_armazenar_hu)
  v_hu_ctx := COALESCE(current_setting('logitrack.hu_armazenando', true), '');
  IF p_hu IS NOT NULL AND p_hu <> public.hu_padrao() AND v_hu_ctx <> p_hu::text THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ARMAZENAR_PELA_HU',
      'mensagem', 'Para armazenar com HU, leia a HU: ela é armazenada inteira num endereço.');
  END IF;
  IF v_hu_ctx = '' THEN
    SELECT COALESCE(sum(hi.quantidade), 0), string_agg(DISTINCT h.codigo_hu, ', ')
      INTO v_qtd_hu, v_hus
    FROM public.hu_item hi
    JOIN public.hu h ON h.id = hi.hu_id AND h.status IN ('ABERTA', 'FECHADA')
    JOIN public.tarefa_execucao tex ON tex.id = hi.tarefa_execucao_id
    JOIN public.tarefa tcf ON tcf.id = tex.tarefa_id
    WHERE hi.tenant_id = p_tenant_id
      AND tcf.id_documento_origem = (SELECT ta.id_documento_origem FROM public.tarefa ta WHERE ta.id = p_tarefa_id);
    IF v_qtd_hu > 0 AND p_quantidade > (v_qtd_requerida - v_qtd_executada - v_qtd_hu) THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'ITEM_EM_HU',
        'mensagem', format('%s unidade(s) deste item estão na HU %s. Leia a HU para armazená-la inteira; avulso restam %s.',
                           v_qtd_hu, v_hus, GREATEST(v_qtd_requerida - v_qtd_executada - v_qtd_hu, 0)),
        'dados', jsonb_build_object('quantidade_em_hu', v_qtd_hu, 'hus', v_hus,
                                    'restante_avulso', GREATEST(v_qtd_requerida - v_qtd_executada - v_qtd_hu, 0)));
    END IF;
  END IF;

$t$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
   WHERE p.oid = 'public.finalizar_armazenagem(uuid,uuid,uuid,uuid,numeric,uuid,text,date,date,uuid,enum_tipo_picking,numeric,numeric)'::regprocedure;
  IF position('hu-h2 (16/11/2026)' IN v_def) > 0 THEN RETURN; END IF;  -- já aplicado
  IF position(v_marca IN v_def) = 0 THEN RAISE EXCEPTION 'hu_h2: marca não encontrada em finalizar_armazenagem'; END IF;
  v_novo := replace(v_def, v_marca, v_trecho || v_marca);
  v_novo := regexp_replace(v_novo, E'\nDECLARE\n', E'\nDECLARE\n  v_hu_ctx text;\n  v_qtd_hu numeric;\n  v_hus text;\n');
  EXECUTE v_novo;
END $do$;

-- ============================================================
-- 5. Estoque × HU: esvaziou → Desmontada; mudou de endereço inteira → endereço atualizado
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_hu_sincronizar_estoque(p_hu uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hu record; v_ends uuid[]; v_desc text; v_usuario uuid;
BEGIN
  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu FOR UPDATE;
  IF NOT FOUND OR v_hu.status <> 'ARMAZENADA' THEN RETURN; END IF;
  SELECT array_agg(DISTINCT eg.endereco_id) INTO v_ends
    FROM public.estoque_geral eg WHERE eg.hu_id = p_hu AND eg.quantidade_total > 0;
  SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = auth.uid() LIMIT 1;
  IF v_ends IS NULL THEN
    UPDATE public.hu SET status = 'DESMONTADA', disponibilidade = 'DISPONIVEL', encerrada_em = now(), updated_by = v_usuario
     WHERE id = p_hu;
    PERFORM public._fn_hu_evento(v_hu.tenant_id, p_hu, 'DESMONTADA', 'ARMAZENADA', 'DESMONTADA', v_usuario,
      'Estoque da HU esgotado (picking, transferência ou saída)');
  ELSIF array_length(v_ends, 1) = 1 AND v_ends[1] IS DISTINCT FROM v_hu.endereco_id THEN
    SELECT e.descricao INTO v_desc FROM public.endereco e WHERE e.id = v_ends[1];
    UPDATE public.hu SET endereco_id = v_ends[1], updated_by = v_usuario WHERE id = p_hu;
    PERFORM public._fn_hu_evento(v_hu.tenant_id, p_hu, 'MOVIDA', 'ARMAZENADA', 'ARMAZENADA', v_usuario, NULL,
      jsonb_build_object('endereco_anterior_id', v_hu.endereco_id, 'endereco_id', v_ends[1], 'endereco', v_desc));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._fn_hu_sincronizar_estoque(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_estoque_geral_hu()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._fn_hu_sincronizar_estoque(NEW.hu_id);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tg_estoque_geral_hu() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_estoque_geral_hu ON public.estoque_geral;
CREATE TRIGGER trg_estoque_geral_hu
  AFTER INSERT OR UPDATE OF quantidade_total, endereco_id ON public.estoque_geral
  FOR EACH ROW WHEN (NEW.hu_id <> '00000000-0000-0000-0000-000000000000'::uuid)
  EXECUTE FUNCTION public.tg_estoque_geral_hu();

-- ============================================================
-- 6. Armazenagem automática: estoque vai sem HU → HUs do movimento ficam Desmontadas
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_hu_desmontar_movimento_automatico(p_tenant uuid, p_movimento uuid, p_usuario uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h record;
BEGIN
  FOR v_h IN SELECT h.id, h.status FROM public.hu h
              WHERE h.tenant_id = p_tenant AND h.movimento_entrada_id = p_movimento AND h.status IN ('ABERTA','FECHADA')
                AND EXISTS (SELECT 1 FROM public.hu_item hi WHERE hi.hu_id = h.id)
              FOR UPDATE LOOP
    UPDATE public.hu SET status = 'DESMONTADA', encerrada_em = now(), updated_by = p_usuario WHERE id = v_h.id;
    PERFORM public._fn_hu_evento(p_tenant, v_h.id, 'DESMONTADA', v_h.status::text, 'DESMONTADA', p_usuario,
      'Armazenagem automática do recebimento: o estoque foi registrado sem HU');
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public._fn_hu_desmontar_movimento_automatico(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE v_def text;
  v_marca text := E'  GET DIAGNOSTICS v_qtd = ROW_COUNT;\n';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p
   WHERE p.proname = 'fn_liberar_armz_executar_automatica' AND p.pronamespace = 'public'::regnamespace;
  IF position('hu-h2' IN v_def) > 0 THEN RETURN; END IF;
  IF position(v_marca IN v_def) = 0 THEN RAISE EXCEPTION 'hu_h2: marca não encontrada em fn_liberar_armz_executar_automatica'; END IF;
  EXECUTE replace(v_def, v_marca, v_marca ||
    E'  -- hu-h2 (16/11/2026): estoque automático vai sem HU; as HUs do movimento ficam Desmontadas\n' ||
    E'  IF v_qtd > 0 THEN PERFORM public._fn_hu_desmontar_movimento_automatico(p_tenant_id, p_movimento_entrada_id, p_usuario_id); END IF;\n');
END $do$;

-- ============================================================
-- ROLLBACK (manual)
-- 1. Recriar finalizar_armazenagem e fn_liberar_armz_executar_automatica a partir de ops.rollback_definicao
--    (migration '20261116140000_hu_h2_armazenagem');
-- 2. DROP TRIGGER trg_estoque_geral_hu ON public.estoque_geral; DROP FUNCTION tg_estoque_geral_hu, _fn_hu_sincronizar_estoque,
--    _fn_hu_desmontar_movimento_automatico, rpc_coletor_armazenar_hu, rpc_coletor_hu_armazenagem, _fn_hu_itens_armazenagem;
-- ============================================================
