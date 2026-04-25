## Plano: Relatório de Tempo de Ciclo de Pedido (Order Cycle Time)

**Caminho**: `/relatorios/ciclo-pedido` · Menu: "Relatórios → Ciclo de Pedido"

Mantém a tríade arquitetural padrão (`service.ts` + `Page.tsx` + rota em `App.tsx` + item no `TopNav.tsx`), idêntica aos relatórios de Recebimento/Inventário/Curva ABC.

---

### Fonte de dados (schema real verificado)

| Tabela | Campo | Uso |
|---|---|---|
| `movimento_saida` | `id`, `numero_onda`, `status`, `data_emissao`, `finalizado_em`, `prioridade`, `total_pedidos`, `total_volume`, `peso_total`, `m3`, `box_id`, `armazem_id`, `empresa_id` | Cabeçalho da onda |
| `movimento_saida_documento` → `documento_saida` → `parceiro` | `numero_pedido`, `razaosocial` | Pedido(s) e cliente(s) |
| `movimento_saida_item` | `movimento_saida_id`, `qtd_esperada`, `qtd_separada` | Volume/itens |
| `tarefa` | `id_documento_origem` (= `movimento_saida_item.id`), `tipo_documento_origem` = `'MOVIMENTO_SAIDA_ITEM'`, `tipo_tarefa_id`, `criado_em` | Marco T1 (geração) |
| `tipo_tarefa` | `codigo` ∈ {`SEP`, `SEP-CONF`} | Identificar separação x conferência |
| `tarefa_atribuicao` | `tarefa_id`, `atribuido_em`, `liberado_em` | **Marco T2 (início real do trabalho)** |
| `tarefa_execucao` | `tarefa_id`, `concluido_em`, `status` | Marco T3/T4 (fim das etapas) |

> **Observação crítica confirmada nos dados**: em `tarefa_execucao`, `iniciado_em == concluido_em`. Portanto, o "início efetivo" da etapa **deve** vir de `tarefa_atribuicao.atribuido_em` (mesmo workaround usado no relatório de Recebimento). Idem `tarefa.concluido_em` aparece nulo em vários casos — usar **MAX(`tarefa_execucao.concluido_em`)** como fim.

---

### Marcos do processo (T0 → T5)

| Marco | Origem | Significado |
|---|---|---|
| **T0 — Criação** | `movimento_saida.data_emissao` | Pedido entrou no WMS |
| **T1 — Liberado p/ separação** | `MIN(tarefa.criado_em)` para tarefas SEP da onda | Tarefas geradas/disponibilizadas |
| **T2 — Início separação** | `MIN(tarefa_atribuicao.atribuido_em)` para SEP | Operador pegou a 1ª tarefa SEP |
| **T3 — Fim separação** | `MAX(tarefa_execucao.concluido_em)` para SEP | Última linha bipada |
| **T4 — Início/Fim conferência** | `MIN(tarefa_atribuicao.atribuido_em)` e `MAX(tarefa_execucao.concluido_em)` para SEP-CONF | Janela da conferência |
| **T5 — Expedição** | `movimento_saida.finalizado_em` se status = `CONCLUIDA`; senão `MAX(tarefa_execucao.concluido_em)` da última etapa concluída | Onda liberada para sair |

---

### Cálculo (no service, em memória)

```
tempo_total_min       = T5 - T0           // Order Cycle Time
tempo_fila_min        = T2 - T0           // tempo até iniciar trabalho
tempo_picking_min     = T3 - T2           // duração da separação
tempo_conferencia_min = T4_fim - T4_inicio
tempo_ate_expedicao_min = T5 - T4_fim     // espera pós-conferência (doca)
tempo_ocioso_min      = (T2 - T1) + (T4_inicio - T3) + (T5 - T4_fim)

sla_horas (parametrizável, default 24h)
perc_sla = (tempo_total_min / (sla_horas * 60)) * 100
status_sla:
  perc_sla <= 80              → DENTRO   (verde)
  perc_sla <= 100             → ALERTA   (amarelo)
  perc_sla  > 100             → FORA     (vermelho)
  pedido sem T5               → EM_ANDAMENTO (cinza)
```

**Pior etapa (gargalo)** por linha: `argmax(tempo_picking, tempo_conferencia, tempo_fila, tempo_ate_expedicao)` — exibido em coluna dedicada.

---

### Colunas

| # | Coluna | Origem | Render |
|---|---|---|---|
| 1 | Onda | `numero_onda` | `#1234` mono |
| 2 | Pedido(s) | `documento_saida.numero_pedido` (concatenado) | "12345, 12346" |
| 3 | Cliente | `parceiro.razaosocial` (1º ou "+N") | truncate |
| 4 | Status Onda | `movimento_saida.status` | badge cromático |
| 5 | Prioridade | `prioridade` | badge |
| 6 | Criação (T0) | `data_emissao` | `formatBrasiliaDateTime` |
| 7 | Início Sep. (T2) | calc | dt curto |
| 8 | Fim Sep. (T3) | calc | dt curto |
| 9 | Fim Conf. (T4) | calc | dt curto |
| 10 | Expedição (T5) | calc | dt curto |
| 11 | T. Total | calc | `formatDuration` (right) |
| 12 | T. Fila | calc | right, amarelo se > 25% do total |
| 13 | T. Picking | calc | right |
| 14 | T. Conferência | calc | right |
| 15 | T. Pós-Conf. | calc | right |
| 16 | T. Ocioso | calc | right, vermelho se > 30% do total |
| 17 | Pior Etapa | calc | badge laranja |
| 18 | SLA % | calc | right, badge cromático |
| 19 | Status SLA | calc | badge (Dentro/Alerta/Fora/Em Andamento) |

Linhas com `status_sla = FORA` ganham tinta de fundo vermelha sutil.

---

### Filtros (toolbar)

- **Período** (data_emissao BETWEEN, default últimos 30 dias)
- **Armazém**
- **Empresa** (já injetado via contexto)
- **Cliente / Parceiro** (select)
- **Status da onda** (CRIADA, EM_SEPARACAO, SEPARADA, CONFERIDO, CONCLUIDA, CANCELADA)
- **Status SLA** (Dentro / Alerta / Fora / Em Andamento)
- **Prioridade**
- **SLA (horas)** input numérico, default 24
- **Apenas concluídas** toggle (default off — para ver gargalos em curso)

---

### KPIs no `ReportHeader`

- Total de ondas no período
- Concluídas / Em andamento
- **Tempo médio total** (destaque principal — `formatDuration`)
- Tempo médio por etapa: Fila · Picking · Conferência · Pós-Conf · Ocioso
- % Dentro do SLA (verde ≥ 95%, amarelo 85–94%, vermelho < 85%)
- **Pior etapa agregada** (qual etapa tem maior média — aponta o gargalo do armazém)

---

### Insights operacionais habilitados

- **Onde o pedido trava**: ordenar por `T. Picking` ou `T. Pós-Conf.` DESC.
- **Clientes problemáticos**: filtrar por cliente + período amplo → ondas com maior média.
- **Picos de ineficiência**: combinar `Período` curto (1 dia) com sort por `Criação` para ver horários.
- **Capacidade vs volume**: KPI "Pior etapa agregada" = "Fila" → falta operador no início; "Pós-Conf." → gargalo de doca/expedição.
- **Ondas órfãs**: `EM_ANDAMENTO` há mais de N horas (ranking no topo por sort default).

---

### Estratégia de query (performance)

1. **Q1** — `movimento_saida` filtrado por tenant/período/armazém/empresa, `LIMIT 2000`.
2. **Q2** — `movimento_saida_documento` + `documento_saida` + `parceiro` para os IDs de Q1 (concatenar pedidos/clientes em memória).
3. **Q3** — `movimento_saida_item` para mapear `item_id → onda_id`.
4. **Q4** — `tarefa` `WHERE tipo_documento_origem='MOVIMENTO_SAIDA_ITEM' AND id_documento_origem IN (item_ids) AND tipo_tarefa_id IN (SEP, SEP-CONF)` (chunks de 800 IDs como já feito em recebimento).
5. **Q5** — `tarefa_atribuicao WHERE tarefa_id IN (...)` → MIN(atribuido_em) por tarefa.
6. **Q6** — `tarefa_execucao WHERE tarefa_id IN (...) AND concluido_em IS NOT NULL` → MAX(concluido_em) por tarefa.
7. Reduzir em memória: por onda, separar SEP vs SEP-CONF e calcular T1..T5.

Default 1000 linhas no `ReportTable` (paginação client-side).

---

### Ordenação default

`status_sla` (FORA → ALERTA → EM_ANDAMENTO → DENTRO), depois `tempo_total_min` DESC. Igual ao padrão do Recebimento.

---

### Padrão técnico

**Estrutura de arquivos**:
```text
src/modules/reports/ciclo-pedido/
├── CicloPedidoReportPage.tsx
└── cicloPedido.service.ts
```

**Reutilização**: `ReportHeader`, `ReportTable` (`ReportColumn`), `Input`, `Label`, `Select`, `Button`, `Switch`. Helpers: `formatBrasiliaDateTime`, `nowBrasiliaDisplay`, `formatDuration` (já existe em `recebimento.service.ts` — extrair para `src/lib/dateUtils.ts` ou duplicar localmente — duplicar por simplicidade, igual ao padrão atual).

**Cores semânticas**: `--status-free` (verde), `--status-busy` (amarelo), `--status-blocked` (vermelho), `text-muted-foreground` (cinza/em andamento). Mesma paleta dos demais relatórios.

**Sem mudanças de schema, RLS ou edge function**. RLS já cobre todas as tabelas via `tenant_full_access`.

---

### Arquivos

| Arquivo | Tipo |
|---|---|
| `src/modules/reports/ciclo-pedido/cicloPedido.service.ts` | novo |
| `src/modules/reports/ciclo-pedido/CicloPedidoReportPage.tsx` | novo |
| `src/App.tsx` | alterado (1 import + 1 case + breadcrumb) |
| `src/components/TopNav.tsx` | alterado (1 item no submenu Relatórios) |
