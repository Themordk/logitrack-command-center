## Objetivo
Evitar nova confirmação de endereço quando ainda existem produtos a contar no mesmo endereço dentro do inventário.

## Comportamento atual
Em `InventarioProdutoPage.handleDialogClose`, após sucesso, incrementa `coletor_inventario_tarefa_idx` e sempre navega para `/coletor/inventario/endereco`.

## Mudança proposta
Arquivo único: `src/pages/coletor/InventarioProdutoPage.tsx` (função `handleDialogClose`).

Lógica nova:
1. Avançar `nextIdx`.
2. Se `nextIdx >= tarefas.length` → comportamento atual (volta para a lista de inventários).
3. Pegar `proxima = tarefas[nextIdx]` e a tarefa atual.
4. Comparar o endereço da próxima tarefa com o da atual (`endereco_id || id_local_origem`, com fallback em `codigo_endereco`).
   - **Mesmo endereço**: atualizar `coletor_inventario_tarefa_atual` no sessionStorage com `proxima`, atualizar `setTarefa(proxima)`, resetar estados locais (`eanScanned`, `embalagemInfo`, `eanConfirmado`, `quantidade`) e permanecer na rota `/coletor/inventario/produto`. Exibir toast informando próximo produto.
   - **Endereço diferente**: comportamento atual — navegar para `/coletor/inventario/endereco` (a página de endereço já lê `tarefa_idx` e exigirá nova confirmação).

## Fora do escopo
- Não alterar `InventarioEnderecoPage` nem a RPC.
- Não alterar a ordenação das tarefas (assume-se que já vêm agrupadas por endereço; caso não estejam, a otimização simplesmente não dispara).
