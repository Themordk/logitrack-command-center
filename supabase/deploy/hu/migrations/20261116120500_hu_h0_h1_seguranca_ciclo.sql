-- Migration: 20261116120500_hu_h0_h1_seguranca_ciclo.sql
-- Plano HU — Fases H0 (segurança) e H1 (ciclo de vida e histórico).
-- Resolve: H2 (parcial: ciclo), H3, H4, H5, H6, H8, H9 da avaliação.
-- Decisões aplicadas: D3 (uma HU por movimento), D4 (HU gerada com antecedência pela sequência).
-- Risco: médio — retira a escrita direta em hu/hu_item; a tela HU e o coletor passam a usar funções.
-- Rollback: bloco ROLLBACK no fim (definições anteriores salvas em ops.rollback_definicao).

-- ============================================================
-- 0. Backup das definições que serão substituídas
-- ============================================================
INSERT INTO ops.rollback_definicao (migration, objeto, definicao)
SELECT '20261116120500_hu_h0_h1_seguranca_ciclo', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_hu_recebimento','desvincular_item_hu','buscar_hu_por_codigo',
                    'finalizar_conferencia_entrada_item','fn_limpar_conferencia_entrada');

-- ============================================================
-- 1. Colunas de rastro na HU
-- ============================================================
ALTER TABLE public.hu
  ADD COLUMN IF NOT EXISTS updated_by   uuid REFERENCES public.usuario(id),
  ADD COLUMN IF NOT EXISTS fechada_em   timestamptz,
  ADD COLUMN IF NOT EXISTS encerrada_em timestamptz;

-- ============================================================
-- 2. Histórico de eventos da HU
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hu_evento (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id            uuid        NOT NULL REFERENCES public.tenant(id),
  hu_id                uuid        NOT NULL REFERENCES public.hu(id) ON DELETE CASCADE,
  evento               text        NOT NULL CHECK (evento IN (
                         'CRIADA','EDITADA','ITEM_ADICIONADO','ITEM_REMOVIDO','FECHADA','REABERTA',
                         'ARMAZENADA','DESMONTADA','EXPEDIDA','DESCARTADA','IMPRESSA')),
  status_anterior      text,
  status_novo          text,
  usuario_id           uuid        REFERENCES public.usuario(id),
  motivo_ocorrencia_id uuid        REFERENCES public.motivo_ocorrencia(id),
  observacao           text,
  dados                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT clock_timestamp()  -- ordem estável dentro da mesma transação
);
CREATE INDEX IF NOT EXISTS idx_hu_evento_hu ON public.hu_evento (tenant_id, hu_id, created_at DESC);
ALTER TABLE public.hu_evento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hu_evento_tenant_select ON public.hu_evento;
CREATE POLICY hu_evento_tenant_select ON public.hu_evento FOR SELECT
  USING (tenant_id = public.get_current_tenant());
REVOKE ALL ON public.hu_evento FROM anon, authenticated;
GRANT SELECT ON public.hu_evento TO authenticated;

-- ============================================================
-- 3. H0 — sem escrita direta pela API
-- ============================================================
REVOKE ALL ON public.hu, public.hu_item FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.hu, public.hu_item FROM authenticated;
GRANT SELECT ON public.hu, public.hu_item TO authenticated;

-- ============================================================
-- 4. Funções internas
-- ============================================================

-- 4.1 Contexto: tenant e usuário da sessão + permissão (qualquer um dos pares módulo:ação)
CREATE OR REPLACE FUNCTION public._fn_hu_contexto(p_permissoes text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := public.get_current_tenant(); v_usuario uuid; v_par text; v_ok boolean := false;
BEGIN
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_SESSAO', 'mensagem', 'Sessão sem tenant válido.');
  END IF;
  SELECT u.id INTO v_usuario FROM public.usuario u
   WHERE u.auth_user_id = auth.uid() AND u.tenant_id = v_tenant LIMIT 1;
  IF v_usuario IS NOT NULL THEN
    FOREACH v_par IN ARRAY p_permissoes LOOP
      IF public.fn_usuario_tem_permissao(v_usuario, split_part(v_par, ':', 1), split_part(v_par, ':', 2)) THEN
        v_ok := true; EXIT;
      END IF;
    END LOOP;
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'SEM_PERMISSAO',
      'mensagem', 'Seu perfil não tem permissão para esta ação na HU.');
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'tenant_id', v_tenant, 'usuario_id', v_usuario);
END $$;

-- 4.2 Registro de evento
CREATE OR REPLACE FUNCTION public._fn_hu_evento(
  p_tenant uuid, p_hu uuid, p_evento text, p_de text, p_para text, p_usuario uuid,
  p_observacao text DEFAULT NULL, p_dados jsonb DEFAULT '{}'::jsonb, p_motivo uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.hu_evento (tenant_id, hu_id, evento, status_anterior, status_novo, usuario_id,
                                motivo_ocorrencia_id, observacao, dados)
  VALUES (p_tenant, p_hu, p_evento, p_de, p_para, p_usuario, p_motivo, nullif(btrim(p_observacao), ''),
          COALESCE(p_dados, '{}'::jsonb));
$$;

-- 4.3 Próximo código (única fonte: sequencia.hu), pulando códigos já usados
CREATE OR REPLACE FUNCTION public._fn_hu_proximo_codigo(p_tenant uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n numeric; v_cod text; v_i int := 0;
BEGIN
  INSERT INTO public.sequencia (tenant_id, hu, endereco)
  SELECT p_tenant, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM public.sequencia WHERE tenant_id = p_tenant);
  LOOP
    UPDATE public.sequencia SET hu = COALESCE(hu, 0) + 1 WHERE tenant_id = p_tenant RETURNING hu INTO v_n;
    v_cod := 'HU-' || lpad(v_n::bigint::text, 9, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.hu WHERE tenant_id = p_tenant AND codigo_hu = v_cod);
    v_i := v_i + 1;
    IF v_i > 10000 THEN RAISE EXCEPTION 'Não foi possível gerar código de HU livre.'; END IF;
  END LOOP;
  RETURN v_cod;
END $$;

-- Sincroniza a sequência com os códigos já gravados (HUs criadas pela tela antiga não avançavam a sequência)
UPDATE public.sequencia s SET hu = GREATEST(COALESCE(s.hu, 0), x.mx)
FROM (SELECT tenant_id, max(substring(codigo_hu FROM '^HU-(\d+)$')::numeric) mx
        FROM public.hu WHERE codigo_hu ~ '^HU-\d+$' GROUP BY tenant_id) x
WHERE x.tenant_id = s.tenant_id;

-- 4.4 Validação de HU para a conferência de entrada (só leitura)
CREATE OR REPLACE FUNCTION public._fn_hu_validar_conferencia(p_hu uuid, p_tarefa_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := public.get_current_tenant(); v_hu record; v_mov record;
BEGIN
  IF p_hu IS NULL OR p_hu = public.hu_padrao() THEN RETURN jsonb_build_object('sucesso', true); END IF;
  SELECT me.id, me.empresa_id, me.armazem_id INTO v_mov
  FROM public.tarefa t
  JOIN public.movimento_entrada_item mei ON mei.id = t.id_documento_origem AND mei.tenant_id = t.tenant_id
  JOIN public.movimento_entrada me ON me.id = mei.movimento_entrada_id AND me.tenant_id = t.tenant_id
  WHERE t.id = p_tarefa_id AND t.tenant_id = v_tenant;

  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu AND h.tenant_id = v_tenant;
  IF NOT FOUND OR NOT v_hu.ativo THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_INVALIDA',
      'mensagem', 'HU informada não encontrada ou inativa para este tenant.');
  END IF;
  IF v_hu.status <> 'ABERTA' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_NAO_ABERTA',
      'mensagem', format('A HU %s está %s e não aceita itens. Use outra HU ou reabra esta.', v_hu.codigo_hu, v_hu.status));
  END IF;
  IF v_mov.id IS NOT NULL THEN
    IF v_hu.empresa_id IS NOT NULL AND v_hu.empresa_id <> v_mov.empresa_id THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_OUTRA_EMPRESA',
        'mensagem', format('A HU %s é de outra empresa.', v_hu.codigo_hu));
    END IF;
    IF v_hu.armazem_id IS NOT NULL AND v_mov.armazem_id IS NOT NULL AND v_hu.armazem_id <> v_mov.armazem_id THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_OUTRO_ARMAZEM',
        'mensagem', format('A HU %s é de outro armazém.', v_hu.codigo_hu));
    END IF;
    IF v_hu.movimento_entrada_id IS NOT NULL AND v_hu.movimento_entrada_id <> v_mov.id
       AND EXISTS (SELECT 1 FROM public.hu_item hi WHERE hi.hu_id = v_hu.id) THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_OUTRO_MOVIMENTO',
        'mensagem', format('A HU %s já tem itens de outro recebimento. Use uma HU deste recebimento.', v_hu.codigo_hu));
    END IF;
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'movimento_entrada_id', v_mov.id,
                            'empresa_id', v_mov.empresa_id, 'armazem_id', v_mov.armazem_id);
END $$;

-- 4.5 Grava o item da HU a partir de uma execução de conferência já registrada
CREATE OR REPLACE FUNCTION public._fn_hu_conferencia_adicionar_item(p_tarefa_execucao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := public.get_current_tenant(); v_usuario uuid; v_te record; v_t record;
        v_val jsonb; v_hu record; v_sku text;
BEGIN
  SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = auth.uid() AND u.tenant_id = v_tenant LIMIT 1;
  SELECT te.* INTO v_te FROM public.tarefa_execucao te WHERE te.id = p_tarefa_execucao_id AND te.tenant_id = v_tenant;
  IF NOT FOUND OR v_te.hu IS NULL OR v_te.hu = public.hu_padrao() THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'EXECUCAO_SEM_HU', 'mensagem', 'Execução sem HU.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.hu_item hi WHERE hi.tarefa_execucao_id = v_te.id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ITEM_JA_NA_HU', 'mensagem', 'Item já registrado na HU.');
  END IF;
  SELECT t.produto_id INTO v_t FROM public.tarefa t WHERE t.id = v_te.tarefa_id AND t.tenant_id = v_tenant;

  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = v_te.hu AND h.tenant_id = v_tenant FOR UPDATE;
  v_val := public._fn_hu_validar_conferencia(v_te.hu, v_te.tarefa_id);
  IF NOT (v_val->>'sucesso')::boolean THEN RETURN v_val; END IF;

  INSERT INTO public.hu_item (tenant_id, hu_id, produto_id, tarefa_execucao_id, quantidade, lote,
                              data_validade, data_fabricacao, created_by)
  VALUES (v_tenant, v_te.hu, v_t.produto_id, v_te.id, v_te.quantidade_executada, COALESCE(v_te.lote, ''),
          COALESCE(v_te.validade, '1900-01-01'::date), COALESCE(v_te.fabricacao, '1900-01-01'::date),
          COALESCE(v_usuario, v_te.usuario_id));

  UPDATE public.hu
     SET disponibilidade = 'RESERVADA',
         movimento_entrada_id = COALESCE((v_val->>'movimento_entrada_id')::uuid, movimento_entrada_id),
         empresa_id = COALESCE(empresa_id, (v_val->>'empresa_id')::uuid),
         armazem_id = COALESCE(armazem_id, (v_val->>'armazem_id')::uuid),
         updated_by = COALESCE(v_usuario, v_te.usuario_id)
   WHERE id = v_te.hu;

  SELECT p.sku INTO v_sku FROM public.produto p WHERE p.id = v_t.produto_id;
  PERFORM public._fn_hu_evento(v_tenant, v_te.hu, 'ITEM_ADICIONADO', v_hu.status::text, v_hu.status::text,
    COALESCE(v_usuario, v_te.usuario_id), NULL,
    jsonb_build_object('produto_id', v_t.produto_id, 'sku', v_sku, 'quantidade', v_te.quantidade_executada,
                       'lote', v_te.lote, 'validade', v_te.validade, 'tarefa_execucao_id', v_te.id));
  RETURN jsonb_build_object('sucesso', true);
END $$;

-- 4.6 Remove o item da HU quando a conferência daquela execução é limpa
CREATE OR REPLACE FUNCTION public._fn_hu_conferencia_remover_item(p_tarefa_execucao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := public.get_current_tenant(); v_usuario uuid; v_item record; v_hu record; v_sku text;
BEGIN
  SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = auth.uid() AND u.tenant_id = v_tenant LIMIT 1;
  SELECT hi.* INTO v_item FROM public.hu_item hi
   WHERE hi.tarefa_execucao_id = p_tarefa_execucao_id AND hi.tenant_id = v_tenant;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', true, 'removido', false); END IF;

  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = v_item.hu_id FOR UPDATE;
  IF v_hu.status NOT IN ('ABERTA', 'FECHADA') THEN
    RAISE EXCEPTION 'A HU % está % e o item não pode mais ser retirado dela.', v_hu.codigo_hu, v_hu.status
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.hu_item WHERE id = v_item.id;
  SELECT p.sku INTO v_sku FROM public.produto p WHERE p.id = v_item.produto_id;
  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'ITEM_REMOVIDO', v_hu.status::text, v_hu.status::text, v_usuario,
    'Conferência do item limpa', jsonb_build_object('produto_id', v_item.produto_id, 'sku', v_sku,
    'quantidade', v_item.quantidade, 'lote', v_item.lote, 'tarefa_execucao_id', p_tarefa_execucao_id));

  IF NOT EXISTS (SELECT 1 FROM public.hu_item WHERE hu_id = v_hu.id) THEN
    UPDATE public.hu SET disponibilidade = 'DISPONIVEL', status = 'ABERTA', fechada_em = NULL, updated_by = v_usuario
     WHERE id = v_hu.id;
    IF v_hu.status = 'FECHADA' THEN
      PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'REABERTA', 'FECHADA', 'ABERTA', v_usuario,
        'HU ficou vazia');
    END IF;
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'removido', true);
END $$;

-- ============================================================
-- 5. Funções existentes reescritas
-- ============================================================

-- 5.1 criar_hu_recebimento: usuário da sessão, empresa/armazém conferidos, código pela função única
CREATE OR REPLACE FUNCTION public.criar_hu_recebimento(
  p_tenant_id uuid, p_empresa_id uuid, p_armazem_id uuid,
  p_tipo_hu text DEFAULT 'PALLET', p_tamanho text DEFAULT 'M',
  p_movimento_entrada_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL)   -- mantido por compatibilidade; IGNORADO (usa a sessão)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_codigo text; v_id uuid; v_empresa uuid := p_empresa_id;
        v_armazem uuid := p_armazem_id;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['coletor.recebimento:EXECUTE','coletor.conferencia:EXECUTE','web.atividades.hus:CREATE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  IF p_tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TENANT_INVALIDO', 'mensagem', 'Tenant inválido.');
  END IF;

  IF p_movimento_entrada_id IS NOT NULL THEN
    SELECT me.empresa_id, COALESCE(me.armazem_id, v_armazem) INTO v_empresa, v_armazem
      FROM public.movimento_entrada me WHERE me.id = p_movimento_entrada_id AND me.tenant_id = v_tenant;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOVIMENTO_INVALIDO', 'mensagem', 'Recebimento não encontrado.');
    END IF;
  END IF;
  IF v_empresa IS NULL OR NOT EXISTS (SELECT 1 FROM public.empresa e WHERE e.id = v_empresa AND e.tenant_id = v_tenant) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'EMPRESA_INVALIDA', 'mensagem', 'Empresa inválida.');
  END IF;
  IF v_armazem IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.armazem a WHERE a.id = v_armazem AND a.tenant_id = v_tenant) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ARMAZEM_INVALIDO', 'mensagem', 'Armazém inválido.');
  END IF;

  v_codigo := public._fn_hu_proximo_codigo(v_tenant);
  INSERT INTO public.hu (tenant_id, empresa_id, armazem_id, codigo_hu, tipo_hu, tamanho, status, disponibilidade,
                         movimento_entrada_id, created_by, updated_by, ativo)
  VALUES (v_tenant, v_empresa, v_armazem, v_codigo, p_tipo_hu::enum_tipo_hu, p_tamanho::enum_tamanho_hu,
          'ABERTA', 'DISPONIVEL', p_movimento_entrada_id, v_usuario, v_usuario, true)
  RETURNING id INTO v_id;
  PERFORM public._fn_hu_evento(v_tenant, v_id, 'CRIADA', NULL, 'ABERTA', v_usuario, NULL,
    jsonb_build_object('origem', 'RECEBIMENTO', 'movimento_entrada_id', p_movimento_entrada_id));

  RETURN jsonb_build_object('sucesso', true, 'hu_id', v_id, 'codigo_hu', v_codigo, 'tipo_hu', p_tipo_hu,
    'tamanho', p_tamanho, 'mensagem', 'HU ' || v_codigo || ' criada com sucesso.');
END $$;

-- 5.2 desvincular_item_hu: permissão, só HU Aberta, evento com motivo
DROP FUNCTION IF EXISTS public.desvincular_item_hu(uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.desvincular_item_hu(
  p_tenant_id uuid, p_hu_item_id uuid,
  p_usuario_id uuid DEFAULT NULL,   -- IGNORADO (usa a sessão)
  p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_item record; v_hu record; v_rest int; v_sku text;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:UPDATE','coletor.recebimento:EXECUTE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  IF p_tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TENANT_INVALIDO', 'mensagem', 'Tenant inválido.');
  END IF;
  IF nullif(btrim(p_observacao), '') IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOTIVO_OBRIGATORIO', 'mensagem', 'Informe o motivo.');
  END IF;

  SELECT hi.* INTO v_item FROM public.hu_item hi WHERE hi.id = p_hu_item_id AND hi.tenant_id = v_tenant;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'Item não encontrado na HU.');
  END IF;
  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = v_item.hu_id FOR UPDATE;
  IF v_hu.status <> 'ABERTA' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_NAO_ABERTA',
      'mensagem', format('A HU %s está %s; reabra antes de retirar itens.', v_hu.codigo_hu, v_hu.status));
  END IF;

  DELETE FROM public.hu_item WHERE id = v_item.id;
  IF v_item.tarefa_execucao_id IS NOT NULL THEN
    UPDATE public.tarefa_execucao SET hu = NULL WHERE id = v_item.tarefa_execucao_id AND tenant_id = v_tenant;
  END IF;
  SELECT count(*) INTO v_rest FROM public.hu_item WHERE hu_id = v_hu.id;
  UPDATE public.hu SET updated_by = v_usuario,
         disponibilidade = CASE WHEN v_rest = 0 THEN 'DISPONIVEL'::enum_disponibilidade_hu ELSE disponibilidade END
   WHERE id = v_hu.id;
  SELECT p.sku INTO v_sku FROM public.produto p WHERE p.id = v_item.produto_id;
  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'ITEM_REMOVIDO', 'ABERTA', 'ABERTA', v_usuario, p_observacao,
    jsonb_build_object('produto_id', v_item.produto_id, 'sku', v_sku, 'quantidade', v_item.quantidade,
                       'lote', v_item.lote, 'tarefa_execucao_id', v_item.tarefa_execucao_id));
  RETURN jsonb_build_object('sucesso', true, 'itens_restantes', v_rest, 'mensagem', 'Item desvinculado da HU.');
END $$;

-- 5.3 buscar_hu_por_codigo: "disponível" passa a respeitar o status
CREATE OR REPLACE FUNCTION public.buscar_hu_por_codigo(p_tenant_id uuid, p_codigo_hu text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hu record; v_qtd int;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_id é obrigatório'; END IF;
  IF p_codigo_hu IS NULL OR btrim(p_codigo_hu) = '' THEN RAISE EXCEPTION 'codigo_hu é obrigatório'; END IF;

  SELECT h.* INTO v_hu FROM public.hu h
   WHERE h.tenant_id = p_tenant_id AND h.codigo_hu = btrim(p_codigo_hu) AND h.id <> public.hu_padrao() LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('encontrada', false, 'mensagem', 'HU não encontrada: ' || p_codigo_hu);
  END IF;
  IF NOT v_hu.ativo OR v_hu.status IN ('EXPEDIDA', 'DESCARTADA', 'DESMONTADA') THEN
    RETURN jsonb_build_object('encontrada', true, 'disponivel', false, 'hu_id', v_hu.id, 'codigo_hu', v_hu.codigo_hu,
      'status', v_hu.status,
      'mensagem', format('HU %s está %s e não pode ser usada.', v_hu.codigo_hu,
                         CASE WHEN NOT v_hu.ativo THEN 'inativa' ELSE lower(v_hu.status::text) END));
  END IF;
  SELECT count(*) INTO v_qtd FROM public.hu_item WHERE hu_id = v_hu.id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object(
    'encontrada', true, 'disponivel', true, 'aceita_itens', v_hu.status = 'ABERTA',
    'hu_id', v_hu.id, 'codigo_hu', v_hu.codigo_hu, 'tipo_hu', v_hu.tipo_hu, 'tamanho', v_hu.tamanho,
    'status', v_hu.status, 'disponibilidade', v_hu.disponibilidade, 'empresa_id', v_hu.empresa_id,
    'armazem_id', v_hu.armazem_id, 'movimento_entrada_id', v_hu.movimento_entrada_id,
    'endereco_id', v_hu.endereco_id, 'qtd_itens', v_qtd, 'mensagem', 'HU encontrada.');
END $$;

-- 5.4 finalizar_conferencia_entrada_item: HU validada antes e gravada pela função interna
CREATE OR REPLACE FUNCTION public.finalizar_conferencia_entrada_item(p_tarefa_id uuid, p_usuario uuid, p_quantidade numeric, p_lote text, p_validade date, p_fabricacao date, p_hu uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id          uuid;
  v_produto_id         uuid;
  v_qtd_requerida      numeric;
  v_qtd_executada       numeric;
  v_tarefa_execucao_id uuid;
  v_hu_val             jsonb;
  v_hu_res             jsonb;
  v_tipo_documento     text;
  v_doc_origem_id      uuid;
  v_tipo_controle      text;
  v_shelf_entrada      numeric;
  v_shelf_devolucao    numeric;
  v_parceiro_shelf     integer;
  v_is_devolucao       boolean;
  v_shelf_minimo       numeric;
  v_dias_restantes     integer;
BEGIN
  SELECT t.tenant_id, t.quantidade_requerida, COALESCE(t.quantidade_executada, 0), t.produto_id,
         t.tipo_documento_origem, t.id_documento_origem
  INTO v_tenant_id, v_qtd_requerida, v_qtd_executada, v_produto_id, v_tipo_documento, v_doc_origem_id
  FROM tarefa t WHERE t.id = p_tarefa_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM tarefa tc WHERE tc.id = p_tarefa_id AND tc.status = 'CANCELADA'::enum_status_tarefa) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TAREFA_CANCELADA',
      'mensagem', 'Esta tarefa foi cancelada (documento removido do movimento ou movimento cancelado). Atualize a lista de tarefas.');
  END IF;

  IF v_produto_id IS NOT NULL THEN
    SELECT p.tipo_controle::text, p.shelf_entrada, p.shelf_devolucao
      INTO v_tipo_controle, v_shelf_entrada, v_shelf_devolucao
    FROM produto p WHERE p.id = v_produto_id AND p.tenant_id = v_tenant_id;

    IF v_tipo_controle = 'VALIDADE' THEN
      IF p_validade IS NULL THEN
        RETURN jsonb_build_object('sucesso', false, 'codigo', 'VALIDADE_OBRIGATORIA',
          'mensagem', 'A data de validade é obrigatória para produtos com controle de validade.');
      END IF;
      v_dias_restantes := p_validade - CURRENT_DATE;
      v_is_devolucao := false;
      IF v_tipo_documento = 'MOVIMENTO_ENTRADA_ITEM' AND v_doc_origem_id IS NOT NULL THEN
        SELECT COALESCE(te.devolucao, false) INTO v_is_devolucao
        FROM movimento_entrada_item mei
        JOIN movimento_entrada me ON me.id = mei.movimento_entrada_id AND me.tenant_id = v_tenant_id
        JOIN tipo_entrada te ON te.id = me.tipo_entrada_id AND te.tenant_id = v_tenant_id
        WHERE mei.id = v_doc_origem_id AND mei.tenant_id = v_tenant_id;
      END IF;
      IF v_is_devolucao THEN v_shelf_minimo := COALESCE(v_shelf_devolucao, 0);
      ELSE v_shelf_minimo := COALESCE(v_shelf_entrada, 0); END IF;
      IF v_tipo_documento = 'MOVIMENTO_ENTRADA_ITEM' AND v_doc_origem_id IS NOT NULL THEN
        SELECT COALESCE(pa.dias_shelf, 0) INTO v_parceiro_shelf
        FROM movimento_entrada_item mei
        JOIN movimento_entrada me ON me.id = mei.movimento_entrada_id AND me.tenant_id = v_tenant_id
        JOIN movimento_entrada_documento med ON med.movimento_entrada_id = me.id AND med.tenant_id = v_tenant_id
        JOIN documento_entrada de ON de.id = med.documento_entrada_id AND de.tenant_id = v_tenant_id
        JOIN parceiro pa ON pa.id = de.parceiro_id AND pa.tenant_id = v_tenant_id
        WHERE mei.id = v_doc_origem_id AND mei.tenant_id = v_tenant_id
        LIMIT 1;
      END IF;
      v_shelf_minimo := GREATEST(v_shelf_minimo, COALESCE(v_parceiro_shelf, 0));
      IF v_shelf_minimo > 0 AND v_dias_restantes < v_shelf_minimo THEN
        RETURN jsonb_build_object('sucesso', false, 'codigo', 'SHELF_LIFE_INSUFICIENTE',
          'mensagem', format('Shelf life insuficiente: %s dias restantes, mínimo exigido %s dias.%s',
            v_dias_restantes, v_shelf_minimo, CASE WHEN v_is_devolucao THEN ' (critério de devolução)' ELSE '' END),
          'dados', jsonb_build_object('dias_restantes', v_dias_restantes, 'shelf_minimo', v_shelf_minimo,
            'is_devolucao', v_is_devolucao,
            'shelf_produto', CASE WHEN v_is_devolucao THEN v_shelf_devolucao ELSE v_shelf_entrada END,
            'shelf_parceiro', v_parceiro_shelf));
      END IF;
    END IF;
  END IF;

  -- hu-h1 (16/11/2026): HU validada antes de registrar a execução (status Aberta, empresa, armazém, movimento)
  IF p_hu IS NOT NULL AND p_hu <> public.hu_padrao() THEN
    v_hu_val := public._fn_hu_validar_conferencia(p_hu, p_tarefa_id);
    IF NOT (v_hu_val->>'sucesso')::boolean THEN RETURN v_hu_val; END IF;
  END IF;

  INSERT INTO tarefa_execucao (
    tenant_id, tarefa_id, usuario_id, status, atribuido_em, iniciado_em, concluido_em,
    quantidade_executada, lote, validade, fabricacao, hu
  ) VALUES (
    v_tenant_id, p_tarefa_id, p_usuario, 'CONCLUIDA',
    COALESCE((SELECT ta.atribuido_em::timestamptz FROM tarefa_atribuicao ta
              WHERE ta.tarefa_id = p_tarefa_id ORDER BY ta.atribuido_em DESC LIMIT 1), now()),
    COALESCE((SELECT MIN(te.iniciado_em) FROM tarefa_execucao te
              WHERE te.tarefa_id = p_tarefa_id AND te.status = 'CONCLUIDA'), now()),
    now(), p_quantidade, p_lote, p_validade, p_fabricacao, p_hu
  ) RETURNING id INTO v_tarefa_execucao_id;

  -- hu-h0 (16/11/2026): item da HU gravado pela função interna (sem escrita direta na tabela)
  IF p_hu IS NOT NULL AND p_hu <> public.hu_padrao() THEN
    v_hu_res := public._fn_hu_conferencia_adicionar_item(v_tarefa_execucao_id);
    IF NOT (v_hu_res->>'sucesso')::boolean THEN
      RAISE EXCEPTION '%', v_hu_res->>'mensagem' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE tarefa SET quantidade_executada = quantidade_executada + p_quantidade WHERE id = p_tarefa_id;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'CONFERENCIA_REGISTRADA',
    'mensagem', 'Conferência do item registrada com sucesso.',
    'dados', jsonb_build_object('execucao_id', v_tarefa_execucao_id));
END;
$function$;

-- 5.5 fn_limpar_conferencia_entrada: item da HU retirado pela função interna
CREATE OR REPLACE FUNCTION public.fn_limpar_conferencia_entrada(p_tarefa_execucao_id uuid, p_tarefa_id uuid, p_quantidade numeric, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
    v_movimento_entrada_item_id uuid;
begin
    perform 1 from tarefa_execucao te
     where te.id = p_tarefa_execucao_id and te.tarefa_id = p_tarefa_id and te.tenant_id = p_tenant_id
     for update;
    if not found then
        raise exception 'Tarefa execução não encontrada.';
    end if;

    -- hu-h1: retira o item da HU antes de cancelar (falha se a HU já foi armazenada)
    perform public._fn_hu_conferencia_remover_item(p_tarefa_execucao_id);

    update tarefa_execucao set status = 'CANCELADA'
     where id = p_tarefa_execucao_id and tenant_id = p_tenant_id;

    select id_documento_origem into v_movimento_entrada_item_id
      from tarefa where id = p_tarefa_id and tenant_id = p_tenant_id for update;
    if v_movimento_entrada_item_id is null then
        raise exception 'Tarefa não possui documento origem.';
    end if;

    update tarefa set quantidade_executada = greatest(0, quantidade_executada - p_quantidade)
     where id = p_tarefa_id and tenant_id = p_tenant_id;

    update movimento_entrada_item
       set qtd_conferida = greatest(0, qtd_conferida - p_quantidade),
           status_item_movimento = 'EM_ANDAMENTO'
     where id = v_movimento_entrada_item_id and tenant_id = p_tenant_id;
end;
$function$;

-- ============================================================
-- 6. Funções da tela Atividades › HU e do coletor (H0/H1)
-- ============================================================

-- 6.1 Gerar HUs com antecedência (D4)
CREATE OR REPLACE FUNCTION public.rpc_hu_gerar(
  p_quantidade int, p_tipo_hu text, p_tamanho text, p_empresa_id uuid, p_armazem_id uuid DEFAULT NULL,
  p_peso_bruto numeric DEFAULT NULL, p_m3 numeric DEFAULT NULL, p_altura numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_i int; v_cod text; v_id uuid; v_out jsonb := '[]'::jsonb;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:CREATE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_quantidade > 500 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'QUANTIDADE_INVALIDA', 'mensagem', 'Quantidade entre 1 e 500.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresa e WHERE e.id = p_empresa_id AND e.tenant_id = v_tenant) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'EMPRESA_INVALIDA', 'mensagem', 'Empresa inválida.');
  END IF;
  IF p_armazem_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.armazem a WHERE a.id = p_armazem_id AND a.tenant_id = v_tenant) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ARMAZEM_INVALIDO', 'mensagem', 'Armazém inválido.');
  END IF;
  FOR v_i IN 1..p_quantidade LOOP
    v_cod := public._fn_hu_proximo_codigo(v_tenant);
    INSERT INTO public.hu (tenant_id, empresa_id, armazem_id, codigo_hu, tipo_hu, tamanho, status, disponibilidade,
                           peso_bruto, m3, altura, created_by, updated_by, ativo)
    VALUES (v_tenant, p_empresa_id, p_armazem_id, v_cod, p_tipo_hu::enum_tipo_hu, nullif(p_tamanho, '')::enum_tamanho_hu,
            'ABERTA', 'DISPONIVEL', p_peso_bruto, p_m3, p_altura, v_usuario, v_usuario, true)
    RETURNING id INTO v_id;
    PERFORM public._fn_hu_evento(v_tenant, v_id, 'CRIADA', NULL, 'ABERTA', v_usuario, NULL,
      jsonb_build_object('origem', 'TELA_HU'));
    v_out := v_out || jsonb_build_object('hu_id', v_id, 'codigo_hu', v_cod);
  END LOOP;
  RETURN jsonb_build_object('sucesso', true, 'hus', v_out, 'mensagem', format('%s HU(s) gerada(s).', p_quantidade));
END $$;

-- 6.2 Editar dados de cadastro (status não muda por aqui)
CREATE OR REPLACE FUNCTION public.rpc_hu_editar(
  p_hu_id uuid, p_tipo_hu text, p_tamanho text, p_peso_bruto numeric, p_m3 numeric, p_altura numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_hu record;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:UPDATE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu_id AND h.tenant_id = v_tenant AND h.id <> public.hu_padrao() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada.'); END IF;
  IF v_hu.status IN ('EXPEDIDA','DESCARTADA','DESMONTADA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_ENCERRADA',
      'mensagem', format('A HU %s está %s e não pode ser editada.', v_hu.codigo_hu, v_hu.status));
  END IF;
  IF (p_peso_bruto IS NOT NULL AND p_peso_bruto < 0) OR (p_m3 IS NOT NULL AND p_m3 < 0) OR (p_altura IS NOT NULL AND p_altura < 0) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'VALOR_INVALIDO', 'mensagem', 'Peso, m³ e altura não podem ser negativos.');
  END IF;
  UPDATE public.hu SET tipo_hu = COALESCE(p_tipo_hu::enum_tipo_hu, tipo_hu),
         tamanho = nullif(p_tamanho, '')::enum_tamanho_hu,
         peso_bruto = p_peso_bruto, m3 = p_m3, altura = p_altura, updated_by = v_usuario
   WHERE id = v_hu.id;
  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'EDITADA', v_hu.status::text, v_hu.status::text, v_usuario, NULL,
    jsonb_build_object('antes', jsonb_build_object('tipo_hu', v_hu.tipo_hu, 'tamanho', v_hu.tamanho,
                         'peso_bruto', v_hu.peso_bruto, 'm3', v_hu.m3, 'altura', v_hu.altura),
                       'depois', jsonb_build_object('tipo_hu', COALESCE(p_tipo_hu, v_hu.tipo_hu::text), 'tamanho', p_tamanho,
                         'peso_bruto', p_peso_bruto, 'm3', p_m3, 'altura', p_altura)));
  RETURN jsonb_build_object('sucesso', true, 'mensagem', 'HU atualizada.');
END $$;

-- 6.3 Fechar (Aberta → Fechada, precisa ter itens)
CREATE OR REPLACE FUNCTION public.rpc_hu_fechar(p_hu_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_hu record; v_qtd int;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:UPDATE','coletor.recebimento:EXECUTE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu_id AND h.tenant_id = v_tenant AND h.id <> public.hu_padrao() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada.'); END IF;
  IF v_hu.status <> 'ABERTA' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'STATUS_INVALIDO',
      'mensagem', format('Só HU Aberta pode ser fechada (a HU %s está %s).', v_hu.codigo_hu, v_hu.status));
  END IF;
  SELECT count(*) INTO v_qtd FROM public.hu_item WHERE hu_id = v_hu.id;
  IF v_qtd = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_VAZIA', 'mensagem', 'A HU está vazia; não há o que fechar.');
  END IF;
  UPDATE public.hu SET status = 'FECHADA', fechada_em = now(), updated_by = v_usuario WHERE id = v_hu.id;
  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'FECHADA', 'ABERTA', 'FECHADA', v_usuario, NULL,
    jsonb_build_object('qtd_itens', v_qtd));
  RETURN jsonb_build_object('sucesso', true, 'mensagem', format('HU %s fechada.', v_hu.codigo_hu));
END $$;

-- 6.4 Reabrir (Fechada → Aberta, com motivo)
CREATE OR REPLACE FUNCTION public.rpc_hu_reabrir(p_hu_id uuid, p_observacao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_hu record;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:UPDATE','coletor.recebimento:EXECUTE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  IF nullif(btrim(p_observacao), '') IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOTIVO_OBRIGATORIO', 'mensagem', 'Informe o motivo.');
  END IF;
  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu_id AND h.tenant_id = v_tenant AND h.id <> public.hu_padrao() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada.'); END IF;
  IF v_hu.status <> 'FECHADA' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'STATUS_INVALIDO',
      'mensagem', format('Só HU Fechada pode ser reaberta (a HU %s está %s).', v_hu.codigo_hu, v_hu.status));
  END IF;
  UPDATE public.hu SET status = 'ABERTA', fechada_em = NULL, updated_by = v_usuario WHERE id = v_hu.id;
  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'REABERTA', 'FECHADA', 'ABERTA', v_usuario, p_observacao);
  RETURN jsonb_build_object('sucesso', true, 'mensagem', format('HU %s reaberta.', v_hu.codigo_hu));
END $$;

-- 6.5 Descartar (só HU Aberta e vazia; substitui a exclusão)
CREATE OR REPLACE FUNCTION public.rpc_hu_descartar(p_hu_id uuid, p_observacao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_hu record;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:DELETE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  IF nullif(btrim(p_observacao), '') IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOTIVO_OBRIGATORIO', 'mensagem', 'Informe o motivo.');
  END IF;
  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu_id AND h.tenant_id = v_tenant AND h.id <> public.hu_padrao() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada.'); END IF;
  IF v_hu.status <> 'ABERTA' OR EXISTS (SELECT 1 FROM public.hu_item WHERE hu_id = v_hu.id)
     OR EXISTS (SELECT 1 FROM public.estoque_geral eg WHERE eg.hu_id = v_hu.id AND eg.quantidade_total <> 0) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_NAO_VAZIA',
      'mensagem', format('Só HU Aberta e vazia pode ser descartada (a HU %s está %s).', v_hu.codigo_hu, v_hu.status));
  END IF;
  UPDATE public.hu SET status = 'DESCARTADA', disponibilidade = 'DESCARTADA', ativo = false,
         encerrada_em = now(), updated_by = v_usuario WHERE id = v_hu.id;
  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'DESCARTADA', 'ABERTA', 'DESCARTADA', v_usuario, p_observacao);
  RETURN jsonb_build_object('sucesso', true, 'mensagem', format('HU %s descartada.', v_hu.codigo_hu));
END $$;

-- 6.6 Histórico da HU
CREATE OR REPLACE FUNCTION public.rpc_hu_eventos(p_hu_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:READ','coletor.recebimento:READ','coletor.armazenagem:READ']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;
  RETURN jsonb_build_object('sucesso', true, 'eventos', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', e.id, 'evento', e.evento, 'status_anterior', e.status_anterior,
             'status_novo', e.status_novo, 'usuario', u.nome, 'observacao', e.observacao, 'dados', e.dados,
             'created_at', e.created_at) ORDER BY e.created_at DESC)
    FROM public.hu_evento e LEFT JOIN public.usuario u ON u.id = e.usuario_id
    WHERE e.hu_id = p_hu_id AND e.tenant_id = v_tenant), '[]'::jsonb));
END $$;

-- ============================================================
-- 7. Permissões de execução
-- ============================================================
REVOKE ALL ON FUNCTION public._fn_hu_contexto(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_hu_evento(uuid, uuid, text, text, text, uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_hu_proximo_codigo(uuid) FROM PUBLIC, anon, authenticated;
-- chamadas de dentro de funções SECURITY INVOKER (conferência), por isso liberadas a authenticated;
-- ambas só agem sobre execuções do tenant da sessão e conferem status/empresa/armazém/movimento.
REVOKE ALL ON FUNCTION public._fn_hu_validar_conferencia(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_hu_conferencia_adicionar_item(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_hu_conferencia_remover_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_hu_validar_conferencia(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._fn_hu_conferencia_adicionar_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._fn_hu_conferencia_remover_item(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.criar_hu_recebimento(uuid, uuid, uuid, text, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.desvincular_item_hu(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buscar_hu_por_codigo(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_hu_gerar(int, text, text, uuid, uuid, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_hu_editar(uuid, text, text, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_hu_fechar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_hu_reabrir(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_hu_descartar(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_hu_eventos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_hu_recebimento(uuid, uuid, uuid, text, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desvincular_item_hu(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_hu_por_codigo(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hu_gerar(int, text, text, uuid, uuid, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hu_editar(uuid, text, text, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hu_fechar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hu_reabrir(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hu_descartar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hu_eventos(uuid) TO authenticated;

-- ============================================================
-- ROLLBACK (manual)
-- 1. Recriar as 5 funções a partir de ops.rollback_definicao (migration '20261116120500_hu_h0_h1_seguranca_ciclo');
--    para desvincular_item_hu: DROP FUNCTION public.desvincular_item_hu(uuid,uuid,uuid,text) antes.
-- 2. GRANT INSERT, UPDATE, DELETE ON public.hu, public.hu_item TO authenticated;
-- 3. DROP FUNCTION rpc_hu_gerar, rpc_hu_editar, rpc_hu_fechar, rpc_hu_reabrir, rpc_hu_descartar, rpc_hu_eventos,
--    _fn_hu_conferencia_adicionar_item, _fn_hu_conferencia_remover_item, _fn_hu_validar_conferencia,
--    _fn_hu_proximo_codigo, _fn_hu_evento, _fn_hu_contexto;
-- 4. DROP TABLE public.hu_evento;  (as colunas novas de hu podem ficar)
-- ============================================================
