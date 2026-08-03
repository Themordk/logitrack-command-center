# Remover busca unificada da tela de Produtos

## Contexto
`ProdutosPage` (`src/pages/ProdutosPage.tsx`) passa para o `CrudTable` a busca unificada via `search`/`onSearchChange` (campo único que faz OR `ilike` em `sku`+`descricao` no `useCrud`). Os três filtros específicos (SKU, Descrição, Referência) já existem em `extraFilters` e são combinados por AND com o filtro "sem código de barras". O usuário quer **remover a busca unificada**, mantendo apenas os três filtros específicos.

Hoje `search` e `onSearchChange` são props **obrigatórios** na interface do `CrudTable`, e o input de busca é sempre renderizado na toolbar (linhas 112-121).

## Plano

### 1. `src/components/crud/CrudTable.tsx` — tornar a busca opcional
- Alterar a interface: `search?: string;` e `onSearchChange?: (s: string) => void;` (em vez de obrigatórios).
- Envolver o bloco do input de busca (linhas 112-121) em `{search !== undefined && onSearchChange && (...)}` para que ele só renderize quando a página passar a busca.
- Isso é backward-compatible: todas as outras páginas continuam passando `search`/`onSearchChange` e continuarão exibindo o campo normalmente.

### 2. `src/pages/ProdutosPage.tsx` — remover a busca unificada
- Remover as props `search={crud.search}`, `onSearchChange={crud.setSearch}` e `searchPlaceholder="Buscar por SKU ou descrição..."` do `<CrudTable>`.
- Os três filtros `extraFilters` (SKU, Descrição, Referência) e o botão "sem código de barras" permanecem intactos — já estão corretos e são a fonte de filtragem desejada.

## Notas
- Nenhuma mudança em `useCrud.ts`: o `search` vazio simplesmente não adiciona o `.or(...)` na query, então não há impacto.
- Sem migrações, sem novas dependências.
