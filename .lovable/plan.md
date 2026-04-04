

# Plano: Relatório Inteligente de Ocupação de Endereços

## Resumo

Criar um dashboard operacional em `/relatorios/ocupacao` que apresenta a saúde de ocupação do armazém com KPIs, mapa visual por setor, drill-down detalhado e gráficos analíticos. Dados derivados das tabelas `endereco`, `estoque_geral`, `setor` e `estoque_movimento`.

## Modelo de Dados

A ocupação será calculada client-side a partir de duas queries:
1. **Endereços + Setor**: `endereco` com `setor.descricao` (busca separada por limitação de FK)
2. **Estoque agregado por endereço**: `estoque_geral` agrupado por `endereco_id` (quantidade_total, count distinct produto_id)
3. **Última movimentação por endereço**: `estoque_movimento` com MAX(criado_em) por endereco_destino_id

Status de ocupação derivado:
- **Livre**: quantidade_total = 0 e situacao = LIVRE
- **Ocupado**: quantidade_total > 0 e SKUs preenchem capacidade
- **Parcial**: quantidade_total > 0 mas abaixo da capacidade
- **Bloqueado**: situacao contém BLOQUEADO

Como `total_pallet` e `m3` frequentemente são null, a % de ocupação será baseada na contagem de SKUs distintos por endereço (presença/ausência) e na quantidade total armazenada.

## Arquivos a Criar/Modificar

### 1. `src/modules/reports/ocupacao/ocupacao.service.ts` (NOVO)
- `fetchOcupacaoData(filters)`: busca endereços, setores, estoque agregado e última movimentação
- Retorna estrutura consolidada com KPIs calculados, dados por setor e por endereço
- Helper functions para classificação de status e cores

### 2. `src/modules/reports/ocupacao/OcupacaoReportPage.tsx` (NOVO)
Página principal com layout em seções verticais:

**Filtros superiores (inline)**:
- Armazém (select, obrigatório)
- Setor (select)
- Tipo de Endereço (PICKING/PULMAO)
- Status (Livre/Parcial/Ocupado/Bloqueado)
- Botão Gerar

**KPIs (6 cards)**:
- Total de Endereços, Ocupados (%), Livres (%), Taxa Média Ocupação, Setor Mais Saturado, Setor Mais Ocioso
- Cores: verde <70%, amarelo 70-85%, vermelho >85%

**Mapa Visual de Setores**:
- Grid de cards por setor com barra de progresso colorida
- % ocupação, total endereços, cor dinâmica
- Clique expande drill-down

**Drill-Down (seção expandível por setor)**:
- Tabela com: Endereço, Qtd Total, SKUs, Tipo Endereço, Situação, Última Movimentação
- Ordenação por maior ocupação

**Gráficos Analíticos**:
- Ocupação por Setor (BarChart - Recharts)
- Distribuição de Status (PieChart)
- Ambos usando componentes `ChartContainer` já existentes

### 3. `src/App.tsx` (MODIFICAR)
- Import `OcupacaoReportPage`
- Adicionar rota `/relatorios/ocupacao`
- Adicionar breadcrumb

### 4. `src/components/Layout.tsx` (MODIFICAR)
- Adicionar item no menu lateral: "Ocupação de Endereços" em Relatórios

## Estratégia de Performance

- Todas as queries filtradas por `tenant_id` + `empresa_id` + `armazem_id` (obrigatório)
- Agregação de estoque feita no banco (SUM/COUNT com GROUP BY)
- Sem view adicional -- 3 queries paralelas client-side (endereços, estoque agregado, última movimentação)
- Paginação no drill-down (20 registros por setor)

## Detalhes Técnicos

- Recharts para gráficos (já instalado)
- Progress component para barras de capacidade
- Skeleton loading durante carregamento
- Padrão visual dark mode existente (#0F172A)
- Cores semânticas: verde/amarelo/vermelho conforme saturação

