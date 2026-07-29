## Objetivo

Tornar o campo `corpo_zpl` a fonte única de verdade na tela **Templates de Etiqueta** (`src/pages/EtiquetaTemplatesPage.tsx`), com modo automático (gerado das configurações) e modo de edição manual explícito.

## Alterações (arquivo único: `src/pages/EtiquetaTemplatesPage.tsx`)

### 1. Estados
- Remover `zplEditado`.
- Adicionar `modoManualZpl` (boolean, default `false`).
- Manter `zplCode`.

### 2. Carregamento do template
No efeito que sincroniza a seleção: carregar `setZplCode(selected.corpo_zpl || "")` sempre (hoje só define quando há valor) e resetar `modoManualZpl` para `false`. Ao limpar a seleção, zerar os três estados.

### 3. Auto-geração
Efeito de geração passa a depender de `[draft, tipo, modoManualZpl]` e sai cedo quando `modoManualZpl` estiver ativo. O textarea nunca altera `draft` — apenas `zplCode` — evitando loop.

### 4. Aba "Código ZPL"
- Remover badge "EDITADO" e botão "Regenerar".
- Adicionar checkbox "Edição manual": ao desmarcar, regenera imediatamente o ZPL a partir do `draft`.
- Textarea `readOnly` quando em modo automático, com estilo atenuado; editável no modo manual.
- Nota explicativa no modo automático; lista de placeholders exibida no modo manual.
- Botão "Copiar" mantido.

### 5. Aba "Preview Térmica"
Substituir o container fixo `min-h-[300px] bg-white` por container centralizado (`mx-auto`, `bg-neutral-100`) com tamanho proporcional:
- largura: `min(largura_mm * 4, 800)px`
- altura mínima: `min(altura_mm * 4, 600)px`

Rodapé passa a mostrar `{largura_mm}mm × {altura_mm}mm — Preview via Labelary`.

### 6. `handleCreateNew`
Montar uma config temporária com os mesmos valores do payload e gerar `corpo_zpl` via `gerarZplTemplate` antes do INSERT (com fallback de ZPL mínimo em caso de erro), já que a coluna é NOT NULL.

### 7. `handleSave`
`corpo_zpl: zplCode` (sem fallback `|| null`). Demais campos do payload inalterados.

## Notas técnicas
- Sem mudanças de banco, sem novas dependências, sem alteração em `zplGenerator.ts`.
- Ordem das abas mantida: Preview Térmica primeiro, Código ZPL depois.
- As classes de colapso das abas (`hidden data-[state=active]:flex`) já corrigidas permanecem.
