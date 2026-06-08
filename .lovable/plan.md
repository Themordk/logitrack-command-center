## Objetivo

Refatorar os 2 relatórios principais conforme prompt anexo:
1. **Posição de Estoque** (`/relatorios/posicao-estoque`) — 4 novos filtros + exportações
2. **Histórico de Movimentações** (`/relatorios/historico-movimentos`) — remover Descrição, adicionar Saldo Inicial/Final via RPC + exportações

Migrations (índices + RPC) aplicadas via `supabase--migration`. Frontend ajustado nos arquivos existentes em `src/modules/reports/`.

## Parte 1 — Migrations no Supabase

### Migration A — Índices de performance
```sql
CREATE INDEX IF NOT EXISTS idx_produto_grupo_id
  ON public.produto(tenant_id, grupo_id) WHERE grupo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_produto_subgrupo_id
  ON public.produto(tenant_id, subgrupo_id) WHERE subgrupo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_produto_marca
  ON public.produto(tenant_id, marca) WHERE marca IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_geral_tenant_empresa_produto
  ON public.estoque_geral(tenant_id, empresa_id, produto_id);
CREATE INDEX IF NOT EXISTS idx_estoque_movimento_tenant_empresa_data
  ON public.estoque_movimento(tenant_id, empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_movimento_produto_id
  ON public.estoque_movimento(tenant_id, produto_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_movimento_tipo
  ON public.estoque_movimento(tenant_id, tipo_movimento);
```

### Migration B — RPC `rpc_historico_movimento_com_saldo`
Window function `SUM() OVER (PARTITION BY produto_id ORDER BY criado_em)` para calcular `saldo_inicial` (linhas anteriores) e `saldo_final` (até a linha atual). `SECURITY INVOKER` para preservar RLS. Sinais por `tipo_movimento`:
- Entradas (+): 1 (Entrada), 4 (Armazenagem), 99 estorno-de-saída
- Saídas (−): 2 (Saída), 5 (Separação)
- Neutros/ajustes: 3 (Transferência), 6 (Inventário) — somam com sinal da própria `quantidade`

Antes de gravar a RPC, validar os códigos reais do enum `tipo_movimento` consultando `estoque_movimento` via `supabase--read_query` e ajustar o `CASE`.

Confirmar via `supabase--read_query` se já existem `GRANT EXECUTE` automáticos para `authenticated`; se não, adicionar `GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;` na migration.

## Parte 2 — Posição de Estoque (frontend)

### `src/modules/reports/estoque/estoque.service.ts`
- Adicionar parâmetro `codigo_endereco?: number` em `EstoqueFilter`
- Estender `produto` no select para incluir `marca`, `grupo_id`, `subgrupo_id` (já presente parcialmente)
- Aplicar filtros client-side por `codigo_endereco`, `grupo_id`, `subgrupo_id`, `marca`
- Manter `.limit(500)` atual

### `src/modules/reports/estoque/EstoqueReportPage.tsx`
- States novos: `filterCodigoEndereco`, `filterGrupoId`, `filterSubgrupoId`, `filterMarca`
- Listas auxiliares: `grupos` (de `grupo_produto` ativo do tenant/empresa), `subgrupos` (filtrado por `grupo_id` quando preenchido), `marcas` (distinct de `produto.marca`)
- Carregar listas no `useEffect` existente (tenant/empresa/empresaVersion)
- 4 novos campos no grid de filtros: Código Endereço (input number), Grupo (select), Subgrupo (select cascata), Marca (select com distinct)
- Resetar `filterSubgrupoId` quando `filterGrupoId` muda
- `handleClear` limpa os 4 novos filtros
- `activeFilters` exibe rótulos dos 4 novos filtros quando preenchidos

### Coluna Endereço
Atualmente exibe `descricao` em coluna rotulada "Endereço". Adicionar coluna **Código** com `codigo_endereco` (numérico) antes da coluna Endereço, mantendo a descrição.

## Parte 3 — Histórico de Movimentações (frontend)

### `src/modules/reports/movimentacoes/movimentacoes.service.ts`
- Substituir consulta da view pela `supabase.rpc('rpc_historico_movimento_com_saldo', {...})`
- Tipar resposta com `saldo_inicial` e `saldo_final` (numeric)
- Manter helpers `getTipoMovimentoLabel`/`Color`/`getTipoDocumentoLabel`

### `MovimentacoesReportPage.tsx`
- **Remover** coluna `descricao` do array `columns`
- **Adicionar** colunas `saldo_inicial` e `saldo_final` ao final (align right, format `Number.toLocaleString("pt-BR")`)
- Layout/filtros existentes preservados

## Parte 4 — Exportações (Excel + PDF) — compartilhado

### Dependências
- `bun add xlsx jspdf jspdf-autotable`

### Novo módulo `src/modules/reports/utils/exporters.ts`
Funções genéricas:
- `exportToExcel(filename, columns, rows)` — usa `XLSX.utils.aoa_to_sheet`, header com labels em PT, auto-width por coluna
- `exportToPdf(opts)` — `jsPDF` paisagem A4 + `autoTable`:
  - Cabeçalho: título, "Gerado em", "Usuário", "Registros", "Período"
  - Linha de "Filtros aplicados: K: V | K: V"
  - Tabela: fonte 8pt, header fundo `#1E3A5F` texto branco, zebra `#F8FAFC`
  - Rodapé fixo: "Página X de N · CORE LogiTrack — Confidencial"

### `ReportHeader.tsx`
Trocar a assinatura para receber callbacks opcionais `onExportExcel`, `onExportPdf`, `onPrint` (mantém `disabled` quando ausentes). Os botões existentes acionam estas funções.

### Páginas
Cada página passa para `ReportHeader`:
- `onExportExcel`: chama `exportToExcel('posicao_estoque_…', visibleColumns, data)`
- `onExportPdf`: chama `exportToPdf({ title, generatedAt, usuario, filters, columns, rows })`
- `onPrint`: `window.print()`

Para reaproveitar as definições, derivar a lista exportável (label + key + formatter) das `ReportColumn[]` já declaradas. Campos com `render` JSX recebem um formatter texto paralelo declarado junto da coluna (ex.: `exportValue?: (row) => string`) — adicionar essa propriedade opcional ao tipo `ReportColumn`.

### CSS de impressão
Adicionar em `src/index.css` um bloco `@media print` (landscape A4, esconder `.no-print`, header colorido, zebra, fonte 8pt). Marcar topnav/breadcrumb/filtros com `print:hidden`.

## Estrutura de arquivos

| Ação | Caminho |
|---|---|
| Editar | `src/modules/reports/estoque/EstoqueReportPage.tsx` |
| Editar | `src/modules/reports/estoque/estoque.service.ts` |
| Editar | `src/modules/reports/movimentacoes/MovimentacoesReportPage.tsx` |
| Editar | `src/modules/reports/movimentacoes/movimentacoes.service.ts` |
| Editar | `src/modules/reports/components/ReportHeader.tsx` |
| Editar | `src/modules/reports/components/ReportTable.tsx` (tipo `ReportColumn` ganha `exportValue?`) |
| Editar | `src/index.css` (regras `@media print`) |
| Criar | `src/modules/reports/utils/exporters.ts` |
| Migration | índices |
| Migration | RPC `rpc_historico_movimento_com_saldo` |

## Fora de escopo

- Não alterar a view `vw_estoque_movimento_relatorio`
- Não tocar outros relatórios (curva ABC, produtividade, etc.)
- Não mexer em RLS nem em outras telas
- Não adicionar paginação server-side (mantém `.limit(500)` atual)

## Pontos de validação antes de implementar

1. Confirmar enum real de `tipo_movimento` (códigos 1..6 e 99) via `supabase--read_query` para ajustar o `CASE` da RPC com precisão.
2. Confirmar se `produto.marca` tem valores suficientes para popular um select; caso contrário, usar input texto com `ILIKE`.

Verificarei ambos antes de criar a migration da RPC.
