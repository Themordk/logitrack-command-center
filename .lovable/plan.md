
## Objetivo

Suportar 6 novas colunas em `etiqueta_template` (`largura_mm`, `altura_mm`, `duas_colunas`, `intervalo_colunas_mm`, `direcao_seta`, `escala_fonte`), corrigir o layout ilegível da etiqueta vertical de endereço, e habilitar impressão em rolo de duas colunas.

## Etapas

### 1. `src/hooks/useEtiquetaTemplate.ts`
Adicionar à interface `EtiquetaConfig` os 6 novos campos. Sem outras mudanças.

### 2. `src/components/etiqueta/thermalEngine.ts`
- Ampliar `EtiquetaConfigLike` com `largura_mm?` e `altura_mm?`.
- Reescrever `getTemplateFromConfig`: quando `largura_mm`/`altura_mm` presentes, calcula `widthPx/heightPx` via `MM_TO_PX` e escala barcode/QR conforme `isSmall = w<=50 || h<=25`. Caso contrário mantém fallback `getTemplateFromSelection`.
- Adicionar `getPrintCSSFromConfig(widthMm, heightMm, duasColunas=false, intervaloMm=3)` retornando CSS `@page` com largura dobrada + gap quando duas colunas, e regras `.etiqueta-row` (flex).

### 3. Redesign vertical de endereço — `EtiquetaEnderecoPreview.tsx`
- Reescrever completamente `TemplateVertical`. Layout topo→base: cabeçalho opcional (logo/marca) → número do apto (fonte ~50px) → nível (~30px) → `ArrowSVG` (~60px) → `BarcodeRenderer` **horizontal** → código completo (`RR.PPP.NN.AA`). Nada de `writingMode` ou `rotate`; nunca `BarcodeRendererVertical`.
- Extrair `apto`/`nivel` de `data.apto`/`data.nivel`; fallback parseando `displayText` (`R01-P02-N03-A04`) via split.
- Adicionar helper interno `ArrowSVG({ direction, size })` — polígono sólido preto (`points="50,5 90,55 65,55 65,95 35,95 35,55 10,55"`), rotacionado 0/90/180/270 para CIMA/DIREITA/BAIXO/ESQUERDA. Não usar Lucide.
- Adicionar prop opcional `direcaoSeta`. Resolução: `config?.direcao_seta ?? direcaoSeta ?? "NENHUMA"`; se `NENHUMA`, oculta seta.
- Em `TemplateHorizontal`: quando seta ≠ `NENHUMA`, dividir layout em duas colunas (conteúdo | coluna vertical com ArrowSVG grande à direita). Sem seta, mantém render atual.
- Aplicar `config?.escala_fonte ?? 1` como multiplicador em todos os `fontSize` do arquivo (tanto vertical quanto horizontal).

### 4. Escala de fonte nos demais previews
`EtiquetaHUPreview`, `EtiquetaProdutoPreview`, `EtiquetaVolumePreview`: multiplicar `fontSize` inline por `config?.escala_fonte ?? 1`. Sem outras mudanças estruturais.

### 5. `src/pages/EtiquetaTemplatesPage.tsx`
- Trocar select "Tamanho" por dois inputs `type="number"` (`min=10`, `max=300`) para `largura_mm` e `altura_mm`. Ao alterar, também atualizar `draft.tamanho = "${largura}x${altura}"` e derivar `orientacao`: `w>h → horizontal`, `h>w → vertical`, `w===h → mantém`.
- Remover o select de orientação (agora derivado).
- Novo bloco: switch "Rolo com duas colunas" (`draft.duas_colunas`) + input numérico "Intervalo entre colunas (mm)" (`draft.intervalo_colunas_mm`, exibido só quando ativo).
- Novo bloco (somente `tipo === "ENDERECO"`): select "Seta direcional" com opções NENHUMA/CIMA/BAIXO/ESQUERDA/DIREITA (`draft.direcao_seta`).
- Novo bloco: seletor discreto de "Escala de fonte" com botões 0.8 / 1.0 / 1.2 / 1.5 (`draft.escala_fonte`).
- Ajustar sync do `draft` em `useEffect(config)` para preencher defaults dos 6 novos campos (`?? 100`, `?? 40`, `?? false`, `?? 3`, `?? "NENHUMA"`, `?? 1.0`).
- Incluir os 6 campos no `payload` de `handleSave` e no `previewConfig` do memo.
- Atualizar `TAMANHOS_POR_TIPO` deixa de ser usado — remover ou manter só como referência (será removido).

### 6. `PrintEtiqueta*Modal.tsx` (4 arquivos)
- Importar `getPrintCSSFromConfig`. Ao montar HTML de impressão: `const css = config?.largura_mm ? getPrintCSSFromConfig(config.largura_mm, config.altura_mm, config.duas_colunas, config.intervalo_colunas_mm) : getPrintCSS(template);`
- Quando `config?.duas_colunas`, agrupar itens em pares e envolver cada par em `<div class="etiqueta-row">…</div>`; cada etiqueta interna mantém a classe `etiqueta-thermal`. Caso contrário, render 1 por vez (comportamento atual).

## Regras

- Retrocompatibilidade: sem `config`, tudo funciona como hoje.
- Sem novas dependências, sem tocar em `src/components/ui/`.
- Cores hex `#000`/`#FFF` só dentro do render físico da etiqueta; UI usa tokens semânticos.
- `parseError` + `toast.error(parsed.title)` em erros (padrão existente).
- Seta sempre como polígono SVG sólido (nunca Lucide, nunca `stroke` fino).

## Arquivos afetados

**Alterados:** `src/hooks/useEtiquetaTemplate.ts`, `src/components/etiqueta/thermalEngine.ts`, `src/components/etiqueta/EtiquetaEnderecoPreview.tsx`, `src/components/etiqueta/EtiquetaHUPreview.tsx`, `src/components/etiqueta/EtiquetaProdutoPreview.tsx`, `src/components/etiqueta/EtiquetaVolumePreview.tsx`, `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx`, `src/components/etiqueta/PrintEtiquetaHUModal.tsx`, `src/components/etiqueta/PrintEtiquetaProdutoModal.tsx`, `src/components/etiqueta/PrintEtiquetaVolumeModal.tsx`, `src/pages/EtiquetaTemplatesPage.tsx`.

**Novos:** nenhum.
