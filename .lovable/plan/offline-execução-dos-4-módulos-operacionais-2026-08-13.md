# Offline — Execução dos 4 módulos operacionais

Objetivo: as leituras intermediárias do coletor (EAN, endereço, lote, resumo) deixam de quebrar quando a rede cai no meio de uma operação já iniciada. A estratégia é cachear os dados enquanto o operador está online e consumir o cache quando offline. Nenhuma biblioteca nova, nenhuma mudança na arquitetura offline existente.

## Novos arquivos

- `src/lib/offlineEanCache.ts` — mapa EAN → { fator, embalagem, produto_id }, TTL 8h, com funções de leitura, gravação unitária e gravação em lote.
- `src/lib/offlineEnderecoCache.ts` — mapa de endereços por id (com busca por `codigo_endereco`), TTL 8h, mesmas três funções.

Ambos usam `cacheData`/`getCachedData` do `offlineStore.ts` já existente.

## Alterações por tela

| Tela | Ajuste |
|---|---|
| `SeparacaoIniciarPage.tsx` | Ao iniciar a onda (online), pré-cachear em lote os EANs dos produtos das tarefas — fire-and-forget, não bloqueia a navegação |
| `SeparacaoEnderecoPage.tsx` | `enrichTarefas` retorna as tarefas inalteradas quando offline |
| `SeparacaoLotePage.tsx` | Offline: monta a lista de lotes a partir de `lote`/`validade`/`fabricacao`/`saldo_endereco` já presentes na tarefa em sessionStorage |
| `SeparacaoProdutoPage.tsx` | `handleScanEan`: offline busca no cache de EAN (aviso claro se não houver); online consulta e grava no cache |
| `ConferenciaIniciarPage.tsx` | Mesmo pré-cache de EANs ao iniciar a onda |
| `ConferenciaProdutoPage.tsx` | `handleEanScan` com a mesma lógica de cache; restante do fluxo (match de tarefa, checkout) inalterado |
| `RecebimentoExecucaoPage.tsx` | Guards offline em `loadConferencia` e `refreshTarefas` — mantém os itens locais em vez de falhar |
| `RecebimentoConferenciaPage.tsx` | Offline: resumo montado a partir de `coletor_recebimento_tarefas` no sessionStorage |
| `ArmazenagemExecucaoPage.tsx` | Scan de endereço com cache offline + `movimentoEntradaId` com fallback para `coletor_armazenagem_movimento_id` do sessionStorage, para o botão Confirmar não travar |

Também será verificado e, se ainda pendente, aplicado o fix de pré-carregar a tarefa do sessionStorage na `ArmazenagemIniciarPage`.

## Detalhes técnicos

- Toda tela alterada passa a ler `isOnline` de `useOffline()` (`@/contexts/OfflineContext`).
- Escritas continuam pela fila existente (`useOfflineAction`); nada muda em `useOfflineSync`, `useOfflineAction`, `useOfflineCache`, `OfflineContext`, `offlineStore`, `OfflineBanner`, `ColetorLayout`.
- Gravações no cache são `catch`-silenciadas para nunca bloquear o fluxo do operador.
- Quando o dado não está no cache offline, a tela exibe aviso explícito ("precisa ser escaneado online pelo menos uma vez") em vez de erro genérico.
- `RecebimentoIniciarPage`, Transferência e Mudança de Picking seguem online-only.

## Validação

Typecheck limpo e verificação no navegador de que as telas do coletor carregam sem erros novos. Os cenários offline (queda de rede no meio da onda) são validados pela lógica de fallback; a simulação completa depende do dispositivo do operador.
