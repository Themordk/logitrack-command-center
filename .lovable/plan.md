## Redesign da Etiqueta HU — Layout Grid Profissional

### Objetivo
Substituir o layout atual da etiqueta HU (texto flutuante em zonas) por um grid com bordas pretas sólidas, seções bem delimitadas, no padrão de mercado WMS.

### Arquivos alterados (apenas 2)

**1. `src/components/etiqueta/EtiquetaHUPreview.tsx`**
- Adicionar constantes de estilo (`BORDER`, `BORDER_THICK`, `cellBase`, `labelText`, `valueText`) após o componente `BarcodeHU`.
- Substituir integralmente o corpo do componente `EtiquetaHUSingle` pelo novo layout em 7 linhas:
  1. Nº MOV (célula 90px) + PALETE barcode compacto
  2. PRODUTO (SKU + descrição) — apenas se `itens[0]` presente
  3. VALIDADE + QUANTIDADE (2 colunas)
  4. FORNECEDOR + CARGA + RECEBIMENTO (3 colunas)
  5. LOTE + NF (2 colunas)
  6. Barcode principal (SEMPRE) — altura adaptativa
  7. TIPO + PESO (rodapé inline)
- Preservar intactos: interfaces `HULike`, `EtiquetaTemplateOverride`, `EtiquetaHUPreviewProps`, componentes `BarcodeHU` e `EtiquetaHUPreview`, e helper `hasValue`.
- Modo compacto (HPX ≤ 400): oculta linhas 2–5, mostra apenas 1, 6, 7.
- Campos sem valor / desativados no template ocultam a célula; linhas sem células ativas somem inteiras.

**2. `src/pages/EtiquetaTemplatesPage.tsx`**
- Na função `renderPreview`, bloco `if (tipo === "HU")`, adicionar o array `itens` ao mock (1 item com sku, descrição, quantidade, lote, validade) via `as any`, mantendo os demais campos já existentes.

### Fora do escopo
- Nenhum outro arquivo é tocado (sem alteração em `thermalEngine.ts`, `PrintEtiquetaHUModal.tsx`, RPCs ou hooks).
- Sem Tailwind — apenas CSS inline (compatível com `window.open` de impressão).
- Sem cores: fundo `#FFFFFF`, bordas `#000000`, labels `#555555`, valores `#000000`.
