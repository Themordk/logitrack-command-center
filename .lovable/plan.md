## Objetivo

Unificar o fluxo de impressão da etiqueta de **Endereço** em torno do ZPL como fonte única de verdade: o preview passa a ser um PNG renderizado pelo Labelary a partir do `corpo_zpl` do template, e toda impressão vai para a fila (`solicitar_impressao`). O `window.print()` é abolido para etiquetas de endereço.

## Escopo

Somente etiqueta de ENDEREÇO. HU, Produto, Volume, `thermalEngine.ts`, coletor, relatórios, `useSolicitarImpressao.ts`, `zplGenerator.ts` e o backend Supabase permanecem intocados.

## Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `src/hooks/useLabelaryPreview.ts` |
| Criar | `src/components/etiqueta/ZplPreview.tsx` |
| Reescrever | `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx` |
| Ajustar | `src/pages/EtiquetaTemplatesPage.tsx` |
| Marcar | `src/components/etiqueta/EtiquetaEnderecoPreview.tsx` (`@deprecated`, sem deletar) |

## 1. Hook `useLabelaryPreview`

- Params: `zpl`, `larguraMm`, `alturaMm`, `dados?`, `dpmm = 8`, `indice = 0`, `enabled = true`. Retorna `{ url, loading, error, refetch }`.
- Substitui `{{chave}}` pelos valores de `dados` (null/undefined → string vazia); placeholders remanescentes viram `---`.
- Endpoint: `https://api.labelary.com/v1/printers/{dpmm}dpmm/labels/{largPol}x{altPol}/{indice}/`, polegadas com 2 casas; fallback para `http://` se o HTTPS falhar.
- Cache in-memory (`Map` no escopo do módulo) com chave por hash DJB2 inline do input completo; sem dependências novas, sem storage.
- Debounce de 400 ms com `setTimeout`/`clearTimeout` e cancelamento por `AbortController`; sem revogar objectURLs no cleanup do consumidor (cache compartilhado), com função de limpeza exposta.
- Erros: mensagem em texto plano do body em `error`, `url = null`, nunca lança.
- Base: lógica hoje em `gerarPreviewTermica` (EtiquetaTemplatesPage, ~linhas 116-199), generalizada.

## 2. Componente `ZplPreview`

Apresentação pura sobre o hook: container centralizado `bg-neutral-100 dark:bg-neutral-800`, `border border-border`, `rounded-lg`, `p-3`, largura `larguraMm * escalaPx` limitada por `maxLarguraPx` (padrão 4 px/mm e 800 px). Imagem com `object-contain` e `image-rendering: pixelated`. Estados: loading (Loader2 + "Renderizando preview térmica..."), erro (AlertTriangle + mensagem + dica sobre `^XA`/`^XZ`), vazio (Printer opacidade 30 + "Aguardando ZPL...") e sucesso. Legenda opcional `{largura}mm × {altura}mm — Preview via Labelary`.

## 3. Modal de impressão de endereço (reescrita)

Props inalteradas, mais `onNavigate?: (path: string) => void` opcional — `EnderecosPage.tsx` não muda.

Removido: `EtiquetaEnderecoPreview`, `thermalEngine` (`getPrintCSS`, `getPrintCSSFromConfig`, `getTemplateFromSelection`, `validateLabel`), `triggerPrint`, `window.open`/`window.print`, overlay fullscreen, seletor de saída preview/imprimir, checkboxes de QR/Curva/Tipo, bloco de 2 colunas e intervalo, `printRef`.

Mantido: carregamento de templates via RPC `listar_etiqueta_templates`, dropdown de template, seleção de seta direcional.

Novo layout `sm:max-w-3xl`, grid `md:grid-cols-[280px_1fr]`:
- Esquerda: badge de contagem (ícone `Layers`), dropdown de template + linha de dimensões, dropdown de seta, callout `Info` explicando que QR/Curva/Tipo/Colunas são configurados no template (link "Editar template" só quando `onNavigate` existir).
- Direita: `ZplPreview` inline alimentado pelo `corpo_zpl` do template (fallback `gerarZplTemplate("ENDERECO", selectedConfig)`) e pelos dados do endereço atual; navegador `‹ X de Y ›` quando houver múltiplos endereços.
- Rodapé: "Cancelar" + botão primário `Send` "Enviar N para Fila" (spinner "Enviando..." durante o envio).

Estados tratados: carregando templates, nenhum template (alerta amarelo + botão desabilitado), template sem ZPL (callout destrutivo), erro de preview (não bloqueia envio), envio em andamento.

Envio: laço sobre `enderecos` chamando `solicitar_impressao` com `p_dados` restrito a `codigo_endereco`, `descricao`, `tipo_endereco`, `curva_acesso`, `direcao_seta`, `seta_simbolo` (mapa `SETA_SIMBOLO` no topo do arquivo), `p_origem: "PAINEL_ADMINISTRATIVO"`, `p_tipo_documento_origem: "endereco"`, `p_prioridade: 5`, `p_setor_uso: "GERAL"`. Toasts: sucesso total (fecha), parcial (success + warning, fecha), falha total (error, mantém aberto), com detalhes em `console.warn`/`console.error`.

## 4. Ajustes na tela de Templates

- Substituir `gerarPreviewTermica` e os states `zplPreviewUrl/Loading/Error` (e o `useEffect` de revoke) pelo uso de `<ZplPreview>` com `zplCode` e as dimensões do `draft`; botão manual opcional chamando `refetch()`.
- Remover a função morta `RenderPreview` (a partir da linha ~980) e os imports órfãos dos previews HTML resultantes, preservando o import de `gerarZplTemplate`.
- Nada mais na tela muda (CRUD, campos, aba ZPL, modo manual).

## 5. Depreciação

Comentário `@deprecated` no topo de `EtiquetaEnderecoPreview.tsx`, sem outras alterações e sem deletar o arquivo nem `thermalEngine.ts`.

## Notas técnicas

TypeScript estrito (`as any` apenas no padrão `(supabase.rpc as any)`), shadcn `Dialog` existente, Sonner para toasts, ícones Lucide, cores exclusivamente por tokens do design system, sem novas dependências. Verificação final: `rg` para garantir ausência de `window.print`/`window.open`/`thermalEngine`/`EtiquetaEnderecoPreview` no modal, e typecheck limpo.
