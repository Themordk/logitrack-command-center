
## Objetivo

Replicar nos demais relatórios o padrão de exportação já implementado em **Posição de Estoque** (`EstoqueReportPage`) e **Histórico de Movimentações** (`MovimentacoesReportPage`):

- Botões **Exportar PDF**, **Exportar Excel** e **Imprimir** no `ReportHeader` totalmente funcionais.
- Botões só ficam habilitados quando o relatório foi gerado e há linhas (`canExport = generated && data.length > 0`).
- Reutiliza `exportToExcel`, `exportToPdf`, `fmtNumberBR`, `fmtDateBR`, `fmtDateTimeBR` de `src/modules/reports/utils/exporters.ts` (sem novas dependências).
- Mesmo metadado no PDF: título, `generatedAt`, `usuário`, total de registros e bloco de filtros ativos.
- `handlePrint = () => window.print()` (CSS de impressão já existente no `ReportHeader`/`ReportTable`).

## Escopo (relatórios a atualizar)

Todos os que já usam `ReportHeader` mas ainda não passam `onExportExcel/onExportPdf/onPrint`:

1. `validade-lote/ValidadeLoteReportPage.tsx`
2. `inventario/InventarioReportPage.tsx`
3. `curva-abc/CurvaAbcReportPage.tsx`
4. `recebimento/RecebimentoReportPage.tsx`
5. `cortes/CortesReportPage.tsx`
6. `baixo-giro/BaixoGiroReportPage.tsx`
7. `ciclo-pedido/CicloPedidoReportPage.tsx`
8. `produtividade/ProdutividadeOperadorPage.tsx`

**Fora do escopo nesta etapa:** `produtividade/ProdutividadeDashboardPage.tsx` é um dashboard analítico (KPIs/charts), sem tabela única exportável. Aplico apenas **Imprimir** (`window.print()`), deixando PDF/Excel desabilitados, salvo orientação em contrário.

## Padrão técnico aplicado em cada arquivo

Para cada página acima, fazer apenas alterações de presentation/wiring (sem mexer em service ou regras de negócio):

1. Importar helpers:
   ```ts
   import { exportToExcel, exportToPdf, fmtNumberBR, fmtDateBR, fmtDateTimeBR, type ExportColumn } from "../utils/exporters";
   ```
2. Pegar `usuarioNome` de `useTenant()` (já disponível no contexto).
3. Definir `exportColumns: ExportColumn[]` espelhando as colunas visíveis da tela, com `format()` usando os mesmos helpers de formatação já usados no `render` (datas BR, números BR, labels de status, classes ABC, severidade, SLA, etc.). Sem render de JSX — apenas strings.
4. Acrescentar:
   ```ts
   const canExport = generated && data.length > 0;
   const handleExcel = () => exportToExcel("<slug>", exportColumns, data);
   const handlePdf   = () => exportToPdf("<slug>", exportColumns, data, {
     title: "<Título do relatório>",
     generatedAt, usuario: usuarioNome || "—",
     total: data.length, filters: activeFilters,
   });
   const handlePrint = () => window.print();
   ```
5. Passar ao `<ReportHeader>`:
   ```tsx
   onExportExcel={canExport ? handleExcel : undefined}
   onExportPdf={canExport ? handlePdf : undefined}
   onPrint={canExport ? handlePrint : undefined}
   exportDisabled={!canExport}
   ```

### Slugs e títulos sugeridos para os arquivos

| Página | filename slug | título PDF |
|---|---|---|
| ValidadeLote | `validade_lote` | Validade e Lotes |
| Inventario | `inventario` | Inventário – Apuração |
| CurvaAbc | `curva_abc` | Curva ABC |
| Recebimento | `recebimento_sla` | Recebimento (SLA) |
| Cortes | `cortes` | Cortes de Separação |
| BaixoGiro | `baixo_giro` | Produtos de Baixo Giro |
| CicloPedido | `ciclo_pedido` | Ciclo do Pedido |
| ProdutividadeOperador | `produtividade_operador` | Produtividade por Operador |

### Tratamento de colunas especiais

- **Status/Badges** (Recebimento SLA, Inventário status/severidade, Curva ABC classe): exportar como **texto** usando o mesmo label/getter já usado no `render`.
- **Durações** (Recebimento `tempo_*_min`, Ciclo do Pedido): reutilizar a função `formatDuration` local do arquivo.
- **Percentuais** (Curva ABC, Inventário acuracidade): manter `fmtPct` local.
- **Datas/validade**: `fmtDateBR`; **timestamps**: `fmtDateTimeBR`.
- **HU / IDs UUID**: aplicar o mesmo truncamento usado no render (ou string vazia quando UUID nulo `00000000-…`).
- **Colunas só visuais** (ícones, ações): omitidas do export.

## Validação

- Build/typecheck automático.
- Smoke manual: em cada relatório gerar com filtros, conferir que os 3 botões habilitam, baixar `.xlsx`/`.pdf` e verificar header (título, usuário, filtros, total) e alinhamento numérico à direita.
- Confirmar que ao trocar empresa ou alterar filtros (que limpa `data`), os botões voltam a ficar desabilitados.

## Riscos / observações

- Nenhuma mudança em services, queries, schema ou estado global — somente camada de apresentação.
- Sem novas libs: `xlsx` e `jspdf`/`jspdf-autotable` já são usados pelos relatórios atuais.
- `ProdutividadeDashboardPage` fica só com Imprimir; se desejar exportar tabelas/gráficos do dashboard, abrir tarefa separada (precisa decidir o que vai no Excel/PDF).
