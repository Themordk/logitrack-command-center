

## Plano: 3 Novos Relatórios Operacionais

Manter a tríade arquitetural já consolidada: `service.ts` (query Supabase + transformação) + `Page.tsx` (UI com `ReportHeader`/`ReportTable` + filtros) + rota em `App.tsx` + entrada no menu `TopNav.tsx`. Visual SAP-like idêntico aos relatórios atuais (densidade alta, 9–11px, dark theme, status com cores semânticas).

---

### Relatório 1 — Curva ABC de Estoque (por giro)

**Caminho**: `/relatorios/curva-abc` · Menu: "Curva ABC"

**Objetivo**: Classificar produtos pelo volume de saída no período, segmentando em A (80%), B (15%), C (5%) do total, para apoiar slotting/priorização.

**Fonte de dados**:
- `estoque_movimento` filtrado por `tipo_movimento = 2` (Saída) entre `data_inicio` e `data_fim`, agregado por `produto_id`.
- Join com `produto` para `sku`, `descricao`, `marca`, `grupo_id`, `subgrupo_id`.
- Saldo atual via `estoque_geral` (soma `quantidade_total` por `produto_id`) — opcional, exibido como contexto.

**Lógica de cálculo (service)**:
1. `SELECT produto_id, SUM(quantidade) AS qtd_saida FROM estoque_movimento WHERE tipo_movimento=2 AND criado_em BETWEEN ... GROUP BY produto_id ORDER BY qtd_saida DESC`.
2. Em memória: `total = Σ qtd_saida`; para cada linha: `participacao = qtd_saida / total`, `acumulado` cumulativo.
3. Classificação: `acumulado ≤ 80% → A`; `≤ 95% → B`; resto → `C`. Limites parametrizáveis (constantes no topo do service).

**Colunas**:
| SKU | Descrição | Marca | Qtd. Saída | % Particip. | % Acum. | Saldo Atual | Classe |

- Classe renderizada como badge: A = verde, B = amarelo, C = cinza.
- "Saldo Atual = 0" em vermelho-escuro (alerta de ruptura num produto A/B).

**Filtros**: Período (data_inicio/data_fim, default últimos 30 dias), Armazém, Grupo, Subgrupo, Marca, SKU, Classe (A/B/C).

**Insights**:
- Item Classe A com saldo zero → alerta de ruptura crítica.
- Item Classe C com saldo alto → candidato a remanejamento de picking para pulmão.

---

### Relatório 2 — Validade & Lote (FEFO/FIFO)

**Caminho**: `/relatorios/validade-lote` · Menu: "Validade e Lote"

**Objetivo**: Visão analítica de saldos por lote/validade ordenada por FEFO, com destaque para itens próximos ao vencimento.

**Fonte de dados**:
- `estoque_geral` (linhas com `quantidade_total > 0`) restrito a produtos cujo `tipo_controle ∈ ('LOTE','VALIDADE','LOTE_SERIE')`.
- Joins: `produto` (sku, descricao, marca, dias_shelf), `endereco` (codigo_endereco, descricao, tipo_endereco, armazem_id, setor_id).

**Lógica de cálculo (service)**:
- `dias_para_vencer = DATEDIFF(data_validade, hoje)` em memória.
- Ordenação default: `data_validade ASC, sku ASC` (FEFO). Toggle no header da tabela permite ordenar por `data_fabricacao ASC` (FIFO).
- Faixas de criticidade:
  - `< 0` → **Vencido** (vermelho `--status-blocked`)
  - `0–30` → **Crítico** (laranja)
  - `31–60` → **Atenção** (amarelo)
  - `> 60` → **OK** (cinza)

**Colunas**:
| SKU | Descrição | Lote | Fabricação | Validade | Dias p/ Vencer | Saldo | Endereço | Tipo End. |

- Linha inteira ganha tinta de fundo sutil para Vencido/Crítico (mesmo padrão do `EstoqueReportPage`).
- Quando `lote = ''` e `data_validade = '1900-01-01'` → item sem controle, omitido.

**Filtros**: Armazém, Setor, Tipo Endereço (Picking/Pulmão), SKU, Marca, Grupo, Subgrupo, Faixa de Criticidade (Vencido/Crítico/Atenção/OK), Validade até (data), Toggle FEFO/FIFO.

**Insights**:
- Quantidade total vencida (KPI no `ReportHeader` em vermelho).
- Quantidade crítica ≤30 dias.
- Lote duplicado em endereços diferentes → potencial consolidação.

---

### Relatório 3 — Baixo Giro / Obsoletos

**Caminho**: `/relatorios/baixo-giro` · Menu: "Baixo Giro / Obsoletos"

**Objetivo**: Identificar produtos com saldo em estoque cuja última saída ocorreu há mais de N dias (default 90), suportando decisões de descarte/promoção/realocação.

**Fonte de dados**:
- `estoque_geral` agrupado por `produto_id` (saldo total > 0).
- `estoque_movimento` (`tipo_movimento = 2`) para `MAX(criado_em)` por `produto_id` — última saída.
- Join com `produto` para metadados; `parceiro` (fornecedor) opcional.

**Lógica de cálculo (service)**:
1. Query A: saldo agregado por produto em `estoque_geral`.
2. Query B: última saída por produto em `estoque_movimento`.
3. Merge em memória pelo `produto_id`. Produtos sem registro em B → `dias_sem_movimento = ∞` (representado como "Nunca").
4. Filtro: `dias_sem_movimento >= dias_limite` (parametrizável; default 90).
5. Classificação:
   - `dias_sem_movimento >= 180` → **Obsoleto** (vermelho)
   - `90 ≤ dias < 180` → **Baixo Giro** (amarelo)
   - "Nunca" → **Sem Movimento** (vermelho-escuro)

**Colunas**:
| SKU | Descrição | Marca | Saldo | Custo Unit. | Custo Total | Última Saída | Dias s/ Mov. | Classificação |

- `Custo Total = saldo × produto.preco_custo` — soma exibida no rodapé do `ReportHeader` ("Capital parado: R$ X").
- Datas via `formatBrasiliaDate`.

**Filtros**: Dias sem movimento (input numérico, default 90), Armazém, Grupo, Subgrupo, Marca, SKU, Classificação (Baixo Giro/Obsoleto/Sem Movimento), Saldo mínimo.

**Insights**:
- KPIs no header: Total de SKUs parados, Saldo total imobilizado, Custo total imobilizado.
- Coluna "Custo Total" alinhada à direita, formatada em BRL.

---

### Padrão técnico (todos os 3)

**Estrutura de arquivos** (idêntica aos relatórios existentes):
```text
src/modules/reports/
├── curva-abc/
│   ├── CurvaAbcReportPage.tsx
│   └── curvaAbc.service.ts
├── validade-lote/
│   ├── ValidadeLoteReportPage.tsx
│   └── validadeLote.service.ts
└── baixo-giro/
    ├── BaixoGiroReportPage.tsx
    └── baixoGiro.service.ts
```

**Componentes reutilizados**: `ReportHeader`, `ReportTable` (com `ReportColumn`), `Input`, `Label`, `Select`, `Button` do shadcn. Helpers: `formatBrasiliaDate`, `formatBrasiliaDateTime`, `nowBrasiliaDisplay`.

**Rotas** (em `src/App.tsx`):
- `/relatorios/curva-abc` → `CurvaAbcReportPage`
- `/relatorios/validade-lote` → `ValidadeLoteReportPage`
- `/relatorios/baixo-giro` → `BaixoGiroReportPage`

**Menu** (em `src/components/TopNav.tsx`, dentro de "Relatórios"): adicionar 3 itens entre "Posição de Estoque" e "Histórico de Movimentos".

**Performance**:
- Limite default 1000 linhas (paginação client-side via `ReportTable`).
- Agregações pesadas (`Curva ABC`, `Baixo Giro`) feitas em memória após query única `tipo_movimento=2` filtrada por período — Supabase devolve raw, JS agrupa. Caso volumes ultrapassem 50k linhas em cliente, próxima iteração migra para uma view SQL (`vw_curva_abc`, `vw_baixo_giro`) — não escopo desta entrega.
- `tenantId` sempre injetado via `useTenant()`; RLS já cobre `estoque_geral` e `estoque_movimento`.

**Cores semânticas** (mesma paleta do projeto):
- Verde `--status-free` · Amarelo `--status-busy` · Vermelho `--status-blocked` · Cinza `text-muted-foreground`.

**Sem mudanças de schema, RLS, edge function ou tipos**.

### Arquivos

| Arquivo | Tipo |
|---|---|
| `src/modules/reports/curva-abc/curvaAbc.service.ts` | novo |
| `src/modules/reports/curva-abc/CurvaAbcReportPage.tsx` | novo |
| `src/modules/reports/validade-lote/validadeLote.service.ts` | novo |
| `src/modules/reports/validade-lote/ValidadeLoteReportPage.tsx` | novo |
| `src/modules/reports/baixo-giro/baixoGiro.service.ts` | novo |
| `src/modules/reports/baixo-giro/BaixoGiroReportPage.tsx` | novo |
| `src/App.tsx` | alterado (3 imports + 3 cases) |
| `src/components/TopNav.tsx` | alterado (3 itens no submenu Relatórios) |

