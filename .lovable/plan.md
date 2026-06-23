## Alterações em Tipos de Saída (`/dados-mestres/tipos-saida`)

### 1. Formulário de cadastro/edição
Adicionar novo campo no `CrudModal`:
- **Separa Pulmão** (`separa_pulmao`) — switch, default `false`. Indica se o tipo de saída permite separação a partir de endereços do tipo PULMÃO.

Posicionar logo após o switch **Conferência Checkout**, antes do **Ativo**.

### 2. Grid (CrudTable) de Tipos de Saída
Adicionar as colunas que hoje estão ausentes, exibindo como badges Sim/Não:
- **Realiza Conferência** (`realiza_conferencia`)
- **Conferência Checkout** (`conferencia_checkout`)
- **Separa Pulmão** (`separa_pulmao`)

Ordem final das colunas: Descrição · Código ERP · Realiza Conferência · Conferência Checkout · Separa Pulmão · Status.

### Detalhes técnicos
- Arquivo único: `src/pages/TiposSaidaPage.tsx`.
- Coluna `separa_pulmao` já existe em `public.tipo_saida` — sem migração.
- `useCrud` faz `SELECT *`, então os novos campos já chegam ao grid e ao modal sem alterações adicionais.
- Renderização Sim/Não no grid: usar `type: "badge"` (mesmo padrão do `ativo`) — se necessário, formatar via `render` para mostrar "Sim"/"Não" em vez do valor bruto, mantendo consistência visual com as demais telas de Dados Mestres.
