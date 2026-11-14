-- Fluxo de Expedição · F1 — tela "Fluxo de Expedição" (Configurações)
-- 2026-11-13 (QA). Reversão: 20261113_fluxo_expedicao_f1_down.sql
-- 1) módulo web.config.fluxo-expedicao em todos os tenants, com as mesmas permissões que os perfis já tinham no Roteiro
-- 2) módulo antigo web.armazem.roteiro-separacao fica inativo (mantido para reversão)
-- 3) provisionamento de novos tenants cria o módulo novo no lugar do antigo
-- 4) roteiro_saida_salvar passa a exigir permissão UPDATE no módulo novo

DO $$
DECLARE r record; v_mod uuid; v_old uuid; v_perm uuid; v_acao text;
BEGIN
  FOR r IN SELECT t.id FROM tenant t LOOP
    INSERT INTO modulo (tenant_id, codigo, descricao, ambiente)
    VALUES (r.id, 'web.config.fluxo-expedicao', 'Fluxo de Expedição', 'WEB')
    ON CONFLICT (tenant_id, codigo) DO NOTHING;
    SELECT id INTO v_mod FROM modulo WHERE tenant_id = r.id AND codigo = 'web.config.fluxo-expedicao';
    SELECT id INTO v_old FROM modulo WHERE tenant_id = r.id AND codigo = 'web.armazem.roteiro-separacao';
    FOREACH v_acao IN ARRAY ARRAY['CREATE','READ','UPDATE','DELETE'] LOOP
      INSERT INTO permissao (tenant_id, modulo_id, acao, descricao)
      VALUES (r.id, v_mod, v_acao::enum_acao_permissao, 'Fluxo de Expedição - ' || v_acao)
      ON CONFLICT (tenant_id, modulo_id, acao) DO NOTHING;
      SELECT id INTO v_perm FROM permissao WHERE tenant_id = r.id AND modulo_id = v_mod AND acao = v_acao::enum_acao_permissao;
      -- quem tinha a ação no Roteiro antigo recebe a mesma no novo
      IF v_old IS NOT NULL THEN
        INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
        SELECT DISTINCT r.id, pp.perfil_id, v_perm
          FROM perfil_permissao pp JOIN permissao pe ON pe.id = pp.permissao_id
         WHERE pp.tenant_id = r.id AND pe.modulo_id = v_old AND pe.acao = v_acao::enum_acao_permissao
        ON CONFLICT DO NOTHING;
      END IF;
      -- ADMINISTRADOR sempre tem tudo
      INSERT INTO perfil_permissao (tenant_id, perfil_id, permissao_id)
      SELECT r.id, p.id, v_perm FROM perfil p WHERE p.tenant_id = r.id AND p.nome = 'ADMINISTRADOR'
      ON CONFLICT DO NOTHING;
    END LOOP;
    UPDATE modulo SET ativo = false WHERE id = v_old;
  END LOOP;
END $$;

-- Provisionamento: troca a linha do módulo antigo pela do novo
CREATE OR REPLACE FUNCTION public.fn_seed_rbac_para_tenant_bkp_f1(p_tenant_id uuid) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
DO $$
DECLARE v_def text; v_n int;
  c_old constant text := $q$ARRAY['web.armazem.roteiro-separacao', 'Roteiro de Separação', 'WEB'],$q$;
  c_new constant text := $q$ARRAY['web.config.fluxo-expedicao', 'Fluxo de Expedição', 'WEB'],$q$;
BEGIN
  v_def := pg_get_functiondef('public.fn_seed_rbac_para_tenant(uuid)'::regprocedure);
  EXECUTE replace(v_def, 'FUNCTION public.fn_seed_rbac_para_tenant(', 'FUNCTION public.fn_seed_rbac_para_tenant_bkp_f1(');
  IF position('web.config.fluxo-expedicao' IN v_def) = 0 THEN
    v_n := (length(v_def) - length(replace(v_def, c_old, ''))) / length(c_old);
    IF v_n <> 1 THEN RAISE EXCEPTION 'F1: linha do Roteiro no seed RBAC encontrada % vezes.', v_n; END IF;
    EXECUTE replace(v_def, c_old, c_new);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_seed_rbac_para_tenant_bkp_f1(uuid) FROM PUBLIC, anon, authenticated;

-- roteiro_saida_salvar: permissão de alteração
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.roteiro_saida_salvar(uuid, uuid, jsonb)'::regprocedure);
  n := replace(d, $a$  PERFORM public.assert_tenant_access(p_tenant_id);
$a$, $b$  PERFORM public.assert_tenant_access(p_tenant_id);

  -- F1: chamada pela API exige UPDATE em Fluxo de Expedição (suporte da plataforma liberado)
  IF COALESCE(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
     AND NOT public.fn_usuario_tem_permissao(public.fn_audit_usuario_atual(), 'web.config.fluxo-expedicao', 'UPDATE')
     AND NOT EXISTS (SELECT 1 FROM platform_support_user s WHERE s.auth_user_id = auth.uid() AND s.ativo) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ROTEIRO_SEM_PERMISSAO',
      'mensagem', 'Você não tem permissão para alterar o Fluxo de Expedição.');
  END IF;
$b$);
  IF n = d THEN RAISE EXCEPTION 'F1: padrão do roteiro_saida_salvar não encontrado'; END IF;
  EXECUTE n;
END $$;
