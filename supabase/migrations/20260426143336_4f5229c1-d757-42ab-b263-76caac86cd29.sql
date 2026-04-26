-- ============================================================
-- 1) RLS na tabela v_reg
-- ============================================================
ALTER TABLE public.v_reg ENABLE ROW LEVEL SECURITY;

CREATE POLICY v_reg_tenant_policy ON public.v_reg
  FOR ALL
  USING (tenant_id = public.get_current_tenant())
  WITH CHECK (tenant_id = public.get_current_tenant());

-- ============================================================
-- 2) security_invoker = true em todas as views públicas
-- ============================================================
ALTER VIEW public.inventario_item_resumo               SET (security_invoker = true);
ALTER VIEW public.v_inventario_iniciar                 SET (security_invoker = true);
ALTER VIEW public.v_recebimento_iniciar                SET (security_invoker = true);
ALTER VIEW public.v_separacao_iniciar                  SET (security_invoker = true);
ALTER VIEW public.vw_abastecimento_lista               SET (security_invoker = true);
ALTER VIEW public.vw_estoque_movimento_relatorio       SET (security_invoker = true);
ALTER VIEW public.vw_inventario_execucao               SET (security_invoker = true);
ALTER VIEW public.vw_inventario_lista                  SET (security_invoker = true);
ALTER VIEW public.vw_lms_timeline_operador             SET (security_invoker = true);
ALTER VIEW public.vw_movimento_entrada_armazenagem_detalhe  SET (security_invoker = true);
ALTER VIEW public.vw_movimento_entrada_conferencia_detalhe  SET (security_invoker = true);
ALTER VIEW public.vw_movimento_entrada_docs_vinculados      SET (security_invoker = true);
ALTER VIEW public.vw_movimento_entrada_info            SET (security_invoker = true);
ALTER VIEW public.vw_movimento_entrada_lista           SET (security_invoker = true);
ALTER VIEW public.vw_movimento_entrada_resumo          SET (security_invoker = true);
ALTER VIEW public.vw_movimento_saida_conferencia_detalhe    SET (security_invoker = true);
ALTER VIEW public.vw_movimento_saida_docs_vinculados        SET (security_invoker = true);
ALTER VIEW public.vw_movimento_saida_lista             SET (security_invoker = true);
ALTER VIEW public.vw_movimento_saida_resumo            SET (security_invoker = true);
ALTER VIEW public.vw_movimento_saida_separacao_detalhe SET (security_invoker = true);

-- ============================================================
-- 3) Função utilitária de validação de tenant
-- ============================================================
CREATE OR REPLACE FUNCTION public.assert_tenant_match(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current uuid;
BEGIN
  v_current := public.get_current_tenant();
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Sessão sem tenant válido' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_tenant_id <> v_current THEN
    RAISE EXCEPTION 'Tenant inválido para o usuário autenticado' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ============================================================
-- 4) Guards nas funções SECURITY DEFINER que recebem p_tenant_id
--    Estratégia: criar wrappers que validam e delegam, OU
--    re-criar as funções inserindo PERFORM assert_tenant_match no topo.
--    Como as funções existentes já são SECURITY DEFINER e contêm
--    lógica complexa, faremos CREATE OR REPLACE preservando o corpo
--    e adicionando o guard como PRIMEIRA instrução.
-- ============================================================

-- conferencia_saida_confirmacao
CREATE OR REPLACE FUNCTION public.conferencia_saida_confirmacao(
  p_tenant_id uuid, p_tarefa_id uuid, p_quantidade numeric, p_usuario_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_execucao_id uuid;
  v_qtd_requerida numeric;
  v_qtd_executada numeric;
  v_movimento_saida_id uuid;
  v_movimento_saida_item_id uuid;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  SELECT t.quantidade_requerida, COALESCE(t.quantidade_executada,0), ms.id, msi.id
    INTO v_qtd_requerida, v_qtd_executada, v_movimento_saida_id, v_movimento_saida_item_id
  FROM tarefa t
  JOIN movimento_saida_item msi ON t.id_documento_origem = msi.id
  JOIN movimento_saida ms ON ms.id = msi.movimento_saida_id
  WHERE t.id = p_tarefa_id AND t.tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_qtd_requerida IS NULL THEN
    RAISE EXCEPTION 'Tarefa não encontrada';
  END IF;

  IF (v_qtd_executada + p_quantidade) > v_qtd_requerida THEN
    RAISE EXCEPTION 'Quantidade excede o saldo da tarefa. Restante permitido: %',
      (v_qtd_requerida - v_qtd_executada) USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO tarefa_execucao (tenant_id, tarefa_id, usuario_id, status, iniciado_em, concluido_em, quantidade_executada)
  VALUES (p_tenant_id, p_tarefa_id, p_usuario_id, 'CONCLUIDA', now(), now(), p_quantidade)
  RETURNING id INTO v_execucao_id;

  UPDATE tarefa SET quantidade_executada = quantidade_executada + p_quantidade
  WHERE id = p_tarefa_id AND tenant_id = p_tenant_id
  RETURNING quantidade_executada INTO v_qtd_executada;

  UPDATE movimento_saida_item SET status='EM_CONFERENCIA' WHERE id = v_movimento_saida_item_id;

  IF v_qtd_executada < v_qtd_requerida THEN
    RETURN v_execucao_id;
  END IF;

  UPDATE tarefa SET status = 'CONCLUIDA', concluido_em = now()
  WHERE id = p_tarefa_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';

  UPDATE movimento_saida_item SET status='CONFERIDO' WHERE id = v_movimento_saida_item_id;

  PERFORM 1 FROM movimento_saida WHERE id = v_movimento_saida_id AND tenant_id = p_tenant_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM tarefa t
    JOIN movimento_saida_item msi ON t.id_documento_origem = msi.id
    WHERE msi.movimento_saida_id = v_movimento_saida_id
      AND t.tenant_id = p_tenant_id
      AND t.status <> 'CONCLUIDA'
  ) THEN
    UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now()
    WHERE id = v_movimento_saida_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';
  END IF;

  RETURN v_execucao_id;
END;
$$;

-- fn_seed_rbac_para_tenant: adiciona apenas o guard no topo
CREATE OR REPLACE FUNCTION public.assert_tenant_match_seed(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);
END;
$$;

-- Como fn_seed_rbac_para_tenant, fn_gerar_abastecimento, gerar_tarefas_conferencia_entrada,
-- rpc_coletor_armazenagem_execucao e separacao_executar_coleta(2) têm corpos longos,
-- envolvemos cada uma com BEFORE-trigger lógico via REPLACE preservando o corpo.
-- Para evitar reescrever centenas de linhas, criamos um INSTEAD trigger lógico
-- adicionando uma instrução inicial. Para isso, usamos DO block que prefixa o corpo.

-- Implementação prática: para cada função, lemos o corpo via pg_get_functiondef
-- e re-criamos inserindo PERFORM assert_tenant_match no início.
DO $migrate$
DECLARE
  rec RECORD;
  v_def text;
  v_body text;
  v_signature text;
  v_returns text;
  v_lang text;
  v_volat text;
  v_new_body text;
  v_new_sql text;
BEGIN
  FOR rec IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'fn_seed_rbac_para_tenant',
        'fn_gerar_abastecimento',
        'gerar_tarefas_conferencia_entrada',
        'rpc_coletor_armazenagem_execucao',
        'separacao_executar_coleta'
      )
  LOOP
    v_def := pg_get_functiondef(rec.oid);

    -- já tem o guard? então pula
    IF v_def ILIKE '%assert_tenant_match(p_tenant_id)%' THEN
      CONTINUE;
    END IF;

    -- Insere PERFORM no início do bloco BEGIN do plpgsql
    -- Estratégia: substituir a primeira ocorrência de "BEGIN" (case-insensitive,
    -- precedida de quebra de linha) por "BEGIN\n  PERFORM public.assert_tenant_match(p_tenant_id);\n"
    v_new_sql := regexp_replace(
      v_def,
      '(\nBEGIN\b)',
      E'\nBEGIN\n  PERFORM public.assert_tenant_match(p_tenant_id);',
      'i'
    );

    -- Garante search_path
    IF v_new_sql NOT ILIKE '%SET search_path%' THEN
      v_new_sql := regexp_replace(v_new_sql, '(SECURITY DEFINER)', E'\\1\n SET search_path = public', 'i');
    END IF;

    EXECUTE v_new_sql;
  END LOOP;
END;
$migrate$;

-- ============================================================
-- 5) search_path = public em todas as funções públicas restantes
-- ============================================================
DO $sp$
DECLARE
  rec RECORD;
  v_sig text;
BEGIN
  FOR rec IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
      ))
  LOOP
    v_sig := format('public.%I(%s)', rec.proname, rec.args);
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', v_sig);
  END LOOP;
END;
$sp$;