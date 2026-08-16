# FIX CRÍTICO: Scan de Produto Obrigatório na Armazenagem

## Objetivo
Eliminar a possibilidade de armazenar o produto errado na tela `ArmazenagemIniciarPage.tsx`, tornando o scan de conferência obrigatório e validado contra os EANs cadastrados do produto.

## Problema confirmado
`ArmazenagemIniciarPage.tsx` trata o scan como opcional quando a tarefa vem da lista de itens (`preloadedTarefa`):

1. Label do `ScanField` exibe "Escanear para conferir (opcional)".
2. `handleScan` aceita qualquer código e dispara overlay de sucesso sem validar.
3. Botão "CONFIRMAR E ARMAZENAR" fica habilitado apenas com a existência de `tarefa`, sem exigir scan válido.

## Escopo
Apenas 1 arquivo:
- `src/pages/coletor/ArmazenagemIniciarPage.tsx`

## Alterações

### 1. Estado de controle
Adicionar:

```ts
const [eanConfirmado, setEanConfirmado] = useState(false);
```

### 2. Label obrigatório
Alterar o `ScanField` para:

```tsx
<ScanField
  label={preloadedTarefa ? "Escanear EAN para confirmar produto" : "Escanear EAN ou HU"}
  lastScanned={lastScanned}
  onScan={handleScan}
/>
```

### 3. Validação de EAN no `handleScan`
Quando `tarefa && preloadedTarefa`:

- Resetar `eanConfirmado` no início da validação.
- Buscar EANs válidos do produto:
  - Online: consultar `produto_embalagem` filtrando por `produto_id`.
  - Offline: usar cache `ean_produto_${produto_id}`.
  - Offline sem cache: aceitar validação por SKU como fallback mínimo.
- Comparar código escaneado (trim + uppercase) contra a lista de EANs válidos.
- EAN correto: `setEanConfirmado(true)` + overlay verde "Produto confirmado".
- EAN incorreto: `setEanConfirmado(false)` + `result.showWarning` com código escaneado e produto esperado.
- Erros inesperados: `result.showError`.

Cachear EANs online por 480 minutos para uso offline futuro.

### 4. Bloqueio do botão CONFIRMAR
Alterar o botão para:

```tsx
<ActionButton
  onClick={handleConfirm}
  variant="primary"
  disabled={!!preloadedTarefa && !eanConfirmado}
>
  CONFIRMAR E ARMAZENAR
</ActionButton>
```

Quando não há `preloadedTarefa`, o botão continua habilitado com `tarefa` existente, pois o EAN já foi validado pela RPC no scan direto.

## O que NÃO será alterado
- Nenhum outro arquivo do coletor.
- `offlineStore.ts`, `offlineEanCache.ts` ou `OfflineContext.tsx`.
- Lógica de `ArmazenagemExecucaoPage.tsx` e `ArmazenagemItensPage.tsx`.

## Critérios de aceite
1. Label do scan NUNCA contém a palavra "opcional".
2. Com tarefa pré-carregada, "CONFIRMAR E ARMAZENAR" inicia desabilitado.
3. Escanear EAN de outro produto exibe warning e mantém botão desabilitado.
4. Escanear EAN correto exibe overlay verde e habilita o botão.
5. Offline sem cache de EAN aceita validação por SKU como fallback.
6. Typecheck e build passam sem regressão.
