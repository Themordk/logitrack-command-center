## Impressão de Etiquetas EAN13 de Produtos

Adicionar fluxo de visualização e impressão de etiquetas de código de barras para embalagens de produtos, reutilizando o padrão da impressão de etiquetas de endereço.

### Escopo

1. **Lista de Produtos** (`Dados Mestres > Produtos`): habilitar seleção múltipla e botão "Imprimir Etiquetas" no header da lista.
2. **Aba Embalagens** (dentro do modal de produto): botão "Imprimir" por linha da tabela e botão "Imprimir Selecionadas" no cabeçalho da aba.
3. Em ambos os casos, abrir o **modal de configuração de impressão** no mesmo padrão visual de `PrintEtiquetaEnderecoModal` (tamanho, orientação, saída preview/imprimir, campos opcionais).

### Componentes novos

```
src/components/etiqueta/
  EtiquetaProdutoPreview.tsx     → renderiza a etiqueta (horizontal/vertical)
  PrintEtiquetaProdutoModal.tsx  → modal de configuração + preview + print
```

Reutiliza sem alterações:
- `thermalEngine.ts` (templates 100x40 e 50x20, H/V, validação, CSS de impressão)
- `BarcodeRenderer` / `BarcodeRendererVertical` (Code128)
- `QRCodeRenderer`

### Dados de entrada do modal

O modal recebe um array `EtiquetaProdutoItem[]`:

```ts
type EtiquetaProdutoItem = {
  produto_id: string;
  sku: string;
  descricao: string;
  marca?: string | null;
  // dados da embalagem (se disponíveis)
  embalagem_id?: string;
  ean: string;            // código de barras renderizado
  embalagem?: string;     // "CX", "UN", "PCT"
  fator?: number;
  altura?: number | null;
  largura?: number | null;
  comprimento?: number | null;
  peso_bruto?: number | null;
  peso_liquido?: number | null;
  m3?: number | null;
};
```

### Origem dos dados

- **Aba Embalagens (linha individual)**: usa diretamente o registro de `produto_embalagem` já carregado (`embalagens`) + SKU/descrição/marca do `produto`.
- **Aba Embalagens (selecionadas)**: idem, filtrando o array `embalagens`.
- **Lista de Produtos (seleção múltipla)**: ao clicar em "Imprimir Etiquetas", buscar `produto_embalagem` de todos os produtos selecionados em uma única query:
  ```ts
  supabase.from("produto_embalagem")
    .select("id, produto_id, ean, embalagem, fator, altura, largura, comprimento, peso_bruto, peso_liquido, m3, produto:produto_id(sku, descricao, marca)")
    .in("produto_id", [...selectedIds])
    .eq("tenant_id", tenantId)
    .eq("ativo", true);
  ```
  Cada embalagem retornada vira uma etiqueta. Se um produto não tiver embalagem ativa, ele é ignorado e o toast informa quantos foram ignorados.

### Modal `PrintEtiquetaProdutoModal`

Mesma estrutura visual do modal de endereço:

- Cabeçalho: ícone `Printer` + título "Impressão de Etiquetas de Produto – Padrão CORE".
- Faixa informativa: "N etiquetas selecionadas · Template: ...".
- Selects: **Tamanho** (100x40, 50x20), **Orientação** (Horizontal/Vertical), **Saída** (Preview/Imprimir).
- Bloco "Campos Opcionais" com checkboxes:
  - Incluir Marca
  - Incluir Altura
  - Incluir Largura
  - Incluir Comprimento
  - Incluir Peso Bruto
  - Incluir Peso Líquido
  - Incluir M³
  - Incluir QR Code (apenas no 100x40, igual ao modal de endereço)
- Validação prévia por etiqueta (EAN obrigatório, Code128-compatível, mesma chamada `validateLabel`). Botão de gerar fica desabilitado quando há erro.
- Botões: Cancelar / Gerar Preview / Imprimir Agora (com modo preview fullscreen + `window.open` + `getPrintCSS`).

### Componente `EtiquetaProdutoPreview`

Renderiza por item:

**Sempre presentes (padrão):**
- Header "CORE LOGITRACK" + "WMS" (igual ao de endereço).
- Área central do código de barras (Code128 do `ean`), com QR opcional ao lado no 100x40.
- Linha de descrição: `SKU · DESCRIÇÃO` (uppercase, bold).
- Linha sempre presente: `EAN: <ean>  |  FATOR: <fator>` — esses dois são os campos default conforme requisito.

**Linhas extras condicionais** (mostradas em uma faixa abaixo, só no 100x40 para preservar legibilidade):
- Marca: `MARCA: <marca>`
- Dimensões: `A:<altura> L:<largura> C:<comprimento>` (concatena apenas as ativas)
- Peso: `PB:<peso_bruto> PL:<peso_liquido>`
- Volume: `M³:<m3>`

Layout vertical (50x20 V e 100x40 V): mostra somente EAN, SKU e FATOR — campos extras são ignorados por restrição de espaço (mesma filosofia do template vertical de endereço, que oculta extras).

### Alterações em `src/pages/ProdutosPage.tsx`

1. **Lista (componente `ProdutosPage`):**
   - Adicionar `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`.
   - Adicionar `const [printOpen, setPrintOpen] = useState(false)` e `const [printItems, setPrintItems] = useState<EtiquetaProdutoItem[]>([])`.
   - Função `handleImprimirSelecionados()` que faz a query de `produto_embalagem` por `in(produto_id, [...selectedIds])`, monta os itens e abre o modal. Toast se nenhuma embalagem for encontrada.
   - Passar para `CrudTable`: `selectable`, `selectedIds`, `onSelectChange={setSelectedIds}` e estender `headerActions` para incluir o botão "Imprimir Etiquetas (N)" ao lado de "Importar do ERP" quando `selectedIds.size > 0`.
   - Renderizar `<PrintEtiquetaProdutoModal open={printOpen} ... items={printItems} />`.

2. **Aba Embalagens (componente `ProdutoDetailModal`):**
   - Adicionar `const [embSelected, setEmbSelected] = useState<Set<string>>(new Set())` e estados do modal de impressão.
   - Na tabela de embalagens:
     - Coluna inicial com checkbox por linha + checkbox "todos" no header.
     - Na coluna "Ações", adicionar botão ícone `Printer` que abre o modal com aquela única embalagem.
   - No header da aba (ao lado de "Nova Embalagem"), botão "Imprimir Selecionadas (N)" quando `embSelected.size > 0`.
   - Função monta `EtiquetaProdutoItem[]` a partir dos registros locais de `embalagens` + dados do `produto` atual (sem nova query).
   - Renderizar o modal de impressão.

### Itens fora de escopo

- Não alterar `PrintEtiquetaEnderecoModal`, `EtiquetaEnderecoPreview`, `thermalEngine` ou renderers de barcode/QR.
- Não modificar schema de banco (campos `ean`, `fator`, dimensões já existem em `produto_embalagem`).
- Não criar Edge Functions.
- Não mexer no fluxo de Picking nem em outras abas.

### Resumo dos arquivos

```
src/components/etiqueta/EtiquetaProdutoPreview.tsx        [novo]
src/components/etiqueta/PrintEtiquetaProdutoModal.tsx     [novo]
src/pages/ProdutosPage.tsx                                [editado]
```
