## Causa identificada

Em `src/modules/reports/baixo-giro/baixoGiro.service.ts`, após agregar os saldos por produto (até 10.000 ids), é feito um único:

```ts
supabase.from("produto").select("id, sku, descricao, marca, grupo_id, subgrupo_id, preco_custo")
  .eq("tenant_id", ...)
  .in("id", produtoIds);
```

Com 999+ ids o `.in(...)` gera uma URL gigante (cada UUID ≈ 38 chars) que estoura o limite do PostgREST/proxy. O request retorna erro/empty silenciosamente — o `data` vem `null`, `produtoMap` fica vazio, e por isso todas as linhas mostram `sku: "—"` e `descricao: "—"`. O mesmo risco existe para a query de `estoque_movimento` (`.in(produto_id, …)`).

A query agregada de saldos não traz esse problema porque não usa `.in`, apenas filtra por tenant/empresa.

## Correção proposta

Em `baixoGiro.service.ts`:

1. Criar util local `chunk(arr, size)` (sem dependência nova).
2. Buscar `produto` em lotes de 300 ids:
   - `for (const ids of chunk(produtoIds, 300)) { ...select().in("id", ids) ... }` acumulando em `produtoMap`.
   - Tratar `error` lançando exceção (hoje é silenciada).
3. Buscar `estoque_movimento` (última saída) também em lotes de 300 ids, mantendo `order desc` e o `Map` que preserva apenas a primeira ocorrência por produto (já correto).
4. Manter `tenant_id`/`empresa_id` nos filtros e o restante do fluxo inalterado.

Nenhuma mudança em UI, tipos, RPC ou esquema. Apenas o serviço do relatório.
