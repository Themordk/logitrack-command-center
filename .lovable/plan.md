# Plano — Passar template selecionado nas chamadas de `solicitar_impressao`

## Contexto

Os quatro modais de impressão do painel administrativo (Endereço, HU, Volume, Produto) possuem um seletor de template (`selectedConfig`), mas essa escolha não é enviada à RPC `solicitar_impressao`. O backend sempre usa o template padrão, ignorando o operador. A RPC já foi ajustada em migration separada para aceitar `p_template_id: uuid`. Esta iteração passa esse parâmetro.

## Mudança

Em cada um dos quatro arquivos, adicionar `p_template_id: selectedConfig?.id ?? undefined` como última propriedade do objeto passado à RPC, em **dois** pontos cada:

1. Dentro de `handleEnviar` (loop de envio em lote)
2. Dentro de `handleReimprimirAtual` (envio individual)

Arquivos (escopo estrito — somente estes):

```
src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx   (linhas ~172 e ~237)
src/components/etiqueta/PrintEtiquetaHUModal.tsx         (linhas ~224 e ~283)
src/components/etiqueta/PrintEtiquetaVolumeModal.tsx     (linhas ~150 e ~209)
src/components/etiqueta/PrintEtiquetaProdutoModal.tsx    (linhas ~145 e ~204)
```

Cada adição é uma única linha, imediatamente antes do `p_prioridade`:

```ts
p_template_id: selectedConfig?.id ?? undefined,
```

## Regras

- Usar `?? undefined` (não `?? null`) — o Supabase JS omite propriedades `undefined`.
- Não alterar nenhuma outra propriedade da chamada RPC.
- Nenhum novo import, hook ou state.
- Não tocar em `useSolicitarImpressao.ts`, coletor, reports, types.ts, migrations ou edge functions.
- Manter o padrão `(supabase.rpc as any)` existente.
- Não reintroduzir `window.print()`, `EtiquetaXPreview`, `getPrintCSS`, `validateLabel`, `thermalEngine`.

## Critérios de aceitação

- [ ] 8 chamadas RPC no total (2 por modal × 4 modais) incluem `p_template_id: selectedConfig?.id ?? undefined`.
- [ ] Nenhuma outra propriedade alterada.
- [ ] `useSolicitarImpressao.ts` e arquivos do coletor não modificados.
- [ ] `types.ts` não regenerado.
- [ ] Diff total ~8 linhas.
- [ ] Zero warnings novos no console.
