## Diagnóstico (confirmado)

O item "Regras de Armazenagem" está registrado no menu (`TopNav.tsx`) e a rota está em `App.tsx`, mas o `TopNav` filtra os itens pelo RBAC usando `getModuleForChildRoute("/armazem/regras-armazenagem")`, que retorna:

- **Frontend espera:** `web.armazem.regras-armazenagem` (com hífen — derivado do path)
- **Banco tem cadastrado:** `web.armazem.regras_armazenagem` (com underscore — registrado no turno anterior)

Como nenhum perfil tem permissão para o código com hífen, o `can("web.armazem.regras-armazenagem","READ")` retorna `false` e o item é removido do menu para qualquer usuário com RBAC efetivo (perfis não-admin com permissões atribuídas). O mesmo mismatch afeta a proteção da rota.

## Correção

Padronizar o frontend para o código já cadastrado no banco (`regras_armazenagem`), evitando nova migration.

### `src/hooks/useRoutePermission.ts`

Adicionar mapeamento explícito no `routeToModuleMap` (antes do fallback genérico):

```ts
"/armazem/regras-armazenagem": "web.armazem.regras_armazenagem",
```

Isso faz `getModuleForChildRoute` retornar o código com underscore, batendo com o banco. Como a função consulta o map antes do fallback, funciona tanto para o filtro do menu quanto para a proteção da rota.

Nenhuma outra alteração é necessária — o `INSERT` de módulo/permissões já executado no banco continua válido.

## Verificação

Após a mudança, com um usuário cujo perfil tenha `READ` em `web.armazem.regras_armazenagem`, o item deve aparecer em Armazém → Regras de Armazenagem. Usuários admin (sem entradas em `permissions`) já viam por causa do fallback "sem permissões = acesso total" no `PermissionsContext`; o cenário quebrado era o de usuários com RBAC ativo.
