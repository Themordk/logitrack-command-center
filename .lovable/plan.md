

## Plano: Refatorar Dashboard como Torre de Controle Operacional

### Visão geral
Substituir o conteúdo atual de `src/pages/Dashboard.tsx` por uma torre de controle com filtros globais, 4 KPIs principais, ranking de operadores e gráfico de ocorrências. Manter o tema dark, classe `card-surface`, ícones lucide e padrão visual existente.

---

### 1. Filtros globais (topo)

Adicionar barra de filtros logo abaixo do header:
- **Armazém** — Select carregado de `armazem` (tenant atual).
- **Data** — Date range picker (Popover + Calendar shadcn). Default: hoje.
- **Turno** — Select carregado de `turnos` filtrado pelo armazém.

Estado local `filters` que dispara recarga de todos os blocos via `useEffect`. Estrutura preparada para auto-refresh futuro (polling `setInterval`, deixado comentado).

---

### 2. Top KPIs (4 cards clicáveis)

Novo componente `KPICardPro` com: título, valor grande, subtítulo, ícone, badge de tendência (▲▼ com %), barra/cor semântica e `onClick` opcional.

| KPI | Cálculo | Cor / regra |
|---|---|---|
| **OTIF** | % de `movimento_saida` com `status = CONCLUIDA` no período / total liberado no mesmo período. *Observação: a tabela não possui campo `data_prevista` nem `data_conclusao`; usaremos `data_emissao` no range e `status` como proxy. Documentar isso no card via tooltip.* | >95% verde, 90-95% amarelo, <90% vermelho. Click → `/atividades/movimento-saida` |
| **Taxa de Ocupação** | `endereco` com `situacao=OCUPADO` / total ativos no armazém. Subtítulo: total e livres. | >85% vermelho, 70-85% amarelo, <70% verde. Click → `/armazem/enderecos` |
| **Produtividade** | Soma `tarefas_concluidas` em `lms_metrica_diaria` no período / soma `tempo_produtivo` (horas) → tarefas/h. Tendência vs período anterior equivalente. | Neutro azul. |
| **Backlog** | Count `tarefa` com `status IN (CRIADA, ATRIBUIDA)` no armazém. Subtítulo: tempo médio de espera = `now() - criado_em` médio. | >50 vermelho, 20-50 amarelo, <20 verde. Click → futuramente lista de tarefas pendentes (placeholder navega para `/atividades/movimento-saida`). |

---

### 3. Gráficos estratégicos (2 colunas)

**3.1 Top Operadores (Ranking)**
- Query em `lms_metrica_diaria` agregando por `usuario_id` no range, join com `usuario` (nome).
- Lista vertical ordenada DESC por `tarefas_concluidas`. Top 3 com badge dourado/prata/bronze e destaque visual (border accent). Demais em estilo padrão.
- Colunas: posição, nome, tarefas concluídas, produtividade/h.

**3.2 Ocorrências Operacionais**
- Query: `tarefa` (e/ou `tarefa_execucao`) com `motivo_ocorrencia IS NOT NULL` no range, join `motivo_ocorrencia` para descrição, agrupado por motivo.
- Renderizar como gráfico de barras horizontal Recharts, top 8 motivos. Cor única (vermelho atenuado) para destacar como alerta.

---

### 4. Ocupação compacta (mantida no rodapé)

Manter o donut de ocupação atual em uma 3ª linha (mais compacto) lado a lado com um mini card de "Acesso Rápido" reduzido (4 links principais: Endereços, Movimento Entrada, Movimento Saída, Inventário). Isso preserva contexto visual sem dominar a tela.

---

### 5. Estrutura de arquivos

- **`src/pages/Dashboard.tsx`** — refatoração completa: header + filtros + 4 KPIs + 2 gráficos + ocupação compacta.
- **`src/pages/dashboard/dashboard.service.ts`** *(novo)* — funções:
  - `fetchOtif(filters)`, `fetchOcupacao(filters)`, `fetchProdutividade(filters)`, `fetchBacklog(filters)`
  - `fetchTopOperadores(filters)`, `fetchOcorrencias(filters)`
  - Cada função recebe `{ tenantId, armazemId, dataIni, dataFim, turnoId }`.
- **`src/pages/dashboard/components/KPICardPro.tsx`** *(novo)* — card de KPI com tendência/cor.
- **`src/pages/dashboard/components/DashboardFilters.tsx`** *(novo)* — barra de filtros (armazém, data range, turno).
- **`src/pages/dashboard/components/RankingOperadores.tsx`** *(novo)*.
- **`src/pages/dashboard/components/OcorrenciasChart.tsx`** *(novo)*.

---

### 6. Detalhes técnicos

- Reutilizar `card-surface`, tokens de cor via classes Tailwind (`bg-red-500/15`, `text-green-400`, etc.) seguindo o padrão atual.
- Loading: skeletons compactos por bloco (não bloquear toda a tela).
- Empty states: mensagem leve em cinza quando sem dados.
- Tendência (▲▼): comparar período atual vs período anterior de mesma duração.
- Date picker: shadcn `Calendar` com `pointer-events-auto` dentro de `Popover`.
- Sem alterações de schema/RLS — todas as tabelas já possuem políticas por tenant.

---

### Observações importantes
- **OTIF**: como `movimento_saida` não tem campos de data prevista/realizada de entrega, o KPI será uma aproximação baseada em status conforme descrito. Caso o usuário queira OTIF "verdadeiro" depois, será necessário adicionar colunas `data_prevista_expedicao` e `data_realizada_expedicao`.
- Cards de "Total HUs" e "Endereços Bloqueados" atuais saem da seção principal — bloqueados podem virar um chip de alerta no header se relevantes.

