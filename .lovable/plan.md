
## Plano — Relatório de Tarefas por Colaborador (drill-down de Produtividade)

Escopo 100% frontend. RPC `rpc_relatorio_tarefas_colaborador` já existe no backend.

### 1. Novo arquivo: `src/modules/reports/produtividade/TarefasColaboradorPage.tsx`

Página completa seguindo o padrão de `ProdutividadeOperadorPage.tsx` e demais relatórios em `src/modules/reports/`:

- Props: `usuarioId: string`, `onNavigate?: (path: string) => void`, `dataInicio?: string`, `dataFim?: string`.
- Fallback de datas: últimos 7 dias quando query params ausentes.
- `useTenant()` para `tenantId`, `empresaId`, `armazemId`, `usuarioNome`.
- Chama `fetchTarefasColaborador(...)` do service em `useEffect` inicial e ao alterar filtros de servidor (tipo de tarefa, status).
- Estado local: dados brutos, filtros de servidor (`tipoTarefaId`, `status`), filtro cliente (`buscaSku`), paginação (20/pág), sort key/dir.
- Header: usa `ReportHeader` existente. Título "{usuario_nome}", subtítulo com período, botão voltar via `onNavigate("/relatorios/produtividade")`, botões Excel/PDF via `exportToExcel`/`exportToPdf` de `src/modules/reports/utils/exporters.ts`.
- 4 KPI cards (Total Tarefas, Itens Movimentados, Tempo Produtivo, Produtividade/Hora) em grid responsivo, ícones `lucide-react`.
- Filtros inline: Select Tipo de Tarefa (carregado de `tipo_tarefa` filtrado por `tenant_id`), Select Status, Input busca SKU/produto.
- Tabela via `ReportTable` (`src/modules/reports/components/ReportTable.tsx`) já suporta sort ao clicar. Colunas: Atribuição, Execução, Tipo Tarefa, ID Tarefa (8 chars), SKU, Produto (truncar 40 com `title`), Qtd Requerida, Qtd Executada, Qtd Cortada (vermelho se >0), Duração, Espera (amarelo se >300s), Origem, Destino, Status (badge colorido), Lote.
- Rodapé com totais (linha extra) — renderizada abaixo da tabela como faixa `bg-secondary/50`, uma vez que `ReportTable` não tem slot de footer.
- Paginação com componente `Pagination` shadcn, 20 por página; slice do array ordenado+filtrado.

### 2. Alteração em `src/modules/reports/produtividade/produtividade.service.ts`

Adicionar função + tipagem:

```ts
export interface TarefaColaboradorRow { /* conforme spec */ }

export async function fetchTarefasColaborador(params: {
  tenant_id: string; usuario_id: string; data_inicio: string; data_fim: string;
  empresa_id?: string | null; armazem_id?: string | null;
  tipo_tarefa_id?: string | null; status?: string | null;
}): Promise<TarefaColaboradorRow[]>
```

Chama `rpc_relatorio_tarefas_colaborador` via `(supabase as any).rpc(...)`.

### 3. Alteração em `src/App.tsx`

- Import de `TarefasColaboradorPage`.
- Em `getBreadcrumbs`: se path começa com `/relatorios/produtividade/tarefas/`, retorna a cadeia CORE > Relatórios > Produtividade Operacional (link) > Tarefas do Operador.
- Em `renderPage`: regex `^\/relatorios\/produtividade\/tarefas\/([a-f0-9-]+)` extraindo `usuarioId` e query params `inicio`/`fim`. Renderiza a página com props.

### 4. Alteração em `src/modules/reports/produtividade/ProdutividadeDashboardPage.tsx`

Na tabela "Detalhamento por Dia": adicionar `cursor-pointer`, `onClick` navegando para `/relatorios/produtividade/tarefas/${r.usuario_id}?inicio=${dataInicio}&fim=${dataFim}` via `onNavigate` (ou `window.location.hash` como fallback) e `title` explicativo.

### Detalhes técnicos

- Datas exibidas com utilitário existente `formatDateTimeNaive` de `src/utils/dateTime.ts` (padrão do projeto — memory rule) ao invés de `parseISO+format` cru.
- Formatação numérica pt-BR com `fmtNumberBR` do `exporters.ts`.
- Duração/espera: helper local `formatDuracao(seg)` → `Xh Ymin` / `Xmin Ys`.
- Exports: colunas mapeadas via `ExportColumn[]`; nome do arquivo `tarefas_operador_{slug(nome)}_{inicio}_{fim}`.

### Fora do escopo
Backend/RPC (já pronta), alterações em outras páginas de Produtividade além da tabela clicável.
