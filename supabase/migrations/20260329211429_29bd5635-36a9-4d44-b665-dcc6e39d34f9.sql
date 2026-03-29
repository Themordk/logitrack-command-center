
-- Seed function: creates modules, permissions, profiles and links for a given tenant
-- This is a reusable function tenants can call to initialize RBAC
CREATE OR REPLACE FUNCTION public.fn_seed_rbac_para_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mod_id uuid;
  v_perm_id uuid;
  v_perfil_admin_id uuid;
  v_perfil_supervisor_id uuid;
  v_perfil_operador_id uuid;
  v_modulos text[][] := ARRAY[
    -- WEB modules
    ARRAY['web.dashboard', 'Dashboard', 'WEB'],
    ARRAY['web.rastreabilidade', 'Rastreabilidade', 'WEB'],
    ARRAY['web.armazem.armazens', 'Cadastro de Armazéns', 'WEB'],
    ARRAY['web.armazem.setores', 'Setores', 'WEB'],
    ARRAY['web.armazem.tipos-estoque', 'Tipos de Estoque', 'WEB'],
    ARRAY['web.armazem.enderecos', 'Endereços', 'WEB'],
    ARRAY['web.armazem.box', 'Box', 'WEB'],
    ARRAY['web.armazem.turnos', 'Turnos', 'WEB'],
    ARRAY['web.armazem.motivos', 'Motivos de Ocorrência', 'WEB'],
    ARRAY['web.armazem.veiculos', 'Veículos', 'WEB'],
    ARRAY['web.armazem.zonas', 'Zonas de Atividade', 'WEB'],
    ARRAY['web.armazem.roteiro-separacao', 'Roteiro de Separação', 'WEB'],
    ARRAY['web.dados-mestres.produtos', 'Produtos', 'WEB'],
    ARRAY['web.dados-mestres.grupos', 'Grupos de Produtos', 'WEB'],
    ARRAY['web.dados-mestres.subgrupos', 'Subgrupos', 'WEB'],
    ARRAY['web.dados-mestres.parceiros', 'Parceiros', 'WEB'],
    ARRAY['web.dados-mestres.rotas', 'Rotas', 'WEB'],
    ARRAY['web.dados-mestres.tipos-entrada', 'Tipos de Entrada', 'WEB'],
    ARRAY['web.dados-mestres.tipos-saida', 'Tipos de Saída', 'WEB'],
    ARRAY['web.atividades.hus', 'Gerar HU', 'WEB'],
    ARRAY['web.atividades.entradas', 'Gerar Entradas', 'WEB'],
    ARRAY['web.atividades.movimentos', 'Movimento de Entrada', 'WEB'],
    ARRAY['web.atividades.saidas', 'Documentos de Saída', 'WEB'],
    ARRAY['web.atividades.mov-saida', 'Ondas de Carregamento', 'WEB'],
    ARRAY['web.atividades.volumes', 'Volumes', 'WEB'],
    ARRAY['web.atividades.inventario', 'Inventário', 'WEB'],
    ARRAY['web.relatorios.estoque', 'Posição de Estoque', 'WEB'],
    ARRAY['web.relatorios.movimentacoes', 'Histórico de Movimentos', 'WEB'],
    ARRAY['web.config.empresas', 'Empresas', 'WEB'],
    ARRAY['web.config.usuarios', 'Usuários', 'WEB'],
    ARRAY['web.config.integracao', 'Integração ERP', 'WEB'],
    ARRAY['web.config.perfis', 'Perfis de Acesso', 'WEB'],
    -- COLETOR modules
    ARRAY['coletor.recebimento', 'Recebimento', 'COLETOR'],
    ARRAY['coletor.armazenagem', 'Armazenagem', 'COLETOR'],
    ARRAY['coletor.movimentos', 'Movimentos', 'COLETOR'],
    ARRAY['coletor.separacao', 'Separação', 'COLETOR'],
    ARRAY['coletor.conferencia', 'Conferência', 'COLETOR'],
    ARRAY['coletor.inventario', 'Inventário', 'COLETOR'],
    ARRAY['coletor.consulta', 'Consultas', 'COLETOR']
  ];
  v_acoes text[] := ARRAY['CREATE', 'READ', 'UPDATE', 'DELETE'];
  v_acoes_exec text[] := ARRAY['READ', 'EXECUTE'];
  v_acao text;
  v_m text[];
BEGIN
  -- Create 3 system profiles
  INSERT INTO perfil (tenant_id, nome, descricao, sistema, ativo)
  VALUES (p_tenant_id, 'ADMINISTRADOR', 'Acesso total ao sistema', true, true)
  ON CONFLICT (tenant_id, nome) DO NOTHING
  RETURNING id INTO v_perfil_admin_id;

  IF v_perfil_admin_id IS NULL THEN
    SELECT id INTO v_perfil_admin_id FROM perfil WHERE tenant_id = p_tenant_id AND nome = 'ADMINISTRADOR';
  END IF;

  INSERT INTO perfil (tenant_id, nome, descricao, sistema, ativo)
  VALUES (p_tenant_id, 'SUPERVISOR', 'Acompanhamento e relatórios', true, true)
  ON CONFLICT (tenant_id, nome) DO NOTHING
  RETURNING id INTO v_perfil_supervisor_id;

  IF v_perfil_supervisor_id IS NULL THEN
    SELECT id INTO v_perfil_supervisor_id FROM perfil WHERE tenant_id = p_tenant_id AND nome = 'SUPERVISOR';
  END IF;

  INSERT INTO perfil (tenant_id, nome, descricao, sistema, ativo)
  VALUES (p_tenant_id, 'OPERADOR', 'Execução de tarefas operacionais', true, true)
  ON CONFLICT (tenant_id, nome) DO NOTHING
  RETURNING id INTO v_perfil_operador_id;

  IF v_perfil_operador_id IS NULL THEN
    SELECT id INTO v_perfil_operador_id FROM perfil WHERE tenant_id = p_tenant_id AND nome = 'OPERADOR';
  END IF;

  -- Create modules and permissions
  FOREACH v_m SLICE 1 IN ARRAY v_modulos LOOP
    INSERT INTO modulo (tenant_id, codigo, descricao, ambiente)
    VALUES (p_tenant_id, v_m[1], v_m[2], v_m[3]::enum_ambiente_modulo)
    ON CONFLICT (tenant_id, codigo) DO NOTHING
    RETURNING id INTO v_mod_id;

    IF v_mod_id IS NULL THEN
      SELECT id INTO v_mod_id FROM modulo WHERE tenant_id = p_tenant_id AND codigo = v_m[1];
    END IF;

    -- Determine actions based on module type
    IF v_m[3] = 'COLETOR' THEN
      FOREACH v_acao IN ARRAY v_acoes_exec LOOP
        INSERT INTO permissao (tenant_id, modulo_id, acao, descricao)
        VALUES (p_tenant_id, v_mod_id, v_acao::enum_acao_permissao, v_m[2] || ' - ' || v_acao)
        ON CONFLICT (tenant_id, modulo_id, acao) DO NOTHING
        RETURNING id INTO v_perm_id;

        IF v_perm_id IS NULL THEN
          SELECT id INTO v_perm_id FROM permissao WHERE tenant_id = p_tenant_id AND modulo_id = v_mod_id AND acao = v_acao::enum_acao_permissao;
        END IF;

        -- ADMIN gets everything
        INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
        VALUES (p_tenant_id, v_perfil_admin_id, v_perm_id)
        ON CONFLICT DO NOTHING;

        -- SUPERVISOR gets READ + EXECUTE on coletor
        INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
        VALUES (p_tenant_id, v_perfil_supervisor_id, v_perm_id)
        ON CONFLICT DO NOTHING;

        -- OPERADOR gets READ + EXECUTE on coletor
        INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
        VALUES (p_tenant_id, v_perfil_operador_id, v_perm_id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    ELSE
      FOREACH v_acao IN ARRAY v_acoes LOOP
        INSERT INTO permissao (tenant_id, modulo_id, acao, descricao)
        VALUES (p_tenant_id, v_mod_id, v_acao::enum_acao_permissao, v_m[2] || ' - ' || v_acao)
        ON CONFLICT (tenant_id, modulo_id, acao) DO NOTHING
        RETURNING id INTO v_perm_id;

        IF v_perm_id IS NULL THEN
          SELECT id INTO v_perm_id FROM permissao WHERE tenant_id = p_tenant_id AND modulo_id = v_mod_id AND acao = v_acao::enum_acao_permissao;
        END IF;

        -- ADMIN gets all WEB permissions
        INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
        VALUES (p_tenant_id, v_perfil_admin_id, v_perm_id)
        ON CONFLICT DO NOTHING;

        -- SUPERVISOR gets READ on WEB modules (dashboard, relatorios, atividades)
        IF v_acao = 'READ' AND (
          v_m[1] LIKE 'web.dashboard%' OR
          v_m[1] LIKE 'web.relatorios%' OR
          v_m[1] LIKE 'web.atividades%' OR
          v_m[1] LIKE 'web.rastreabilidade%'
        ) THEN
          INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
          VALUES (p_tenant_id, v_perfil_supervisor_id, v_perm_id)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
