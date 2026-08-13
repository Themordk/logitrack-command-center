# FIX: Armazenagem offline — 2 correções pendentes do v39

## Objetivo
Corrigir duas falhas restantes no fluxo de Armazenagem do coletor quando o operador está offline, sem alterar arquitetura ou outros módulos.

## Problema confirmado
`ArmazenagemItensPage` já grava todos os dados do item selecionado no `sessionStorage` via `handleSelectItem`. Entretanto, `ArmazenagemIniciarPage` inicializa o state `tarefa` como `null` e, ao escanear offline, busca no cache IndexedDB por chave `armazenagem_tarefa_${code}` — cache que nunca foi populado para aquele EAN. Resultado: erro "Sem conexão e sem dados em cache para este código."

## Escopo
Apenas 2 arquivos:
- `src/pages/coletor/ArmazenagemIniciarPage.tsx`
- `src/pages/coletor/ArmazenagemItensPage.tsx`

## Alterações

### 1. `src/pages/coletor/ArmazenagemIniciarPage.tsx`
- Criar `preloadedTarefa` lendo os dados já existentes no `sessionStorage` (tarefa_id, produto_id, sku, descricao, qtd_restante, lote, validade, fabricacao, picking_sugerido, varios_pickings).
- Inicializar o state `tarefa` com `preloadedTarefa` em vez de `null`.
- No início de `handleScan`, quando `tarefa` já existe (modo conferência vindo da lista), exibir overlay de sucesso "Produto confirmado: {descricao}" sem zerar o state.
- Ajustar label do `ScanField` para "Escanear para conferir (opcional)" quando houver `preloadedTarefa`, mantendo "Escanear EAN ou HU" no modo scan direto.
- Garantir que o botão "CONFIRMAR E ARMAZENAR" funcione sempre que `tarefa` existir, sem exigir `lastScanned`.

### 2. `src/pages/coletor/ArmazenagemItensPage.tsx`
- Importar `offlineStore`.
- Adicionar `useEffect` que, ao carregar a lista online (`data` populado), cacheia individualmente cada item no IndexedDB com chave `armazenagem_tarefa_${item.sku}` e TTL de 120 minutos.
- O cache garante que o scan direto (modo 2, sem vir da lista) também funcione offline se o operador já carregou a lista antes de perder conexão.

## O que NÃO será alterado
- `ArmazenagemExecucaoPage.tsx` (já lê do sessionStorage corretamente).
- `offlineStore.ts`, `offlineEanCache.ts`, `offlineEnderecoCache.ts`, `OfflineContext.tsx`, `useOfflineSync.ts`, `useOfflineAction.ts`, `useOnlineStatus.ts`.
- Nenhum outro módulo (Separação, Conferência, Recebimento já corrigidos no v39).
- Nenhuma biblioteca nova; `vite.config.ts`; `supabaseClient.ts`; `package.json`.

## Critérios de aceite
1. Operador seleciona item na lista → "Confirmar Produto" exibe o produto imediatamente, sem scan obrigatório.
2. EAN escaneado na tela de confirmação exibe overlay "Produto confirmado".
3. Botão "CONFIRMAR E ARMAZENAR" funciona sem scan quando o produto veio da lista.
4. Fluxo completo lista → confirmar → executar funciona offline.
5. Scan direto (sem vir da lista) continua funcionando online e offline com cache.
6. Nenhuma regressão nos módulos já corrigidos.
