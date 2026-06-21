## Problema

O enum `enum_status_tarefa` não possui `PENDENTE`/`CONTADO`/`CONFERIDO`. Os valores reais são:
`CRIADA, ATRIBUIDA, EM_ANDAMENTO, PAUSADA, CONCLUIDA, AUDITADA, CANCELADA, DIVERGENTE`.

A view `inventario_item_resumo` expõe `tarefa.status` direto. Para o inventário `eaee533a-…` confirmei: `ATRIBUIDA` (não contado), `EM_ANDAMENTO` (1ª feita / aguardando 2ª), `CONCLUIDA` (conferido).

Ou seja, todo o mapeamento atual de status na página está errado — tanto a query de "Zerar não contados" (filtro `PENDENTE`/`CONTADO`) quanto a lógica de exibição de `—` e o `STATUS_COLOR`.

## Mudanças em `src/pages/InventarioItensPage.tsx`

1. **`handleZerar`** — trocar o filtro de status no `select` de tarefas:
   - 1ª Contagem → `status = 'ATRIBUIDA'`
   - 2ª Contagem → `status = 'EM_ANDAMENTO'`

2. **Lógica de exibição (`—`)** nas colunas da tabela:
   - `primeira_contagem`: `—` quando `status === 'ATRIBUIDA'`
   - `segunda_contagem`: `—` quando `status ∈ ('ATRIBUIDA', 'EM_ANDAMENTO')`
   - `saldo_final`: `—` quando `status !== 'CONCLUIDA'` (e `!== 'AUDITADA'` se aplicável)
   - `divergência`: `—` quando `status ∈ ('ATRIBUIDA', 'EM_ANDAMENTO')`

3. **`STATUS_COLOR`** — substituir chaves pelos status reais para o badge voltar a colorir:
   - `ATRIBUIDA` (cinza/muted)
   - `EM_ANDAMENTO` (azul)
   - `DIVERGENTE` (vermelho)
   - `CONCLUIDA` (verde)

4. **Filtro "Não Contados" do topo** — continua usando `.is(..., null)` na view; isso não depende de status e segue funcionando. Sem mudança.

Nenhuma alteração em RPC, schema, layout ou demais comportamentos.

## Resumo

Corrige o erro `22P02 invalid input value for enum enum_status_tarefa "PENDENTE"` alinhando a página aos valores reais do enum (`ATRIBUIDA`/`EM_ANDAMENTO`/`CONCLUIDA`/`DIVERGENTE`) tanto na ação de zerar quanto na exibição de `—` e no badge de status.