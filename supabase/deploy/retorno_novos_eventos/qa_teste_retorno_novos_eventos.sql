-- =====================================================================
-- QA · Retorno ao ERP · novos eventos (movimentação interna + Importar do ERP)
-- Bateria qa.fn_teste_retorno_novos_eventos(): roda como usuário real
-- (role authenticated + request.jwt.claims) no tenant CORE LogiTrack do QA
-- e desfaz tudo no fim (QA_DESFAZER). NUNCA rodar em produção.
--   select qa.fn_teste_retorno_novos_eventos();
-- Gatilhos adiados (emissão do evento no commit) são disparados com
-- SET CONSTRAINTS ALL IMMEDIATE depois de cada operação.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS qa;

CREATE OR REPLACE FUNCTION qa.fn_teste_retorno_novos_eventos(p_tenant_slug_nome text DEFAULT 'CORE LogiTrack')
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'integracao'
AS $function$
DECLARE
  v_casos   jsonb := '[]'::jsonb;
  v_falhas  int := 0;
  v_t       uuid;
  v_emp     uuid;
  v_adm     uuid; v_adm_auth uuid;
  v_op      uuid; v_op_auth uuid;
  eg        record;
  v_pulmao  uuid;
  v_pick2   uuid;
  v_setor_pulmao uuid;
  v_r       jsonb;
  v_err     text;
  v_ok      boolean;
  v_mi      public.movimentacao_interna;
  v_ex      integracao.retorno_execucao;
  v_n       int;
  v_fluxo_mov uuid;
  v_fluxo_imp uuid;
  v_def     jsonb;
  v_val     jsonb;
  v_exec_imp uuid;
  v_orig_mp uuid; v_dest_mp uuid;
BEGIN
  BEGIN
    -- ---------- arranjo ----------
    SELECT id INTO v_t FROM tenant WHERE nome = p_tenant_slug_nome;
    SELECT u.id, u.auth_user_id INTO v_adm, v_adm_auth FROM usuario u
      JOIN usuario_perfil up ON up.usuario_id = u.id JOIN perfil p ON p.id = up.perfil_id
     WHERE u.tenant_id = v_t AND u.ativo AND u.auth_user_id IS NOT NULL AND p.nome = 'ADMINISTRADOR' LIMIT 1;
    SELECT u.id, u.auth_user_id INTO v_op, v_op_auth FROM usuario u
     WHERE u.tenant_id = v_t AND u.ativo AND u.auth_user_id IS NOT NULL
       AND NOT fn_usuario_tem_permissao(u.id, 'web.dados-mestres.produtos', 'CREATE')
       AND NOT fn_usuario_tem_permissao(u.id, 'web.config.integracao.retornos', 'READ')
       AND EXISTS (SELECT 1 FROM usuario_perfil up WHERE up.usuario_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM usuario_perfil up JOIN perfil p ON p.id = up.perfil_id WHERE up.usuario_id = u.id AND p.nome = 'ADMINISTRADOR')
     LIMIT 1;

    -- saldo num PICKING do setor PICKING, fora do endereço de cancelamento
    SELECT g.*, e.setor_id AS setor_origem, e.armazem_id INTO eg
      FROM estoque_geral g JOIN endereco e ON e.id = g.endereco_id
      JOIN setor s ON s.id = e.setor_id
     WHERE g.tenant_id = v_t AND g.quantidade_disponivel >= 1 AND e.ativo AND e.tipo_endereco::text = 'PICKING'
       AND s.descricao = 'PICKING' AND NOT public.fn_endereco_cancelamento_com_tarefa(v_t, e.id)
     ORDER BY g.quantidade_disponivel DESC LIMIT 1;
    v_emp := eg.empresa_id;
    SELECT e.id, e.setor_id INTO v_pulmao, v_setor_pulmao FROM endereco e
     WHERE e.tenant_id = v_t AND e.ativo AND e.armazem_id = eg.armazem_id AND e.setor_id <> eg.setor_origem
       AND e.situacao::text NOT LIKE 'BLOQ%' AND NOT public.fn_endereco_cancelamento_com_tarefa(v_t, e.id) LIMIT 1;
    SELECT e.id INTO v_pick2 FROM endereco e
     WHERE e.tenant_id = v_t AND e.ativo AND e.setor_id = eg.setor_origem AND e.id <> eg.endereco_id
       AND e.situacao::text NOT LIKE 'BLOQ%' AND e.tipo_endereco::text = 'PICKING'
       AND NOT EXISTS (SELECT 1 FROM estoque_geral x WHERE x.endereco_id = e.id AND x.quantidade_total > 0)
       AND NOT EXISTS (SELECT 1 FROM picking_produto pp WHERE pp.endereco_id = e.id)
     LIMIT 1;

    v_ok := v_t IS NOT NULL AND v_adm IS NOT NULL AND v_op IS NOT NULL AND eg.id IS NOT NULL AND v_pulmao IS NOT NULL AND v_pick2 IS NOT NULL;
    v_casos := v_casos || jsonb_build_object('caso', '0 · massa encontrada (admin, operador sem permissão, saldo em picking, pulmão, picking vazio)', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; RAISE EXCEPTION 'QA_DESFAZER'; END IF;

    -- =====================================================================
    -- MOVIMENTAÇÃO INTERNA
    -- =====================================================================
    -- fluxo ativo para estoque.estrutura_alterada (só quando muda setor)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_r := public.integracao_retorno_salvar_fluxo(v_t, v_emp, jsonb_build_object(
      'nome', 'QA · estrutura alterada', 'definicao', jsonb_build_object('versao_schema', 1,
        'nos', jsonb_build_array(
          jsonb_build_object('id', 'g', 'tipo', 'gatilho.evento', 'config', jsonb_build_object('evento', 'estoque.estrutura_alterada',
             'filtros', jsonb_build_array(jsonb_build_object('campo', 'movimentacao.muda_setor', 'operador', 'igual', 'valor', 'true')),
             'combinador', 'e', 'modo', 'imediato')),
          jsonb_build_object('id', 'p', 'tipo', 'dados.payload', 'config', jsonb_build_object('modo', 'jsonata', 'expressao', '{"numero": movimentacao.numero}'))),
        'ligacoes', jsonb_build_array(jsonb_build_object('de', 'g', 'para', 'p')))));
    v_fluxo_mov := (v_r->>'id')::uuid;
    v_r := public.integracao_retorno_publicar_fluxo(v_fluxo_mov, true);
    EXECUTE 'reset role';
    v_ok := (v_r->>'ativo')::boolean IS TRUE;
    v_casos := v_casos || jsonb_build_object('caso', 'M0 · fluxo estoque.estrutura_alterada publicado e ativo (admin)', 'ok', v_ok, 'r', v_r->'validacao');
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- M1: transferência PICKING -> PULMÃO pelo coletor (rpc_transferencia_confirmar)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_r := public.rpc_transferencia_confirmar(v_t, v_emp, v_adm, eg.produto_id, 1, eg.endereco_id, v_pulmao,
             eg.lote, eg.data_validade, eg.data_fabricacao, eg.hu_id);
    EXECUTE 'reset role';
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    SELECT * INTO v_mi FROM movimentacao_interna WHERE tenant_id = v_t AND endereco_origem_id = eg.endereco_id
       AND endereco_destino_id = v_pulmao ORDER BY created_at DESC LIMIT 1;
    v_ok := (v_r->>'sucesso')::boolean AND v_mi.id IS NOT NULL AND v_mi.rotina = 'TRANSFERENCIA' AND v_mi.muda_setor
            AND NOT v_mi.muda_armazem AND v_mi.empresa_id = v_emp
            AND (SELECT count(*) FROM movimentacao_interna_item i WHERE i.movimentacao_interna_id = v_mi.id AND i.quantidade = 1) = 1;
    v_casos := v_casos || jsonb_build_object('caso', 'M1 · transferência PICKING→PULMÃO registra movimentação TRANSFERENCIA (muda_setor) com 1 item', 'ok', v_ok, 'rpc', v_r);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    SELECT * INTO v_ex FROM retorno_execucao WHERE entidade = 'movimentacao_interna' AND documento_id = v_mi.id AND fluxo_id = v_fluxo_mov;
    v_ok := v_ex.id IS NOT NULL AND v_ex.status = 'pendente' AND v_ex.modo = 'automatico' AND v_ex.documento_numero LIKE 'MI-%'
            AND EXISTS (SELECT 1 FROM retorno_evento ev WHERE ev.id = v_ex.evento_id AND ev.status = 'roteado' AND ev.evento = 'estoque.estrutura_alterada');
    v_casos := v_casos || jsonb_build_object('caso', 'M2 · evento estoque.estrutura_alterada emitido no commit e execução pendente MI-…', 'ok', v_ok,
      'execucao', jsonb_build_object('status', v_ex.status, 'numero', v_ex.documento_numero));
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    v_r := (SELECT ev.contexto FROM retorno_evento ev WHERE ev.id = v_ex.evento_id);
    v_ok := v_r #>> '{origem,setor,id}' = eg.setor_origem::text AND v_r #>> '{destino,setor,id}' = v_setor_pulmao::text
            AND v_r #>> '{movimentacao,mudancas,0}' = 'setor' AND jsonb_array_length(v_r->'itens') = 1
            AND v_r #>> '{itens,0,produto,id}' = eg.produto_id::text AND v_r #>> '{empresa,id}' = v_emp::text
            AND v_r #>> '{operador,id}' = v_adm::text AND v_r #>> '{documento,numero}' = v_ex.documento_numero;
    v_casos := v_casos || jsonb_build_object('caso', 'M3 · contexto traz origem/destino com setor, mudancas, itens, empresa e operador', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    SELECT * INTO v_mi FROM movimentacao_interna WHERE id = v_mi.id;
    v_ok := v_mi.integracao_status = 'pendente';
    v_casos := v_casos || jsonb_build_object('caso', 'M4 · movimentação fica integracao_status = pendente', 'ok', v_ok, 'status', v_mi.integracao_status);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- M5: dispatcher conclui com sucesso -> integrado
    PERFORM public.integracao_retorno_svc_reservar(1, v_ex.id);
    PERFORM public.integracao_retorno_svc_concluir(v_ex.id, jsonb_build_object('status', 'sucesso', 'proximo_no', NULL, 'estado', '{}'::jsonb, 'passos', '[]'::jsonb));
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    SELECT * INTO v_mi FROM movimentacao_interna WHERE id = v_mi.id;
    v_ok := v_mi.integracao_status = 'integrado';
    v_casos := v_casos || jsonb_build_object('caso', 'M5 · execução com sucesso -> movimentação integrado', 'ok', v_ok, 'status', v_mi.integracao_status);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- M6: transferência dentro do mesmo setor/tipo de estoque não registra
    SELECT count(*) INTO v_n FROM movimentacao_interna WHERE tenant_id = v_t;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_r := public.rpc_transferencia_confirmar(v_t, v_emp, v_adm, eg.produto_id, 1, eg.endereco_id, v_pick2,
             eg.lote, eg.data_validade, eg.data_fabricacao, eg.hu_id);
    EXECUTE 'reset role';
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    v_ok := (v_r->>'sucesso')::boolean AND (SELECT count(*) FROM movimentacao_interna WHERE tenant_id = v_t) = v_n;
    v_casos := v_casos || jsonb_build_object('caso', 'M6 · transferência PICKING→PICKING (mesmo setor e tipo) não gera movimentação', 'ok', v_ok, 'rpc', v_r->>'codigo');
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- M7: mudança de picking para endereço de outro setor (setor do destino trocado só neste teste)
    SELECT e.id INTO v_orig_mp FROM endereco e
     WHERE e.tenant_id = v_t AND e.ativo AND e.tipo_endereco::text = 'PICKING' AND e.situacao::text NOT LIKE 'BLOQ%'
       AND EXISTS (SELECT 1 FROM estoque_geral x WHERE x.endereco_id = e.id AND x.quantidade_total > 0)
       AND NOT EXISTS (SELECT 1 FROM estoque_geral x WHERE x.endereco_id = e.id AND x.quantidade_total > 0
                       AND NOT EXISTS (SELECT 1 FROM picking_produto pp WHERE pp.endereco_id = e.id AND pp.produto_id = x.produto_id AND pp.ativo))
       AND NOT public.fn_endereco_cancelamento_com_tarefa(v_t, e.id)
       AND jsonb_array_length(public.fn_mudanca_picking_pendencias(v_t, ARRAY[e.id])) = 0
       AND (SELECT count(DISTINCT x.produto_id) FROM estoque_geral x WHERE x.endereco_id = e.id AND x.quantidade_total > 0) = 1
     LIMIT 1;
    SELECT e.id INTO v_dest_mp FROM endereco e
     WHERE e.tenant_id = v_t AND e.ativo AND e.tipo_endereco::text = 'PICKING' AND e.situacao::text NOT LIKE 'BLOQ%'
       AND e.id NOT IN (coalesce(v_orig_mp, e.id), v_pick2) AND e.armazem_id = eg.armazem_id
       AND NOT EXISTS (SELECT 1 FROM estoque_geral x WHERE x.endereco_id = e.id AND x.quantidade_total > 0)
       AND NOT EXISTS (SELECT 1 FROM picking_produto pp WHERE pp.endereco_id = e.id)
       AND jsonb_array_length(public.fn_mudanca_picking_pendencias(v_t, ARRAY[e.id])) = 0
       AND e.capacidade_unidades IS NULL
     LIMIT 1;
    IF v_orig_mp IS NULL OR v_dest_mp IS NULL THEN
      v_casos := v_casos || jsonb_build_object('caso', 'M7 · mudança de picking (sem massa adequada no QA: não executado)', 'ok', true, 'pulado', true);
    ELSE
      UPDATE endereco SET setor_id = v_setor_pulmao WHERE id = v_dest_mp;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
      EXECUTE 'set local role authenticated';
      BEGIN
        v_r := public.rpc_mudanca_picking_executar(v_t, v_orig_mp, v_dest_mp, v_adm, '[]'::jsonb);
      EXCEPTION WHEN OTHERS THEN v_r := jsonb_build_object('sucesso', false, 'erro', SQLERRM);
      END;
      EXECUTE 'reset role';
      SET CONSTRAINTS ALL IMMEDIATE;
      SET CONSTRAINTS ALL DEFERRED;
      SELECT * INTO v_mi FROM movimentacao_interna WHERE tenant_id = v_t AND endereco_origem_id = v_orig_mp AND endereco_destino_id = v_dest_mp
        ORDER BY created_at DESC LIMIT 1;
      v_ok := coalesce((v_r->>'sucesso')::boolean, false) AND v_mi.rotina = 'MUDANCA_PICKING' AND v_mi.muda_setor
              AND (SELECT count(*) FROM movimentacao_interna_item i WHERE i.movimentacao_interna_id = v_mi.id) = (v_r #>> '{resumo,itens_movidos}')::int
              AND EXISTS (SELECT 1 FROM retorno_execucao x WHERE x.documento_id = v_mi.id AND x.fluxo_id = v_fluxo_mov AND x.status = 'pendente');
      v_casos := v_casos || jsonb_build_object('caso', 'M7 · mudança de picking para outro setor gera UMA movimentação MUDANCA_PICKING com todos os itens e o evento', 'ok', v_ok,
        'rpc', v_r->>'codigo', 'erro', v_r->>'erro', 'itens_movidos', v_r #>> '{resumo,itens_movidos}');
      IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;
    END IF;

    -- M8: RLS — operador do tenant enxerga só o próprio tenant; anon não lê
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_op_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    SELECT count(*) INTO v_n FROM public.movimentacao_interna WHERE tenant_id <> v_t;
    v_ok := v_n = 0 AND (SELECT count(*) FROM public.movimentacao_interna) > 0;
    BEGIN
      INSERT INTO public.movimentacao_interna (tenant_id, empresa_id, rotina, transacao_id, endereco_origem_id, endereco_destino_id, muda_armazem, muda_setor, muda_tipo_estoque)
      VALUES (v_t, v_emp, 'TRANSFERENCIA', 1, eg.endereco_id, v_pulmao, false, true, false);
      v_ok := false;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    EXECUTE 'reset role';
    v_casos := v_casos || jsonb_build_object('caso', 'M8 · RLS: usuário lê só o próprio tenant e não grava direto na tabela', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- M9: "Enviar ao ERP" (manual) da movimentação e teste do editor
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    SELECT * INTO v_mi FROM public.movimentacao_interna WHERE tenant_id = v_t AND endereco_destino_id = v_pulmao ORDER BY created_at DESC LIMIT 1;
    v_r := public.integracao_retorno_verificar_envio(v_fluxo_mov, v_mi.id);
    v_val := public.integracao_retorno_executar(v_fluxo_mov, v_mi.id, 'manual', false, false);
    v_def := public.integracao_retorno_documentos_recentes(v_t, v_emp, 'estoque.estrutura_alterada', NULL, 'e', 5, NULL);
    EXECUTE 'reset role';
    v_ok := v_r->>'entidade' = 'movimentacao_interna' AND v_val->>'status' = 'pendente'
            AND jsonb_array_length(v_def) >= 1 AND v_def #>> '{0,numero}' LIKE 'MI-%';
    v_casos := v_casos || jsonb_build_object('caso', 'M9 · verificar_envio/executar manual e documentos_recentes aceitam movimentação', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- =====================================================================
    -- IMPORTAR DO ERP
    -- =====================================================================
    -- I1: validações do fluxo de importação
    v_def := jsonb_build_object('nos', jsonb_build_array(
               jsonb_build_object('id', 'g', 'tipo', 'gatilho.evento', 'config', jsonb_build_object('evento', 'importar.produto', 'filtros', '[]'::jsonb, 'combinador', 'e', 'modo', 'imediato')),
               jsonb_build_object('id', 'p', 'tipo', 'dados.payload', 'config', jsonb_build_object('modo', 'jsonata', 'expressao', '{"codigo_erp": importacao.valor, "sku": importacao.valor, "descricao": "QA", "referencia": "QA", "parceiro_codigo_erp": "X"}'))),
             'ligacoes', jsonb_build_array(jsonb_build_object('de', 'g', 'para', 'p')));
    v_val := fn_retorno_validar_definicao(v_def, v_t, v_emp);
    v_ok := EXISTS (SELECT 1 FROM jsonb_array_elements(v_val->'erros') x WHERE x->>'codigo' = 'IMPORTACAO_GRAVAR_UNICO');
    v_casos := v_casos || jsonb_build_object('caso', 'I1a · importação sem "Gravar no LogiTrack" é inválida', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    v_def := jsonb_set(v_def, '{nos}', (v_def->'nos') || jsonb_build_array(
               jsonb_build_object('id', 'w', 'tipo', 'acao.gravar_logitrack', 'config', jsonb_build_object('corpo_de', 'p')),
               jsonb_build_object('id', 'c', 'tipo', 'logica.confirmar_usuario', 'config', jsonb_build_object('titulo', 'Confirme', 'previa_de', 'p', 'expira_minutos', 15))));
    v_def := jsonb_set(v_def, '{ligacoes}', jsonb_build_array(
               jsonb_build_object('de', 'g', 'para', 'p'), jsonb_build_object('de', 'p', 'para', 'w'), jsonb_build_object('de', 'w', 'para', 'c', 'saida', 'sucesso')));
    v_val := fn_retorno_validar_definicao(v_def, v_t, v_emp);
    v_ok := EXISTS (SELECT 1 FROM jsonb_array_elements(v_val->'erros') x WHERE x->>'codigo' = 'IMPORTACAO_CONFIRMAR_DEPOIS');
    v_casos := v_casos || jsonb_build_object('caso', 'I1b · "Confirmar" depois de "Gravar" é recusado', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    v_def := jsonb_set(v_def, '{ligacoes}', jsonb_build_array(
               jsonb_build_object('de', 'g', 'para', 'p'), jsonb_build_object('de', 'p', 'para', 'c'), jsonb_build_object('de', 'c', 'para', 'w')));
    v_val := fn_retorno_validar_definicao(v_def, v_t, v_emp);
    v_ok := (v_val->>'valido')::boolean AND v_val #>> '{gatilho,entidade}' = 'cadastro_importacao';
    v_casos := v_casos || jsonb_build_object('caso', 'I1c · gatilho → payload → confirmar → gravar é válido', 'ok', v_ok, 'erros', v_val->'erros');
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    v_val := fn_retorno_validar_definicao(jsonb_set(v_def, '{nos,0,config,modo}', '"agrupado"'), v_t, v_emp);
    v_ok := EXISTS (SELECT 1 FROM jsonb_array_elements(v_val->'erros') x WHERE x->>'codigo' = 'IMPORTACAO_MODO');
    v_casos := v_casos || jsonb_build_object('caso', 'I1d · modo agrupado é recusado na importação', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    v_val := fn_retorno_validar_definicao(jsonb_build_object('nos', jsonb_build_array(
               jsonb_build_object('id', 'g', 'tipo', 'gatilho.evento', 'config', jsonb_build_object('evento', 'estoque.estrutura_alterada', 'modo', 'imediato')),
               jsonb_build_object('id', 'w', 'tipo', 'acao.gravar_logitrack', 'config', '{}'::jsonb)),
             'ligacoes', jsonb_build_array(jsonb_build_object('de', 'g', 'para', 'w'))), v_t, v_emp);
    v_ok := EXISTS (SELECT 1 FROM jsonb_array_elements(v_val->'erros') x WHERE x->>'codigo' = 'NO_SO_IMPORTACAO');
    v_casos := v_casos || jsonb_build_object('caso', 'I1e · "Gravar no LogiTrack" fora da importação é recusado', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- I2: sem fluxo ativo
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_r := public.integracao_retorno_importacao_disponivel(v_t, v_emp, 'importar.produto');
    v_err := NULL;
    BEGIN
      PERFORM public.integracao_retorno_importacao_iniciar(v_t, v_emp, 'importar.produto', '{"valor": "123"}'::jsonb);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM;
    END;
    EXECUTE 'reset role';
    v_ok := (v_r #>> '{0,disponivel}')::boolean = false AND v_err LIKE 'RETORNO_IMPORTACAO_SEM_FLUXO%'
            AND (SELECT count(*) FROM integracao.retorno_importacao_recurso) = 9
            AND EXISTS (SELECT 1 FROM integracao.retorno_importacao_recurso WHERE evento IN ('importar.tipo_entrada'))
            AND EXISTS (SELECT 1 FROM integracao.retorno_importacao_recurso WHERE evento IN ('importar.tipo_saida'));
    v_casos := v_casos || jsonb_build_object('caso', 'I2 · sem fluxo: disponivel=false e iniciar recusa (9 botões, com tipos de entrada/saída)', 'ok', v_ok, 'erro', v_err);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- I3: publica o fluxo e inicia como admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_r := public.integracao_retorno_salvar_fluxo(v_t, v_emp, jsonb_build_object('nome', 'QA · importar produto', 'definicao', v_def || '{"versao_schema": 1}'::jsonb));
    v_fluxo_imp := (v_r->>'id')::uuid;
    PERFORM public.integracao_retorno_publicar_fluxo(v_fluxo_imp, true);
    v_val := public.integracao_retorno_importacao_disponivel(v_t, v_emp, 'importar.produto');
    v_r := public.integracao_retorno_importacao_iniciar(v_t, v_emp, 'importar.produto', '{"valor": " 9030118 ", "tipo_busca": "codigo_erp"}'::jsonb);
    v_exec_imp := (v_r->>'execucao_id')::uuid;
    EXECUTE 'reset role';
    SELECT * INTO v_ex FROM retorno_execucao WHERE id = v_exec_imp;
    v_ok := (v_val #>> '{0,disponivel}')::boolean AND (v_val #>> '{0,tem_confirmacao}')::boolean
            AND v_ex.modo = 'interativo' AND v_ex.status = 'pendente' AND v_ex.entidade = 'cadastro_importacao'
            AND v_ex.contexto #>> '{importacao,valor}' = '9030118' AND v_ex.contexto #>> '{importacao,rota}' = 'master-data/produtos'
            AND v_ex.contexto #>> '{operador,id}' = v_adm::text AND v_ex.documento_numero = '9030118';
    v_casos := v_casos || jsonb_build_object('caso', 'I3 · publicado: disponivel=true com confirmação; iniciar cria execução interativa com valor aparado e rota', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- I4: agendador não pega execução interativa
    v_r := public.integracao_retorno_svc_reservar(50, NULL);
    v_ok := NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r) x WHERE x->>'id' = v_exec_imp::text)
            AND (SELECT status FROM retorno_execucao WHERE id = v_exec_imp) = 'pendente';
    v_casos := v_casos || jsonb_build_object('caso', 'I4 · tick (svc_reservar sem id) ignora execução interativa', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- I5: valor vazio / usuário sem permissão / outro usuário não vê
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_err := NULL;
    BEGIN PERFORM public.integracao_retorno_importacao_iniciar(v_t, v_emp, 'importar.produto', '{"valor": "  "}'::jsonb);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    EXECUTE 'reset role';
    v_ok := v_err LIKE 'RETORNO_IMPORTACAO_VALOR%';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_op_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_err := NULL;
    BEGIN PERFORM public.integracao_retorno_importacao_iniciar(v_t, v_emp, 'importar.produto', '{"valor": "1"}'::jsonb);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_ok := v_ok AND v_err LIKE 'RETORNO_IMPORTACAO_SEM_PERMISSAO%';
    v_err := NULL;
    BEGIN PERFORM public.integracao_retorno_importacao_obter(v_exec_imp);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_ok := v_ok AND v_err LIKE 'RETORNO_SEM_PERMISSAO%';
    v_err := NULL;
    BEGIN PERFORM public.integracao_retorno_svc_chave_api(v_exec_imp);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_ok := v_ok AND v_err LIKE '%permission denied%';
    EXECUTE 'reset role';
    v_casos := v_casos || jsonb_build_object('caso', 'I5 · valor vazio, operador sem permissão (iniciar/obter) e svc_chave_api fechado para authenticated', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- I6: simula o dispatcher pausando na confirmação; usuário confirma; continua
    PERFORM public.integracao_retorno_svc_reservar(1, v_exec_imp);
    PERFORM public.integracao_retorno_svc_concluir(v_exec_imp, jsonb_build_object(
      'status', 'aguardando_confirmacao', 'proximo_no', 'c', 'processar_apos', (now() + interval '15 minutes'),
      'estado', jsonb_build_object('saidas', jsonb_build_object('p', jsonb_build_object('codigo_erp', '9030118')),
                                   'previa', jsonb_build_object('codigo_erp', '9030118'),
                                   'confirmacao', jsonb_build_object('no_id', 'c', 'titulo', 'Confirme', 'mensagem', '')),
      'passos', '[]'::jsonb));
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_r := public.integracao_retorno_importacao_obter(v_exec_imp);
    v_val := public.integracao_retorno_importacao_confirmar(v_exec_imp);
    v_err := NULL;
    BEGIN PERFORM public.integracao_retorno_importacao_confirmar(v_exec_imp);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    EXECUTE 'reset role';
    SELECT * INTO v_ex FROM retorno_execucao WHERE id = v_exec_imp;
    v_ok := (v_r->>'aguardando_confirmacao')::boolean AND v_r #>> '{previa,codigo_erp}' = '9030118' AND v_r #>> '{confirmacao,titulo}' = 'Confirme'
            AND v_val->>'status' = 'pendente' AND (v_ex.estado #>> '{confirmados,c}')::boolean AND v_ex.estado #>> '{saidas,p,codigo_erp}' = '9030118'
            AND v_err LIKE 'RETORNO_IMPORTACAO_SEM_PREVIA%';
    v_casos := v_casos || jsonb_build_object('caso', 'I6 · prévia aparece no obter; confirmar volta a pendente com confirmados.c e mantém as saídas; 2ª confirmação recusada', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- I7: gravação registrada; reprocessar e executar manual recusam importação
    PERFORM public.integracao_retorno_svc_reservar(1, v_exec_imp);
    v_r := public.integracao_retorno_svc_chave_api(v_exec_imp);
    PERFORM public.integracao_retorno_svc_importacao_registrar(v_exec_imp, jsonb_build_object('id', v_adm, 'status', 'created', 'codigo_erp', '9030118'));
    PERFORM public.integracao_retorno_svc_concluir(v_exec_imp, jsonb_build_object('status', 'sucesso', 'proximo_no', NULL, 'estado', v_ex.estado, 'passos', '[]'::jsonb));
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_val := public.integracao_retorno_importacao_obter(v_exec_imp);
    v_err := NULL;
    BEGIN PERFORM public.integracao_retorno_reprocessar(v_exec_imp, 'w');
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_ok := v_err LIKE 'RETORNO_IMPORTACAO_REPROCESSAR%';
    v_err := NULL;
    BEGIN PERFORM public.integracao_retorno_executar(v_fluxo_imp, gen_random_uuid(), 'manual', false, false);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_ok := v_ok AND v_err LIKE 'RETORNO_IMPORTACAO_EXECUTAR%';
    EXECUTE 'reset role';
    v_ok := v_ok AND v_r ? 'chave' AND v_val->>'status' = 'sucesso' AND (v_val->>'finalizado')::boolean
            AND v_val #>> '{registro,id}' = v_adm::text AND v_val #>> '{registro,status}' = 'created';
    v_casos := v_casos || jsonb_build_object('caso', 'I7 · chave da API achada, registro gravado aparece no obter; reprocessar/executar manual recusam importação', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- I8: teste do editor (simulação) e cancelamento
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_adm_auth, 'role', 'authenticated')::text, true);
    EXECUTE 'set local role authenticated';
    v_r := public.integracao_retorno_importacao_testar(v_fluxo_imp, '{"valor": "ABC"}'::jsonb, 'simulacao', true);
    v_val := public.integracao_retorno_importacao_iniciar(v_t, v_emp, 'importar.produto', '{"valor": "XYZ"}'::jsonb);
    v_val := public.integracao_retorno_importacao_cancelar((v_val->>'execucao_id')::uuid);
    EXECUTE 'reset role';
    v_ok := v_r->>'modo' = 'simulacao' AND v_r->>'status' = 'pendente'
            AND (SELECT teste FROM integracao.retorno_importacao WHERE id = (v_r->>'importacao_id')::uuid)
            AND public.integracao_retorno_svc_chave_api((v_r->>'execucao_id')::uuid) IS NULL
            AND v_val->>'status' = 'descartado';
    v_casos := v_casos || jsonb_build_object('caso', 'I8 · testar em simulação (sem chave da API) e cancelar importação pendente', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- I9: prévia vencida expira
    v_r := public.integracao_retorno_importacao_iniciar(v_t, v_emp, 'importar.produto', '{"valor": "EXP"}'::jsonb);
    PERFORM public.integracao_retorno_svc_reservar(1, (v_r->>'execucao_id')::uuid);
    PERFORM public.integracao_retorno_svc_concluir((v_r->>'execucao_id')::uuid, jsonb_build_object(
      'status', 'aguardando_confirmacao', 'proximo_no', 'c', 'processar_apos', (now() - interval '1 minute'), 'estado', '{}'::jsonb, 'passos', '[]'::jsonb));
    PERFORM integracao.fn_retorno_interativo_expirar();
    v_ok := (SELECT status FROM retorno_execucao WHERE id = (v_r->>'execucao_id')::uuid) = 'descartado';
    v_casos := v_casos || jsonb_build_object('caso', 'I9 · prévia vencida vira descartado pelo cron', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    -- R1: regressão — contexto de documento de saída continua igual (campos de carga/entrega)
    SELECT ds.id INTO v_orig_mp FROM documento_saida ds WHERE ds.tenant_id = v_t LIMIT 1;
    v_r := fn_retorno_contexto('documento_saida', v_orig_mp, 'manual.documento_saida', NULL);
    v_ok := v_orig_mp IS NULL OR (v_r ? 'documento' AND v_r ? 'carga' AND v_r ? 'entrega' AND v_r ? 'itens');
    v_casos := v_casos || jsonb_build_object('caso', 'R1 · contexto de documento de saída inalterado', 'ok', v_ok);
    IF NOT v_ok THEN v_falhas := v_falhas + 1; END IF;

    RAISE EXCEPTION 'QA_DESFAZER';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'QA_DESFAZER' THEN
      v_casos := v_casos || jsonb_build_object('caso', 'erro inesperado', 'ok', false, 'erro', SQLERRM, 'estado', SQLSTATE);
      v_falhas := v_falhas + 1;
    END IF;
  END;
  RETURN jsonb_build_object('ok', v_falhas = 0, 'falhas', v_falhas, 'casos', v_casos);
END;
$function$;
REVOKE ALL ON FUNCTION qa.fn_teste_retorno_novos_eventos(text) FROM public, anon, authenticated;
