## Objetivo

Na tela **Armazém → Localizações / Endereços**, permitir selecionar **todos os endereços de todas as páginas** (respeitando busca e filtros ativos) para viabilizar impressão de etiquetas em lote sem navegar página por página.

## Comportamento atual

O checkbox do cabeçalho em `CrudTable` marca apenas as linhas atualmente renderizadas (`data`), que correspondem só à página visível (server-side pagination, `pageSize = 15`).

## Solução proposta (mínima e cirúrgica, escopo apenas em Endereços)

Manter o comportamento padrão de "selecionar página" e adicionar uma **faixa de ação contextual** acima da tabela quando houver seleção parcial, no estilo Gmail/Notion:

```
[✓ 15 selecionados nesta página]   Selecionar todos os N endereços deste filtro   |   Limpar seleção
```

Quando o usuário clicar em "Selecionar todos os N…":
1. Uma função dispara uma consulta à `vw_endereco_listagem` reaproveitando exatamente os mesmos filtros (tenant, empresa, `filterArmazem`, `filterSetor`, `filterTipoEstoque`, `filterTipoEstrutura`, `filterTipo`, `filterSituacao`, `filterLado`, `filterCurva`, `filterAtivo`, `search`) porém trazendo apenas a coluna `id` sem paginação.
2. O resultado alimenta `selectedIds` com todos os IDs correspondentes.
3. O botão "Imprimir Selecionados (N)" já existente passa a operar sobre a lista completa.

Para impressão, `handlePrintSelected` hoje faz `crud.data.filter(...)` — só enxerga a página atual. Vamos alterá-lo para buscar os registros completos por IDs selecionados (query direta em `vw_endereco_listagem` com `.in("id", [...selectedIds])`) antes de abrir `PrintEtiquetaEnderecoModal`.

## Arquivos a alterar

1. **`src/pages/EnderecosPage.tsx`**
   - Adicionar estado `selectingAll` (loading) e helper `selectAllAcrossPages()` que replica os filtros aplicados e busca todos os `id` da view.
   - Renderizar uma faixa (banner) logo acima do `CrudTable` (via nova prop `topBanner` no `CrudTable` OU envolvendo a página com um `<div>` acima) que aparece somente quando `selectedIds.size > 0` e `selectedIds.size < crud.total`. Preferência: adicionar prop opcional `selectionBanner` no `CrudTable` para manter alinhamento visual dentro do card.
   - Ajustar `handlePrintSelected` para buscar via Supabase todos os endereços correspondentes aos `selectedIds` (não apenas os presentes em `crud.data`).
   - Limpar `selectedIds` ao trocar de filtros/empresa (já existe reset no `useEffect` de contexto — estender para reset ao mudar filtros).

2. **`src/components/crud/CrudTable.tsx`** (mudança mínima)
   - Adicionar prop opcional `selectionBanner?: React.ReactNode` renderizada entre o header de filtros e a tabela, apenas quando fornecida.

## Detalhes técnicos

- A query de "selecionar tudo" deve usar o mesmo builder de filtros do `useCrud` (replicado localmente no `EnderecosPage`), incluindo `tenant_id`, `empresa_id` e o `or(...)` de busca textual. Como duplicaríamos lógica, a alternativa mais limpa é expor uma função `fetchAllIds()` no `useCrud` que executa a mesma query sem `.range()` e retornando `select("id")`. Adotaremos essa via — retorno é `string[]`.
- `useCrud` passa a expor `fetchAllIds: () => Promise<string[]>`. Nenhum outro consumidor precisa alterar.
- A faixa exibe: "N selecionado(s) nesta página." + botão "Selecionar todos os {total} endereços" quando `selectedIds.size < total`; quando `selectedIds.size === total` mostra "Todos os {total} endereços estão selecionados." + botão "Limpar seleção".
- `handlePrintSelected`: se `selectedIds.size <= crud.data.length` e todos estão em `crud.data`, mantém caminho atual. Caso contrário, faz `.from("vw_endereco_listagem").select("*").eq("tenant_id", ...).in("id", Array.from(selectedIds))` (em chunks de 500 IDs para evitar URL longa) e concatena os resultados.

## Fora de escopo

- Não alterar outras telas com seleção múltipla (VolumesPage etc.). Se necessário no futuro, aplica-se o mesmo padrão via `useCrud.fetchAllIds`.
- Sem mudanças de schema/RPC.