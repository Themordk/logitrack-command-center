

## Plano: Relatório de Acuracidade do Inventário

**Caminho**: `/relatorios/inventario` · Menu: já existe em "Relatórios → Inventário"

Manter a tríade arquitetural padrão: `service.ts` (query + transformação) + `Page.tsx` (UI com `ReportHeader` + `ReportTable` + filtros) + case em `App.tsx` + breadcrumb.

---

### Fonte de dados

A view `inventario_item_resumo` já consolida o necessário (uma linha por tarefa de auditoria por item):

| Campo da view | Significado |
|---|---|
| `inventario_id` | FK para `inventario.id` |
| `sku`, `referencia`, `descricao` | Identificação do produto |
| `rua`, `predio`, `nivel`, `apto` | Endereço físico |
| `quantidade_requerida` | **Quantidade sistêmica** (saldo congelado no momento do snapshot) |
| `primeira_contagem` | 1ª contagem física |
| `segunda_contagem` | 2ª contagem (quando cega/dupla) |
| `saldo_final` | Saldo após auditoria (oficial) |
| `divergência` | Já calculado na view |
| `status` | PENDENTE / CONTADO / DIVERGENTE / CONFERIDO |

Joins adicionais no service:
- `inventario` → `numero_inventario`, `descricao`, `tipo_inventario`, `status`, `iniciado_em`, `finalizado_em`
- `produto` → `preco_custo` (para impacto financeiro)

> **Lote**: o modelo atual de `tarefa` não armazena `lote` por linha de inventário. A coluna **Lote** será exibida e ficará como "—" quando não disponível. Caso a operação precise de granularidade por lote no futuro, será necessário evoluir o snapshot da auditoria — fora do escopo desta entrega.

---

### Lógica de cálculo (no service, em memória)

Para cada item retornado:

```
sistemico  = quantidade_requerida ?? 0
contado    = saldo_final ?? primeira_contagem ?? 0   // saldo_final tem prioridade
diferenca  = contado - sistemico                     // positiva = sobra, negativa = falta
diferenca_pct = sistemico > 0 ? (diferenca / sistemico) * 100 : (contado > 0 ? 100 : 0)

acuracidade_item = sistemico > 0
  ? max(0, (1 - abs(diferenca) / sistemico) * 100)
  : (contado === 0 ? 100 : 0)

impacto_financeiro = abs(diferenca) * (produto.preco_custo ?? 0)

status_calc =
  diferenca === 0          → "CONFORME"
  diferenca  >  0          → "SOBRA"
  diferenca  <  0          → "FALTA"

severidade =
  abs(diferenca_pct) === 0    → "OK"           (verde)
  abs(diferenca_pct) <= 5     → "PEQUENA"      (amarelo)
  abs(diferenca_pct) <= 20    → "MEDIA"        (laranja)
  abs(diferenca_pct)  > 20    → "GRANDE"       (vermelho)
```

**Acuracidade geral do inventário** (KPIs no `ReportHeader`):

```
acuracidade_por_item       = (qtde_itens_conformes / total_itens) * 100        // % de itens sem divergência
acuracidade_ponderada_qtd  = 1 - (Σ |diferenca|)        / Σ sistemico   * 100  // por quantidade
acuracidade_ponderada_R$   = 1 - (Σ impacto_financeiro) / Σ (sistemico * preco_custo) * 100
```

Exibir as três métricas no header — a **ponderada por quantidade** será o KPI primário (padrão de mercado para WMS).

Itens com `status = PENDENTE` (nunca contados) entram como **FALTA** apenas se `sistemico > 0` e `saldo_final` for nulo após o inventário ser finalizado; se ainda estiver em andamento, aparecem como "Pendente" e são excluídos do cálculo agregado (toggle no filtro).

---

### Colunas

| # | Coluna | Origem | Render |
|---|---|---|---|
| 1 | Inventário | `numero_inventario` | `#1234` |
| 2 | SKU | `sku` | mono semibold |
| 3 | Descrição | `descricao` | truncate |
| 4 | Endereço | `rua-predio-nivel-apto` | `R01-P02-N03-A04` |
| 5 | Lote | — | "—" (placeholder) |
| 6 | Qtd. Sistêmica | `quantidade_requerida` | right |
| 7 | Qtd. Contada | `saldo_final` ?? `primeira_contagem` | right |
| 8 | Diferença | calc | right, colorido (verde 0, vermelho falta, amarelo sobra) |
| 9 | Diferença % | calc | right, mesmo critério |
| 10 | Impacto R$ | calc | right, BRL |
| 11 | Acuracidade % | calc | right, badge colorido |
| 12 | Status | calc (CONFORME/SOBRA/FALTA) | badge |

Linhas com `severidade = GRANDE` recebem leve tinta de fundo vermelha (mesmo padrão de `EstoqueReportPage`).

---

### Filtros

- **Inventário** (select carregado dos `inventario` do tenant — default: último inventário finalizado)
- **Período** (`iniciado_em` BETWEEN — quando "Inventário" = "Todos")
- **Armazém** (FK em `inventario.armazem_id`)
- **SKU** (input texto)
- **Endereço** (input rua/prédio/nível/apto, igual `InventarioItensPage`)
- **Status** (Conforme / Sobra / Falta / Pendente)
- **Severidade** (OK / Pequena / Média / Grande)
- **Apenas divergentes** (toggle on/off — default off)

---

### KPIs (rodapé do `ReportHeader`)

- Total de itens auditados
- Itens conformes / divergentes (com %)
- **Acuracidade ponderada por quantidade** (destaque principal)
- Acuracidade por item (%)
- Acuracidade ponderada por valor (R$)
- Impacto financeiro total das divergências (BRL)

Cores: verde ≥ 98%, amarelo 95–97.9%, vermelho < 95%.

---

### Insights operacionais (já viabilizados pela tabela ordenável)

- **Endereços com baixa confiabilidade**: ordenar por `Acuracidade %` ASC + agrupar mentalmente por `rua` (ranking visível no scroll).
- **Produtos com erro recorrente**: filtrar por SKU + período amplo abrangendo múltiplos inventários — itens repetidos com divergência indicam problema sistêmico (recebimento, separação, armazenagem).
- **Tendência sobra vs. falta**: KPI de soma de diferenças positivas vs. negativas no header → se houver dominância de "FALTA", suspeitar de furtos/quebras; "SOBRA" indica falhas de baixa de estoque.
- **Maior impacto financeiro**: ordenar por `Impacto R$` DESC.

---

### Padrão técnico

**Estrutura de arquivos**:
```text
src/modules/reports/inventario/
├── InventarioReportPage.tsx
└── inventario.service.ts
```

**Reutilização**: `ReportHeader`, `ReportTable` (`ReportColumn`), `Input`, `Label`, `Select`, `Button`, helpers `formatBrasiliaDateTime` / `nowBrasiliaDisplay`. `useTenant()` para `tenantId`.

**Performance**:
- Limite default 1000 linhas (paginação client-side via `ReportTable`).
- Filtro obrigatório por **Inventário** quando o usuário não escolhe período → evita varrer histórico inteiro.
- Cálculos em memória após query única na view.

**Cores semânticas**: já usadas no projeto — `--status-free` (verde), `--status-busy` (amarelo), `--status-blocked` (vermelho), `text-muted-foreground` (cinza/pendente).

**Sem mudanças de schema, RLS, edge function ou tipos**. A view `inventario_item_resumo` já existe e respeita RLS via `tenant_full_access` nas tabelas-base.

---

### Arquivos

| Arquivo | Tipo |
|---|---|
| `src/modules/reports/inventario/inventario.service.ts` | novo |
| `src/modules/reports/inventario/InventarioReportPage.tsx` | novo |
| `src/App.tsx` | alterado (1 import + 1 case `/relatorios/inventario` + breadcrumb) |
| `src/components/TopNav.tsx` | sem alteração (item já existe no submenu) |

