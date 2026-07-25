
DO $$
DECLARE
  v_tenant uuid := 'f89963dc-9afc-49be-8b70-3559c9fd80bd';
BEGIN
  INSERT INTO public.modulo (tenant_id, codigo, descricao, ambiente) VALUES
    (v_tenant, 'web.atividades.operadores-ativos', 'Operadores Ativos', 'WEB'),
    (v_tenant, 'web.atividades.tarefas-ativas', 'Tarefas Ativas', 'WEB'),
    (v_tenant, 'web.relatorios.picking-nao-cadastrado', 'Picking Não Cadastrado', 'WEB'),
    (v_tenant, 'web.config.ocorrencia-sla', 'Configuração de SLA de Ocorrências', 'WEB')
  ON CONFLICT (tenant_id, codigo) DO NOTHING;

  INSERT INTO public.permissao (tenant_id, modulo_id, acao, descricao)
  SELECT v_tenant, m.id, 'READ'::enum_acao_permissao, 'Visualizar'
  FROM public.modulo m
  WHERE m.tenant_id = v_tenant
    AND m.codigo IN (
      'web.atividades.operadores-ativos',
      'web.atividades.tarefas-ativas',
      'web.relatorios.picking-nao-cadastrado'
    )
  ON CONFLICT (tenant_id, modulo_id, acao) DO NOTHING;

  INSERT INTO public.permissao (tenant_id, modulo_id, acao, descricao)
  SELECT v_tenant, m.id, a.acao::enum_acao_permissao,
         CASE a.acao WHEN 'CREATE' THEN 'Criar' WHEN 'READ' THEN 'Visualizar'
                     WHEN 'UPDATE' THEN 'Editar' WHEN 'DELETE' THEN 'Excluir' END
  FROM public.modulo m
  CROSS JOIN (VALUES ('CREATE'),('READ'),('UPDATE'),('DELETE')) AS a(acao)
  WHERE m.tenant_id = v_tenant
    AND m.codigo = 'web.config.ocorrencia-sla'
  ON CONFLICT (tenant_id, modulo_id, acao) DO NOTHING;

  INSERT INTO public.perfil_permissao (tenant_id, perfil_id, permissao_id)
  SELECT v_tenant, pf.id, p.id
  FROM public.perfil pf
  JOIN public.permissao p ON p.tenant_id = pf.tenant_id
  JOIN public.modulo m ON m.id = p.modulo_id
  WHERE pf.tenant_id = v_tenant
    AND pf.nome = 'ADMINISTRADOR'
    AND m.codigo IN (
      'web.atividades.operadores-ativos',
      'web.atividades.tarefas-ativas',
      'web.relatorios.picking-nao-cadastrado',
      'web.config.ocorrencia-sla'
    )
  ON CONFLICT (tenant_id, perfil_id, permissao_id) DO NOTHING;
END $$;
