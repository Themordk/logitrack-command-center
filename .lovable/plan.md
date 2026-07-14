## Plano — Correção de dados nas telas do Coletor + Evolução da OcorrenciaDetalhePage

Escopo 100% frontend. Nenhuma alteração em banco, RPC ou enums.

### 1. Coletor — corrigir contextos de ocorrência

**1.1 `src/pages/coletor/ConferenciaProdutoPage.tsx`**
No `<RegistrarOcorrenciaColetorButton contexto={...}>`:
- `etapa`: `"RECEBIMENTO"` → `"EXPEDICAO"`
- `tipo_documento_origem`: `"MOVIMENTO_ENTRADA"` → `"MOVIMENTO_SAIDA"`
- Confirmar que `produto_id`, `produto_descricao` e `tarefa_id` continuam sendo enviados.

**1.2 `src/pages/coletor/ArmazenagemExecucaoPage.tsx`**
Ler a página para identificar a variável do endereço destino confirmado (ex.: `enderecoConfirmado` / `endDestinoId` / `pickConfirmado`) e adicionar ao contexto:
- `endereco_id`: id do endereço destino
- `endereco_descricao`: descrição do endereço destino
Manter `etapa: "ARMAZENAGEM"` e `tipo_documento_origem: "MOVIMENTO_ENTRADA"`.

**1.3 `SeparacaoProdutoPage.tsx` e `ConsultaProdutoDetalhePage.tsx`**
Verificar se o botão duplicado ainda existe (já foi removido em turno anterior). Se ainda houver, remover import e uso do `RegistrarOcorrenciaColetorButton`.

**Sem alteração:** `ConferenciaItensPage`, `AbastecimentoColetaPage`, `AbastecimentoDestinoPage`, `InventarioEnderecoPage`, `InventarioProdutoPage`.

### 2. `src/pages/OcorrenciaDetalhePage.tsx` — enriquecer detalhe

**2.1 InfoItems adicionais** (após os existentes na grid de Informações):
- Tipo documento (map amigável de `tipo_documento_origem`)
- ID documento origem (`documento_origem_id`, mono)
- Execução da tarefa (`tarefa_execucao_id`, mono)
- Resolvida por (`usuario_resolvedor.nome`) — apenas quando `resolvido_por` existe e ainda não há `resolucao`

**2.2 Card "Complementar informações"**
Novo card exibido quando `podeAgir` (status ABERTA / EM_INVESTIGACAO / EM_TRATAMENTO), abaixo do card de Ações. Componente `ComplementarOcorrenciaForm` declarado inline no mesmo arquivo.

Campos editáveis (pré-preenchidos): `tipo_ocorrencia`, `prioridade`, `categoria`, `quantidade_esperada`, `quantidade_real`, `lote`, `validade`, `observacao`. Grid 2 colunas, usando `inputClass`/`labelClass` locais.

Ao salvar:
1. Montar `patch` só com campos alterados (recalcular `quantidade_divergente` quando qtd muda).
2. Se `patch` só contém `updated_by`, exibir `toast.info("Nenhuma alteração detectada.")`.
3. `UPDATE ocorrencia_operacional` com o patch (filtro `id` + `tenant_id`).
4. `INSERT ocorrencia_historico` com `status_anterior = status_novo = status atual` e observação listando os campos alterados.
5. Recarregar via `load()`.

**2.3 Status EM_TRATAMENTO — completar mapas**
Garantir presença em `STATUS_BADGE` (roxo), `STATUS_LABEL` ("Em tratamento") e `STATUS_DOT`. Incluir `"EM_TRATAMENTO"` no tipo `DialogAction`. Timeline: ícone `Wrench` para `status_novo === "EM_TRATAMENTO"`. Confirmar opção no select do modal "Registrar Histórico".

### Fora do escopo
Backend, componentes base de ocorrência (`RegistrarOcorrenciaColetorButton`, `RegistrarOcorrenciaModal`, `RegistrarOcorrenciaButton`), `App.tsx`, UI primitives.
