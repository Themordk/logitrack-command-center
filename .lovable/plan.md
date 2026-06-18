# Correção: Relatório de Cancelamentos de Tarefas

## Objetivo
Trocar o campo exibido como "Qtd. Cancelada" de `quantidade_cortada` para `quantidade_executada`, e exibir "Sistema" quando `usuario_cancelamento` for null.

## Arquivos afetados

### 1. `src/modules/reports/cancelamentos/cancelamentos.service.ts`
- Remover `quantidade_cortada` do `select` (manter `quantidade_executada`).

### 2. `src/modules/reports/cancelamentos/CancelamentosPage.tsx`
Substituir em todos os locais abaixo `item.quantidade_cortada` → `item.quantidade_executada`:
- Coluna "Qtd. Cancelada" da tabela
- KPI "Qtd. Total Cancelada" (somatório)
- Totalizador do rodapé da tabela
- Exportação Excel (coluna "Qtd. Cancelada")
- Exportação PDF (coluna "Qtd. Cancelada")

Tratamento de "Cancelado por":
- Na renderização da coluna, se `usuario_cancelamento` (nome) for null/undefined, exibir `"Sistema"`.
- Aplicar mesmo fallback nas exportações Excel e PDF.

## Fora do escopo
Nenhuma outra alteração em filtros, layout, joins ou demais colunas.
