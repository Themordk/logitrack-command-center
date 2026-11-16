-- Migration: 20261116180000_hu_h7_h8_h9.sql
-- Plano HU — H7 (código SSCC/GS1), H8 (consulta, verificação de local e contagem por HU), H9 (dividir e juntar HU).
-- H7: empresa ganha formato do código da HU (PADRAO = HU-000000001 | SSCC) e prefixo GS1; o código SSCC tem
--     18 dígitos com dígito verificador (GS1 mod 10). Leitura aceita "(00)"/"00" + 18 dígitos e ]C1.
--     A HU pode nascer com o SSCC que o fornecedor já colou no pallet (criar_hu_recebimento.p_codigo_externo).
-- H8: rpc_coletor_hu_consulta (consulta no coletor pelo servidor), rpc_coletor_hu_verificar_local (evento VERIFICADA)
--     e rpc_coletor_inventario_hu (quantidade da HU para o produto/endereço da tarefa de inventário).
-- H9: rpc_hu_dividir e rpc_hu_juntar (só HU ainda não armazenada; HU armazenada fica para uma fase de estoque).
-- Risco: médio (troca a assinatura de _fn_hu_proximo_codigo e criar_hu_recebimento; ajusta funções da HU).
-- Rollback: bloco no fim; definições anteriores em ops.rollback_definicao.

INSERT INTO ops.rollback_definicao (migration, objeto, definicao)
SELECT '20261116180000_hu_h7_h8_h9', p.oid::regprocedure::text, pg_get_functiondef(p.oid)
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('_fn_hu_proximo_codigo','criar_hu_recebimento','rpc_hu_gerar','buscar_hu_por_codigo',
                    'rpc_coletor_hu_armazenagem','_fn_hu_conferencia_remover_item','desvincular_item_hu',
                    'rpc_hu_desmontar','_fn_etiqueta_hu_dados','rpc_hu_detalhe');

ALTER TABLE public.hu_evento DROP CONSTRAINT IF EXISTS hu_evento_evento_check;
ALTER TABLE public.hu_evento ADD CONSTRAINT hu_evento_evento_check CHECK (evento IN (
  'CRIADA','EDITADA','ITEM_ADICIONADO','ITEM_REMOVIDO','FECHADA','REABERTA','ARMAZENADA','MOVIDA','DESMONTADA',
  'EXPEDIDA','DESCARTADA','IMPRESSA','VERIFICADA','DIVIDIDA','JUNTADA'));

-- ============================================================
-- H7.1 Configuração por empresa
-- ============================================================
ALTER TABLE public.empresa
  ADD COLUMN IF NOT EXISTS hu_formato_codigo text NOT NULL DEFAULT 'PADRAO',
  ADD COLUMN IF NOT EXISTS gs1_prefixo text,
  ADD COLUMN IF NOT EXISTS gs1_digito_extensao smallint NOT NULL DEFAULT 0;
ALTER TABLE public.empresa DROP CONSTRAINT IF EXISTS empresa_hu_formato_codigo_check;
ALTER TABLE public.empresa ADD CONSTRAINT empresa_hu_formato_codigo_check CHECK (hu_formato_codigo IN ('PADRAO', 'SSCC'));
ALTER TABLE public.empresa DROP CONSTRAINT IF EXISTS empresa_gs1_prefixo_check;
ALTER TABLE public.empresa ADD CONSTRAINT empresa_gs1_prefixo_check CHECK (gs1_prefixo IS NULL OR gs1_prefixo ~ '^\d{7,10}$');
ALTER TABLE public.empresa DROP CONSTRAINT IF EXISTS empresa_gs1_extensao_check;
ALTER TABLE public.empresa ADD CONSTRAINT empresa_gs1_extensao_check CHECK (gs1_digito_extensao BETWEEN 0 AND 9);
ALTER TABLE public.empresa DROP CONSTRAINT IF EXISTS empresa_hu_sscc_prefixo_check;
ALTER TABLE public.empresa ADD CONSTRAINT empresa_hu_sscc_prefixo_check CHECK (hu_formato_codigo <> 'SSCC' OR gs1_prefixo IS NOT NULL);
COMMENT ON COLUMN public.empresa.hu_formato_codigo IS 'Formato do código da HU: PADRAO (HU-000000001) ou SSCC (GS1, 18 dígitos)';
COMMENT ON COLUMN public.empresa.gs1_prefixo IS 'Prefixo de empresa GS1 (7 a 10 dígitos), obrigatório com SSCC';

-- ============================================================
-- H7.2 GS1: dígito verificador, SSCC e normalização da leitura
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_gs1_digito(p_base text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT (10 - (sum(substr(r, i, 1)::int * CASE WHEN i % 2 = 1 THEN 3 ELSE 1 END) % 10)) % 10
  FROM (SELECT reverse(p_base) AS r) x, generate_series(1, length(p_base)) i;
$$;

CREATE OR REPLACE FUNCTION public._fn_sscc_valido(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p ~ '^\d{18}$' AND right(p, 1)::int = public._fn_gs1_digito(left(p, 17));
$$;

CREATE OR REPLACE FUNCTION public._fn_hu_normalizar_codigo(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN c ~ '^(00)?\d{18}$' THEN right(c, 18)
    ELSE c END
  FROM (SELECT upper(regexp_replace(regexp_replace(COALESCE(p, ''), '^\]C1', ''), '[\s()\x1d]', '', 'g')) AS c) x;
$$;

-- ============================================================
-- H7.3 Próximo código: formato da empresa (PADRAO ou SSCC), sempre pela sequência do tenant
-- ============================================================
DROP FUNCTION IF EXISTS public._fn_hu_proximo_codigo(uuid);
CREATE OR REPLACE FUNCTION public._fn_hu_proximo_codigo(p_tenant uuid, p_empresa uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n numeric; v_cod text; v_i int := 0; v_emp record; v_base text; v_tam int;
BEGIN
  SELECT e.hu_formato_codigo, e.gs1_prefixo, e.gs1_digito_extensao INTO v_emp
    FROM public.empresa e WHERE e.id = p_empresa AND e.tenant_id = p_tenant;
  INSERT INTO public.sequencia (tenant_id, hu, endereco)
  SELECT p_tenant, 0, 0 WHERE NOT EXISTS (SELECT 1 FROM public.sequencia WHERE tenant_id = p_tenant);
  LOOP
    UPDATE public.sequencia SET hu = COALESCE(hu, 0) + 1 WHERE tenant_id = p_tenant RETURNING hu INTO v_n;
    IF v_emp.hu_formato_codigo = 'SSCC' AND v_emp.gs1_prefixo IS NOT NULL THEN
      v_tam := 16 - length(v_emp.gs1_prefixo);           -- 1 extensão + prefixo + referência = 17
      IF length(v_n::bigint::text) > v_tam THEN
        RAISE EXCEPTION 'Sequência de HU esgotou a faixa do prefixo GS1 % (máx. % dígitos).', v_emp.gs1_prefixo, v_tam;
      END IF;
      v_base := v_emp.gs1_digito_extensao::text || v_emp.gs1_prefixo || lpad(v_n::bigint::text, v_tam, '0');
      v_cod := v_base || public._fn_gs1_digito(v_base)::text;
    ELSE
      v_cod := 'HU-' || lpad(v_n::bigint::text, 9, '0');
    END IF;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.hu WHERE tenant_id = p_tenant AND codigo_hu = v_cod);
    v_i := v_i + 1;
    IF v_i > 10000 THEN RAISE EXCEPTION 'Não foi possível gerar código de HU livre.'; END IF;
  END LOOP;
  RETURN v_cod;
END $$;
REVOKE ALL ON FUNCTION public._fn_hu_proximo_codigo(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- rpc_hu_gerar passa a empresa (o resto da função não muda)
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.rpc_hu_gerar(int,text,text,uuid,uuid,numeric,numeric,numeric)'::regprocedure) INTO v_def;
  IF position('_fn_hu_proximo_codigo(v_tenant, p_empresa_id)' IN v_def) = 0 THEN
    IF position('_fn_hu_proximo_codigo(v_tenant)' IN v_def) = 0 THEN RAISE EXCEPTION 'hu_h7: marca não encontrada em rpc_hu_gerar'; END IF;
    EXECUTE replace(v_def, '_fn_hu_proximo_codigo(v_tenant)', '_fn_hu_proximo_codigo(v_tenant, p_empresa_id)');
  END IF;
END $do$;

-- ============================================================
-- H7.4 criar_hu_recebimento: formato da empresa e SSCC do fornecedor
-- ============================================================
DROP FUNCTION IF EXISTS public.criar_hu_recebimento(uuid, uuid, uuid, text, text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.criar_hu_recebimento(
  p_tenant_id uuid, p_empresa_id uuid, p_armazem_id uuid,
  p_tipo_hu text DEFAULT 'PALLET', p_tamanho text DEFAULT 'M',
  p_movimento_entrada_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,          -- IGNORADO (usa a sessão)
  p_codigo_externo text DEFAULT NULL)      -- SSCC já colado no pallet pelo fornecedor (opcional)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_codigo text; v_id uuid; v_empresa uuid := p_empresa_id;
        v_armazem uuid := p_armazem_id; v_externo text;
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

  IF nullif(btrim(p_codigo_externo), '') IS NOT NULL THEN
    v_externo := public._fn_hu_normalizar_codigo(p_codigo_externo);
    IF NOT public._fn_sscc_valido(v_externo) THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'SSCC_INVALIDO',
        'mensagem', format('O código %s não é um SSCC válido (18 dígitos com dígito verificador).', p_codigo_externo));
    END IF;
    IF EXISTS (SELECT 1 FROM public.hu WHERE tenant_id = v_tenant AND codigo_hu = v_externo) THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'SSCC_JA_USADO',
        'mensagem', format('O SSCC %s já é de uma HU cadastrada. Leia a HU em vez de criar outra.', v_externo));
    END IF;
    v_codigo := v_externo;
  ELSE
    v_codigo := public._fn_hu_proximo_codigo(v_tenant, v_empresa);
  END IF;

  INSERT INTO public.hu (tenant_id, empresa_id, armazem_id, codigo_hu, tipo_hu, tamanho, status, disponibilidade,
                         movimento_entrada_id, created_by, updated_by, ativo)
  VALUES (v_tenant, v_empresa, v_armazem, v_codigo, p_tipo_hu::enum_tipo_hu, p_tamanho::enum_tamanho_hu,
          'ABERTA', 'DISPONIVEL', p_movimento_entrada_id, v_usuario, v_usuario, true)
  RETURNING id INTO v_id;
  PERFORM public._fn_hu_evento(v_tenant, v_id, 'CRIADA', NULL, 'ABERTA', v_usuario, NULL,
    jsonb_build_object('origem', CASE WHEN v_externo IS NOT NULL THEN 'SSCC_FORNECEDOR' ELSE 'RECEBIMENTO' END,
                       'movimento_entrada_id', p_movimento_entrada_id));

  RETURN jsonb_build_object('sucesso', true, 'hu_id', v_id, 'codigo_hu', v_codigo, 'tipo_hu', p_tipo_hu,
    'tamanho', p_tamanho, 'sscc_fornecedor', v_externo IS NOT NULL,
    'mensagem', 'HU ' || v_codigo || ' criada com sucesso.');
END $$;
REVOKE ALL ON FUNCTION public.criar_hu_recebimento(uuid, uuid, uuid, text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_hu_recebimento(uuid, uuid, uuid, text, text, uuid, uuid, text) TO authenticated;

-- ============================================================
-- H7.5 Leitura do código: buscar_hu_por_codigo e rpc_coletor_hu_armazenagem normalizam (00)+SSCC
-- ============================================================
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.buscar_hu_por_codigo(uuid,text)'::regprocedure) INTO v_def;
  IF position('_fn_hu_normalizar_codigo' IN v_def) = 0 THEN
    IF position('h.codigo_hu = btrim(p_codigo_hu)' IN v_def) = 0 THEN RAISE EXCEPTION 'hu_h7: marca não encontrada em buscar_hu_por_codigo'; END IF;
    EXECUTE replace(v_def, 'h.codigo_hu = btrim(p_codigo_hu)', 'h.codigo_hu = public._fn_hu_normalizar_codigo(p_codigo_hu)');
  END IF;
  SELECT pg_get_functiondef('public.rpc_coletor_hu_armazenagem(text)'::regprocedure) INTO v_def;
  IF position('_fn_hu_normalizar_codigo' IN v_def) = 0 THEN
    IF position('h.codigo_hu = upper(btrim(p_codigo_hu))' IN v_def) = 0 THEN RAISE EXCEPTION 'hu_h7: marca não encontrada em rpc_coletor_hu_armazenagem'; END IF;
    EXECUTE replace(v_def, 'h.codigo_hu = upper(btrim(p_codigo_hu))', 'h.codigo_hu = public._fn_hu_normalizar_codigo(p_codigo_hu)');
  END IF;
END $do$;

-- ============================================================
-- H7.6 Etiqueta: código legível e SSCC
-- ============================================================
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public._fn_etiqueta_hu_dados(uuid,uuid[])'::regprocedure) INTO v_def;
  IF position('codigo_hu_legivel' IN v_def) = 0 THEN
    IF position($m$'codigo_hu', h.codigo_hu,$m$ IN v_def) = 0 THEN RAISE EXCEPTION 'hu_h7: marca não encontrada em _fn_etiqueta_hu_dados'; END IF;
    EXECUTE replace(v_def, $m$'codigo_hu', h.codigo_hu,$m$,
      $n$'codigo_hu', h.codigo_hu,
    'codigo_hu_legivel', CASE WHEN public._fn_sscc_valido(h.codigo_hu) THEN '(00) ' || h.codigo_hu ELSE h.codigo_hu END,
    'sscc', CASE WHEN public._fn_sscc_valido(h.codigo_hu) THEN h.codigo_hu ELSE '' END,$n$);
  END IF;
END $do$;

-- ============================================================
-- H8.1 Consulta de HU no coletor (pelo servidor)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_coletor_hu_consulta(p_codigo_hu text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_b record;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['coletor.consulta:READ','coletor.consulta:EXECUTE','coletor.armazenagem:EXECUTE',
                                        'coletor.inventario:EXECUTE','coletor.recebimento:EXECUTE','web.atividades.hus:READ']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;
  SELECT b.* INTO v_b FROM public._fn_hus_base(v_tenant, NULL) b WHERE b.codigo_hu = public._fn_hu_normalizar_codigo(p_codigo_hu);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada: ' || COALESCE(p_codigo_hu, ''));
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK', 'dados', jsonb_build_object(
    'hu', to_jsonb(v_b),
    'itens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('sku', p.sku, 'descricao', p.descricao, 'quantidade', hi.quantidade,
               'lote', nullif(hi.lote, ''),
               'validade', CASE WHEN hi.data_validade = DATE '1900-01-01' THEN NULL ELSE hi.data_validade END) ORDER BY p.descricao)
      FROM public.hu_item hi JOIN public.produto p ON p.id = hi.produto_id WHERE hi.hu_id = v_b.id), '[]'::jsonb),
    'estoque', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('endereco', e.descricao, 'sku', p.sku, 'descricao', p.descricao,
               'lote', nullif(eg.lote, ''), 'quantidade', eg.quantidade_total) ORDER BY e.descricao, p.descricao)
      FROM public.estoque_geral eg JOIN public.produto p ON p.id = eg.produto_id
      LEFT JOIN public.endereco e ON e.id = eg.endereco_id
      WHERE eg.hu_id = v_b.id AND eg.tenant_id = v_tenant AND eg.quantidade_total > 0), '[]'::jsonb),
    'ultima_verificacao', (
      SELECT jsonb_build_object('created_at', x.created_at, 'usuario', u.nome, 'endereco', x.dados->>'endereco',
                                'confere', (x.dados->>'confere')::boolean)
      FROM public.hu_evento x LEFT JOIN public.usuario u ON u.id = x.usuario_id
      WHERE x.hu_id = v_b.id AND x.evento = 'VERIFICADA' ORDER BY x.created_at DESC LIMIT 1)));
END $$;
REVOKE ALL ON FUNCTION public.rpc_coletor_hu_consulta(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_hu_consulta(text) TO authenticated;

-- ============================================================
-- H8.2 Verificação de local (floor check): a HU está onde o sistema diz?
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_coletor_hu_verificar_local(p_hu_id uuid, p_endereco_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_hu record; v_end record; v_esperado text; v_confere boolean;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['coletor.consulta:EXECUTE','coletor.inventario:EXECUTE','coletor.armazenagem:EXECUTE','web.atividades.hus:UPDATE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu_id AND h.tenant_id = v_tenant AND h.id <> public.hu_padrao();
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada.'); END IF;
  SELECT e.id, e.descricao INTO v_end FROM public.endereco e WHERE e.id = p_endereco_id AND e.tenant_id = v_tenant;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'ENDERECO_NAO_ENCONTRADO', 'mensagem', 'Endereço não encontrado.'); END IF;
  SELECT e.descricao INTO v_esperado FROM public.endereco e WHERE e.id = v_hu.endereco_id;
  v_confere := v_hu.status = 'ARMAZENADA' AND v_hu.endereco_id = p_endereco_id
               AND EXISTS (SELECT 1 FROM public.estoque_geral eg WHERE eg.hu_id = v_hu.id AND eg.endereco_id = p_endereco_id AND eg.quantidade_total > 0);
  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'VERIFICADA', v_hu.status::text, v_hu.status::text, v_usuario,
    CASE WHEN v_confere THEN NULL ELSE 'HU encontrada fora do endereço do sistema' END,
    jsonb_build_object('endereco_id', p_endereco_id, 'endereco', v_end.descricao, 'endereco_sistema', v_esperado, 'confere', v_confere));
  RETURN jsonb_build_object('sucesso', true, 'confere', v_confere, 'endereco', v_end.descricao, 'endereco_sistema', v_esperado,
    'mensagem', CASE WHEN v_confere THEN format('HU %s confere em %s.', v_hu.codigo_hu, v_end.descricao)
      WHEN v_hu.status <> 'ARMAZENADA' THEN format('HU %s está %s no sistema, não armazenada. Verificação registrada.', v_hu.codigo_hu, lower(v_hu.status::text))
      ELSE format('HU %s está em %s no sistema, não em %s. Divergência registrada; avise o supervisor.', v_hu.codigo_hu, COALESCE(v_esperado, '—'), v_end.descricao) END);
END $$;
REVOKE ALL ON FUNCTION public.rpc_coletor_hu_verificar_local(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_hu_verificar_local(uuid, uuid) TO authenticated;

-- ============================================================
-- H8.3 Contagem por HU no inventário: quanto do produto da tarefa a HU guarda naquele endereço
--   (a contagem continua sendo registrada pelo fluxo normal, fn_inventario_registrar_contagem)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_coletor_inventario_hu(p_codigo_hu text, p_tarefa_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_t record; v_hu record; v_qtd numeric; v_outros int; v_end text;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['coletor.inventario:EXECUTE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid;
  SELECT t.id, t.produto_id, t.id_local_origem, t.empresa_id INTO v_t
    FROM public.tarefa t WHERE t.id = p_tarefa_id AND t.tenant_id = v_tenant AND t.tipo_documento_origem = 'INVENTARIO';
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'TAREFA_NAO_ENCONTRADA', 'mensagem', 'Tarefa de inventário não encontrada.'); END IF;
  SELECT h.* INTO v_hu FROM public.hu h
   WHERE h.tenant_id = v_tenant AND h.codigo_hu = public._fn_hu_normalizar_codigo(p_codigo_hu) AND h.id <> public.hu_padrao();
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada: ' || COALESCE(p_codigo_hu, '')); END IF;
  IF v_hu.status <> 'ARMAZENADA' THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_NAO_ARMAZENADA',
      'mensagem', format('A HU %s está %s; conte as unidades soltas.', v_hu.codigo_hu, lower(v_hu.status::text)));
  END IF;
  SELECT e.descricao INTO v_end FROM public.endereco e WHERE e.id = v_hu.endereco_id;
  IF v_hu.endereco_id IS DISTINCT FROM v_t.id_local_origem THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_OUTRO_ENDERECO',
      'mensagem', format('No sistema, a HU %s está em %s. Conte as unidades soltas e avise o supervisor.', v_hu.codigo_hu, COALESCE(v_end, '—')));
  END IF;
  SELECT COALESCE(sum(eg.quantidade_total), 0) INTO v_qtd FROM public.estoque_geral eg
   WHERE eg.hu_id = v_hu.id AND eg.endereco_id = v_t.id_local_origem AND eg.produto_id = v_t.produto_id AND eg.tenant_id = v_tenant;
  SELECT count(DISTINCT eg.produto_id) INTO v_outros FROM public.estoque_geral eg
   WHERE eg.hu_id = v_hu.id AND eg.produto_id <> v_t.produto_id AND eg.quantidade_total > 0;
  IF v_qtd <= 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_SEM_PRODUTO', 'mensagem', format('A HU %s não tem este produto.', v_hu.codigo_hu));
  END IF;
  RETURN jsonb_build_object('sucesso', true, 'hu_id', v_hu.id, 'codigo_hu', v_hu.codigo_hu, 'quantidade', v_qtd, 'outros_produtos', v_outros,
    'mensagem', format('HU %s: %s un. deste produto.', v_hu.codigo_hu, public._fn_num_txt(v_qtd)));
END $$;
REVOKE ALL ON FUNCTION public.rpc_coletor_inventario_hu(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_inventario_hu(text, uuid) TO authenticated;

-- ============================================================
-- H9.0 Uma execução de conferência pode ficar repartida entre HUs (divisão): funções que
--      retiravam "o" item passam a tratar todos, e a execução só perde a HU quando não sobra nenhum item dela
-- ============================================================
CREATE OR REPLACE FUNCTION public._fn_hu_conferencia_remover_item(p_tarefa_execucao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid := public.get_current_tenant(); v_usuario uuid; v_item record; v_hu record; v_sku text; v_n int := 0;
BEGIN
  SELECT u.id INTO v_usuario FROM public.usuario u WHERE u.auth_user_id = auth.uid() AND u.tenant_id = v_tenant LIMIT 1;
  FOR v_item IN SELECT hi.* FROM public.hu_item hi
                 WHERE hi.tarefa_execucao_id = p_tarefa_execucao_id AND hi.tenant_id = v_tenant LOOP
    SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = v_item.hu_id FOR UPDATE;
    IF v_hu.status NOT IN ('ABERTA', 'FECHADA') THEN
      RAISE EXCEPTION 'A HU % está % e o item não pode mais ser retirado dela.', v_hu.codigo_hu, v_hu.status
        USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.hu_item WHERE id = v_item.id;
    v_n := v_n + 1;
    SELECT p.sku INTO v_sku FROM public.produto p WHERE p.id = v_item.produto_id;
    PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'ITEM_REMOVIDO', v_hu.status::text, v_hu.status::text, v_usuario,
      'Conferência do item limpa', jsonb_build_object('produto_id', v_item.produto_id, 'sku', v_sku,
      'quantidade', v_item.quantidade, 'lote', v_item.lote, 'tarefa_execucao_id', p_tarefa_execucao_id));
    IF NOT EXISTS (SELECT 1 FROM public.hu_item WHERE hu_id = v_hu.id) THEN
      UPDATE public.hu SET disponibilidade = 'DISPONIVEL', status = 'ABERTA', fechada_em = NULL, updated_by = v_usuario
       WHERE id = v_hu.id;
      IF v_hu.status = 'FECHADA' THEN
        PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'REABERTA', 'FECHADA', 'ABERTA', v_usuario, 'HU ficou vazia');
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('sucesso', true, 'removido', v_n > 0);
END $$;

DO $do$
DECLARE v_def text;
BEGIN
  -- desvincular_item_hu: a execução só perde a HU quando não sobra item dela em nenhuma HU
  SELECT pg_get_functiondef('public.desvincular_item_hu(uuid,uuid,uuid,text)'::regprocedure) INTO v_def;
  IF position('hu-h9' IN v_def) = 0 THEN
    IF position('UPDATE public.tarefa_execucao SET hu = NULL WHERE id = v_item.tarefa_execucao_id AND tenant_id = v_tenant;' IN v_def) = 0 THEN
      RAISE EXCEPTION 'hu_h9: marca não encontrada em desvincular_item_hu';
    END IF;
    EXECUTE replace(v_def,
      'UPDATE public.tarefa_execucao SET hu = NULL WHERE id = v_item.tarefa_execucao_id AND tenant_id = v_tenant;',
      'UPDATE public.tarefa_execucao SET hu = NULL WHERE id = v_item.tarefa_execucao_id AND tenant_id = v_tenant
       AND NOT EXISTS (SELECT 1 FROM public.hu_item x WHERE x.tarefa_execucao_id = v_item.tarefa_execucao_id); -- hu-h9');
  END IF;
  -- rpc_hu_desmontar: apaga os itens antes e só solta a execução sem item em outra HU
  SELECT pg_get_functiondef('public.rpc_hu_desmontar(uuid,text)'::regprocedure) INTO v_def;
  IF position('hu-h9' IN v_def) = 0 THEN
    IF position('  UPDATE public.tarefa_execucao te SET hu = NULL' IN v_def) = 0 THEN RAISE EXCEPTION 'hu_h9: marca não encontrada em rpc_hu_desmontar'; END IF;
    v_def := replace(v_def,
      E'  UPDATE public.tarefa_execucao te SET hu = NULL\n    FROM public.hu_item hi WHERE hi.hu_id = v_hu.id AND te.id = hi.tarefa_execucao_id AND te.tenant_id = v_tenant;\n  DELETE FROM public.hu_item WHERE hu_id = v_hu.id;',
      E'  -- hu-h9: a execução só perde a HU quando não tem item em outra HU\n  WITH apagados AS (DELETE FROM public.hu_item WHERE hu_id = v_hu.id RETURNING tarefa_execucao_id)\n  UPDATE public.tarefa_execucao te SET hu = NULL\n    WHERE te.tenant_id = v_tenant AND te.id IN (SELECT tarefa_execucao_id FROM apagados)\n      AND NOT EXISTS (SELECT 1 FROM public.hu_item x WHERE x.tarefa_execucao_id = te.id AND x.hu_id <> v_hu.id);');
    IF position('hu-h9' IN v_def) = 0 THEN RAISE EXCEPTION 'hu_h9: trecho de rpc_hu_desmontar não substituído'; END IF;
    EXECUTE v_def;
  END IF;
END $do$;

-- ============================================================
-- H9.1 Dividir: parte dos itens de uma HU (não armazenada) vai para uma HU nova
--   p_itens: [{"hu_item_id": "...", "quantidade": 10}, ...]
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_hu_dividir(p_hu_id uuid, p_itens jsonb, p_observacao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_hu record; v_novo uuid; v_cod text; v_x record; v_item record;
        v_mov jsonb := '[]'::jsonb; v_sku text;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:UPDATE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  IF nullif(btrim(p_observacao), '') IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOTIVO_OBRIGATORIO', 'mensagem', 'Informe o motivo.');
  END IF;
  SELECT h.* INTO v_hu FROM public.hu h WHERE h.id = p_hu_id AND h.tenant_id = v_tenant AND h.id <> public.hu_padrao() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU não encontrada.'); END IF;
  IF v_hu.status NOT IN ('ABERTA', 'FECHADA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_JA_ARMAZENADA',
      'mensagem', format('A HU %s está %s. Dividir HU armazenada ainda não está disponível; use a transferência.', v_hu.codigo_hu, lower(v_hu.status::text)));
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ITENS_OBRIGATORIOS', 'mensagem', 'Escolha os itens e as quantidades que vão para a HU nova.');
  END IF;
  -- tudo precisa ser válido antes de mexer
  FOR v_x IN SELECT (e->>'hu_item_id')::uuid AS id, (e->>'quantidade')::numeric AS qtd FROM jsonb_array_elements(p_itens) e LOOP
    SELECT hi.* INTO v_item FROM public.hu_item hi WHERE hi.id = v_x.id AND hi.hu_id = v_hu.id;
    IF NOT FOUND OR v_x.qtd IS NULL OR v_x.qtd <= 0 OR v_x.qtd > v_item.quantidade THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'QUANTIDADE_INVALIDA',
        'mensagem', 'Quantidade inválida: cada item vai com mais de zero e no máximo o que tem na HU.');
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM public.hu_item hi
    LEFT JOIN (SELECT (e->>'hu_item_id')::uuid id, sum((e->>'quantidade')::numeric) q FROM jsonb_array_elements(p_itens) e GROUP BY 1) s ON s.id = hi.id
    WHERE hi.hu_id = v_hu.id AND hi.quantidade - COALESCE(s.q, 0) > 0) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'DIVISAO_TOTAL',
      'mensagem', 'Assim a HU original ficaria vazia. Para mover tudo, junte a HU em outra.');
  END IF;

  v_cod := public._fn_hu_proximo_codigo(v_tenant, v_hu.empresa_id);
  INSERT INTO public.hu (tenant_id, empresa_id, armazem_id, codigo_hu, tipo_hu, tamanho, status, disponibilidade,
                         movimento_entrada_id, created_by, updated_by, ativo)
  VALUES (v_tenant, v_hu.empresa_id, v_hu.armazem_id, v_cod, v_hu.tipo_hu, v_hu.tamanho, v_hu.status, 'RESERVADA',
          v_hu.movimento_entrada_id, v_usuario, v_usuario, true)
  RETURNING id INTO v_novo;
  IF v_hu.status = 'FECHADA' THEN UPDATE public.hu SET fechada_em = now() WHERE id = v_novo; END IF;

  FOR v_x IN SELECT (e->>'hu_item_id')::uuid AS id, sum((e->>'quantidade')::numeric) AS qtd FROM jsonb_array_elements(p_itens) e GROUP BY 1 LOOP
    SELECT hi.* INTO v_item FROM public.hu_item hi WHERE hi.id = v_x.id FOR UPDATE;
    IF v_x.qtd >= v_item.quantidade THEN
      UPDATE public.hu_item SET hu_id = v_novo WHERE id = v_item.id;
    ELSE
      UPDATE public.hu_item SET quantidade = quantidade - v_x.qtd WHERE id = v_item.id;
      INSERT INTO public.hu_item (tenant_id, hu_id, produto_id, tarefa_execucao_id, quantidade, lote, data_validade,
                                  data_fabricacao, numero_serie, created_by)
      VALUES (v_tenant, v_novo, v_item.produto_id, v_item.tarefa_execucao_id, v_x.qtd, v_item.lote, v_item.data_validade,
              v_item.data_fabricacao, v_item.numero_serie, v_usuario);
    END IF;
    SELECT p.sku INTO v_sku FROM public.produto p WHERE p.id = v_item.produto_id;
    v_mov := v_mov || jsonb_build_object('sku', v_sku, 'quantidade', v_x.qtd, 'lote', v_item.lote);
  END LOOP;

  PERFORM public._fn_hu_evento(v_tenant, v_hu.id, 'DIVIDIDA', v_hu.status::text, v_hu.status::text, v_usuario, p_observacao,
    jsonb_build_object('hu_nova_id', v_novo, 'hu_nova', v_cod, 'itens', v_mov));
  PERFORM public._fn_hu_evento(v_tenant, v_novo, 'CRIADA', NULL, v_hu.status::text, v_usuario, p_observacao,
    jsonb_build_object('origem', 'DIVISAO', 'hu_origem_id', v_hu.id, 'hu_origem', v_hu.codigo_hu, 'itens', v_mov));
  RETURN jsonb_build_object('sucesso', true, 'hu_id', v_novo, 'codigo_hu', v_cod,
    'mensagem', format('HU %s criada com parte da %s. Imprima a etiqueta da HU nova.', v_cod, v_hu.codigo_hu));
END $$;
REVOKE ALL ON FUNCTION public.rpc_hu_dividir(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_hu_dividir(uuid, jsonb, text) TO authenticated;

-- ============================================================
-- H9.2 Juntar: todos os itens da HU de origem vão para a HU de destino; a origem fica Desmontada
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_hu_juntar(p_hu_origem_id uuid, p_codigo_destino text, p_observacao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ctx jsonb; v_tenant uuid; v_usuario uuid; v_o record; v_d record; v_mov jsonb; v_n int;
BEGIN
  v_ctx := public._fn_hu_contexto(ARRAY['web.atividades.hus:UPDATE']);
  IF NOT (v_ctx->>'sucesso')::boolean THEN RETURN v_ctx; END IF;
  v_tenant := (v_ctx->>'tenant_id')::uuid; v_usuario := (v_ctx->>'usuario_id')::uuid;
  IF nullif(btrim(p_observacao), '') IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOTIVO_OBRIGATORIO', 'mensagem', 'Informe o motivo.');
  END IF;
  SELECT h.* INTO v_o FROM public.hu h WHERE h.id = p_hu_origem_id AND h.tenant_id = v_tenant AND h.id <> public.hu_padrao() FOR UPDATE;
  SELECT h.* INTO v_d FROM public.hu h
   WHERE h.tenant_id = v_tenant AND h.codigo_hu = public._fn_hu_normalizar_codigo(p_codigo_destino) AND h.id <> public.hu_padrao() FOR UPDATE;
  IF v_o.id IS NULL OR v_d.id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO', 'mensagem', 'HU de origem ou de destino não encontrada.');
  END IF;
  IF v_o.id = v_d.id THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MESMA_HU', 'mensagem', 'Escolha uma HU de destino diferente.');
  END IF;
  IF v_o.status NOT IN ('ABERTA', 'FECHADA') OR v_d.status NOT IN ('ABERTA', 'FECHADA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_JA_ARMAZENADA',
      'mensagem', 'As duas HUs precisam estar Abertas ou Fechadas. Juntar HU armazenada ainda não está disponível.');
  END IF;
  IF v_o.empresa_id IS DISTINCT FROM v_d.empresa_id OR (v_o.armazem_id IS NOT NULL AND v_d.armazem_id IS NOT NULL AND v_o.armazem_id <> v_d.armazem_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_OUTRA_EMPRESA', 'mensagem', 'As HUs são de empresa ou armazém diferentes.');
  END IF;
  IF v_o.movimento_entrada_id IS NOT NULL AND v_d.movimento_entrada_id IS NOT NULL AND v_o.movimento_entrada_id <> v_d.movimento_entrada_id
     AND EXISTS (SELECT 1 FROM public.hu_item WHERE hu_id = v_d.id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_OUTRO_MOVIMENTO', 'mensagem', 'As HUs são de recebimentos diferentes (uma HU por recebimento).');
  END IF;
  SELECT jsonb_agg(jsonb_build_object('sku', p.sku, 'quantidade', hi.quantidade, 'lote', hi.lote)), count(*)
    INTO v_mov, v_n FROM public.hu_item hi JOIN public.produto p ON p.id = hi.produto_id WHERE hi.hu_id = v_o.id;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'HU_VAZIA', 'mensagem', 'A HU de origem está vazia; descarte-a.');
  END IF;

  UPDATE public.hu_item SET hu_id = v_d.id WHERE hu_id = v_o.id;
  UPDATE public.tarefa_execucao te SET hu = v_d.id WHERE te.tenant_id = v_tenant AND te.hu = v_o.id;
  UPDATE public.hu SET disponibilidade = 'RESERVADA', updated_by = v_usuario,
         movimento_entrada_id = COALESCE(movimento_entrada_id, v_o.movimento_entrada_id) WHERE id = v_d.id;
  UPDATE public.hu SET status = 'DESMONTADA', disponibilidade = 'DISPONIVEL', encerrada_em = now(), updated_by = v_usuario WHERE id = v_o.id;
  PERFORM public._fn_hu_evento(v_tenant, v_o.id, 'JUNTADA', v_o.status::text, 'DESMONTADA', v_usuario, p_observacao,
    jsonb_build_object('hu_destino_id', v_d.id, 'hu_destino', v_d.codigo_hu, 'itens', v_mov));
  PERFORM public._fn_hu_evento(v_tenant, v_d.id, 'JUNTADA', v_d.status::text, v_d.status::text, v_usuario, p_observacao,
    jsonb_build_object('hu_origem_id', v_o.id, 'hu_origem', v_o.codigo_hu, 'itens', v_mov));
  RETURN jsonb_build_object('sucesso', true, 'hu_id', v_d.id, 'codigo_hu', v_d.codigo_hu,
    'mensagem', format('Itens da HU %s juntados na %s. Reimprima a etiqueta da %s.', v_o.codigo_hu, v_d.codigo_hu, v_d.codigo_hu));
END $$;
REVOKE ALL ON FUNCTION public.rpc_hu_juntar(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_hu_juntar(uuid, text, text) TO authenticated;

-- ============================================================
-- H9.3 Detalhe da HU: ações dividir e juntar
-- ============================================================
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.rpc_hu_detalhe(uuid)'::regprocedure) INTO v_def;
  IF position($m$'dividir'$m$ IN v_def) = 0 THEN
    IF position($m$'imprimir', NOT v_b.encerrada)$m$ IN v_def) = 0 THEN RAISE EXCEPTION 'hu_h9: marca não encontrada em rpc_hu_detalhe'; END IF;
    EXECUTE replace(v_def, $m$'imprimir', NOT v_b.encerrada)$m$,
      $n$'imprimir', NOT v_b.encerrada,
      'dividir', v_pode_upd AND v_b.status IN ('ABERTA', 'FECHADA') AND (v_b.qtd_skus > 1 OR v_b.qtd_total > 1),
      'juntar', v_pode_upd AND v_b.status IN ('ABERTA', 'FECHADA') AND v_b.qtd_skus > 0)$n$);
  END IF;
END $do$;

-- ============================================================
-- ROLLBACK (manual)
-- 1. DROP FUNCTION rpc_hu_juntar, rpc_hu_dividir, rpc_coletor_inventario_hu, rpc_coletor_hu_verificar_local, rpc_coletor_hu_consulta,
--    _fn_hu_normalizar_codigo, _fn_sscc_valido, _fn_gs1_digito; DROP FUNCTION criar_hu_recebimento(uuid,uuid,uuid,text,text,uuid,uuid,text);
--    DROP FUNCTION _fn_hu_proximo_codigo(uuid,uuid);
-- 2. Recriar a partir de ops.rollback_definicao (migration '20261116180000_hu_h7_h8_h9') as funções listadas no backup.
-- 3. As colunas novas de empresa podem ficar (padrão PADRAO).
-- ============================================================
