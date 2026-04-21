

## Plano: Telas de Detalhe para Documentos de Entrada e Saída

### Objetivo

Permitir ao usuário **clicar em um registro** das listas em **Atividades → Gerar Entradas** e **Atividades → Gerar Saídas** para visualizar os detalhes completos do documento (cabeçalho + itens), seguindo o mesmo padrão visual da tela `TarefaDetalhePage`.

### Padrão visual

Reutilizar exatamente os mesmos componentes/estilos de `TarefaDetalhePage.tsx`:
- Header com botão "Voltar" + título + subtítulo
- Cards (`Card`/`CardHeader`/`CardContent`) com ícone no título
- Helper `InfoItem` para exibir label uppercase + valor
- Datas via `formatBrasiliaDateTime` / `formatBrasiliaDate` (padrão Brasília)
- Tabela densa para os itens (mesmo estilo da `EntradasPage`/`SaidasPage`)

### Mudanças

**1. Nova página `src/pages/DocEntradaDetalhePage.tsx`**

Props: `{ documentoId: string; onBack: () => void }`

Layout em 2 cards verticais:

- **Card 1 — Dados do Documento** (ícone `FileText`)
  - Nº Nota, Data Emissão, Data Entrada
  - Parceiro (razão social + CNPJ)
  - Tipo de Entrada (descrição)
  - Armazém (descrição)
  - Qtd Volumes, Valor Total Produtos, Valor Total Nota
  - Status (badge: 0=Pendente, 1=Em Movimento, 2=Concluído) + Criado em

- **Card 2 — Itens do Documento** (ícone `Package`, contador no título)
  - Tabela: Produto (SKU + Descrição), Quantidade, Valor Unit., Valor Total
  - Linhas com lotes (quando existirem em `documento_entrada_item_lote`) exibidas como sub-linhas recolhíveis ou colunas extras (Lote, Validade, Fabricação, Série, Quantidade)
  - Footer com Total de SKUs e Valor Total Produtos

Carregamento: 4 queries paralelas (`documento_entrada`, `parceiro`, `tipo_entrada`, `armazem`) + 1 query `documento_entrada_item` com enriquecimento de produto e lotes em batch.

**2. Nova página `src/pages/DocSaidaDetalhePage.tsx`**

Props: `{ documentoId: string; onBack: () => void }`

Layout em 2 cards verticais:

- **Card 1 — Dados do Documento** (ícone `FileText`)
  - Nº Pedido, Data Emissão
  - Parceiro (razão social + CNPJ)
  - Tipo Pedido (descrição)
  - Rota, Vendedor, Transportador
  - Valor Pedido, Status (badge: 0=Pendente, 1=Em Onda, 2=Concluído)
  - Observação

- **Card 2 — Itens do Documento** (ícone `Package`, contador no título)
  - Tabela: Produto (SKU + Descrição), Quantidade, Valor Unit., Valor Total
  - Sub-linhas/colunas com Lote, Validade, Fabricação, Série quando houver `documento_saida_item_lote`
  - Footer com Total de SKUs e Valor Total

Carregamento análogo à entrada, usando `documento_saida` / `documento_saida_item` / `documento_saida_item_lote`.

**3. Alterações em `src/pages/EntradasPage.tsx`**

- Novo state: `const [detalheId, setDetalheId] = useState<string | null>(null)`
- Adicionar uma **coluna "Ações"** com ícone `Eye` (clique → `setDetalheId(doc.id)`) — não usar o clique da linha inteira para evitar conflito com o checkbox de seleção (que continua selecionando)
- Renderização condicional no topo do componente: `if (detalheId) return <DocEntradaDetalhePage documentoId={detalheId} onBack={() => { setDetalheId(null); fetchDocs(); }} />;`
- Mesmo padrão já usado para `showCadastro`/`CadastroDocEntradaPage` — não cria nova rota.

**4. Alterações em `src/pages/SaidasPage.tsx`**

- Mesma estratégia: state `detalheId`, coluna "Ações" com botão `Eye`, render condicional `<DocSaidaDetalhePage />`.

### UX da listagem

Hoje o clique na linha **alterna o checkbox**. Isso será preservado. A entrada para o detalhe será via **botão de ícone (olho)** na nova coluna "Ações" à direita, com `e.stopPropagation()` para não conflitar com a seleção. Esse padrão é consistente com tabelas SAP-like do sistema.

### Tratamento de status (badges)

| Tabela | status | label | cor |
|---|---|---|---|
| documento_entrada | 0 | Pendente | red |
| documento_entrada | 1 | Em Movimento | yellow |
| documento_entrada | 2 | Concluído | blue |
| documento_saida | 0 | Pendente | red |
| documento_saida | 1 | Em Onda | yellow |
| documento_saida | 2 | Concluído | blue |

(Reaproveita paleta da progressão de status já usada no projeto.)

### Arquivos

| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/pages/DocEntradaDetalhePage.tsx` | novo | Tela de detalhe do documento de entrada |
| `src/pages/DocSaidaDetalhePage.tsx` | novo | Tela de detalhe do documento de saída |
| `src/pages/EntradasPage.tsx` | alterado | Coluna "Ações" + render condicional do detalhe |
| `src/pages/SaidasPage.tsx` | alterado | Coluna "Ações" + render condicional do detalhe |

### Observações

- Sem mudanças de schema, RLS ou rotas no `App.tsx` (segue o padrão de `CadastroDocEntradaPage`/`CadastroDocSaidaPage`, que usam render condicional dentro da página-mãe).
- Datas exibidas via helpers `formatBrasiliaDateTime`/`formatBrasiliaDate`, alinhado com o padrão Brasília.
- Cards de lotes aparecem **somente** quando há registros em `documento_entrada_item_lote` / `documento_saida_item_lote` para o item — produtos sem controle de lote ficam com a linha simples.

