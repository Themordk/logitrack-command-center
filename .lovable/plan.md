## Objetivo
Garantir que todas as rotas WEB do `App.tsx` estejam refletidas na tabela `modulo` e visíveis na tela **Perfis de Acesso**, para que possam ser liberadas/restringidas via RBAC.

## Diagnóstico (auditoria realizada)

Comparando `App.tsx` (`renderPage` + `breadcrumbs`) e `useRoutePermission.ts` com a tabela `modulo` no banco:

### Módulos WEB faltantes (10)
| Código de Módulo | Rota | Descrição |
|---|---|---|
| `web.atividades.abastecimento` | `/atividades/abastecimento` (+ `/gerar`, `/:id/tarefas`) | Abastecimento |
| `web.relatorios.ocupacao` | `/relatorios/ocupacao` | Ocupação de Endereços |
| `web.relatorios.produtividade` | `/relatorios/produtividade` (+ `/operador/:id`) | Produtividade Operacional |
| `web.relatorios.cortes` | `/relatorios/cortes` | Cortes de Separação |
| `web.relatorios.curva-abc` | `/relatorios/curva-abc` | Curva ABC |
| `web.relatorios.validade-lote` | `/relatorios/validade-lote` | Validade & Lote |
| `web.relatorios.baixo-giro` | `/relatorios/baixo-giro` | Baixo Giro / Obsoletos |
| `web.relatorios.inventario` | `/relatorios/inventario` | Acuracidade de Inventário |
| `web.relatorios.recebimento` | `/relatorios/recebimento` | Recebimento (Dock-to-Stock) |
| `web.relatorios.ciclo-pedido` | `/relatorios/ciclo-pedido` | Tempo de Ciclo de Pedido |

### Já cadastrados (referência) — 32 WEB + 7 COLETOR
Inclui `web.relatorios.estoque`, `web.relatorios.movimentacoes`, `web.relatorios.cortes` (este último já está no mapa mas falta o módulo correspondente — sim, faltou: ele está na lista acima).

### Rotas que NÃO precisam de módulo próprio
São subrotas que herdam permissão do pai:
- `/armazem/enderecos/lote` → `web.armazem.enderecos`
- `/atividades/inventario/novo` e `/atividades/inventario/:id/itens|execucao` → `web.atividades.inventario`
- `/atividades/abastecimento/gerar` e `/:id/tarefas` → `web.atividades.abastecimento`
- `/relatorios/movimentacoes/tarefa/:id` → `web.relatorios.movimentacoes`
- `/relatorios/produtividade/operador/:id` → `web.relatorios.produtividade`

## Plano de execução

### 1. Migration SQL (idempotente, multi-tenant)
Criar uma migration que, **para cada tenant_id existente em `modulo`**, insere os 10 módulos faltantes e suas 4 permissões (`CREATE`, `READ`, `UPDATE`, `DELETE`) cada — somando **10 módulos + 40 permissões por tenant**.

Estrutura proposta (uso de `ON CONFLICT DO NOTHING` e CTE para gerar permissões):

```sql
-- 1) Inserir módulos faltantes para cada tenant
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
tenants AS (SELECT DISTINCT tenant_id FROM modulo WHERE tenant_id IS NOT NULL)
INSERT INTO modulo (id, tenant_id, codigo, descricao, ambiente, ativo)
SELECT gen_random_uuid(), t.tenant_id, f.codigo, f.descricao, 'WEB', true
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
acoes(acao) AS (VALUES ('CREATE'),('READ'),('UPDATE'),('DELETE'))
INSERT INTO permissao (id, tenant_id, modulo_id, acao, descricao)
SELECT gen_random_uuid(), nm.tenant_id, nm.id, a.acao::enum_acao_permissao, a.acao
FROM novos_modulos nm CROSS JOIN acoes a
WHERE NOT EXISTS (
  SELECT 1 FROM permissao p
  WHERE p.modulo_id = nm.id AND p.acao::text = a.acao
);

-- 3) Conceder automaticamente as novas permissões ao perfil ADMINISTRADOR (sistema=true)
WITH novas_perms AS (
  SELECT p.id AS permissao_id, p.tenant_id
  FROM permissao p JOIN modulo m ON m.id = p.modulo_id
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
FROM perfil pf JOIN novas_perms np ON np.tenant_id = pf.tenant_id
WHERE pf.sistema = true
  AND NOT EXISTS (
    SELECT 1 FROM perfil_permissao pp
    WHERE pp.perfil_id = pf.id AND pp.permissao_id = np.permissao_id
  );
```

> Validar antes da migração o tipo exato do enum `acao` em `permissao` (provável `enum_acao_permissao`) — ajustar o cast se necessário.

### 2. Atualizar `src/hooks/useRoutePermission.ts`
Acrescentar ao `routeToModuleMap` as entradas faltantes para que o gate de permissão funcione:
```ts
"/atividades/abastecimento": "web.atividades.abastecimento",
"/relatorios/ocupacao": "web.relatorios.ocupacao",
"/relatorios/produtividade": "web.relatorios.produtividade",
"/relatorios/curva-abc": "web.relatorios.curva-abc",
"/relatorios/validade-lote": "web.relatorios.validade-lote",
"/relatorios/baixo-giro": "web.relatorios.baixo-giro",
"/relatorios/inventario": "web.relatorios.inventario",
"/relatorios/recebimento": "web.relatorios.recebimento",
"/relatorios/ciclo-pedido": "web.relatorios.ciclo-pedido",
```
(`web.relatorios.cortes` já existe.)

### 3. Atualizar `src/pages/PerfisAcessoPage.tsx`
Adicionar `"web.relatorios": "Relatórios"` ao objeto `groupLabels` para que o grupo de relatórios apareça com label amigável (atualmente só está mapeado por outros prefixos).

### 4. Limpar cache de permissões (orientação ao usuário)
Após aplicar a migration, o cache em `sessionStorage` (`core_rbac_permissions`, TTL 5 min) será atualizado automaticamente no próximo login ou após 5 minutos. Usuários ADMIN podem fazer logout/login para liberação imediata.

## Validação pós-execução
1. Abrir **Configurações → Perfis de Acesso** e confirmar que aparece um novo grupo **Relatórios** com 9 módulos e que **Atividades** agora mostra **Abastecimento**.
2. Selecionar um perfil não-sistema e marcar/salvar permissões em uma das novas entradas — confirmar persistência.
3. Para um usuário com perfil restrito, navegar à rota `/relatorios/baixo-giro` e validar que `useRoutePermission` bloqueia/libera conforme esperado.

## Arquivos impactados
- **Nova migration**: `supabase/migrations/<timestamp>_modulos_faltantes_rbac.sql`
- **Modificado**: `src/hooks/useRoutePermission.ts`
- **Modificado**: `src/pages/PerfisAcessoPage.tsx`
