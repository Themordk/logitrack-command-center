
## Objetivo

Corrigir dois problemas nos templates de etiqueta:
1. Ao escolher "Vertical" na tela de templates, a etiqueta continua renderizando como horizontal porque `largura_mm`/`altura_mm` não são trocados.
2. Seta direcional, 2 colunas e intervalo devem ser **decisões de impressão** (editáveis no modal de imprimir), com defaults vindos do template.

## Etapas

### 1. `src/pages/EtiquetaTemplatesPage.tsx` — troca automática ao mudar orientação

- No `onChange` do select "Orientação", quando a nova orientação diferir da atual, trocar `largura_mm` ↔ `altura_mm` no mesmo `setDraft`.
- Validação leve (não bloqueante): se `orientacao === "vertical"` e `largura_mm >= altura_mm`, ou vice-versa, apenas exibir um `text-muted-foreground` inline avisando divergência (não força correção).
- Nos blocos de "Direção da Seta", "Impressão em 2 colunas" e "Intervalo (mm)", adicionar rodapé:
  ```
  Valores padrão para impressão. O operador pode alterá-los no momento de imprimir.
  ```

### 2. `src/components/etiqueta/thermalEngine.ts` — `orientation` derivada das dimensões reais

Em `getTemplateFromConfig`, quando `largura_mm`/`altura_mm` presentes:
- Substituir `orientation: config.orientacao || (widthMm >= heightMm ? "horizontal" : "vertical")` por `orientation: heightMm > widthMm ? "vertical" : "horizontal"` (dimensão manda, ignora o campo `orientacao` para o rótulo físico).
- Ajustar `barcode.height` para `isSmall ? 60 : Math.min(120, heightPx * 0.15)` (evita barcode maior que 15% da altura em rótulos verticais).

### 3. `src/components/etiqueta/EtiquetaEnderecoPreview.tsx` — dispatcher usa `template.orientation`

Verificar/garantir que `EtiquetaSingle` escolhe `TemplateVertical` vs `TemplateHorizontal` via `template.orientation === "vertical"` (derivado agora das dimensões reais), não pela prop `orientacao` do modal.

### 4. `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx` — controles editáveis por impressão

Adicionar 3 estados locais com defaults vindos do template no `useEffect` de defaults:
```typescript
const [direcaoSeta, setDirecaoSeta] = useState<"CIMA"|"BAIXO"|"ESQUERDA"|"DIREITA"|"NENHUMA">("NENHUMA");
const [duasColunas, setDuasColunas] = useState(false);
const [intervaloColunasMm, setIntervaloColunasMm] = useState(3);
```
No `useEffect` que aplica `config`: setar `config.direcao_seta ?? "NENHUMA"`, `config.duas_colunas ?? false`, `config.intervalo_colunas_mm ?? 3`.

Nova seção "Opções de impressão" no JSX (após saída), com:
- Select "Seta Direcional" (NENHUMA/CIMA/BAIXO/ESQUERDA/DIREITA).
- Checkbox "Impressão em 2 colunas" + input numérico "Intervalo (mm)" visível só quando ativo.

Em `triggerPrint`: usar os estados locais em vez de `config.duas_colunas` / `config.intervalo_colunas_mm` ao chamar `getPrintCSSFromConfig`.

Nos dois `<EtiquetaEnderecoPreview>` (hidden `printRef` e visível), passar override:
```tsx
config={config ? { ...config, direcao_seta: direcaoSeta, duas_colunas: duasColunas, intervalo_colunas_mm: intervaloColunasMm } : undefined}
```

### 5. Modais HU/Produto/Volume — controles de impressão (sem seta)

Em `PrintEtiquetaHUModal.tsx`, `PrintEtiquetaProdutoModal.tsx`, `PrintEtiquetaVolumeModal.tsx`: espelhar apenas `duasColunas` + `intervaloColunasMm` (sem seta). Aplicar override do `config` na chamada dos previews e no `getPrintCSSFromConfig` do `triggerPrint`.

## Regras

- Retrocompatibilidade preservada: sem `config`, comportamento atual mantido.
- Não modificar `src/components/ui/`, sem novas dependências.
- Alterações no modal de impressão NÃO salvam no template.
- Erros com `parseError` + `toast.error(parsed.title)`.

## Arquivos afetados

**Alterados:** `src/pages/EtiquetaTemplatesPage.tsx`, `src/components/etiqueta/thermalEngine.ts`, `src/components/etiqueta/EtiquetaEnderecoPreview.tsx`, `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx`, `src/components/etiqueta/PrintEtiquetaHUModal.tsx`, `src/components/etiqueta/PrintEtiquetaProdutoModal.tsx`, `src/components/etiqueta/PrintEtiquetaVolumeModal.tsx`.

**Novos:** nenhum.
