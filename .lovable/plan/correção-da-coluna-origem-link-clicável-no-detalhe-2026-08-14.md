# Correção da coluna Origem + Link clicável no Detalhe

## Problema
O redesign da grid de ocorrências e do detalhe deixou de fora os tipos de documento de origem relacionados a movimentos. Como resultado:

1. Na grid (`OcorrenciasOperacionaisPage.tsx`), ocorrências vinculadas a `MOVIMENTO_ENTRADA`, `MOVIMENTO_ENTRADA_ITEM` ou `MOVIMENTO_SAIDA` exibem "—" na segunda linha da coluna Origem, pois o segundo fetch só consulta `documento_entrada` e `documento_saida`.
2. No detalhe (`OcorrenciaDetalhePage.tsx`), o `routeMap` só tem rotas para `DOCUMENTO_ENTRADA` e `DOCUMENTO_SAIDA`, então ocorrências de movimento caem no fallback que exibe o UUID cru sem link.
3. `TIPO_DOC_LABEL` em `ocorrenciaConstants.ts` está sem a chave `MOVIMENTO_ENTRADA_ITEM`.

## Solução

### 1. `src/lib/ocorrenciaConstants.ts`
Adicionar a entrada faltante:

```ts
MOVIMENTO_ENTRADA_ITEM: "Mov. Entrada",
```

### 2. `src/pages/OcorrenciasOperacionaisPage.tsx`
No segundo fetch dentro de `listQuery.queryFn`, incluir consultas para:

- `movimento_entrada` (campo `numero_movimento`)
- `movimento_saida` (campo `numero_onda`)
- `movimento_entrada_item` (join com `movimento_entrada` para obter `numero_movimento`)

Popular `docNumeros` com os formatos:

- `Mov. ${numero_movimento}`
- `Onda ${numero_onda}`

### 3. `src/pages/OcorrenciaDetalhePage.tsx`
Expandir o `routeMap` com:

- `MOVIMENTO_ENTRADA`: `/atividades/movimentos`
- `MOVIMENTO_SAIDA`: `/atividades/mov-saida`
- `MOVIMENTO_ENTRADA_ITEM`: `/atividades/movimentos`

Usar deep-link `?detalhe=` apenas para `DOCUMENTO_ENTRADA` e `DOCUMENTO_SAIDA` (já suportado). Para movimentos, navegar direto para a lista do módulo correspondente.

## Fora de escopo
Nenhuma alteração na estrutura da grid, KPIs, ações rápidas, `NotificacoesDropdown`, `TopNav`, formulários complementares ou banco de dados.
