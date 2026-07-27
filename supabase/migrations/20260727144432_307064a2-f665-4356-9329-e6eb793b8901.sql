DO $$
DECLARE
  v_tenant uuid;
  v_modulo uuid;
  v_perfil uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenant WHERE slug = 'corelogitrack' LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Tenant corelogitrack não encontrado — migration ignorada.';
    RETURN;
  END IF;

  -- Módulo Impressão
  INSERT INTO public.modulo (tenant_id, codigo, descricao, ambiente, ativo)
  VALUES (v_tenant, 'web.config.impressao', 'Impressão', 'WEB', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_modulo
  FROM public.modulo
  WHERE tenant_id = v_tenant AND codigo = 'web.config.impressao'
  LIMIT 1;

  -- Permissões (READ, CREATE, UPDATE, DELETE, EXECUTE)
  INSERT INTO public.permissao (tenant_id, modulo_id, acao, descricao)
  SELECT v_tenant, v_modulo, a::enum_acao_permissao, 'Impressão - ' || a
  FROM unnest(ARRAY['READ','CREATE','UPDATE','DELETE','EXECUTE']) AS a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.permissao p
    WHERE p.tenant_id = v_tenant AND p.modulo_id = v_modulo AND p.acao = a::enum_acao_permissao
  );

  -- Vincular ao perfil ADMINISTRADOR
  SELECT id INTO v_perfil
  FROM public.perfil
  WHERE tenant_id = v_tenant AND upper(nome) = 'ADMINISTRADOR'
  LIMIT 1;

  IF v_perfil IS NOT NULL THEN
    INSERT INTO public.perfil_permissao (tenant_id, perfil_id, permissao_id)
    SELECT v_tenant, v_perfil, p.id
    FROM public.permissao p
    WHERE p.tenant_id = v_tenant AND p.modulo_id = v_modulo
      AND NOT EXISTS (
        SELECT 1 FROM public.perfil_permissao pp
        WHERE pp.perfil_id = v_perfil AND pp.permissao_id = p.id
      );
  END IF;
END $$;