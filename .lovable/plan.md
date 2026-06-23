## Redesign Relatório de Produtividade Operacional

Substituir o conteúdo de `ProdutividadeDashboardPage.tsx` (rota `/relatorios/produtividade`) e reescrever `produtividade.service.ts` conforme spec do anexo. Manter `ProdutividadeOperadorPage.tsx` e a rota de drill-down `/relatorios/produtividade/operador/:id` como estão.

### Arquivos

- **Reescrever** `src/modules/reports/produtividade/produtividade.service.ts`
  - `ProdutividadeFilters` (tenantId, empresaId, armazemId, dataInicio, dataFim, usuarioId, turnoId)
  - `fetchProdutividadeDiaria(filters)` → `lms_metrica_diaria` + joins `usuario(id,nome)` e `turno:turno_id(descricao)`
  - `fetchDetalheTipoTarefa(filters)` → `lms_metrica_tipo_tarefa` + joins
  - `fetchOperadores(tenantId)` e `fetchTurnos(tenantId)` para popular selects
  - Tipos exportados para a página

- **Reescrever** `src/modules/reports/produtividade/ProdutividadeDashboardPage.tsx` (mesmo arquivo, mesmo export — sem mudar App.tsx)
  - Header: ícone `Activity`, título "Produtividade Operacional", subtítulo cinza
  - Barra de filtros `grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3`: data início, data fim, Armazém (já existe no atual — manter), Operador, Turno, botão Filtrar + botões Excel/PDF à direita
  - Presets ghost: Hoje, Últimos 7 dias, Últimos 15 dias, Este mês (preenchem datas e disparam fetch)
  - **6 KPI cards** (`bg-card border-border rounded-lg p-4`, label uppercase muted, valor `text-2xl font-bold font-mono`): Tarefas Concluídas, Itens Processados, Tempo Produtivo (HHh MMmin), Taxa de Ocupação (cor dinâmica verde/amarelo/vermelho), Produtividade/Hora, Cancelamentos (vermelho se >0)
  - **Gráfico Ranking de Operadores** (Recharts BarChart horizontal, ícone `Trophy`):
    - Eixo Y nomes, eixo X taxa_ocupacao 0–100
    - Cor por faixa (verde ≥85, amarelo 70–84, vermelho <70) usando `<Cell>` por barra
    - Tooltip custom (nome, ocupação, tarefas, prod/hora), LabelList com %
    - Ordenação desc, **clique navega** para `/relatorios/produtividade/operador/{usuario_id}` via `onNavigate`
  - **Gráfico Distribuição de Tempo** (Recharts BarChart empilhado, ícone `Clock`): séries "Tempo Produtivo" (#3b82f6) e "Tempo Ocioso" (#6b7280) em horas; tooltip em "Xh Ymin"; grid `stroke="hsl(222 35% 18%)"`
  - **Tabela detalhada** "Detalhamento por Dia" (ícone `Table`): 12 colunas conforme spec, header `bg-muted/50 uppercase`, `font-mono` para números, cor dinâmica em Taxa Ocupação, rodapé totalizador (totais soma + médias), ordenação por clique no header (`ChevronUp/Down`), paginação 20/página (shadcn `Pagination`)
  - Loading: skeletons `animate-pulse bg-muted rounded-lg` nos KPIs (6×h-24) e gráficos (2×h-72); spinner na tabela
  - Empty state com `BarChart3` quando sem dados
  - Carregamento automático dos últimos 7 dias ao abrir (sem exigir clique)

- **Utilitários inline** (mesmo arquivo): `formatarTempo`, `formatarNumero`, `corTaxaOcupacao`

- **Export Excel** (`xlsx`) e **PDF** (`jsPDF` + `jspdf-autotable`) conforme snippets do anexo, com nome `produtividade_YYYY-MM-DD.{ext}`

### Regras técnicas
- Tudo em português, sem siglas inglesas
- Ícones só do `lucide-react`, gráficos só do `recharts`
- Datas via `date-fns` locale pt-BR
- Sem novas dependências, sem mexer em `components/ui/`
- Sem `as any` (tipar respostas Supabase com generics estritos onde possível; `unknown` + narrow quando necessário)
- Recarregar ao mudar `empresaVersion`/armazemId selecionado

### Fora de escopo
- `App.tsx`, breadcrumbs, TopNav, `ProdutividadeOperadorPage.tsx`
- Componentes em `src/components/ui/`
- Mudanças no banco / RPCs
- Plano e ajustes anteriores em `InventarioItensPage.tsx`
