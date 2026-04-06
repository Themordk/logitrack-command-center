

# Plano: Ajustes no Fluxo de Abastecimento (WEB + Coletor)

## 1. Fix enum `tipo_convocacao` no insert de `tarefa_atribuicao`

**Problema**: O valor `"MANUAL"` nao existe no enum `enum_tipo_convocacao`. Valores validos: `AUTO_CONVOCADO`, `CONVOCACAO_GESTOR`, `CONVOCACAO_ATIVA`.

**Solucao**: Em `AbastecimentoGeracaoPage.tsx` linha 210, trocar `tipo_convocacao: "MANUAL"` por `tipo_convocacao: "CONVOCACAO_GESTOR"`.

Arquivo: `src/pages/AbastecimentoGeracaoPage.tsx`

---

## 2. Nova rota WEB para visualizar tarefas de um abastecimento

Substituir o modal de detalhe (`detailOpen`) por navegacao para rota dedicada.

### 2.1 Nova pagina `AbastecimentoDetalhePage.tsx`

Rota: `/atividades/abastecimento/:id/tarefas`

- Layout similar a `AbastecimentoGeracaoPage` (tabela com header e botao voltar)
- Colunas: SKU, Descricao, Requerida, Executada, Origem, Destino, Status, Cancelar
- Botao "Cancelar" por linha: atualiza `tarefa.status = 'CANCELADA'` para tarefas com status `CRIADA` ou `ATRIBUIDA`
- Query: `tarefa` filtrada por `id_documento_origem = abastId` com JOINs em produto e endereco

### 2.2 Ajustar `AbastecimentoPage.tsx`

- Remover modal de detalhe
- Botao Eye navega para `/atividades/abastecimento/${row.id}/tarefas`

### 2.3 Registrar rota em `App.tsx`

- Import + dynamic route match em `renderPage`
- Breadcrumb dinamico em `getDynamicBreadcrumb`

Arquivos: novo `src/pages/AbastecimentoDetalhePage.tsx`, editar `AbastecimentoPage.tsx`, `App.tsx`

---

## 3. Fluxo de abastecimento no Coletor (3 novas paginas)

O fluxo substitui a listagem simples por um processo de coleta e destino em etapas.

```text
AbastecimentoListPage (lista tarefas pendentes)
  └─ Selecionar tarefa → navega para /coletor/movimentos/abastecimento/coleta

AbastecimentoColetaPage (Rota A)
  ├─ Scan Endereco Origem → valida vs tarefa
  ├─ Scan Produto (EAN/SKU) → valida vs tarefa
  ├─ Input quantidade
  ├─ Botao "Confirmar Coleta" → bloqueia saldo em estoque_geral (quantidade_bloqueada += qty, quantidade_disponivel -= qty)
  ├─ Lista de coletas realizadas (pode coletar de varios enderecos)
  └─ Botao "Abastecer" → navega para /coletor/movimentos/abastecimento/destino

AbastecimentoDestinoPage (Rota B)
  ├─ Lista enderecos de destino ordenados por proximidade (rua ASC)
  ├─ Scan Endereco Destino → valida vs tarefa
  ├─ Scan Produto → valida
  ├─ Input quantidade
  ├─ Botao "Confirmar Abastecimento":
  │   - Cria tarefa_execucao (status CONCLUIDA)
  │   - Atualiza estoque_geral: origem (desbloqueio, baixa) e destino (credito)
  │   - Atualiza tarefa.quantidade_executada
  │   - Navega para proximo destino pendente
  ├─ Se nao ha mais destinos mas ha coletas pendentes → volta para /coleta
  └─ Se tudo concluido → mensagem sucesso → navega /coletor/movimentos/abastecimento
```

### 3.1 `AbastecimentoColetaPage.tsx`

- Recebe `tarefa_id` via sessionStorage
- ScanField para endereco origem (valida contra `id_local_origem` da tarefa)
- ScanField para produto (valida EAN/SKU contra `produto_id` da tarefa)
- Input numerico para quantidade
- Ao confirmar coleta: `UPDATE estoque_geral SET quantidade_bloqueada = quantidade_bloqueada + qty, quantidade_disponivel = quantidade_disponivel - qty WHERE endereco_id = origem AND produto_id = X`
- Armazena coletas em sessionStorage como array
- Botao "Abastecer" habilitado quando ha pelo menos 1 coleta

### 3.2 `AbastecimentoDestinoPage.tsx`

- Le coletas do sessionStorage
- Lista enderecos destino pendentes ordenados por `rua ASC` (proximidade)
- ScanField para endereco destino + produto + quantidade
- Ao confirmar:
  - INSERT em `tarefa_execucao` (status CONCLUIDA, quantidades, endereco_origem, endereco_destino)
  - UPDATE `estoque_geral` origem: `quantidade_bloqueada -= qty, quantidade_total -= qty`
  - UPSERT `estoque_geral` destino: credita quantidade
  - UPDATE `tarefa.quantidade_executada += qty`
  - Se tarefa completa: UPDATE `tarefa.status = 'CONCLUIDA'`
- Navega para proximo destino, ou volta para coleta, ou finaliza

### 3.3 Ajustar `AbastecimentoListPage.tsx`

- Ao clicar em uma tarefa, salvar dados em sessionStorage e navegar para `/coletor/movimentos/abastecimento/coleta`

### 3.4 Registrar rotas no `App.tsx` (renderColetorPage)

- `/coletor/movimentos/abastecimento/coleta` → AbastecimentoColetaPage
- `/coletor/movimentos/abastecimento/destino` → AbastecimentoDestinoPage

---

## Arquivos Afetados

```text
NOVOS:
  - src/pages/AbastecimentoDetalhePage.tsx
  - src/pages/coletor/AbastecimentoColetaPage.tsx
  - src/pages/coletor/AbastecimentoDestinoPage.tsx

EDITADOS:
  - src/pages/AbastecimentoGeracaoPage.tsx (fix enum)
  - src/pages/AbastecimentoPage.tsx (remover modal detalhe, navegar para rota)
  - src/pages/coletor/AbastecimentoListPage.tsx (click navega para coleta)
  - src/App.tsx (3 novas rotas + imports + breadcrumbs)
  - src/hooks/useRoutePermission.ts (mapear novas rotas)
```

Nenhuma migration SQL necessaria -- todas as operacoes usam tabelas e colunas existentes.

