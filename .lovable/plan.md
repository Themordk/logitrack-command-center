## Plano — Refatoração do Dashboard "Torre de Controle"

Aplicar o prompt enviado (`prompt-lovable-dashboard.md`), migrando o dashboard para as 4 novas RPCs já disponíveis no banco, adicionando KPIs, gráfico de tendência e auto-refresh.

### Arquivos alterados

1. **`src/pages/dashboard/dashboard.service.ts`** — substituir 100% do conteúdo.
   - Remove as 6 funções antigas (`fetchOtif`, `fetchOcupacao`, `fetchProdutividade`, `fetchBacklog`, `fetchTopOperadores`, `fetchOcorrencias`) que faziam queries diretas.
   - Adiciona 4 funções que chamam RPCs: `fetchKpis` (`dashboard_kpis`), `fetchRankingOperadores` (`dashboard_ranking_operadores`), `fetchOcorrencias` (`dashboard_ocorrencias`), `fetchTendencia` (`dashboard_tendencia_tarefas`).
   - Exporta tipos `KpisResult`, `OperadorRanking`, `OcorrenciaItem`, `TendenciaItem` e helper `formatarTempoEspera`.

2. **`src/pages/Dashboard.tsx`** — reescrever.
   - Remove imports mortos do `recharts` (PieChart/Pie/Cell) e variável `donut`.
   - Estados passam a refletir as RPCs (`kpis`, `ranking`, `ocorrencias`, `tendencia`, `ultimaAtualizacao`).
   - Mantém o header "Torre de Controle" + "Sistema Online", adiciona botão de última atualização com `RefreshCw`.
   - Auto-refresh a cada 60 s sem ativar spinner.
   - Linha 1 de KPIs (Taxa de Conclusão, Ocupação, Produtividade, Fila de Espera) e nova Linha 2 (Em Andamento, Operadores Ativos, Unidades Movimentadas, Acurácia Operacional).
   - Novo gráfico `TendenciaChart` acima da seção Ranking + Ocorrências.

3. **`src/pages/dashboard/components/KPICardPro.tsx`** — adicionar props `progress` (0-100) e `unit` (texto ao lado do valor), e corrigir a barra de progresso que hoje fica fixa em 100% (passa a refletir `progress`, com fallback atual quando ausente).

4. **`src/pages/dashboard/components/TendenciaChart.tsx`** — novo arquivo. AreaChart (recharts) 24h, preenchendo horas sem dados com zero, com gradiente, tooltip dark, estado vazio e skeleton.

### Notas técnicas

- Nenhuma migração de banco — RPCs já existem.
- Mantém integração com `useTenant` (tenant/empresa/armazem/empresaVersion) e `DashboardFilters` existente.
- Severidades de KPI seguem regras do prompt (Taxa: ≥95 good / ≥80 warn; Ocupação invertida; Acurácia: ≥98 good / ≥95 warn; Backlog: >50 bad / ≥20 warn).
- `RankingOperadores` e `OcorrenciasChart` reutilizam componentes existentes (ocorrências mapeadas para `{ descricao, qtd }`).
- Sem alterações em filtros, rotas, permissões ou outras telas.
