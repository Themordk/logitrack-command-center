## Objetivo

Substituir a query atual de contagem (apenas Recebimento) por uma chamada unificada à RPC `fn_coletor_menu_badges`, exibindo badges vermelhos em todos os 6 botões do menu do coletor.

## Arquivo afetado

- `src/pages/coletor/ColetorHomePage.tsx` (único arquivo)

## Mudanças

### 1. Substituir o `useEffect` atual de contagem
Remover a query direta em `tarefa` (linhas 39-50). Em seu lugar, chamar a RPC `fn_coletor_menu_badges` passando `p_tenant_id`, `p_empresa_id` e `p_armazem_id` (null se ausente).

Obter `empresaId` do `localStorage` (`core_empresa_id`), seguindo o mesmo padrão usado para `tenantId` e `armazemId` no arquivo atual (não trocar para `useTenant()` para manter consistência com o restante do componente).

### 2. Mapear chaves da RPC para os labels dos botões
Adicionar um campo `badgeKey` em cada item de `modules`:

| Label        | badgeKey       |
|--------------|----------------|
| Recebimento  | `recebimento`  |
| Armazenagem  | `armazenagem`  |
| Movimentos   | `movimentos`   |
| Separação    | `separacao`    |
| Conferência  | `conferencia`  |
| Inventário   | `inventario`   |

O state `pendingCounts` passa a guardar o objeto retornado pela RPC (`Record<string, number>`), e o render usa `pendingCounts[m.badgeKey]`.

### 3. Refresh automático
- `setInterval` de 30s para re-chamar a RPC.
- Listener `visibilitychange` para refresh quando o app volta ao foco.
- Cleanup correto (clearInterval + removeEventListener) no retorno do `useEffect`.

### 4. Estilo do badge
Manter exatamente o estilo já existente no arquivo (linhas 82-86): círculo vermelho, absolute top-right, esconder quando count = 0. Apenas adicionar tratamento `count > 99 ? "99+" : count`. O badge aparece automaticamente em todos os botões, já que o `allowedModules.map` é compartilhado — sem necessidade de filtrar por permissão (a permissão já filtra o botão antes).

## Fora de escopo

- Sem migrations (a RPC já existe).
- Sem novos componentes ou dependências.
- Sem alterar o footer (Consultas/Metas/Config).
- Sem alterar permissões ou outras telas do coletor.
