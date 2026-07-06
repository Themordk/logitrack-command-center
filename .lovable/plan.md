## Plano: Ciclo de Tarefas no Pular Endereço (Coletor Separação)

### Contexto
Na tela `/coletor/separacao/endereco`, o botão **Pular Endereço** atualmente para ao chegar na última tarefa e exibe um toast. O usuário quer que, ao clicar novamente no último endereço, o sistema **retorne ao início da ordem** (primeira tarefa).

### Implementação
- Ajustar a função `handlePular` em `src/pages/coletor/SeparacaoEnderecoPage.tsx`:
  - Quando `nextIdx >= tarefas.length`, em vez de toast + `return`, definir `currentIdx = 0` e salvar no `sessionStorage`.
  - O toast será atualizado para informar que retornou ao início.

### Arquivos
- `src/pages/coletor/SeparacaoEnderecoPage.tsx` (apenas a função `handlePular`, ~10 linhas)

### Critérios de Aceitação
1. Ao clicar "Pular Endereço" na última tarefa, o índice volta para `0`.
2. A interface exibe a primeira tarefa novamente.
3. O `sessionStorage` (`coletor_separacao_tarefa_idx`) é atualizado corretamente.
4. Sem alterações em lógica de negócio, RPCs ou banco de dados.