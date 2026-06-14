# Ajuste: Resumo de Endereços/SKUs do Novo Inventário

## Problema
Em `/atividades/inventario/novo`, a prévia do card **Resumo** (Endereços / SKUs a serem contados) faz uma consulta em `estoque_geral` com embed `endereco!inner(...)` aplicando o filtro:

```
endereco.situacao = neq.BLOQUEADO_INVENTARIO
```

Esse filtro exclui qualquer endereço que esteja momentaneamente em situação `BLOQUEADO_INVENTARIO` (ex.: já há outro inventário em andamento), gerando **falso negativo** no totalizador exibido na tela — o usuário vê menos endereços/SKUs do que realmente seriam considerados pela RPC de geração do inventário. O atalho "POR ENDEREÇO" não tem esse problema porque consulta `estoque_geral` direto pelo `endereco_id`, sem embed.

## Escopo da alteração
Apenas UI/consulta de prévia. Nenhuma mudança em RPC, migration, lógica de geração do inventário ou demais telas.

**Arquivo:** `src/pages/NovoInventarioPage.tsx`

## Mudança técnica
No `useEffect` de prévia (linhas ~239–246), remover a cláusula `.neq("endereco.situacao", "BLOQUEADO_INVENTARIO")` da query genérica:

Antes:
```ts
let q = supabase.from("estoque_geral")
  .select("endereco_id, produto_id, endereco!inner(armazem_id, situacao)")
  .eq("tenant_id", tenantId)
  .eq("empresa_id", empresaId)
  .eq("endereco.armazem_id", armazemId)
  .neq("endereco.situacao", "BLOQUEADO_INVENTARIO")
  .limit(LIMIT);
```

Depois:
```ts
let q = supabase.from("estoque_geral")
  .select("endereco_id, produto_id, endereco!inner(armazem_id)")
  .eq("tenant_id", tenantId)
  .eq("empresa_id", empresaId)
  .eq("endereco.armazem_id", armazemId)
  .limit(LIMIT);
```

Tira-se também `situacao` do `select` embed (não é mais necessário).

## Fora de escopo
- Lógica/RPC de geração do inventário (permanece como está).
- Atalho do tipo "POR ENDEREÇO" (já não usa o embed).
- Demais telas/relatórios que consultam `estoque_geral`.
