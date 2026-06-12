# Fix — Conferência livre por EAN (coletor/conferencia/produto)

## Causa raiz
A RPC `conferencia_buscar_tarefas` devolve `id, ordem_tarefa, sku, descricao, fator_caixa, quantidade_requerida, conferido, status` — **sem `produto_id`**. O frontend faz `tarefas.findIndex(t => t.produto_id === emb.produto_id)`, então todo scan de EAN cai em "EAN não pertence a nenhum item desta conferência", mesmo quando o produto está na onda.

## Mudanças

### 1) Migration — atualizar RPC `conferencia_buscar_tarefas`
Adicionar `produto_id uuid` (e por clareza `tarefa_id uuid` = `t.id`) ao `RETURNS TABLE` e ao `SELECT` final. Sem alterar lógica de claim/atribuição. Demais campos preservados para compatibilidade com `ConferenciaItensPage`.

```sql
RETURNS TABLE(
  id uuid,
  tarefa_id uuid,
  produto_id uuid,
  ordem_tarefa integer,
  sku text,
  descricao text,
  fator_caixa numeric,
  quantidade_requerida numeric,
  conferido numeric,
  status text
)
...
SELECT
  t.id,
  t.id            AS tarefa_id,
  t.produto_id,
  t.ordem_tarefa::integer,
  p.sku,
  p.descricao,
  p.fator_caixa::numeric,
  t.quantidade_requerida::numeric,
  COALESCE(t.quantidade_executada,0)::numeric AS conferido,
  t.status::text
FROM tarefa t ...
```

### 2) Frontend — `src/pages/coletor/ConferenciaProdutoPage.tsx`
Nenhuma mudança de lógica necessária: o match em `handleEanScan` (`t.produto_id === emb.produto_id`) e `markTarefaIniciadaByTarefa(activeTarefa.tarefa_id, …)` passam a funcionar automaticamente. Apenas validar que `loadTarefa` continua usando `t.produto_id` (já usa) para popular `produtoId`.

### 3) Compatibilidade
- `ConferenciaItensPage` itera os mesmos campos já existentes — sem regressão.
- Sessão persistida (`coletor_conferencia_tarefas`) é repovoada ao iniciar nova onda; usuários com sessão antiga continuarão vendo o erro até reiniciar a conferência (comportamento aceitável).

## Verificação
- Iniciar conferência do movimento `f78cae9a-4773-4b44-a567-71b5b516744f`.
- Escanear EAN `101010` → deve confirmar produto `cb054224…` (modo manual habilita quantidade; modo checkout registra direto).
- Escanear EAN inexistente → "EAN não cadastrado".
- Escanear EAN de produto fora da onda → "EAN não pertence a nenhum item desta conferência".
- Escanear EAN de item já 100% conferido → toast "Item já conferido".
