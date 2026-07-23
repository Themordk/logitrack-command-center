
# Novos campos em Produto: URL_IMAGEM e PESO_LIQUIDO

Adicionar suporte aos dois novos campos da tabela `produto` no painel administrativo e no coletor, com miniatura clicável para ampliar em ambas as telas.

## 1. Painel administrativo — `src/pages/ProdutosPage.tsx`

### Formulário de cadastro/edição (Sheet lateral)
- Adicionar seção com dois novos campos:
  - **Peso Líquido (kg)** — input `number` step `0.001` (mesmo padrão do `peso_bruto`).
  - **URL da Imagem** — input `text` para colar URL.
- Incluir ambos no state inicial, na normalização numérica (`peso_liquido` entra na lista de campos convertidos com `Number()`) e no payload salvo.
- Abaixo do campo URL, exibir preview quadrado (~120px) com a imagem carregada; fallback discreto quando URL vazia ou erro de carregamento (`onError` esconde `<img>`).

### Lista de produtos
- Ajustar a view `vw_produto_listagem` (migration) para expor `url_imagem` e `peso_liquido`.
- Adicionar coluna **Imagem** como primeira coluna do grid:
  - Thumbnail 32×32px, `object-cover`, `rounded`, com fallback (ícone `ImageIcon` cinza) quando `url_imagem` for nula.
  - Ao clicar na thumbnail, abrir um `Dialog` (shadcn) com a imagem ampliada (max 80vh, `object-contain`) e legenda `sku — descrição`. Não deve disparar a edição da linha (usar `stopPropagation`).
- Reutilizar um componente novo `ProdutoImagemThumb` para padronizar thumbnail + preview modal (também será usado na listagem principal e no coletor via versão adaptada).

## 2. Coletor — consulta de produto

### `src/pages/coletor/ConsultaProdutoDetalhePage.tsx`
- Selecionar `url_imagem` e `peso_liquido` no fetch de `produto`.
- Adicionar bloco no topo da aba "Dados":
  - Thumbnail ~64×64px alinhada com SKU/descrição, e botão "Ver imagem" que abre um overlay full-screen (mobile-first) com a imagem ampliada e botão fechar. Se não houver `url_imagem`, ocultar bloco.
- Incluir **Peso Líquido** na lista de atributos exibidos (linha nova entre pesos).

### `src/pages/coletor/ConsultaProdutoPage.tsx`
- Após identificar o produto pelo EAN, buscar também `url_imagem` e exibir thumbnail pequena (40×40px) ao lado do nome do produto no card de resultado, também clicável (mesmo overlay full-screen).

### `src/components/coletor/InfoCard.tsx`
- Aceitar prop opcional `urlImagem`. Quando presente, mostrar thumbnail 40×40px à esquerda do bloco SKU/qtd com clique para overlay ampliado (via callback ou modal interno leve). Usado por telas operacionais (conferência, separação, armazenagem etc.) sem quebrar layout — mantém texto atual se URL ausente.
- Repassar `url_imagem` nas telas que já usam `InfoCard` e carregam produto (busca por EAN já retorna o produto; ajustar selects para incluir o campo apenas onde já se faz join com `produto`).

## 3. Backend

Migration única:
- `CREATE OR REPLACE VIEW public.vw_produto_listagem` incluindo `url_imagem` e `peso_liquido` (mantendo colunas atuais).

Nenhuma alteração de RLS/GRANT (view herda de `produto`).

## Detalhes técnicos

- Componente novo `src/components/produto/ProdutoImagemThumb.tsx`: recebe `url`, `size`, `alt`; renderiza `<img>` com `loading="lazy"`, `object-cover`, fallback e onClick abrindo `Dialog` centralizado (usa `Dialog` shadcn no admin, e overlay próprio dark no coletor via prop `variant`).
- Todas as imagens usam `loading="lazy"` e `referrerPolicy="no-referrer"` para não bloquear render.
- Nenhum upload de arquivo — apenas URL colada pelo usuário (Fase 1). Storage/upload fica para futura fase se solicitado.
- Reset de imagem quando input URL é limpo; validação leve (aceita qualquer string, exibe preview só se `<img>` carregar).

## Fora de escopo

- Upload de arquivos para Storage.
- Alteração em relatórios ou etiquetas.
- Alteração em outras telas administrativas listando produtos (só a `ProdutosPage`).
