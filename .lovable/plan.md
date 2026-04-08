

# Plano: Relatório de Cortes de Separação

## Resumo

Criar um novo relatório tabular em `/relatorios/cortes` que exibe os itens cortados na separação (onde `qtde_cortada > 0`), com resumo de custo total no topo. Seguirá o mesmo padrão arquitetural dos relatórios existentes (Service + Page + componentes compartilhados).

## Estrutura de Arquivos

```text
NOVOS:
  - src/modules/reports/cortes/CortesReportPage.tsx
  - src/modules/reports/cortes/cortes.service.ts

EDITADOS:
  - src/App.tsx (import + rota /relatorios/cortes)
  - src/hooks/useRoutePermission.ts (mapear permissão)
```

## 1. Service (`cortes.service.ts`)

- Interface `CortesFilter`: `tenant_id`, `data_inicio`, `data_fim`, `motivo_ocorrencia_id?`, `sku?`
- Função `fetchCortesReport(filters)`:
  - Query em `movimento_saida_item` com filtro `qtde_cortada > 0`
  - JOINs via select do Supabase:
    - `movimento_saida:movimento_saida_id (numero_onda)`
    - `produto:produto_id (sku, descricao, preco_custo)`
    - `motivo:motivo_ocorrencia (descricao)`
    - `usuario:usuario_autorizou (nome)` (tabela `usuario`)
  - Filtro por período: `autorizado_em` entre `data_inicio` e `data_fim`
  - Filtro opcional por `motivo_ocorrencia` (UUID)
  - Filtro opcional por SKU (client-side filter no resultado, mesmo padrão do relatório de movimentações)
  - Retorna array mapeado com campos: `numero_onda`, `sku`, `descricao`, `preco_custo`, `qtde_cortada`, `custo_total_item` (preco_custo × qtde_cortada), `motivo`, `usuario`, `autorizado_em`

## 2. Page (`CortesReportPage.tsx`)

Seguindo o padrão de `MovimentacoesReportPage`:

**Filtros:**
- Data Início / Data Fim (obrigatórios, default últimos 7 dias)
- Motivo de Ocorrência (Select com dados carregados de `motivo_ocorrencia`)
- SKU (input texto)

**Resumo superior** (exibido após geração, entre o ReportHeader e a tabela):
- Card com: Total de itens cortados, Quantidade total cortada, Custo total dos cortes (soma de preco_custo × qtde_cortada)

**Colunas da tabela (ReportTable):**
| Coluna | Campo | Alinhamento |
|---|---|---|
| Nº Onda | numero_onda | left |
| SKU | sku | left |
| Descrição | descricao | left |
| Qtd Cortada | qtde_cortada | right |
| Preço Custo | preco_custo | right (R$ formatado) |
| Custo Total | custo_total_item | right (R$ formatado) |
| Motivo | motivo | left |
| Autorizado por | usuario | left |
| Autorizado em | autorizado_em | left (data formatada pt-BR) |

## 3. Rota (`App.tsx`)

- Import `CortesReportPage` de `./modules/reports/cortes/CortesReportPage`
- Adicionar case `"/relatorios/cortes"` no switch de `renderPage`

## 4. Permissão (`useRoutePermission.ts`)

- Mapear `/relatorios/cortes` para o módulo de relatórios existente

## Observações

- Nenhuma migration SQL necessária — a query usa tabelas e colunas existentes com JOINs via SDK do Supabase
- O campo `autorizado_em` da tabela `movimento_saida_item` será usado como referência de período
- O resumo de custos usa `preco_custo` da tabela `produto` multiplicado por `qtde_cortada`

