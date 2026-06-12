# Conferência livre por EAN na rota `coletor/conferencia/produto`

## Objetivo
Permitir que o operador escaneie o EAN de **qualquer produto vinculado à onda em conferência**, e não apenas o item que a UI está exibindo. Ao escanear, o sistema localiza a tarefa correspondente (mesma onda / `movimento_saida`) e habilita confirmação manual ou checkout, conforme o modo já existente.

## Comportamento atual (a corrigir)
- A página fixa um `tarefaIdx` (item atual) e, no `handleEanScan`, valida que o EAN pertence ao `produtoId` daquele item específico. Qualquer outro EAN dispara o diálogo "EAN Incorreto", mesmo que o produto pertença à mesma onda.

## Comportamento desejado
1. Operador escaneia EAN.
2. Sistema identifica o produto do EAN.
3. Sistema procura, na lista de tarefas da onda (já carregada em `sessionStorage`), uma tarefa **com o mesmo `produto_id` e ainda pendente** (`conferido < quantidade_requerida` e `status != CONCLUIDA`).
4. Se encontrar → torna essa tarefa o item ativo da UI (atualiza header Produto, contadores Requerida/Conferida/Restante, embalagem) e:
   - **Modo Checkout**: confirma automaticamente pelo fator da embalagem (lógica atual).
   - **Modo Manual**: foca o campo Quantidade.
5. Se o EAN existir mas o produto **não estiver na onda** → diálogo "EAN não pertence a esta conferência".
6. Se todas as tarefas desse produto já estiverem concluídas → toast "Item já conferido".
7. Se o EAN não existir em `produto_embalagem` → diálogo "EAN não cadastrado" (mantém atual).

## Mudanças (apenas frontend)

### `src/pages/coletor/ConferenciaProdutoPage.tsx`
- Reescrever `handleEanScan`:
  - 1 consulta: `produto_embalagem.select('ean,fator,embalagem,produto_id').eq('ean', ean).maybeSingle()` (substitui as 2 consultas atuais — ganho de performance).
  - Localizar índice da tarefa pendente no array `tarefas` com `produto_id === emb.produto_id`. Empate: primeiro pendente. Se não houver pendente mas existir alguma com aquele produto → "Item já conferido". Se nenhuma → "EAN não pertence a esta conferência".
  - Se índice ≠ `tarefaIdx`, alternar item ativo: `setTarefaIdx(novoIdx)`, atualizar `sessionStorage('coletor_conferencia_tarefa_idx')`, recarregar dados via `loadTarefa(tarefas[novoIdx])` **antes** de seguir com a confirmação/foco.
  - Manter `markTarefaIniciadaByTarefa` usando o `tarefa_id` da tarefa recém-selecionada.
- Atualizar o card "Produto" para refletir a tarefa ativa após troca (já é reativo a `tarefa = tarefas[tarefaIdx]`, basta garantir a ordem das atualizações).
- Ajustar a lógica de "próxima tarefa" em `executarConfirmacao` (já existe) para continuar funcionando — sem mudanças estruturais.
- Mensagens do `showEanErroDialog` parametrizadas (novo state `eanErroMsg`) para diferenciar "não cadastrado" vs "não pertence à onda".

### Sem mudanças
- Sem alteração em RPCs, migrations, serviços ou outras telas.
- A `ConferenciaItensPage` continua igual; o operador pode abrir "Visualizar Itens" para conferir o que falta.

## Performance
- Consulta de EAN cai de 2 → 1 chamada Supabase.
- Busca da tarefa correspondente é em memória (`tarefas` já está em `sessionStorage`).
- Nenhum refetch adicional ao trocar de item ativo (somente `fetchProdutoDetails` por `produto_id` já existente — pode ser pulado se a tarefa já trouxer `referencia`; manter como hoje para não regredir).

## UX
- Header e contadores atualizam automaticamente para o produto escaneado.
- Em modo Checkout o feedback visual de troca + confirmação é instantâneo (mesmo overlay atual).
- Em modo Manual o cursor pula direto para Quantidade após a troca.
- Diálogos de erro distinguem o motivo da rejeição.

## Validação
- Onda com 2+ itens: escanear EAN do 2º produto direto → UI muda para esse item e habilita confirmação.
- Modo Checkout: escanear EAN avança a quantidade pelo fator e segue para o próximo pendente.
- EAN de produto fora da onda → diálogo correto.
- EAN inválido → diálogo correto.
- Após concluir todas as tarefas, segue fluxo de "Onda finalizada".
