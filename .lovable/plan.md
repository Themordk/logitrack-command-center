# Causa do problema

A consulta retorna **35 registros** corretamente, mas a tela exibe lista vazia.

Olhando `cancelamentos.service.ts` (linhas 111-116), há um filtro **client-side**:

```ts
if (filters.empresa_id) rows = rows.filter(r => r.__empresa_id === filters.empresa_id);
if (filters.armazem_id) rows = rows.filter(r => r.__armazem_id === filters.armazem_id);
```

Esses valores vêm de `tarefa.empresa_id` / `tarefa.armazem_id`. No payload retornado, **todas as 35 linhas têm `tarefa.armazem_id = null`**. Como a página (`CancelamentosPage.tsx` linha 99) passa `armazem_id: armazemId` do `useTenant()`, e o tenant atual tem um `armazemId` selecionado, o filtro `null === '<uuid>'` derruba **100% das linhas**.

O mesmo risco existe para `empresa_id` quando o tenant tem empresa selecionada que não bate (ou quando `tarefa.empresa_id` é null em algum registro).

# Correção proposta

**Arquivo único:** `src/modules/reports/cancelamentos/cancelamentos.service.ts`

Mudar o filtro client-side para **só descartar a linha quando o valor da tarefa for não-nulo e diferente** do filtro — registros sem empresa/armazém atribuído na `tarefa` permanecem visíveis (mesmo comportamento prático do filtro server-side por `tenant_id`, que já isola os dados):

```ts
if (filters.empresa_id) {
  rows = rows.filter((r: any) => !r.__empresa_id || r.__empresa_id === filters.empresa_id);
}
if (filters.armazem_id) {
  rows = rows.filter((r: any) => !r.__armazem_id || r.__armazem_id === filters.armazem_id);
}
```

`tipo_tarefa_id` e `sku` continuam como estão (esses campos nunca são nulos nos dados retornados).

# Por que não filtrar server-side

`tarefa_execucao` não tem colunas `empresa_id`/`armazem_id` próprias; estão na tabela `tarefa` (relação aninhada). Para filtrar server-side seria preciso `!inner` + `tarefa.empresa_id=eq.X`, mas isso também excluiria as linhas com `armazem_id = null`, mantendo o bug. A lógica permissiva (null = aceita) é a correta para um relatório de rastreabilidade.

# Validação

Após o ajuste, gerar o relatório no período atual deve listar as 35 ocorrências retornadas pela API.

# Sem mudanças necessárias

- Sem alteração de SQL/RLS/grants.
- Sem alteração de UI, KPIs, exportadores ou roteamento.
- Sem mudança em `CancelamentosPage.tsx`.
