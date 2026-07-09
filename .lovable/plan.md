Alterar a letra do label "APTO" para "A" no template BIN 80x20 de etiqueta de endereço.

O componente `TemplateBIN` em `src/components/etiqueta/EtiquetaEnderecoPreview.tsx` renderiza o texto fixo "APTO" à direita do código de barras. O solicitante deseja que o label exibido seja "A" em vez de "P" (referente a Apartamento).

**Mudança técnica:**
- Em `src/components/etiqueta/EtiquetaEnderecoPreview.tsx`, no `TemplateBIN`, substituir o texto literal `"APTO"` por `"A"`.