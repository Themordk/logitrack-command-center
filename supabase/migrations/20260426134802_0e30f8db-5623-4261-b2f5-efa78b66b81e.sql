-- 1) Inserir módulos faltantes para cada tenant existente
WITH faltantes(codigo, descricao) AS (
  VALUES
    ('web.atividades.abastecimento','Abastecimento'),
    ('web.relatorios.ocupacao','Ocupação de Endereços'),
    ('web.relatorios.produtividade','Produtividade Operacional'),
    ('web.relatorios.cortes','Cortes de Separação'),
    ('web.relatorios.curva-abc','Curva ABC'),
    ('web.relatorios.validade-lote','Validade & Lote'),
    ('web.relatorios.baixo-giro','Baixo Giro / Obsoletos'),
    ('web.relatorios.inventario','Acuracidade de Inventário'),
    ('web.relatorios.recebimento','Recebimento (Dock-to-Stock)'),
    ('web.relatorios.ciclo-pedido','Tempo de Ciclo de Pedido')
),
tenants AS (
  SELECT DISTINCT tenant_id FROM modulo WHERE tenant_id IS NOT NULL
)
INSERT INTO modulo (id, tenant_id, codigo, descricao, ambiente, ativo)
SELECT gen_random_uuid(), t.tenant_id, f.codigo, f.descricao, 'WEB'::enum_ambiente_modulo, true
FROM tenants t CROSS JOIN faltantes f
WHERE NOT EXISTS (
  SELECT 1 FROM modulo m
  WHERE m.tenant_id = t.tenant_id AND m.codigo = f.codigo
);

-- 2) Inserir 4 permissões (CREATE/READ/UPDATE/DELETE) para cada módulo recém-criado
WITH novos_modulos AS (
  SELECT id, tenant_id FROM modulo
  WHERE codigo IN (
    'web.atividades.abastecimento','web.relatorios.ocupacao',
    'web.relatorios.produtividade','web.relatorios.cortes',
    'web.relatorios.curva-abc','web.relatorios.validade-lote',
    'web.relatorios.baixo-giro','web.relatorios.inventario',
    'web.relatorios.recebimento','web.relatorios.ciclo-pedido'
  )
),
acoes(acao) AS (
  VALUES ('CREATE'::enum_acao_permissao),
         ('READ'::enum_acao_permissao),
         ('UPDATE'::enum_acao_permissao),
         ('DELETE'::enum_acao_permissao)
)
INSERT INTO permissao (id, tenant_id, modulo_id, acao, descricao)
SELECT gen_random_uuid(), nm.tenant_id, nm.id, a.acao, a.acao::text
FROM novos_modulos nm CROSS JOIN acoes a
WHERE NOT EXISTS (
  SELECT 1 FROM permissao p
  WHERE p.modulo_id = nm.id AND p.acao = a.acao
);

-- 3) Conceder automaticamente as novas permissões aos perfis do sistema (Administrador)
WITH novas_perms AS (
  SELECT p.id AS permissao_id, p.tenant_id
  FROM permissao p
  JOIN modulo m ON m.id = p.modulo_id
  WHERE m.codigo IN (
    'web.atividades.abastecimento','web.relatorios.ocupacao',
    'web.relatorios.produtividade','web.relatorios.cortes',
    'web.relatorios.curva-abc','web.relatorios.validade-lote',
    'web.relatorios.baixo-giro','web.relatorios.inventario',
    'web.relatorios.recebimento','web.relatorios.ciclo-pedido'
  )
)
INSERT INTO perfil_permissao (id, tenant_id, perfil_id, permissao_id)
SELECT gen_random_uuid(), pf.tenant_id, pf.id, np.permissao_id
FROM perfil pf
JOIN novas_perms np ON np.tenant_id = pf.tenant_id
WHERE pf.sistema = true
  AND NOT EXISTS (
    SELECT 1 FROM perfil_permissao pp
    WHERE pp.perfil_id = pf.id AND pp.permissao_id = np.permissao_id
  );