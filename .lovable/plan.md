## Otimizar adição de itens em Documentos de Entrada e Saída

Refatorar o modal "Adicionar Item" usado em `CadastroDocEntradaPage.tsx` e `CadastroDocSaidaPage.tsx`, extraindo a busca de produto para um componente reutilizável com busca incremental por **SKU, descrição, referência ou EAN**, no padrão do `EnderecoSearchInput`. O custo passa a vir do cadastro de produto (`produto.preco_custo`), em modo somente leitura.

### Componente novo: `src/components/produto/ProdutoSearchInput.tsx`

- Padrão visual idêntico ao `EnderecoSearchInput` (input com ícone `Search`, chip selecionado com `X`, dropdown absoluto, fechamento ao clicar fora, debounce 250ms).
- Estado vazio: input com placeholder "Buscar por SKU, descrição, referência ou EAN…".
- Busca server-side com `useDebounce` (mínimo 2 caracteres) escopada por `tenant_id` + `empresa_id` + `ativo=true`:
  - Em `produto`: `or(sku.ilike.%t%, descricao.ilike.%t%, referencia.ilike.%t%)` — selecionar `id, sku, descricao, referencia, preco_custo` (limit 30).
  - Em `produto_embalagem` quando termo é numérico: `ean.ilike.%t%` → join para `produto(id, sku, descricao, referencia, preco_custo)` filtrado pela mesma empresa, mesclar resultados deduplicando por `produto_id` (limit 20).
- Dropdown lista até 30 itens com duas linhas: `SKU — descrição` e `Ref: xxx · EAN match: 7891…` quando aplicável. Navegação por teclado (↑/↓/Enter/Esc) e auto-focus ao abrir o modal.
- Chip selecionado mostra `SKU — descrição` + botão limpar.
- Props: `value: string | null`, `onChange(produto | null)` (devolve objeto completo, não só id), `tenantId`, `empresaId`, `disabled`.

### Modal "Adicionar Item" (reescrita em ambas as páginas)

Layout do modal (largura `sm:max-w-xl`):

1. **Produto** — `<ProdutoSearchInput>` ocupando linha inteira.
2. Linha de detalhes do produto selecionado (somente leitura, fundo `bg-secondary/30`): SKU, Referência, EAN principal (quando disponível). Oculta enquanto não houver seleção.
3. Grid 3 colunas:
   - **Quantidade** *(editável, auto-focus após seleção do produto)*
   - **Valor Unit.** — somente leitura, `readOnly`, preenchido com `produto.preco_custo ?? 0`, formatado em BRL.
   - **Valor Total** — somente leitura, calculado `quantidade * valor_unit`.
4. Botão **Adicionar** habilita apenas quando há produto + quantidade > 0. Após adicionar, modal permanece aberto com o foco voltando ao campo de busca (fluxo rápido para vários itens); botão **Adicionar e fechar** secundário fecha o modal.

### Página de cadastro (Entrada e Saída)

- Remover o pré-carregamento de **todos** os produtos (`setProdutos([...])` do `useEffect` inicial). A busca passa a ser sob demanda via componente.
- `addItem` recebe o produto completo do componente, monta o `DocItem` com `valor_unidade/valor_unit = preco_custo` e `valor_total = quantidade * preco_custo`.
- Persistência (`documento_entrada_item` / `documento_saida_item`) usa esses mesmos valores — schema inalterado.
- Tabela de itens existente fica como está; apenas o modal e o serviço de busca mudam.

### Detalhes técnicos

- Tabela `produto` já possui `sku`, `descricao`, `referencia`, `preco_custo`, `ativo`, `empresa_id`, `tenant_id`. EAN vive em `produto_embalagem.ean` (1:N).
- Reaproveitar `useDebounce` de `src/hooks/useDebounce.ts`.
- Sem migrations; sem alterações em rotas, tipos do Supabase ou no schema.
- Componente novo isolado em `src/components/produto/`, podendo ser reutilizado depois (movimentos, ajustes etc.).
