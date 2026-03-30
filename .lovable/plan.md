

# Correção: Scanner hardware não funciona no modo "Coletor com leitor"

## Diagnóstico

O problema está na linha 75 do `ScanField.tsx`:

```tsx
inputMode={shouldSuppressKeyboard ? "none" : undefined}
```

`inputMode="none"` é um atributo HTML que instrui o navegador a **não ativar nenhum mecanismo de entrada virtual**. Em muitos dispositivos Android com coletores Zebra/Honeywell, o WebView interpreta `inputMode="none"` de forma agressiva — ele não apenas suprime o teclado virtual, mas também **bloqueia o canal IME (Input Method Editor)** pelo qual o scanner de hardware envia os caracteres. Isso explica por que:

- **Celular/Tablet** (sem `inputMode="none"`): scanner funciona normalmente, pois o input aceita qualquer entrada.
- **Coletor com leitor** (`inputMode="none"`): o input rejeita a entrada do scanner porque o canal IME está bloqueado, mas digitação via teclado físico funciona pois usa KeyEvents diretamente.

## Solução

Substituir `inputMode="none"` por uma abordagem que suprime o teclado virtual **sem bloquear o canal de entrada do scanner**. A técnica comprovada para coletores Zebra/Honeywell é usar `readOnly` momentaneamente:

1. O input inicia com `readOnly={true}` — isso impede o teclado virtual de aparecer ao receber foco.
2. Ao detectar o primeiro `keydown` (que vem do scanner ou teclado físico), remove-se o `readOnly` para permitir a entrada.
3. Após processar o scan (Enter), volta a `readOnly={true}`.

Essa abordagem é usada amplamente em apps WMS industriais e funciona em todos os browsers móveis e WebViews de coletores.

## Mudanças

### `src/components/coletor/ScanField.tsx`

- Remover `inputMode="none"`.
- Adicionar estado `readOnly` controlado:
  - Inicia `true` quando `shouldSuppressKeyboard` está ativo.
  - No `onKeyDown`, se `readOnly` estiver `true`, desativa-o para liberar a entrada.
  - Após o scan (Enter), reativa `readOnly`.
- Adicionar `onBlur` que reativa `readOnly` para que, ao re-focar, o teclado virtual não apareça.

Resultado: o teclado virtual continua suprimido, mas o scanner de hardware funciona normalmente.

