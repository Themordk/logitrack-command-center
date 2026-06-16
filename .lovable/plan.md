# Otimizar navegação na separação do coletor

Replicar a lógica já aplicada no inventário, agora na rotina de separação (`/coletor/separacao/produto` → próxima tarefa): se o próximo item está no mesmo endereço, manter o operador na tela de produto trocando apenas o conteúdo, em vez de exigir nova leitura de endereço.

## Escopo

Apenas frontend. Sem alterações em RPC, ordenação de tarefas ou na tela `SeparacaoEnderecoPage`.

## Arquivo alterado

`src/pages/coletor/SeparacaoProdutoPage.tsx` — função `advanceToNext` (linhas ~277-293).

## Lógica nova em `advanceToNext`

1. Calcular `nextIdx = idx + 1`.
2. Limpar `coletor_separacao_lote_selecionado` (comportamento atual).
3. Se `nextIdx >= tarefas.length` → encerrar onda, navegar para `/coletor/separacao/iniciar` (comportamento atual).
4. Persistir `coletor_separacao_tarefa_idx = nextIdx`.
5. Comparar endereço da tarefa atual com o da próxima:
   - Chave de comparação: `endereco_alternativo_id || endereco_id`, com fallback para `endereco` (descrição) quando ids ausentes.
6. **Mesmo endereço:**
   - Atualizar `coletor_separacao_tarefa_atual` no sessionStorage com `tarefas[nextIdx]`.
   - `setTarefa(proxima)` e resetar estados locais: `eanScanned`, `embalagemInfo`, `eanConfirmado`, `quantidade`, `qtdSeparada` (a partir de `proxima.separado || 0`), `loteSel`, `produtoId`, `referencia`, `enderecoId`.
   - Reexecutar resolução de produto (`fetchProdutoDetails`/`fetchProdutoBySku`) e endereço, igual ao `useEffect` inicial.
   - Toast informando o próximo produto.
   - **Permanecer em `/coletor/separacao/produto`** (sem `onNavigate`).
7. **Endereços diferentes:** comportamento atual — `onNavigate("/coletor/separacao/endereco")`.

## Fora de escopo

- `SeparacaoEnderecoPage`, `SeparacaoLotePage`, RPCs e ordenação das tarefas na onda.
