## Problema

As rotas **Movimento de Entrada** e **Ondas de Carregamento (Movimento de Saída)** quebram com:

```
Error: No QueryClient set, use QueryClientProvider to set one
```

### Causa raiz

No refactor de performance anterior, `MovimentoEntradaPage.tsx` e `MovimentoSaidaPage.tsx` passaram a usar `useQuery` (`@tanstack/react-query`) para chamar as RPCs `listar_movimentos_entrada`, `buscar_itens_movimento_entrada`, `listar_ondas_carregamento` e `buscar_itens_onda_carregamento`.

Porém o projeto **nunca teve** um `QueryClientProvider` montado:

- `src/main.tsx` apenas faz `render(<App />)`.
- `src/App.tsx` não importa nada de `@tanstack/react-query`.
- `rg "QueryClient" src/` não encontra nenhuma referência.

Sem provider, qualquer `useQuery` lança esse erro ao renderizar — exatamente o que acontece nessas duas páginas.

## Correção (mínima, escopo de UI/bootstrap)

Adicionar um `QueryClientProvider` global em `src/App.tsx`, envolvendo a árvore de providers atual (`TenantProvider` → `TenantBootProvider` → `PermissionsProvider` → Router). Nada mais é alterado.

### Passos

1. **`src/App.tsx`**
   - Importar `QueryClient` e `QueryClientProvider` de `@tanstack/react-query`.
   - Criar uma única instância de `QueryClient` em escopo de módulo, com defaults conservadores:
     - `staleTime: 30_000`
     - `refetchOnWindowFocus: false`
     - `retry: 1`
   - Envolver o conteúdo retornado pelo componente `App` com `<QueryClientProvider client={queryClient}>…</QueryClientProvider>` como provider mais externo (acima de `TenantProvider`).

2. **Validação**
   - Confirmar que `@tanstack/react-query` já está em `package.json` (é o pacote que `MovimentoEntradaPage`/`MovimentoSaidaPage` já importam). Se faltar, adicionar como dependência.
   - Abrir `/movimentos/entrada` e `/movimentos/saida` no preview e verificar que:
     - A lista carrega via RPC.
     - A aba "Itens" carrega via RPC.
     - Não há mais o erro `No QueryClient set` no console.

### O que NÃO será alterado

- Lógica das páginas, RPCs, debounce, paginação, filtros, layout, abas Conferência/Separação/Docs, regras de tenant/empresa.
- Demais páginas (que hoje não usam `useQuery`) continuam funcionando sem mudanças, pois o provider é adicionado acima de tudo, sem efeito colateral.
