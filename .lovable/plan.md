

## Plano: Atribuição de Tarefas — Visibilidade e Reatribuição

### Contexto técnico descoberto
- `tarefa.id_documento_origem` aponta para `movimento_saida_item.id` (origem `MOVIMENTO_SAIDA_ITEM`) ou `movimento_entrada_item.id` (origem `MOVIMENTO_ENTRADA_ITEM`).
- `tarefa_execucao.status` ∈ `COLETA_PENDENTE | CONCLUIDA | CANCELADA`. Atribuição ativa = `COLETA_PENDENTE`.
- Telas usam views `vw_movimento_saida_lista` e `vw_movimento_entrada_lista` (sem dados de operador ainda).

---

### 1. Exibir operador atribuído abaixo do status (ambas as telas)

**Ondas de Carregamento** (`MovimentoSaidaPage.tsx`):
- Após carregar a lista paginada, executar 1 query agregada para os IDs visíveis:
  - `tarefa_execucao` ⨝ `tarefa` ⨝ `movimento_saida_item` ⨝ `usuario`
  - Filtro: `te.status = 'COLETA_PENDENTE'` AND `msi.movimento_saida_id IN (...)`
  - Agrupar por `movimento_saida_id` → lista de nomes distintos.
- Acrescentar `operadores_atribuidos: string[]` em `MovSaida`.
- Renderizar abaixo do status com ícone `Users` (lucide).

**Movimento de Entrada** (`MovimentoEntradaPage.tsx`):
- Mesma lógica via `movimento_entrada_item`.

**Layout proposto**:
```text
Onda #55                    [Em Separação]
FORNECEDOR B                👤 João Silva
Box: A1 • 09/04/2026
```
- Sem atribuição → linha **oculta** (mantém o card limpo).
- Múltiplos → "**João Silva +2**" com tooltip listando todos.

---

### 2. Nova opção "Reatribuir tarefas" (somente Ondas de Carregamento)

**Disparo**: novo item no menu `MoreVertical` da onda, abaixo de "Prioridade":
- Label: `Reatribuir tarefas` (ícone `UserCog`).
- Habilitado quando existir ≥ 1 `tarefa_execucao` com `status='COLETA_PENDENTE'` na onda.

**Modal de reatribuição**:
1. Lista das tarefas pendentes agrupadas por **operador atual**, com checkbox por operador (escopo: trocar tudo de um operador específico de uma vez — atende cenários de ausência).
2. Para tarefas com `iniciado_em IS NOT NULL`: marcar com badge "Em andamento" e exigir confirmação adicional.
3. Select do **novo operador** carregado de `usuario` (ativo, mesmo `tenant_id`/`empresa_id`, `tipo_usuario` operacional).
4. Botão "Confirmar reatribuição".

**Lógica de reatribuição** (transação no client em sequência):
Para cada `tarefa_execucao` afetada:
1. **Cancelar a execução atual** do usuário antigo:
   - `UPDATE tarefa_execucao SET status='CANCELADA', concluido_em=nowBrasilia() WHERE id=...`
   - O Coletor filtra por `status='COLETA_PENDENTE'` + `usuario_id`, então o usuário antigo deixa de ver imediatamente.
2. **Criar nova execução** para o novo usuário:
   - `INSERT INTO tarefa_execucao (tarefa_id, usuario_id, status, atribuido_em, tenant_id)` com `status='COLETA_PENDENTE'`, `atribuido_em=nowBrasilia()`.
3. Toast: `"X tarefa(s) reatribuída(s) para FULANO"`.
4. Refresh da lista para atualizar nomes.

**Por que cancelar + recriar** (em vez de `UPDATE usuario_id`):
- Preserva auditoria (sabemos quem teve a tarefa antes).
- LMS calcula por execução; cancelamentos não contam como concluídos.
- Alinha com o padrão já adotado: `tarefa_execucao` não é deletada (memory `integridade-execucao`).

---

### 3. Decisões adotadas (sem mais perguntas — padrões já estabelecidos no sistema)
- **Sem atribuição** → ocultar a linha (alinha com design enxuto do card).
- **Múltiplos operadores** → primeiro nome + `+N` com tooltip (compacto).
- **Tarefa já INICIADA** → permitir, mas exibir badge "Em andamento" no modal e exigir confirmação extra antes de cancelar o progresso (mantém flexibilidade operacional sem surpreender o usuário).
- **Escopo** → permitir selecionar por operador atual (cobre o caso 1-operador automaticamente e permite trocar parcialmente quando há vários).

---

### 4. Detalhes técnicos
- **Sem alterações de schema** — apenas tabelas existentes (`tarefa_execucao`, `tarefa`, `movimento_saida_item`, `movimento_entrada_item`, `usuario`).
- Timestamps via `nowBrasilia()` (memory padrão).
- Modal com `Dialog` shadcn, select de usuário com `usuario` ativo + tenant + empresa.
- 1 query agregada por refresh da lista (não N+1) — performance preservada.

### Arquivos modificados
- `src/pages/MovimentoSaidaPage.tsx` — exibir operadores + nova opção "Reatribuir tarefas" + modal.
- `src/pages/MovimentoEntradaPage.tsx` — exibir operadores (apenas leitura).

