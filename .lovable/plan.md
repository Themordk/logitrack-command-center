## Objetivo

Duas melhorias na UI de etiquetas:
1. Nova aba **"Preview Térmica"** em `EtiquetaTemplatesPage` que renderiza o ZPL real via API Labelary.
2. Trocar `window.print()` da opção **"Imprimir Diretamente"** dos 4 modais de impressão pela RPC `solicitar_impressao` (fila de impressão).

## Arquivos

### 1. `src/pages/EtiquetaTemplatesPage.tsx`
- Novos estados: `zplPreviewUrl`, `zplPreviewLoading`, `zplPreviewError`.
- Nova função `gerarPreviewTermica()`: substitui placeholders `{{campo}}` por dados mock (VOLUME/HU/PRODUTO/ENDERECO), monta URL `https://api.labelary.com/v1/printers/8dpmm/labels/{L}x{A}/0/` (polegadas com 2 casas), POST com o ZPL, converte blob → objectURL. Fallback: se HTTPS bloqueado, tenta `http://`. `URL.revokeObjectURL` no anterior e no unmount.
- `TabsList grid-cols-3`: adicionar `TabsTrigger value="termica"` (ícone Printer).
- `TabsContent value="termica"`: botão "Gerar Preview" (não auto-gera), estados de loading/erro/vazio, `<img>` com `image-rendering: pixelated`, rodapé explicando a origem Labelary.
- Import adicional: `Loader2`, `RefreshCw` já presente.

### 2–5. Modais de impressão (`src/components/etiqueta/`)
`PrintEtiquetaHUModal.tsx`, `PrintEtiquetaProdutoModal.tsx`, `PrintEtiquetaVolumeModal.tsx`, `PrintEtiquetaEnderecoModal.tsx`.

Para cada modal:
- Import `useTenant` de `@/contexts/TenantContext` e obter `armazemId`.
- Nova função `enviarParaImpressora()`:
  - Guarda: se `!armazemId` → `toast.error("Selecione um armazém antes de imprimir")`.
  - Loop pelos itens (`husEnriquecidas` / `items` / `volumes` / `enderecos`), chamando `supabase.rpc("solicitar_impressao", {...})` com `p_tipo_etiqueta` correspondente (HU/PRODUTO/VOLUME/ENDERECO), `p_dados` conforme o schema do prompt, `p_origem: "PAINEL_ADMINISTRATIVO"`, `p_documento_origem_id`, `p_tipo_documento_origem`, `p_prioridade: 5`.
  - Contadores `successCount`/`errorCount`, toasts de resultado, `onClose()` se houve sucesso.
- Alterar `handleGerar`: se `saida === "imprimir"` → `await enviarParaImpressora()` (em vez de `triggerPrint()`).
- **Manter** `triggerPrint()` intacta — continua acionada pelo botão "Imprimir" dentro do preview HTML.
- Em `PrintEtiquetaVolumeModal`: se ainda não houver o select "Visualizar / Imprimir Diretamente", adicionar seguindo o padrão dos demais.
- Opcional: atualizar label da opção para "🖨️ Enviar para Impressora Térmica".

## Regras

- Sem novas dependências, sem migrações (RPC `solicitar_impressao` e `fila_impressao` já existem).
- Não remover a opção "Visualizar" nem `triggerPrint()`.
- Labelary chamado **apenas via clique**, nunca a cada keystroke.
- Placeholders não substituídos viram `---` para não quebrar o ZPL.

## Detalhes técnicos

- Labelary: `https://api.labelary.com/v1/printers/8dpmm/labels/{largMm/25.4}x{altMm/25.4}/0/`, `Content-Type: application/x-www-form-urlencoded`, body = ZPL puro, response `image/png`.
- Mock data cobre todos os campos usados pelos 4 tipos (ver prompt lines 61–101).
- `solicitar_impressao` retorno pode vir como string JSON ou objeto — normalizar com `typeof data === "string" ? JSON.parse(data) : data`.
