## Objetivo
Adicionar um novo template de etiqueta **80×20 mm horizontal** para caixas BIN, exibindo à esquerda o **código de barras** de `ENDERECO.CODIGO_ENDERECO` e à direita, com fonte grande, os campos `NIVEL` (linha 1) e `APTO` (linha 2). Reutilizar toda a infraestrutura atual (JsBarcode, thermalEngine, PrintEtiquetaEnderecoModal, preview e impressão) — sem alterar os templates 100×40 e 50×20.

## Alterações

### 1. `src/components/etiqueta/thermalEngine.ts`
- Ampliar `TemplateId` com `"BIN_80x20_H"`.
- Adicionar entrada em `TEMPLATES`:
  - `widthMm: 80, heightMm: 20` → `widthPx: 640, heightPx: 160` (203 DPI, 8 px/mm)
  - `orientation: "horizontal"`
  - `barcode: { moduleWidth: 2, height: 120, margin: 8 }` (mantém legibilidade)
  - `qrCode` presente por compatibilidade de tipo, sem uso no template
  - `quietZone: { horizontal: 12, vertical: 10 }`
- Ampliar `TamanhoEtiqueta` (em `EtiquetaEnderecoPreview.tsx`) com `"80x20"`.
- Atualizar `getTemplateFromSelection` para retornar `BIN_80x20_H` quando `tamanho === "80x20"` (força horizontal — orientação vertical não suportada neste template).

### 2. `src/components/etiqueta/EtiquetaEnderecoPreview.tsx`
- Ampliar `LabelData` (em thermalEngine) com `nivel?: string` e `apto?: string` (opcionais, só usados no BIN).
- `getLabelData` passa a incluir `nivel` e `apto` do endereço.
- Criar um novo componente `TemplateBIN` (interno) que renderiza:
  - Container flex horizontal, `width/height` fixos.
  - **Esquerda (~65%)**: `<BarcodeRenderer>` com `moduleWidth/height/margin` do template, respeitando `quietZone`.
  - **Direita (~35%)**: coluna vertical centralizada, duas linhas:
    - `NIVEL` — fonte muito grande (ex.: 64px), negrito, letra-spacing curto.
    - `APTO` — negrito, ligeiramente menor (ex.: 52px).
  - Auto-fit: usar `fontSize` dinâmico simples baseado no `length` do texto (fallback CSS via `clamp`/redução condicional) para nunca cortar/quebrar linha; `whiteSpace: nowrap` e `overflow: hidden`.
  - Header CORE removido (etiqueta é pequena e o foco é o texto grande) — mantém `border-bottom` opcional se necessário para manter identidade, mas priorizando o texto.
- No dispatcher `EtiquetaSingle`, se `template.id === "BIN_80x20_H"` renderiza `TemplateBIN`; senão mantém o caminho atual (H/V).

### 3. Fonte dos dados de `NIVEL`/`APTO`
- O tipo `EnderecoLike` no `EtiquetaEnderecoPreview.tsx` receberá campos opcionais `nivel?: number | string` e `apto?: number | string` (colunas já existentes em `endereco`).
- Formatação: usar `String(...).padStart(2,"0")` para `nivel` prefixado com `"N"` (ex.: `N03`) e `apto` prefixado com `"P"` (ex.: `P101`) — sem padding forçado quando o valor já tem 3+ dígitos, para respeitar a responsividade do prompt (`N123`, `P1000`).

### 4. `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx`
- Ampliar o tipo `enderecos` para aceitar `nivel?` e `apto?`.
- Adicionar `"80x20"` como opção no `SelectField` "Tamanho" com rótulo `80mm × 20mm – 640×160px (BIN)`.
- Quando o tamanho for `80x20`, desabilitar/forçar orientação para `horizontal` e ocultar as checkboxes de QR Code / Curva / Tipo (não fazem parte do layout BIN). O `validateLabel` continua exigindo `barcodeValue` e `displayText`; para BIN, preencheremos `displayText` com o próprio `codigo_endereco` como fallback (não é renderizado) para passar a validação sem alterar o engine.

### 5. Origem das chamadas
- As rotinas atuais que abrem `PrintEtiquetaEnderecoModal` (ex.: `EnderecosPage.tsx`, `EnderecosBatchPage.tsx`) já passam o registro do endereço. Garantir apenas que os campos `nivel` e `apto` sejam repassados no objeto (spread do row) — sem alterar a UI dessas telas.

## Critérios de aceite (mapeados)
- Nova opção “80mm × 20mm (BIN)” disponível no modal de impressão.
- Barcode via mesma pipeline (`BarcodeRenderer` + JsBarcode Code128) usando `codigo_endereco`.
- Texto exibido: apenas `NIVEL` e `APTO`, sem `descricao`.
- Fonte grande, negrito, responsiva (auto-shrink) e sem quebra/corte.
- Templates 100×40 e 50×20 permanecem inalterados.
- Impressão via `getPrintCSS(template)` reutiliza `@page 80mm 20mm`.

## Fora de escopo
- Alterações nos templates existentes.
- Novo modal / novo serviço de impressão.
- Alterações no banco (colunas `nivel`/`apto` já existem).
