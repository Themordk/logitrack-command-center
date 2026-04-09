
## Plan: Optimize Separation Screens to Reduce Scrolling

### Summary
Reduce scrolling on two collector separation screens by hiding non-essential info, making buttons floating, and compacting the product scan field.

---

### 1. SeparacaoEnderecoPage (Scan Endereco)

**File:** `src/pages/coletor/SeparacaoEnderecoPage.tsx`

**1.1 Hide product container** — Remove the "Product preview" card (lines ~219-226) from the rendered output. The product data is already stored in `tarefa` and passed via sessionStorage, so no data is lost for the next route.

**1.2 Floating "Pular Endereço" button** — Move the skip button out of the scrollable `flex-col` container and position it as a fixed floating button at the bottom of the screen, matching the pattern from `AbastecimentoListPage.tsx`:
```
<div className="fixed bottom-6 left-4 right-4 z-50 max-w-lg mx-auto">
  <ActionButton onClick={handlePular} variant="secondary">
    <SkipForward size={18} /> Pular Endereço
  </ActionButton>
</div>
```
Add `pb-24` padding to the main content to avoid overlap.

---

### 2. SeparacaoProdutoPage (Scan Produto)

**File:** `src/pages/coletor/SeparacaoProdutoPage.tsx`

**2.1 Floating "Confirmar Quantidade" button** — Move the confirm button to a fixed bottom position with the same pattern:
```
<div className="fixed bottom-6 left-4 right-4 z-50 max-w-lg mx-auto">
  <ActionButton ...>Confirmar Quantidade</ActionButton>
</div>
```
Add bottom padding to main content.

**2.2 Move "Ocorrências" button** — Remove the full-width warning ActionButton at the bottom. Instead, place a small icon-only button (yellow background, white `AlertTriangle` icon) inside the product info card header, aligned to the right:
```
<button
  onClick={() => onNavigate("/coletor/separacao/ocorrencias")}
  className="w-8 h-8 rounded-lg bg-[#F59E0B] flex items-center justify-center"
>
  <AlertTriangle size={16} className="text-white" />
</button>
```

**2.3 Reduce ScanField size by 25%** — Apply a `scale-[0.75]` wrapper or reduce the internal padding/icon size of the ScanField specifically on this page. Preferred approach: wrap the ScanField in a container with reduced padding and smaller icon/text via a `compact` className or inline style override, keeping the component reusable. Concretely, wrap in `<div className="transform scale-[0.75] origin-top">` to shrink it 25%.

---

### Files Modified
- `src/pages/coletor/SeparacaoEnderecoPage.tsx`
- `src/pages/coletor/SeparacaoProdutoPage.tsx`
