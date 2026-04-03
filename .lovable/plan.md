

# Plano: Colunas de Rastreabilidade + Detalhe de Tarefa no Relatório de Movimentações

## Contexto

A tabela `estoque_movimento` já possui os campos `tipo_documento_origem` (text), `documento_origem_id` (text) e `tarefa_execucao_id` (uuid). Os dados confirmam que `tarefa_execucao_id` está preenchido em todos os registros e o `tipo_documento_origem` está na tabela `tarefa` (não na `estoque_movimento` -- onde aparece null). Os tipos de documento existentes são: `MOVIMENTO_ENTRADA_ITEM`, `MOVIMENTO_SAIDA_ITEM`, `INVENTARIO`. Os tipos de tarefa incluem: ARMAZENAGEM_ENTRADA, CONFERENCIA_ENTRADA, SEPARACAO, TRANSFERENCIA, ABASTECIMENTO, INVENTARIO, etc.

Atualmente a query faz joins individuais via Supabase SDK (N+1 implícito). Para performance, criaremos uma **view consolidada** no banco.

---

## Etapa 1 -- View de banco `vw_estoque_movimento_relatorio`

Criar uma migration com uma view que consolida todos os dados necessários em uma única query, eliminando joins no frontend:

```sql
CREATE OR REPLACE VIEW public.vw_estoque_movimento_relatorio AS
SELECT
  em.id,
  em.criado_em,
  em.tenant_id,
  em.empresa_id,
  em.tipo_movimento,
  em.quantidade,
  em.lote,
  em.hu_id,
  em.tarefa_execucao_id,
  -- Produto
  p.sku,
  p.descricao AS produto_descricao,
  -- Enderecos
  eo.descricao AS endereco_origem,
  ed.descricao AS endereco_destino,
  -- Usuario
  u.nome AS usuario_nome,
  -- Tarefa (via tarefa_execucao -> tarefa)
  t.tipo_documento_origem,
  tt.codigo AS tipo_tarefa_codigo,
  tt.descricao AS tipo_tarefa_descricao,
  -- Tarefa execucao resumo
  te.status AS tarefa_execucao_status,
  te.usuario_id AS tarefa_usuario_id,
  tu.nome AS tarefa_usuario_nome
FROM estoque_movimento em
LEFT JOIN produto p ON p.id = em.produto_id
LEFT JOIN endereco eo ON eo.id = em.endereco_origem_id
LEFT JOIN endereco ed ON ed.id = em.endereco_destino_id
LEFT JOIN usuario u ON u.id = em.usuario_id
LEFT JOIN tarefa_execucao te ON te.id = em.tarefa_execucao_id
LEFT JOIN tarefa t ON t.id = te.tarefa_id
LEFT JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
LEFT JOIN usuario tu ON tu.id = te.usuario_id;
```

Isso elimina o padrão N+1 e traz todos os dados necessarios em uma unica consulta.

---

## Etapa 2 -- Atualizar o service (`movimentacoes.service.ts`)

- Trocar a query atual (com joins via SDK) por uma consulta simples na view `vw_estoque_movimento_relatorio`.
- Adicionar nos resultados mapeados: `tipo_documento_origem`, `tarefa_execucao_id`, `tipo_tarefa_codigo`, `tipo_tarefa_descricao`, `tarefa_execucao_status`.
- Adicionar `case 99` nas funcoes `getTipoMovimentoLabel` (retorna "Estorno") e `getTipoMovimentoColor` (retorna `text-yellow-400`).
- Adicionar helper `getTipoDocumentoLabel()` para traduzir os valores (`MOVIMENTO_ENTRADA_ITEM` -> "Mov. Entrada", `MOVIMENTO_SAIDA_ITEM` -> "Mov. Saida", `INVENTARIO` -> "Inventario").

---

## Etapa 3 -- Adicionar colunas na tabela do relatorio (`MovimentacoesReportPage.tsx`)

Duas novas colunas inseridas apos "Tipo Movimento":

1. **Doc. Origem** -- exibe o label amigavel do `tipo_documento_origem` (badge colorido).
2. **Tarefa** -- exibe o `tipo_tarefa_codigo` como link clicavel. Ao clicar, navega para `/relatorios/movimentacoes/tarefa/:tarefa_execucao_id`.
   - UUID simplificado: mostrar o codigo do tipo de tarefa (ex: "ENTR-ARMZ") em vez do UUID.
   - Se nao houver tarefa vinculada, exibe "---".

Adicionar "Estorno" (valor 99) no filtro de Tipo Movimento no select.

---

## Etapa 4 -- Nova pagina de detalhe da tarefa

Criar `src/modules/reports/movimentacoes/TarefaDetalhePage.tsx`:

**Layout em cards informativos (estilo SAP dark):**

**Card 1 -- Informacoes da Tarefa:**
- Tipo Tarefa (codigo + descricao)
- Tipo Documento Origem
- Status
- Prioridade
- Ordem Tarefa
- Produto (SKU + descricao via join)
- Qtd Requerida / Qtd Executada / Qtd Cortada
- % Execucao
- Local Origem / Local Destino (descricao do endereco)
- Criado em / Concluido em
- Motivo Ocorrencia (se existir)

**Card 2 -- Informacoes da Execucao:**
- Status da Execucao
- Usuario Executor (nome)
- Atribuido em / Iniciado em / Concluido em
- Quantidade Executada
- Lote / Validade / Fabricacao / Serie
- HU
- Endereco Origem / Destino
- Qtd Cortada (se houver)
- Motivo Ocorrencia (se houver)

**Botao "Voltar" para retornar ao relatorio.**

---

## Etapa 5 -- Rota no App.tsx

Adicionar rota dinamica `/relatorios/movimentacoes/tarefa/:id` no bloco de rotas dinamicas (secao `default` do switch), renderizando `TarefaDetalhePage`.

Adicionar breadcrumb correspondente.

---

## Resumo tecnico

```text
Arquivos modificados/criados:
  1. migration: vw_estoque_movimento_relatorio (VIEW)
  2. src/modules/reports/movimentacoes/movimentacoes.service.ts (query na view + helpers)
  3. src/modules/reports/movimentacoes/MovimentacoesReportPage.tsx (2 colunas + estorno no filtro)
  4. src/modules/reports/movimentacoes/TarefaDetalhePage.tsx (NOVO)
  5. src/App.tsx (rota + breadcrumb)
```

**Ganho de performance**: a view elimina 4 sub-queries/joins feitos pelo Supabase SDK, consolidando tudo em uma unica consulta SQL otimizada pelo Postgres.

