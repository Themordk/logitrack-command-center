## Objetivo

Gerar código **ZPL** (Zebra Programming Language) automaticamente no frontend a partir da configuração visual dos templates de etiqueta, persistir em `etiqueta_template.corpo_zpl` (já existente no banco) e adicionar uma aba "Código ZPL" ao lado do Preview atual — editável, com badge "EDITADO" e botão "Regenerar".

O agente local passa a receber o ZPL pronto (com placeholders `{{campo}}`) e apenas substitui pelos dados reais no momento da impressão.

## Arquivos

### NOVO — `src/lib/zplGenerator.ts`
Módulo TypeScript puro (sem React). Exporta:

- `gerarZplTemplate(tipo, config): string` — dispatcher por tipo.
- `gerarZplVolume(config)` — cabeçalho preto opcional + barcode `{{codigo_volume}}` + grid 2 colunas dos campos ativos (excluindo `codigo_volume`), com linhas divisórias.
- `gerarZplHU(config)` — cabeçalho + barcode `{{codigo_hu}}` + grid 2 colunas dos demais campos ativos.
- `gerarZplProduto(config)` — header simples (CORE LOGITRACK / `{{sku}}`) + `{{descricao}}` + campos extras + barcode `{{ean}}`.
- `gerarZplEndereco(config)` — barcode `{{codigo_endereco}}` no topo + descrição + seta direcional (↑↓←→) conforme `direcao_seta` + campos ativos.

Constantes: `DOTS_PER_MM = 8` (203 DPI). Helper de escala `fs(n) = round(n * escala_fonte)`. Comandos usados: `^XA/^XZ`, `^CI28`, `^PW/^LL`, `^CF0`, `^FO`, `^FD/^FS`, `^FB`, `^GB`, `^FR`, `^BY`, `^BCN`. Determinístico — sem timestamps, sem dados reais, apenas `{{placeholders}}`.

### 1. `src/hooks/useEtiquetaTemplate.ts`
Adicionar ao interface `EtiquetaConfig` (mantendo os campos atuais):
```ts
corpo_zpl?: string | null;
corpo_tspl?: string | null;
linguagem_padrao?: string;
```

### 2. `src/pages/EtiquetaTemplatesPage.tsx`
- Novos imports: `gerarZplTemplate`, `Tabs/TabsContent/TabsList/TabsTrigger`, ícones `Code, Eye, Printer, Copy, RefreshCw`.
- Novos estados: `zplCode: string`, `zplEditado: boolean`.
- `useEffect` que regenera ZPL a partir de `draft`/`tipo` quando `!zplEditado`.
- Ao trocar o template selecionado: se `selected.corpo_zpl` → carrega e marca `zplEditado=true`; senão deixa auto-gerar.
- `handleSave` (linha 168): incluir `corpo_zpl: zplCode || null` no payload.
- Substituir o bloco de Preview (linha 695–697) por `<Tabs>` com duas abas:
  - **Preview**: mantém `RenderPreview` existente intacto.
  - **Código ZPL**: `<textarea>` monoespaçada verde/preta editável; badge "EDITADO"; botões "Regenerar" (só quando editado) e "Copiar"; rodapé listando os placeholders `{{chave}}` dos campos ativos.

## Regras

- Sem novas dependências, sem migração de banco (campo `corpo_zpl` já existe).
- Não remover código existente; não alterar componentes de Preview (`EtiquetaVolumePreview`, `EtiquetaHUPreview`, etc.).
- Não alterar `handleCreateNew` — novos templates nascem com `corpo_zpl = null` e o auto-gerador preenche.
- Placeholders usam a chave exata dos campos ativos do template.
