
# Fase 2 — Refletir campos LMS nos painéis de produtividade

Aplicar campos LMS (`cor_interface`, `tipo_tarefa_categoria`, `aderencia_meta_pct`) já disponibilizados pelo `produtividade.service.ts` em duas páginas. Todas as adições são **opcionais**: se os campos vierem `null`, comportamento atual permanece intacto.

## Arquivos alterados (apenas 2)

### 1. `src/modules/reports/produtividade/ProdutividadeOperadorPage.tsx`

- **Cor configurável**: remover `TASK_COLORS` e o `getTaskColor(codigo)` atuais. Adicionar `DEFAULT_TASK_COLORS` + nova assinatura `getTaskColor(corInterface, codigo)` com fallback para o default e depois para azul base.
- Atualizar todas as chamadas para passar `cor_interface`:
  - `ganttData` map → `color: getTaskColor(t.cor_interface, t.tipo_tarefa_codigo)`
  - Mapa `porTipo` passa a armazenar `corInterface` (da primeira entrada do grupo); `<Cell fill={getTaskColor(entry.corInterface, entry.codigo)} />`
  - Tabela "Execuções Detalhadas" → mesma troca
  - Legenda do Gantt: usar `Map(ganttData.map(g => [codigo, g]))` para preservar amostra e passar `sample.cor_interface`
- **KPI Aderência à Meta (condicional)**: calcular `aderenciaMedia` sobre `concluidas.filter(t => t.aderencia_meta_pct != null)`. Se `null`, não renderiza. Grid dos KPIs passa a `grid-cols-2 md:grid-cols-4 lg:grid-cols-5`. Cor semântica: verde ≥100, âmbar ≥80, vermelho <80.
- **Coluna "Categoria"** na tabela de execuções detalhadas, antes de "Status": exibe `t.tipo_tarefa_categoria || "—"`.

### 2. `src/modules/reports/produtividade/TarefasColaboradorPage.tsx`

- Adicionar `"tipo_tarefa_categoria"` ao union `SortKey`.
- Nova coluna sortável "Categoria" no `<thead>` após "Tipo Tarefa"; célula no `<tbody>` com `r.tipo_tarefa_categoria || "—"`.
- Célula "Tipo Tarefa" ganha bolinha colorida (`w-2 h-2 rounded-full`) usando `r.cor_interface`, exibida apenas se cor existir.
- `exportColumns`: adicionar item `{ key: "tipo_tarefa_categoria", label: "Categoria", ... }` após `tipo_tarefa_descricao`.

## Fora de escopo (explícito)

- `produtividade.service.ts` — não alterar (já atualizado)
- `ProdutividadeDashboardPage.tsx` — fase 3 (depende de `fn_consolidar_lms_diario`)
- Nenhum outro arquivo do projeto

## Verificação

Rodar `tsgo` após as edições para confirmar tipagem dos novos campos e do `SortKey`.
