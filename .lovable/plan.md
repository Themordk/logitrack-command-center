## Plano: Tratar capacidade excedida do picking na armazenagem

Único arquivo alterado: `src/pages/coletor/ArmazenagemExecucaoPage.tsx`.

### Alterações

1. **Novos estados** (junto aos existentes): `showCapModal: boolean` e `capInfo: { maximo, saldoAtual, cabeMais } | null`.

2. **Helper `parseCapacidadeMsg(msg)`** — extrai `Máximo`, `Saldo atual` e `Cabe mais` da mensagem P0002 via regex; retorna `null` se não casar.

3. **`handleConfirm` — bloco `catch`**: se `err.code === "P0002"` ou a mensagem contém "Capacidade do picking excedida":
   - Parseia a mensagem.
   - Se `cabeMais > 0` → abre o modal (`setCapInfo`, `setShowCapModal(true)`).
   - Se `cabeMais === 0` → overlay `warning` "Picking cheio. Armazene em um endereço de pulmão."
   - Caso contrário mantém o overlay `error` atual.

4. **Ações do modal**:
   - `handleArmazenarParcial`: lê `coletor_armazenagem_fator` do sessionStorage; se fator > 1, preenche o campo com `Math.floor(cabeMais / fator)`, senão com `cabeMais`. Fecha o modal. **Não** re-submete — operador confirma manualmente.
   - `handleAlterarEndereco`: limpa `enderecoId`, `enderecoDesc`, `enderecoScan`; fecha o modal.

5. **JSX do modal** — inline, antes do fechamento `</ColetorLayout>`, overlay fixo `z-[999]` com fundo `bg-black/70`. Cartão com ícone `AlertTriangle` (já importado), título, três blocos (Máximo / Saldo atual / Cabe mais) e dois `ActionButton`:
   - `ARMAZENAR {cabeMais} UN. NO PICKING` (primary) — só quando `cabeMais > 0`.
   - `ALTERAR ENDEREÇO (PULMÃO)` (secondary).

### Fora de escopo

Sem novos componentes/páginas/rotas/RPCs, sem libs de dialog, sem alterar `finalizar_armazenagem` ou qualquer outra página, sem auto-resubmit.
