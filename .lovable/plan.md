## Objetivo
Adicionar o campo **Prioridade** nos cadastros de Tipos de Entrada e Tipos de Saída.

## Contexto
As colunas `prioridade` (enum `enum_prioridade_onda`: BAIXA, NORMAL, ALTA, URGENTE) já existem em `public.tipo_entrada` e `public.tipo_saida`. Portanto não há migração de banco — apenas ajustes de UI.

## Alterações

### `src/pages/TiposEntradaPage.tsx` e `src/pages/TiposSaidaPage.tsx`
- Adicionar coluna **Prioridade** no grid (com badge colorido: cinza/BAIXA, azul/NORMAL, laranja/ALTA, vermelho/URGENTE) posicionada antes da coluna Status.
- Adicionar campo `prioridade` no `CrudModal` do tipo `select` com as 4 opções do enum, `defaultValue: "NORMAL"`, obrigatório.

## Fora do escopo
- Nenhuma mudança no backend/RPC (a `gerar_onda_separacao` já lê `tipo_saida.prioridade`).
- Sem alterar telas de Entradas/Saídas.
