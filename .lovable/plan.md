## Ajuste: permitir confirmar contagem ZERO sem escanear EAN

Na rota `/coletor/inventario/produto` (`src/pages/coletor/InventarioProdutoPage.tsx`), o botão "Confirmar Contagem" hoje exige `eanConfirmado === true`. Isso impede o operador de registrar contagem zero para produtos ausentes no endereço (não há como escanear algo que não está lá).

### Regra nova do botão

Habilitar "Confirmar Contagem" quando:
- `quantidade === "0"` (contagem zero) — **sem exigir EAN**, ou
- `quantidade > 0` **e** `eanConfirmado === true` (comportamento atual)

Continua desabilitado quando:
- `quantidade` vazio
- `quantidade > 0` sem EAN confirmado
- `confirming` (loading)

### Mudança pontual

Arquivo: `src/pages/coletor/InventarioProdutoPage.tsx`

Substituir o `disabled` do `ActionButton` de confirmação:

```tsx
// antes
disabled={!quantidade || confirming || !eanConfirmado}

// depois
const qtdNum = Number(quantidade);
const podeConfirmar =
  quantidade !== "" &&
  !isNaN(qtdNum) &&
  (qtdNum === 0 || eanConfirmado);

disabled={!podeConfirmar || confirming}
```

O fluxo de confirmação por zero (`showZeroConfirm` dialog) já existe e continua sendo acionado dentro de `handleConfirmar` — nenhuma alteração no RPC, no dialog de zero, nem no dialog de EAN inválido.

### Fora de escopo

- Não altera validação de EAN para quantidades > 0.
- Não altera o RPC `fn_inventario_registrar_contagem` nem parâmetros enviados.
- Não mexe em outras rotas (inventário livre, endereço, lista).
