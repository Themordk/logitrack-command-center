
## Objetivo
Refletir visualmente na UI de Movimento de Saída quais itens foram auto-separados via picking tipo PDV. Mudanças puramente visuais + ajuste de contrato de dados (RPC/view + toast). Nenhuma nova lógica de negócio.

## Arquivos afetados
1. Migração Supabase — alterar RPC `buscar_itens_onda_carregamento` e view `vw_movimento_saida_separacao_detalhe` para expor `auto_separacao`.
2. `src/pages/MovimentoSaidaPage.tsx` — interfaces, badges e toast.

## Mudanças

### 1. Backend (migration)
- **RPC `buscar_itens_onda_carregamento`**: adicionar no SELECT/GROUP a coluna `auto_separacao` derivada de:
  `COALESCE(BOOL_OR(CASE WHEN tt.codigo = 'SEP' THEN t.auto_separacao ELSE false END), false) AS auto_separacao`.
  O JOIN com `tarefa t` já existe.
- **View `vw_movimento_saida_separacao_detalhe`**: adicionar `t.auto_separacao` no SELECT (JOIN com `tarefa t` já existe). Recriar a view via `CREATE OR REPLACE VIEW`.

### 2. MovimentoSaidaPage.tsx

**Interfaces**
- `OndaCarregamentoItem`: adicionar `auto_separacao: boolean`.
- Interface do detalhe de separação (linha da tab Separação): adicionar `auto_separacao: boolean`.
- `LiberarResult`: adicionar campos opcionais `pdv?: { total_itens_pdv; total_auto_separados; total_parciais; total_sem_saldo; mensagem }` e `todas_separadas?: boolean`.

**Tab "Itens"**
- Na célula de Status, renderizar antes do badge de status:
  ```tsx
  {item.auto_separacao && (
    <span className="text-[10px] px-2 py-0.5 rounded-full border bg-purple-500/15 text-purple-400 border-purple-500/30 mr-1">PDV</span>
  )}
  ```

**Tab "Separação"**
- Coluna Operador: se `item.auto_separacao`, renderizar badge "Auto PDV" (mesmas classes purple) em vez do nome; caso contrário mantém `item.operador || "—"`.

**`handleLiberar`**
- Após `if (result.sucesso)`, se `result.pdv?.total_itens_pdv > 0`, montar toast enriquecido com `total_auto_separados`, `total_parciais`, `total_sem_saldo` (duração 6s). Caso contrário, toast atual.
- Após `fetchMovimentos()`, se `result.todas_separadas`, atualizar `selectedMov.status` para `"SEPARADO"`; senão `"LIBERADO"` (mantendo comportamento atual quando o campo não vier).

## Fora de escopo
- Nenhuma nova RPC/edge function/página/modal.
- Nenhuma alteração no fluxo de separação, conferência ou corte.
- Nenhuma alteração de layout além dos badges inline.

## Observação sobre tokens de cor
O projeto padroniza cores via tokens semânticos (proibindo utilitários hardcoded como `text-white`, `bg-purple-*`). O spec pede explicitamente a paleta `purple-500/15|400|500/30` para diferenciar PDV. Vou seguir o spec literalmente conforme solicitado; se preferir, posso substituir por um token semântico novo (`--status-auto-pdv`) definido em `index.css` — me diga antes de implementar caso queira essa variação.
