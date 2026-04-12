

## Plan: Redesign TarefaDetalhePage with 3-Container Layout

### Overview
Restructure the task detail page from 2 cards into 3 distinct sections with improved readability, and fetch all related executions instead of just one.

---

### 1. Update Service (`movimentacoes.service.ts`)

**1.1 Enhance `fetchTarefaDetalhe`** to accept a `tarefa_execucao_id`, but also:
- Fetch the **source document info** based on `tarefa.tipo_documento_origem` and `tarefa.id_documento_origem`:
  - If `MOVIMENTO_ENTRADA_ITEM`: fetch `movimento_entrada_item` + parent `movimento_entrada` (numero_movimento, status, box, observacao)
  - If `MOVIMENTO_SAIDA_ITEM`: fetch `movimento_saida_item` + parent `movimento_saida` (numero_onda, status, rota, destino_carga)
  - Other types: show raw `tipo_documento_origem` and `id_documento_origem`
- Fetch **all `tarefa_execucao` records** for the same `tarefa_id` (not just the one clicked), including usuario and enderecos joins
- Fix field name: use `prioridade_tarefa` (enum) instead of `prioridade`
- Fix field names: `id_local_origem`/`id_local_destino` instead of `endereco_origem_id`/`endereco_destino_id` for the tarefa table
- Fix `quantidade_cortada` instead of `qtde_cortada`

**Return shape:**
```ts
{
  tarefa: { ...tarefa, tipo_tarefa, produto, endereco_origem, endereco_destino },
  documento_origem: { tipo, numero, status, ...extra_fields } | null,
  execucoes: [ { ...tarefa_execucao, usuario, endereco_origem, endereco_destino } ]
}
```

---

### 2. Redesign Page (`TarefaDetalhePage.tsx`)

The page will receive a `tarefaExecucaoId` (used to identify which tarefa to load), then display 3 vertically stacked sections in a single-column layout for better readability:

**Container 1 — Documento de Origem**
- Icon: `FileText`
- Title: "Documento de Origem" with badge showing type (Mov. Entrada / Mov. Saída / etc)
- For MOVIMENTO_ENTRADA_ITEM: Nº Movimento, Status, Box, Produto (SKU + desc), Qtd Esperada, Qtd Conferida
- For MOVIMENTO_SAIDA_ITEM: Nº Onda, Status, Rota, Destino Carga, Produto, Qtd Esperada, Qtd Separada
- For other types: tipo_documento_origem + id_documento_origem
- Horizontal grid layout (3-4 cols) with compact InfoItems

**Container 2 — Informações da Tarefa**
- Icon: `ClipboardList`
- All existing tarefa fields, updated:
  - Use `prioridade_tarefa` with enum label
  - Use `quantidade_cortada` (correct field)
  - Use `id_local_origem` / `id_local_destino` for address lookups
- Progress bar for % execucao instead of just text

**Container 3 — Execuções**
- Icon: `Play`
- Title: "Execuções ({count})"
- Render as a **list of compact rows/cards**, each showing:
  - Status badge, Usuario, Atribuido/Iniciado/Concluido timestamps
  - Qtd Executada, Lote, Validade, Origem/Destino, HU
  - Motivo ocorrencia (if exists), Qtd Cortada (if > 0)
  - ID Execucao in monospace
- Highlight the execution matching the original `tarefaExecucaoId`

**Design standards:**
- Dark theme cards with `bg-card` borders
- Status colors following red-to-blue progression
- Compact `InfoItem` component reused throughout
- Single-column full-width layout (no side-by-side cards)

---

### Files Modified
- `src/modules/reports/movimentacoes/movimentacoes.service.ts` — enhanced data fetching
- `src/modules/reports/movimentacoes/TarefaDetalhePage.tsx` — complete redesign

