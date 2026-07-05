# Correções solicitadas

## 1. Armazém obrigatório em Novo Documento de Entrada
**Arquivo:** `src/pages/CadastroDocEntradaPage.tsx`

- Marcar visualmente o campo Armazém como obrigatório (label `Armazém *`).
- Incluir `armazemId` na validação de `handleSave` (mensagem de toast passa a listar também "Armazém").
- Enviar `armazem_id: armazemId` (sem fallback para `null`) no `insert` do `documento_entrada`.

## 2. Erro de enum ao listar "Itens sem picking"
**Arquivo:** `src/modules/reports/picking-nao-cadastrado/pickingNaoCadastrado.service.ts`

O enum `enum_status_mov_entrada` no banco contém apenas: `GERADO`, `LIBERADO`, `ERRO_TRANSPORTADOR`, `EM_CONFERENCIA`, `CONFERIDO`, `DIVERGENCIA`, `LIB_ARMAZENAGEM`, `ARMAZENAGEM_PARCIAL`, `ARMAZENADO`, `EXPORTADO`, `CANCELADO`.

O array `STATUS_ABERTOS` está passando os literais legados `"EM CONFERENCIA"` e `"LIB. ARMAZENAGEM"` (com espaço/ponto), que o Postgres rejeita com `22P02`.

- Remover essas duas entradas do array, mantendo apenas as formas com underscore que existem no enum.

## 3. Busca em Localizações/Endereços não retorna resultados
**Arquivo:** `src/hooks/useCrud.ts`

A coluna `endereco.codigo_endereco` é `numeric` no banco. A cláusula `codigo_endereco.ilike.%termo%` gerada pelo `useCrud` faz o Postgres rejeitar o operador em coluna numérica, o que derruba todo o `.or()` e faz a busca por `descricao` também não retornar nada.

- Ao montar a cláusula de busca para `table === "endereco"`:
  - `descricao` continua usando `ilike.%search%`.
  - `codigo_endereco` só entra no `.or()` se o `search` for totalmente numérico, e usando `eq.<numero>` (não `ilike`).
- Alterações restritas ao bloco `if (search)` do hook; nenhuma outra tabela é afetada.

## Detalhes técnicos
- Nenhuma migração ou mudança de schema.
- Sem impacto em Coletor, RLS ou triggers de estoque.
