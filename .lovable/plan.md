# Badge "Mapeado" na Consulta de Produto do Coletor

## Objetivo
Na rota `/coletor/consulta/produto`, a seção **Picking** da listagem de saldos deve exibir um badge verde **★ Mapeado** ao lado do endereço quando aquele endereço estiver mapeado na tabela `picking_produto` para o produto consultado.

## Arquivo alterado (único)
`src/pages/coletor/ConsultaProdutoPage.tsx` — nenhum outro arquivo será tocado.

## Mudanças

### 1. Tipos
- `SaldoRow`: adicionar `endereco_id: string` (primeira propriedade).
- `ConsultaProdutoData`: adicionar `pickingMapeadoIds: string[]`.

### 2. `fetchConsulta`
- No `.map()` dos saldos, incluir `endereco_id: e.endereco_id || ""` como primeira propriedade.
- Após montar `saldos`, filtrar os `endereco_id` de tipo `PICKING` e consultar `picking_produto` com `.eq("produto_id", prodId)`, `.eq("ativo", true)` e `.in("endereco_id", pickingEnderecoIds)`, capturando a lista de endereços mapeados.
- Incluir `pickingMapeadoIds` no `return`.

### 3. Componente
- Extrair `const pickingMapeadoIds = data?.pickingMapeadoIds ?? [];`.
- Passar `pickingMapeadoIds` apenas para a chamada `SaldoSection` de Picking (Pulmão/Outros inalterados).
- Em `SaldoSection`, adicionar prop opcional `pickingMapeadoIds = []` e, no `.map()` dos itens, renderizar o badge logo após o badge de `tipo_estoque_desc` quando `pickingMapeadoIds.includes(item.endereco_id)`.

## Badge
```
<span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-green-500/15 text-green-400 border border-green-500/30">★ Mapeado</span>
```
Dentro do mesmo `<div className="flex items-center gap-1.5 flex-wrap">`, depois do badge de tipo de estoque.

## Regras
- Não alterar a lógica de busca de estoque existente — apenas adicionar a consulta a `picking_produto`.
- Manter imports, handlers e estilos atuais intactos.

## Validação
- Typecheck com `tsgo`.
- Preview: consultar um produto com picking mapeado e conferir o badge verde na seção Picking.
