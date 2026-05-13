# Tornar MODULO e PERMISSAO globais (sem filtro de tenant)

## Contexto
As tabelas `modulo` e `permissao` definem os módulos e ações do sistema WMS. Hoje todos os registros estão vinculados a um único `tenant_id`, e a UI filtra por tenant. Isso força duplicação de dados mestres para cada novo tenant. O objetivo é tornar essas tabelas visíveis globalmente.

## Escopo
- Apenas tabelas `modulo` e `permissao` (dados mestres de RBAC)
- Não alterar `perfil`, `perfil_permissao`, `usuario_perfil` (continuam por tenant)
- Não alterar layout, rotas ou funcionalidades

## Plano de execução

### 1. Ajustar RLS no banco de dados

Criar migration com os seguintes ajustes:

**Tabela `modulo`:**
- Drop da policy `tenant_full_access` existente (ALL → `get_current_tenant()`)
- Nova policy SELECT: `USING (true)` — qualquer usuário autenticado visualiza todos os módulos
- Nova policy INSERT: `WITH CHECK (tenant_id = get_current_tenant())` — criação vinculada ao tenant
- Nova policy UPDATE: `USING (tenant_id = get_current_tenant())` — edição apenas do tenant dono
- Nova policy DELETE: `USING (tenant_id = get_current_tenant())` — exclusão apenas do tenant dono

**Tabela `permissao`:**
- Drop da policy `tenant_full_access` existente (ALL → `get_current_tenant()`)
- Nova policy SELECT: `USING (true)` — qualquer usuário autenticado visualiza todas as permissões
- Nova policy INSERT: `WITH CHECK (tenant_id = get_current_tenant())` — criação vinculada ao tenant
- Nova policy UPDATE: `USING (tenant_id = get_current_tenant())` — edição apenas do tenant dono
- Nova policy DELETE: `USING (tenant_id = get_current_tenant())` — exclusão apenas do tenant dono

> Nota: `tenant_id` continua existindo nas tabelas. Registros legados mantêm seu `tenant_id`, mas serão visíveis a todos. Novos registros de módulos/permissoes customizados por tenant continuam possíveis.

### 2. Ajustar queries no frontend

**Arquivo: `src/pages/PerfisAcessoPage.tsx`**

Na função `fetchAll`, alterar as duas queries de:
```
(supabase as any).from("modulo").select("*").eq("tenant_id", tenantId).order("codigo")
(supabase as any).from("permissao").select("*").eq("tenant_id", tenantId)
```

Para:
```
(supabase as any).from("modulo").select("*").order("codigo")
(supabase as any).from("permissao").select("*")
```

Remove o filtro `tenantId` dessas duas chamadas apenas. As queries de `perfil`, `perfil_permissao` e `usuario_perfil` mantêm o filtro de tenant.

### 3. Validar compatibilidade com `fn_usuario_permissoes`

A função `fn_usuario_permissoes` já faz JOIN com `permissao` e `modulo` **sem** filtrar `tenant_id` nessas tabelas (apenas em `perfil_permissao` e `usuario_perfil`). Portanto, após liberar o SELECT via RLS, a função continuará funcionando corretamente para todos os tenants.

### 4. Fora de escopo
- Não remover a coluna `tenant_id` das tabelas
- Não alterar `PermissionsContext.tsx` (usa RPC, já compatível)
- Não alterar outras páginas ou componentes
- Não alterar `perfil`, `perfil_permissao`, `usuario_perfil`