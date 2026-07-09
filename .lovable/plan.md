## Objetivo
Refazer o template **BIN 80×20 mm** (horizontal) para bater visualmente com o mockup enviado, mantendo a mesma arquitetura (`thermalEngine` + `EtiquetaEnderecoPreview` + `BarcodeRenderer`) e sem alterar tamanho, DPI ou pipeline de impressão.

## Estrutura visual alvo

```text
┌──────────────────────────────────────────────────────────────┐
│ [BLACK HEADER]                                               │
│  ■ CORE       LOCALIZAÇÃO BIN        📅 23/05/2025 10:30    │
│    LogiTrack                         Usuário: OPERADOR       │
├───────────────────────────────┬──────────────────────────────┤
│  CÓDIGO DE ENDEREÇO           │  NÍVEL  │      N03           │
│  ▐█▐█▐▌█▐█▌▐█▐█▌▐█            │─────────┼─────────────       │
│  END00012345                  │  APTO   │      P101          │
└───────────────────────────────┴──────────────────────────────┘
```

Proporções: header ≈ 22% da altura, corpo ≈ 78%. Corpo dividido em ~55% (barcode) / ~45% (nível/apto). Margem interna 2 mm (16 px @ 203 DPI) em todos os lados. Linha divisória vertical preta entre as duas metades e linha horizontal entre NÍVEL e APTO.

## Arquivos alterados

### 1. `src/components/etiqueta/thermalEngine.ts`
Ajustar `TEMPLATES.BIN_80x20_H`:
- `quietZone`: `{ horizontal: 16, vertical: 16 }` (2 mm).
- `barcode`: `{ moduleWidth: 2, height: 64, margin: 4 }` (altura reduzida para caber barcode + texto legível).

### 2. `src/components/etiqueta/EtiquetaEnderecoPreview.tsx`
Passar novos campos para `TemplateBIN` e reescrever o componente:

**Novos dados exibidos**
- `barcodeValue` (ex.: `END00012345`) formatado com zero-pad, mesma origem atual (`codigo_endereco`).
- Data/hora atual (`new Date()` no momento da renderização, formato `dd/MM/yyyy HH:mm`, timezone via `src/utils/dateTime.ts`).
- Usuário logado: ler do contexto (`useAuth`/`TenantContext` – confirmar em build) e exibir em maiúsculas. Fallback: `—`.

**Novo layout do `TemplateBIN`**
- Container flex column.
- **Header** (altura fixa ≈ 44 px): fundo preto, texto branco.
  - Esquerda: bloco "CORE / LogiTrack" (duas linhas empilhadas, fonte pequena, bold).
  - Centro (flex-1): `LOCALIZAÇÃO BIN` bold, letter-spacing 2px, tamanho ~16 px.
  - Direita: ícone calendário (lucide `Calendar` inline SVG monocromático) + data/hora em uma linha; abaixo `Usuário: {nome}`.
- **Corpo** (flex 1, fundo branco, padding 8 px):
  - **Coluna esquerda (55%)**: `CÓDIGO DE ENDEREÇO` (label 9 px, bold, centralizado), barcode Code128 centralizado abaixo (altura ~60 px), e texto do código embaixo em fonte monoespaçada 12 px bold.
  - **Divisor vertical**: 2 px preto.
  - **Coluna direita (45%)**: duas linhas iguais separadas por linha horizontal 2 px preta.
    - Linha 1: label `NÍVEL` à esquerda (12 px bold), valor `Nxx` à direita em fonte grande (auto-fit 40–56 px, 900 bold).
    - Linha 2: label `APTO` à esquerda, valor `Pxxx` à direita mesma regra.
- Manter `validateLabel` já existente; se inválido, exibir mensagem de erro no lugar do barcode.

Fontes: Segoe UI (fallback Arial/Helvetica) — atualizar `fontFamily` do container para `"'Segoe UI', Arial, Helvetica, sans-serif"`.

### 3. `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx`
- Nenhuma mudança estrutural. Apenas atualizar o rótulo do option para deixar claro o novo layout, ex.: `80mm × 20mm – Localização BIN (Nível/Apto)`.
- Passar `usuario` via prop opcional caso o header do modal já disponha; caso contrário, o próprio `TemplateBIN` lê do contexto.

## Detalhes técnicos

- Timezone/formatação da data: usar helper existente em `src/utils/dateTime.ts` (padrão do projeto — America/Fortaleza).
- Usuário logado: recuperar via `TenantContext`/`useAuth` (a confirmar durante build; se não disponível diretamente, expor via prop opcional no `EtiquetaEnderecoPreview` e passar do modal).
- Barcode continua Code128 com `JsBarcode` (mesmo `BarcodeRenderer`); sem QR nem alterações no engine de leitura.
- Impressão: `getPrintCSS` inalterado; `@page 80mm × 20mm` já correto.
- Sem alteração em `src/pages/EnderecosPage.tsx` / `EnderecosBatchPage.tsx`.

## Fora do escopo
- Templates 100×40 e 50×20.
- Persistência de logotipo (mantém texto “CORE LogiTrack”; se no futuro houver SVG do logo, plugar no header).
- ZPL/EPL nativos.