## Problema

Na aba **Impressoras** de Configurações → Impressão, o campo "Agent Responsável" abre vazio. A busca é feita em `ImpressorasTab.tsx` filtrando `print_agent` apenas por `tenant_id` e `ativo=true`, mas:

1. O `useEffect` depende só de `tenantId` — quando o usuário troca de empresa/armazém no TopNav, a lista de agents não é refetchada.
2. Não há filtro por `armazem_id`, mas uma impressora sempre pertence ao armazém ativo, então o agent listado deveria ser do mesmo armazém.
3. Existe hoje 1 agent ativo (`API RECEBIMENTO`) vinculado a um armazém específico; se o armazém selecionado for outro, faz sentido não aparecer — mas hoje o código nem sequer garante que aparece quando o armazém bate.

## Correção

Ajustar `src/components/impressao/ImpressorasTab.tsx`:

- Trocar o `useEffect` por um `useQuery` (padrão já adotado no restante do módulo) chaveado por `["print-agents", tenantId, empresaId, armazemId]`.
- A consulta filtra `print_agent` por `tenant_id`, `ativo=true` e, quando `armazemId` estiver definido, também por `armazem_id = armazemId` — evitando listar agents de outros armazéns.
- Se `armazemId` estiver definido e não houver agents, mostrar no `placeholder` do select uma mensagem "Nenhum agent cadastrado para este armazém" (via label da opção vazia dos `agentOptions`).
- Garantir que `agentOptions` seja recomputado toda vez que muda empresa/armazém no TopNav.

Nenhuma outra tela é afetada. Sem migration.

## Detalhes técnicos

Arquivo alterado: `src/components/impressao/ImpressorasTab.tsx`
- Substituir `useState`+`useEffect` por `useQuery` do `@tanstack/react-query`.
- Query key inclui `tenantId`, `empresaId`, `armazemId`.
- `enabled: !!tenantId`.
- Filtro condicional `.eq("armazem_id", armazemId)` quando presente.
