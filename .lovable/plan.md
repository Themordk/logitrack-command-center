Correção de timezone em `OperadoresAtivosPage.tsx`

### Alteração
1. **Imports**: manter `format` do `date-fns` (usado para `ultimaAtualizacao`) e adicionar `formatTime` de `@/utils/dateTime`.
2. **Formatação de `inicio_sessao`**: substituir `format(new Date(o.inicio_sessao), "HH:mm")` por `formatTime(o.inicio_sessao)` na célula da tabela.
3. **Sem outras mudanças**: não alterar nenhum outro arquivo, componente, RPC ou lógica.

### Arquivo afetado
- `src/pages/OperadoresAtivosPage.tsx`