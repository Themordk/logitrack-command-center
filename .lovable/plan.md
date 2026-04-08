

# Plano: Atualizações de Abastecimento, Ondas e Coletor

## Resumo

Ajustar o campo `prioridade` -> `prioridade_tarefa` na tabela `tarefa`, adicionar coluna editável de prioridade nas tarefas de abastecimento, implementar ações de abastecimento/corte na liberação de ondas, e melhorar o fluxo de abastecimento no coletor com seleção múltipla, informações detalhadas e persistência de coletas.

---

## Pré-requisito: Campo PRIORIDADE -> PRIORIDADE_TAREFA

O campo `prioridade` foi removido e substituído por `prioridade_tarefa` (tipo `enum_prioridade_onda`) na tabela `tarefa`.

**Arquivo afetado:**
- `src/pages/coletor/TransferenciaDestinoPage.tsx` (linha 71): trocar `prioridade: 1` por `prioridade_tarefa: "NORMAL"`

---

## 1. Tarefas de Abastecimento — Coluna Prioridade Editável

**Arquivo:** `src/pages/AbastecimentoDetalhePage.tsx`

- Adicionar `prioridade_tarefa` ao select da query de tarefas
- Adicionar coluna "Prioridade" na tabela com Badge colorido (mesmo padrão do `MovimentoSaidaPage`)
- Ao clicar no Badge de prioridade, abrir um Dialog com as 4 opções (URGENTE, ALTA, NORMAL, BAIXA) — mesmo componente visual usado em `MovimentoSaidaPage` (linhas 815-846)
- Ao salvar, fazer `update` na tabela `tarefa` com o novo valor de `prioridade_tarefa`

---

## 2. Liberação de Ondas — Ações para Saldo Picking Insuficiente

**Arquivo:** `src/pages/MovimentoSaidaPage.tsx`

Na dialog de ocorrências de liberação (linhas 748-812), quando `tipo_ocorrencia === "saldo_insuficiente_picking"`:

### 2.1 Coluna "Saldo Pulmão"
- Para cada item da ocorrência, consultar `estoque_geral` somando `quantidade_disponivel` dos endereços do tipo PULMÃO (`endereco.tipo_endereco = 'PULMAO'`) para o `produto_id`
- Exibir o saldo na tabela como nova coluna

### 2.2 Botão "Gerar Abastecimento Preventivo" (por item)
- Se saldo pulmão > 0: habilitar botão azul para chamar `fn_gerar_abastecimento` com `p_simular = false` passando o item específico via `p_itens`
- Botão já existe globalmente (linha 802), será adaptado para funcionar por item quando houver saldo

### 2.3 Botão "Cortar" (vermelho, por item)
- Se saldo pulmão = 0: exibir botão vermelho "Cortar"
- Ao clicar, abrir dialog de confirmação solicitando motivo de ocorrência (select carregado de `motivo_ocorrencia`)
- Ao confirmar, fazer `update` em `movimento_saida_item`:
  - `qtde_cortada` = `qtd_esperada` (ou valor informado)
  - `motivo_ocorrencia` = UUID selecionado
  - `usuario_autorizou` = `usuarioId`
  - `autorizado_em` = `now()`
- Filtrar o item correto via `movimento_saida_id` + `produto_id`

---

## 3. Coletor — Abastecimento

### 3.1 Seleção Múltipla de Tarefas

**Arquivo:** `src/pages/coletor/AbastecimentoListPage.tsx`

- Adicionar checkbox em cada card de tarefa
- Adicionar botão flutuante "Iniciar Coleta (N selecionadas)" no rodapé
- Ao iniciar, salvar apenas as tarefas selecionadas no `sessionStorage` ordenadas por `endereco_destino_rua` ASC (rua do endereço destino)
- Se nenhuma selecionada, exibir toast de aviso

### 3.2 Informações do Item na Coleta

**Arquivo:** `src/pages/coletor/AbastecimentoColetaPage.tsx`

**Ao escanear endereço (step 2 — antes do scan produto):**
- Exibir container com informações do item esperado: SKU, Referência (`produto.referencia`), Descrição
- Incluir `referencia` no select do produto e no `TarefaInfo`

**Ao confirmar produto (step 3):**
- Container de produto: SKU, Referência, Descrição, Fator (do EAN confirmado, buscar `produto_embalagem.fator`)
- Novo container abaixo com: Qtd a Abastecer (requerida - executada), Qtd Coletada (soma das coletas locais), Qtd Abastecida (executada)
- Incluir `fator` no state ao confirmar scan do produto via `produto_embalagem`

### 3.3 Persistência de Coletas vinculada à Tarefa

**Mecanismo de controle:**
- Ao confirmar coleta, além de salvar no `sessionStorage`, inserir registro na tabela `tarefa_execucao` com status `COLETA_PENDENTE` (ou usar um campo de controle), vinculando `tarefa_id`, `usuario_id`, `quantidade_executada`, `endereco_origem_id`
- Ao iniciar a tela de coleta, verificar se existem `tarefa_execucao` pendentes no banco para as tarefas selecionadas e carregar como coletas existentes
- Isso garante que se o app fechar, as coletas não sejam perdidas

### 3.4 Trava contra Bloqueio Duplicado de Saldo

**Arquivo:** `src/pages/coletor/AbastecimentoColetaPage.tsx`

- Antes de bloquear saldo em `estoque_geral`, verificar se já existe uma coleta (no banco) para o mesmo `tarefa_id` + `endereco_id` + `produto_id` com status pendente
- Se já existir coleta com a quantidade total requerida, impedir novo bloqueio
- Usar a soma de `tarefa_execucao` pendentes para calcular o saldo já bloqueado e subtrair do disponível

---

## Arquivos Modificados (Resumo)

| Arquivo | Alteração |
|---|---|
| `src/pages/coletor/TransferenciaDestinoPage.tsx` | `prioridade` -> `prioridade_tarefa` |
| `src/pages/AbastecimentoDetalhePage.tsx` | Coluna prioridade editável |
| `src/pages/MovimentoSaidaPage.tsx` | Saldo pulmão + botões abastecimento/corte por item |
| `src/pages/coletor/AbastecimentoListPage.tsx` | Seleção múltipla + ordenação por rua |
| `src/pages/coletor/AbastecimentoColetaPage.tsx` | Info detalhada do produto + persistência + trava duplicidade |

## Observações

- Nenhuma migration SQL necessária (o campo `prioridade_tarefa` já existe no banco)
- A persistência de coletas no banco (item 3.3) é essencial para evitar perda de dados e bloqueios órfãos em `estoque_geral`
- O corte (item 2.3) afeta diretamente o relatório de Cortes recém-criado

