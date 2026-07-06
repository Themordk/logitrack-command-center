## Objetivo
No relatório **Posição de Estoque** (`/relatorios/estoque`), adicionar um checkbox "Apenas posições com saldo" no painel de filtros. Quando marcado, o relatório deve excluir posições com `quantidade_total === 0`. O checkbox deve vir **marcado por padrão** ao carregar a tela.

## Escopo da mudança
Dois arquivos do frontend:

1. `src/modules/reports/estoque/estoque.service.ts`
2. `src/modules/reports/estoque/EstoqueReportPage.tsx`

## Detalhes técnicos

### 1. Serviço (`estoque.service.ts`)
- Adicionar campo `apenas_com_saldo?: boolean` na interface `EstoqueFilter`.
- Aplicar filtro client-side no array `results` antes do retorno: quando `filters.apenas_com_saldo === true`, manter apenas itens onde `quantidade_total > 0`.
- Executar esse filtro **antes** da ordenação final, para que sort e multi-localização trabalhem sobre o subset já filtrado.

### 2. Página (`EstoqueReportPage.tsx`)
- Criar estado `filterApenasComSaldo` com valor inicial `true`.
- Renderizar checkbox na mesma linha dos filtros (próximo ao existente "Apenas produtos com mais de uma localização").
- Incluir `apenas_com_saldo: filterApenasComSaldo` no objeto `filters` enviado para `fetchEstoqueReport` em `handleGenerate`.
- Incluir `apenas_com_saldo` no `handleClear` (resetar para `true`).
- Incluir `apenas_com_saldo` no `activeFilters` para aparecer no cabeçalho do relatório e nos exports (quando marcado).
- Incluir `apenas_com_saldo` no reset de empresa (`useEffect` que escuta `empresaId`/`empresaVersion`).

## Fora de escopo
- Nenhuma mudança no banco de dados (view, tabela, RLS, triggers).
- Nenhuma mudança no componente `ReportTable` genérico.
- Nenhuma mudança em outros relatórios.