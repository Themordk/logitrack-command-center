
# Plano: Módulo LMS -- Análise de Produtividade Operacional

## Descoberta Crítica

Ao analisar os dados reais de `tarefa_execucao`, identifiquei que **todos os timestamps são idênticos** (`atribuido_em = iniciado_em = concluido_em`). O coletor atualmente grava os três valores como `now()` no momento da conclusão, tornando impossível calcular tempos reais de execução.

**Antes de construir dashboards, precisamos corrigir a instrumentação de timestamps no coletor.**

---

## Arquitetura em 3 Fases

```text
FASE 1: Instrumentação (pré-requisito)
  Corrigir coletor → timestamps reais → dados válidos

FASE 2: Infraestrutura Analítica
  Views materializadas + tabela de métricas consolidadas

FASE 3: Dashboard LMS
  Timeline Gantt + KPIs + Rankings + Drill-downs
```

---

## FASE 1 -- Instrumentação de Timestamps no Coletor

### Problema Atual
O fluxo do coletor (Armazenagem, Conferência, Separação, etc.) define os 3 timestamps no mesmo instante. Para LMS funcionar, cada evento deve ser registrado no momento correto:

| Evento | Quando gravar |
|---|---|
| `atribuido_em` | Quando a tarefa é atribuída ao operador (já funciona via `DEFAULT now()`) |
| `iniciado_em` | Quando o operador **inicia a execução** (scan do primeiro item/endereço) |
| `concluido_em` | Quando o operador **conclui** a tarefa |

### Alterações Necessárias
Modificar as páginas do coletor que executam tarefas para gravar timestamps separadamente:

1. **Na atribuição**: já correto (`atribuido_em` = `DEFAULT now()`)
2. **No início da execução**: UPDATE `iniciado_em = now()` quando operador começa (primeiro scan)
3. **Na conclusão**: UPDATE `concluido_em = now()` ao finalizar

**Arquivos afetados** (estimativa):
- `RecebimentoExecucaoPage.tsx` / `RecebimentoConferenciaPage.tsx`
- `ArmazenagemExecucaoPage.tsx`
- `SeparacaoProdutoPage.tsx`
- `TransferenciaProdutoPage.tsx`
- `InventarioProdutoPage.tsx`
- `ConferenciaItensPage.tsx`

### Adicionar Status PAUSADA
Registrar pausas como linhas separadas ou adicionar colunas `pausado_em` / `retomado_em` em `tarefa_execucao` para capturar tempo auxiliar vs. produtivo.

---

## FASE 2 -- Infraestrutura Analítica

### 2.1 Nova Tabela: `lms_metrica_diaria`

Tabela de métricas consolidadas por operador/dia, calculada incrementalmente:

```sql
CREATE TABLE public.lms_metrica_diaria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  empresa_id uuid NOT NULL,
  armazem_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  data_referencia date NOT NULL,
  turno_id uuid,
  -- Tempos (segundos)
  tempo_produtivo integer DEFAULT 0,      -- soma duração tarefas
  tempo_ocioso integer DEFAULT 0,         -- gaps entre tarefas dentro do turno
  tempo_auxiliar integer DEFAULT 0,       -- pausas registradas
  tempo_jornada integer DEFAULT 0,        -- duração total sessão
  -- Contadores
  tarefas_concluidas integer DEFAULT 0,
  tarefas_canceladas integer DEFAULT 0,
  quantidade_total numeric DEFAULT 0,     -- itens movimentados
  peso_total numeric DEFAULT 0,           -- kg movimentados
  documentos_processados integer DEFAULT 0,
  skus_distintos integer DEFAULT 0,
  -- Calculados
  taxa_ocupacao numeric DEFAULT 0,        -- produtivo / jornada * 100
  produtividade_hora numeric DEFAULT 0,   -- quantidade / horas_produtivas
  UNIQUE (tenant_id, usuario_id, data_referencia)
);
ALTER TABLE public.lms_metrica_diaria ENABLE ROW LEVEL SECURITY;
```

### 2.2 Nova Tabela: `lms_metrica_tipo_tarefa`

Detalhamento por tipo de tarefa:

```sql
CREATE TABLE public.lms_metrica_tipo_tarefa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  data_referencia date NOT NULL,
  tipo_tarefa_id uuid NOT NULL,
  tempo_medio_segundos integer DEFAULT 0,
  tempo_total_segundos integer DEFAULT 0,
  tarefas_concluidas integer DEFAULT 0,
  quantidade_total numeric DEFAULT 0,
  UNIQUE (tenant_id, usuario_id, data_referencia, tipo_tarefa_id)
);
```

### 2.3 View Analítica: `vw_lms_timeline_operador`

Para a timeline Gantt -- view simples sobre dados existentes:

```sql
CREATE VIEW public.vw_lms_timeline_operador AS
SELECT
  te.tenant_id,
  te.usuario_id,
  u.nome AS usuario_nome,
  u.habilidade,
  u.tipo_operacao,
  u.turno_id,
  tn.descricao AS turno_descricao,
  tn.hora_inicio AS turno_inicio,
  tn.hora_fim AS turno_fim,
  te.id AS execucao_id,
  te.tarefa_id,
  tt.codigo AS tipo_tarefa_codigo,
  tt.descricao AS tipo_tarefa_descricao,
  te.status,
  te.atribuido_em,
  te.iniciado_em,
  te.concluido_em,
  te.quantidade_executada,
  te.quantidade_cortada,
  t.quantidade_requerida,
  t.tipo_documento_origem,
  t.id_documento_origem,
  t.armazem_id,
  t.empresa_id,
  EXTRACT(EPOCH FROM (te.concluido_em - te.iniciado_em)) AS duracao_segundos,
  EXTRACT(EPOCH FROM (te.iniciado_em - te.atribuido_em)) AS espera_segundos,
  tt.tempo_estimado_segundos
FROM tarefa_execucao te
JOIN tarefa t ON t.id = te.tarefa_id
JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
JOIN usuario u ON u.id = te.usuario_id
LEFT JOIN turnos tn ON tn.id = u.turno_id;
```

### 2.4 Índices Recomendados

```sql
CREATE INDEX idx_exec_usuario_periodo
  ON tarefa_execucao (tenant_id, usuario_id, concluido_em);

CREATE INDEX idx_exec_concluido
  ON tarefa_execucao (tenant_id, concluido_em)
  WHERE status = 'CONCLUIDA';

CREATE INDEX idx_sessao_usuario_periodo
  ON log_sessao_usuario (tenant_id, usuario_id, inicio_sessao);
```

### 2.5 Estratégia de Cálculo Incremental

Edge Function `calcular-metricas-lms` executada via pg_cron ou chamada manual:

1. Consulta `tarefa_execucao` com `concluido_em >= último_calculo`
2. Agrega por `usuario_id + data_referencia`
3. UPSERT em `lms_metrica_diaria` e `lms_metrica_tipo_tarefa`
4. Cruza com `log_sessao_usuario` para calcular tempo de jornada e ociosidade
5. Armazena cursor de processamento para evitar recálculo

---

## FASE 3 -- Dashboard LMS (Frontend)

### 3.1 Estrutura de Páginas

```text
/relatorios/produtividade
  ├── ProdutividadeDashboardPage.tsx    (visão geral)
  ├── ProdutividadeOperadorPage.tsx     (detalhe individual)
  └── produtividade.service.ts          (queries)
```

### 3.2 Dashboard Principal (`/relatorios/produtividade`)

**Filtros**: Armazém, Período, Turno, Tipo Operação, Habilidade

**KPIs (cards)**:
- Taxa Média de Ocupação (%)
- Produtividade Média (itens/hora)
- Tempo Ocioso Total (hh:mm)
- Tarefas Concluídas
- Colaboradores Ativos
- Performance vs. Meta (%)

**Seção 1 -- Ranking de Colaboradores**:
Tabela ordenada por produtividade com:
- Nome, Turno, Habilidade, Tipo Operação
- Tarefas Concluídas, Itens Movimentados
- Taxa Ocupação, Produtividade/hora
- Sparkline de evolução (últimos 7 dias)
- Clique -> drill-down individual

**Seção 2 -- Produtividade por Operação**:
BarChart agrupado por `tipo_tarefa` mostrando:
- Tempo médio por tarefa vs. estimado
- Volume processado

**Seção 3 -- Análise Cruzada**:
- Heatmap: Turno x Tipo Operação (cor = produtividade)
- Comparativo: Habilidade x Performance real

### 3.3 Detalhe do Operador (`/relatorios/produtividade/operador/:id`)

**Timeline Gantt**:
- Eixo X = horário do turno (ex: 08:00 - 17:00)
- Barras coloridas por tipo de tarefa
- Gaps visíveis = tempo ocioso
- Hover mostra detalhes da tarefa

**Cards**:
- Tempo Produtivo / Ocioso / Auxiliar (com %)
- Performance por tipo de tarefa (radar chart)
- Evolução diária (line chart)

**Tabela detalhada**: todas as execuções do dia selecionado

### 3.4 Métricas LMS (Padrão Industry)

| Métrica | Fórmula | Referência |
|---|---|---|
| Taxa de Ocupação | tempo_produtivo / tempo_jornada | SAP EWM |
| Produtividade/Hora | qtd_itens / horas_produtivas | Manhattan |
| Eficiência vs. Meta | tempo_estimado / tempo_real | Blue Yonder |
| Índice de Corte | qtd_cortada / qtd_requerida | Geral |
| Gap de Ociosidade | gaps entre tarefas > 5min | LMS Standard |

---

## Resumo de Arquivos

```text
FASE 1 (Instrumentação):
  - 6+ páginas do coletor (gravar timestamps corretos)

FASE 2 (Infraestrutura):
  - Migration: tabelas lms_metrica_diaria, lms_metrica_tipo_tarefa
  - Migration: view vw_lms_timeline_operador
  - Migration: índices analíticos
  - Edge Function: calcular-metricas-lms (opcional, para consolidação)

FASE 3 (Dashboard):
  - src/modules/reports/produtividade/produtividade.service.ts
  - src/modules/reports/produtividade/ProdutividadeDashboardPage.tsx
  - src/modules/reports/produtividade/ProdutividadeOperadorPage.tsx
  - src/App.tsx (rotas + breadcrumbs)
  - src/components/Layout.tsx (menu)
```

## Recomendação de Execução

**Fase 1 é bloqueante**. Sem timestamps reais, qualquer dashboard mostrará zero de tempo produtivo. Sugiro:

1. Primeiro: corrigir instrumentação no coletor (1-2 sprints)
2. Segundo: criar infra analítica + view (1 sprint)
3. Terceiro: dashboard frontend (1 sprint)

Dados históricos com timestamps iguais podem ser marcados como "sem medição" no dashboard.
