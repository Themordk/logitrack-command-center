## Escopo

Três ajustes pontuais:

### 1. Armazém → Configurações: campo "Endereço de Armazenagem Automática"

**Arquivo:** `src/components/armazem/ArmazemConfigModal.tsx`
- Adicionar estado `enderecoArmazenagemAutomaticaId`.
- Carregar `endereco_armazenagem_automatica_id` no `select` inicial.
- Adicionar 4º `EnderecoSearchInput` com label "Endereço de Armazenagem Automática".
- Incluir `endereco_armazenagem_automatica_id` no payload do upsert e no reset do `handleRemove`.

### 2. Tipos de Entrada: campo `armazenagem_automatica`

**Arquivo:** `src/pages/TiposEntradaPage.tsx`
- Adicionar coluna `armazenagem_automatica` (type: `badge`, label "Armazenagem Automática") na lista, logo após "Realiza Conferência".
- Adicionar `FieldSpec` do tipo `switch` no modal com `defaultValue: false`, abaixo de "Realiza Conferência".

### 3. Nova assinatura de `gerar_tarefas_conferencia_entrada`

**Arquivo:** `src/pages/MovimentoEntradaPage.tsx` (linha 380)
- Passar `p_usuario_id: usuarioId` (via `useTenant()`) além dos parâmetros já existentes (`p_movimento_entrada_id`, `p_tenant_id`).

Nenhuma migração de banco é necessária — as colunas e a função já existem.

## Fora de escopo

- Qualquer lógica funcional que consome os novos campos (execução da armazenagem automática em si) — apenas cadastro/exibição.
