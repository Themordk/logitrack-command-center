## Plano — Grupo B: Telas de Operadores Ativos e Tarefas Ativas

Criar duas telas dedicadas para os KPIs "Operadores Ativos" e "Em Andamento" do Dashboard, seguindo o prompt fornecido.

### Arquivos a criar

**1. `src/pages/OperadoresAtivosPage.tsx`**
- Chama RPC `dashboard_operadores_ativos` (via `supabase as any`).
- Header com título, subtítulo, hora da última atualização e badge Auto-refresh.
- 3 mini-cards de resumo: Total Online, Em Atividade, Ociosos.
- Filtros: Armazém (carregado de `armazem` filtrado por tenant/ativo, seguindo `DashboardFilters.tsx`), Status local (Todos/Em Atividade/Ocioso), botão Atualizar.
- Tabela com colunas: Operador (nome + tipo_operacao), Status (badge), Tarefa Atual, Produto, Endereço (origem → destino), Tempo (na tarefa ou ocioso), Tarefas Hoje, Sessão Desde.
- Destaque por ociosidade: <10min normal, 10-20min borda amarela, >20min borda vermelha e badge "Ocioso > 20min".
- Empty state com ícone `Users`.
- Auto-refresh silencioso a cada 30s + botão manual.

**2. `src/pages/TarefasAtivasPage.tsx`**
- Chama RPC `dashboard_tarefas_ativas`.
- Header no mesmo padrão.
- 3 mini-cards: Em Execução, Na Fila: Criadas, Na Fila: Atribuídas.
- Filtros compartilhados: Armazém, Tipo de Tarefa (derivado dos dados), busca textual local (produto_sku, produto_descricao, operador_nome).
- **Seção 1 — Tarefas em Execução**: tabela com Tipo, Operador, Produto, Origem→Destino, Qtd (executada/requerida), Tempo, Prioridade (badges coloridas).
- **Seção 2 — Fila de Espera**: tabela com Tipo, Status (CRIADA/ATRIBUIDA), Atribuído a, Produto, Origem→Destino, Qtd, Aguardando (destaque amarelo >4h, vermelho >24h), Prioridade.
- Empty states em cada seção.
- Auto-refresh 30s.

### Arquivos a alterar

**3. `src/App.tsx`**
- Adicionar imports das duas páginas (seguindo o padrão já usado no arquivo — direto ou lazy).
- Adicionar cases no switch de `renderPage()`:
  - `/atividades/operadores-ativos` → `<OperadoresAtivosPage onNavigate={onNavigate} />`
  - `/atividades/tarefas-ativas` → `<TarefasAtivasPage onNavigate={onNavigate} />`
- Adicionar breadcrumbs correspondentes.

**4. `src/pages/Dashboard.tsx`**
- Card "Em Andamento": substituir `onClick` atual (`/atividades/mov-saida`) por `/atividades/tarefas-ativas`.
- Card "Operadores Ativos": adicionar `onClick` para `/atividades/operadores-ativos` (hoje não tem).

### Utilitário
- Reutilizar `formatarTempoEspera` de `dashboard.service.ts` (já existe) para formatação de tempo em ambas as páginas.

### Fora do escopo
- Nenhuma alteração em RPCs, `components/ui/`, `dashboard.service.ts`, `KPICardPro.tsx`, `TopNav.tsx` ou permissões/menu.
- As páginas ficam acessíveis apenas via clique nos KPIs do Dashboard.

### Notas técnicas
- Usar `useTenant()` para tenantId/empresaId/armazemId, `sonner` para toasts em erros, `date-fns` (`format`) para horários, ícones Lucide (`Users`, `PlayCircle`, `Clock`, `ListTodo`, `UserCheck`, `RefreshCw`), classes existentes (`card-surface`, tokens do design system) — sem cores hardcoded fora dos badges semânticos já usados no projeto.
- Padrão `const sb = supabase as any` para chamadas RPC.
- Sem `react-router`: navegação via prop `onNavigate`.
