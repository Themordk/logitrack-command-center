# Correção: Modo Checkout não ativa na Conferência do Coletor

## Diagnóstico

Validei direto no banco com os IDs informados:

- `usuario.permite_checkout` = **true** ✅
- `tipo_saida.conferencia_checkout` = **true** ✅ (VENDAS 1)
- `tipo_saida.realiza_conferencia` = **true** ✅

Ou seja, os dados estão corretos. O bug está **no frontend**.

## Causa raiz

Em `src/pages/coletor/ConferenciaProdutoPage.tsx` (linhas ~60-65), a query usa:

```ts
.from("movimento_saida")
.select("tipo_saida:tipo_saida_id(conferencia_checkout)")
```

Isso pede ao PostgREST para fazer o embed via a coluna **`tipo_saida_id`**, que **não existe** na tabela. A coluna correta é **`tipo_saida`** (é simultaneamente o nome da FK e o nome do campo). Como o embed falha silenciosamente, `movRes.data.tipo_saida` vem `null`, `checkoutTipo` fica `false` e o `modoCheckout` nunca ativa — por isso a tela continua exibindo o input "Quantidade a conferir" e o botão verde, em vez do fluxo automático com badge CHECKOUT.

## Correção

Arquivo: `src/pages/coletor/ConferenciaProdutoPage.tsx`

1. Trocar o select do `movimento_saida` para usar o nome real da coluna FK, renomeando o embed para evitar colisão com a própria coluna:

   ```ts
   .select("tipo_saida_rel:tipo_saida(conferencia_checkout)")
   ```

2. Ajustar a leitura do resultado:

   ```ts
   const checkoutTipo = !!movRes?.data?.tipo_saida_rel?.conferencia_checkout;
   ```

Nenhuma outra alteração é necessária — o restante do fluxo (`executarConfirmacao("checkout")`, badge no header, ocultação do input de quantidade) já está implementado e passa a funcionar assim que `modoCheckout` recebe `true`.

## Verificação pós-fix

1. Abrir a conferência da onda #82 com o usuário de teste.
2. Conferir que aparece o badge amarelo **CHECKOUT** no header.
3. Escanear o EAN do produto → a quantidade restante deve ser confirmada automaticamente, sem exibir o campo "Quantidade a conferir" nem o botão "Confirmar Conferência".
