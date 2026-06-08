# Plan — Checkout por FATOR + refresh imediato dos contadores

Arquivo único: `src/pages/coletor/ConferenciaProdutoPage.tsx`.

## Diagnóstico

### Falha 1 — Contadores ainda não atualizam ao escanear

Apesar de o plano anterior ter movido `setQtdConferida` para fora do `if (tarefaAtualizada)`, o usuário continua vendo CONFERIDA = 0 logo após o scan. Causas reais:

- O `StatusOverlay` (full-screen ~800 ms) é disparado **imediatamente** após o `setQtdConferida`, cobrindo a tela antes do React pintar o novo valor. Quando o overlay sai, em muitos casos o `pendingNextRef` troca a tarefa atual (`loadTarefa(next)` chama `setQtdConferida(Number(t.conferido || 0))` — e como o `newTarefas[tarefaIdx]` foi atualizado mas o `t.conferido` pode estar zerado na próxima, parece que "voltou a zero").
- Em modo checkout (1 tarefa por scan), a chamada `setEanScanned("")` + `setEmbalagemInfo(null)` + `setEanConfirmado(false)` ocorre **antes** do `setQtdConferida`, e o React faz batch — porém o overlay tampa a UI. O usuário literalmente nunca vê o número novo.

### Falha 2 — Checkout está conferindo o restante inteiro

Hoje, em `handleEanScan`, quando `modoCheckout = true`:

```ts
await executarConfirmacao(restanteAtual, "checkout");
```

Isso lança a quantidade total que falta de uma vez. O correto é incrementar **pelo fator da embalagem escaneada** (`produto_embalagem.fator`), permitindo múltiplos scans:

- EAN da caixa (fator 12) → +12 unidades.
- EAN do display (fator 6) → +6 unidades.
- EAN da unidade (fator 1) → +1 unidade.

A conferência só finaliza quando `qtdConferida >= qtdRequerida` (após N scans).

## Mudanças

### A. Checkout passa a usar `fator` por scan

Em `handleEanScan`, bloco `if (modoCheckout)`:

```ts
const fator = Number(emb.fator || 1);
const restanteAtual = reqAtual - confAtual;
if (restanteAtual <= 0) { /* já conferido */ return; }
// Incrementa pelo fator, sem ultrapassar o restante
const qtdIncremento = Math.min(fator, restanteAtual);
await executarConfirmacao(qtdIncremento, "checkout");
```

Isso preserva o RPC atual (que recebe quantidade absoluta a adicionar) e permite scans sucessivos.

### B. Garantir que o usuário VEJA o contador atualizado

1. Mostrar o overlay **somente depois** do paint dos contadores. Trocar a sequência em `executarConfirmacao`:
   - `setQtdConferida(newQtdConferida)` + `setTarefas(newTarefas)` primeiro.
   - `requestAnimationFrame(() => setOverlay({...}))` para garantir um frame de renderização antes do overlay full-screen aparecer.
2. **Não trocar de tarefa enquanto o overlay está visível**. Hoje `handleOverlayDone` chama `loadTarefa(next)` que zera `qtdConferida` para o estado da próxima tarefa — correto, mas precisa acontecer só após o overlay sair. Já está; apenas garantir que o overlay de "Item conferido — próximo" use a mesma técnica de `requestAnimationFrame` para mostrar `CONFERIDA = REQUERIDA` da tarefa atual antes da troca.
3. Reduzir a duração do overlay de sucesso intermediário (não-final) para ~500 ms para o usuário enxergar o número rapidamente. Manter 800 ms só no encerramento da onda.

### C. Pequenos ajustes correlatos

- No fallback `Number(execFromDb ?? (qtdConferida + qtdFinal))`, usar `qtdConferida` do estado lido no início da função (já está OK), garantindo soma correta em scans rápidos sucessivos no checkout.
- Em `loadTarefa`, ler `t.conferido ?? t.separado ?? 0` (não `||`) para não zerar quando `0`.

## Fora de escopo

- RPC, migrations, edge functions: sem alterações.
- Modo manual continua usando `quantidade * fator` digitada.
- Lógica de finalização da onda (modal "Conferência da Onda #N finalizada com sucesso") permanece como no plano anterior.

## Validação

1. Tarefa com `quantidade_requerida = 24`, EAN da caixa (fator 12).
2. 1º scan → CONFERIDA = 12, RESTANTE = 12, overlay "Item conferido" (~500 ms). Usuário vê o número antes do overlay.
3. 2º scan → CONFERIDA = 24, RESTANTE = 0, overlay 800 ms, modal "Conferência da Onda finalizada com sucesso".
4. Caso misto: scan caixa (fator 12) + scan unidade (fator 1) × 12 → também totaliza 24.
5. Se restante < fator (ex.: restante 5, fator 12) → adiciona somente 5 (cap em restante).
