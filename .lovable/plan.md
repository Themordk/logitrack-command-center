## Objetivo

Padronizar a tela de criação/edição de **Tipos de Entrada** aplicando o mesmo layout seccionado já usado em **Tipos de Saída**, substituindo o `CrudModal` genérico por um `Dialog` customizado com grupos visuais.

## Mudanças em `src/pages/TiposEntradaPage.tsx`

1. Remover o uso do `CrudModal` e do array `fields`.
2. Substituir por um `Dialog` customizado (mesmo padrão de `TiposSaidaPage.tsx`) com estado local `form`, `saving`, helpers `set()` e `handleSave()`.
3. Reaproveitar as classes utilitárias já validadas em Tipos de Saída (`inputClass`, `sectionClass`, `sectionTitleClass`) para manter identidade visual idêntica.

## Estrutura das seções do modal

Distribuir os campos existentes (sem adicionar/remover campos) nos seguintes blocos:

- **Dados gerais** (grid 3 colunas)
  - Descrição *
  - Código ERP
  - Prioridade * (BAIXA / NORMAL / ALTA / URGENTE)

- **Conferência**
  - Realiza Conferência (switch)

- **Armazenagem**
  - Armazenagem Automática (switch)

- **Automação**
  - Gera Movimento Automático (switch)
  - Libera Movimento Automático (switch)

- **Status** (fora de card, rodapé)
  - Ativo (switch)

## Regras de negócio

- Ao salvar, preservar `empresa_id: empresaId` no payload (comportamento atual).
- Manter validação mínima: `descricao` obrigatória (bloqueia salvar se vazia).
- Nenhuma alteração no grid/tabela, colunas, filtros, exclusão ou no hook `useCrud`.

## Fora de escopo

- Nenhuma alteração de schema, RPC ou lógica de backend.
- Nenhuma mudança em Tipos de Saída.
