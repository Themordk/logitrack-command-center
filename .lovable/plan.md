

## Plan: Three Fixes for Separation, Wave Release, and Replenishment

### 1. SeparacaoProdutoPage — Remove EAN from embalagem + use ScanField component

**File:** `src/pages/coletor/SeparacaoProdutoPage.tsx`

**1.1** Remove the EAN field from the embalagem info container (line 342). Keep only Fator and Embalagem.

**1.2** Replace the custom inline scan input (lines 308-335) with the existing `ScanField` component, which already handles:
- Device type detection (`coletor_tipo_dispositivo` from localStorage)
- `readOnly` toggle to suppress virtual keyboard on hardware scanners
- Sound/vibration feedback via `useFeedback` hook
- Auto-focus behavior

The `ScanField` will be used with the existing `handleScanEan` callback. Import `ScanField` and `useFeedback`, remove the manual `eanInputRef`/`eanInputValue` state, and remove the `ScanLine` import (already in ScanField).

---

### 2. MovimentoSaidaPage — Enable "Retirar da Separação" for EM_PICKING

**File:** `src/pages/MovimentoSaidaPage.tsx`

**Line 560:** Change the disabled condition from:
```
disabled={mov.status !== "LIBERADO"}
```
to:
```
disabled={mov.status !== "LIBERADO" && mov.status !== "EM_PICKING"}
```

This allows the "Retirar da separação" action for movements that are already being picked.

---

### 3. AbastecimentoDestinoPage — Fix duplicate estoque_movimento

**File:** `src/pages/coletor/AbastecimentoDestinoPage.tsx`

**Root cause:** When confirming replenishment, the code:
1. Inserts a `tarefa_execucao` with status `CONCLUIDA` (line 139-152)
2. Manually debits origin stock in `estoque_geral` (lines 154-184)
3. Manually credits destination stock in `estoque_geral` (lines 191-221)
4. Manually inserts into `estoque_movimento` with `tipo_movimento: 6` (lines 236-247)

However, the database has a trigger `trg_tarefa_execucao_estoque` on `tarefa_execucao` INSERT that calls `processar_movimento_estoque()`, which **also** inserts into `estoque_movimento` (using the `tipo_movimento` from `tipo_tarefa`) and **also** updates `estoque_geral` (debit/credit).

This creates duplicate records: one manual (tipo_movimento 6, no tarefa_execucao_id) and one from the trigger (with tarefa_execucao_id, using the tipo_tarefa's tipo_movimento). The estoque_geral is also double-updated.

**Fix:** Remove all manual stock operations from the frontend code (steps 2, 3, and 5 above — lines 154-247). The trigger already handles everything correctly. The code should only:
1. Insert `tarefa_execucao` (keeps line 139-152)
2. Update coleta tracking in local state (keeps lines 179-188)
3. Update `tarefa` status (keeps lines 224-233)

Remove: manual `estoque_geral` debit (lines 154-184), manual `estoque_geral` credit (lines 191-221), and manual `estoque_movimento` insert (lines 236-247).

---

### Files Modified
- `src/pages/coletor/SeparacaoProdutoPage.tsx`
- `src/pages/MovimentoSaidaPage.tsx`
- `src/pages/coletor/AbastecimentoDestinoPage.tsx`

