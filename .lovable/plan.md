# Padronização de Feedback do Coletor — v41

## Objetivo
Unificar os 3 padrões de feedback coexistentes (toast, StatusOverlay, ResultDialog) em uma regra única, para que o operador sempre leia mensagens de erro/aviso em um modal com botão OK.

## Regra de decisão aplicada
| Situação | Componente |
|---|---|
| Scan OK / confirmação instantânea (≤5 palavras) | `StatusOverlay` verde (800ms) |
| Info não-crítica (offline salvo, navegação, modo degradado) | `toast.info` |
| Sucesso de operação completa | `result.showSuccess` |
| Aviso / validação | `result.showWarning` |
| Erro (rede, RPC, SQL, auth) | `result.showError(err, { context })` |

Proibidos após a mudança: `toast.error`, `toast.warning`, `StatusOverlay` com type `error`/`warning`, e `toast.success` para fim de operação.

## Infraestrutura — não será tocada
`errorMapper.ts`, `useResultDialog.ts`, `ResultDialog.tsx`, `StatusOverlay.tsx`, `useFeedback.ts`, todos os arquivos offline (`OfflineContext`, `useOfflineAction/Cache/Sync`, `useOnlineStatus`, `offlineStore`, `offlineEanCache`, `offlineEnderecoCache`), `src/components/ui/*`, backend/RPC/migrations, `App.tsx`, `vite.config.ts`, `package.json`.

## Grupo 1 — Prioridade alta (7 páginas)
- `ArmazenagemIniciarPage` — adiciona ResultDialog; converte "sem cache" para warning e o catch para `showError`; mantém os 3 overlays verdes de scan.
- `ArmazenagemExecucaoPage` — adiciona ResultDialog; converte 8 overlays de erro/aviso e os 2 sucessos de operação (armazenagem registrada, online e offline) para dialog; mantém overlays verdes de endereço/produto e o `toast.info` offline.
- `RecebimentoExecucaoPage` — adiciona ResultDialog; converte os `toast.error` (carregar itens, confirmar, remover item conferido, cancelar); `toast.success("Conferência cancelada")` vira `toast.info`; overlays de erro passam a dialog no ponto de chamada.
- `RecebimentoConferenciaPage` — adiciona ResultDialog; converte os 2 `toast.error`, finalização (sucesso/divergência/offline) e o erro ao finalizar; remove `StatusOverlay` se nenhum scan verde restar.
- `ConferenciaProdutoPage` — já tem o hook; converte os `toast.warning`/`toast.error`, remove o `setOverlay({type:"error"})` redundante ao lado de `showError`, mantém overlays verdes e `toast.success` de volumes.
- `ColetorLoginPage` — adiciona ResultDialog; erro de login vira `showError` com instrução "Verifique seu login e senha"; mantém `toast.success` de boas-vindas.
- `LoginPage` (web) — adiciona ResultDialog com `coletorMode: false`; erro de login e aviso de armazém viram dialog.

## Grupo 2 — Prioridade média (7 páginas)
- `TransferenciaOrigemPage`, `TransferenciaProdutoPage`, `TransferenciaDestinoPage`, `MudancaPickingOrigemPage`, `MudancaPickingDestinoPage` — todos os overlays são de erro: convertidos para `showWarning`/`showError` e o `StatusOverlay` (mais imports e states `overlay`/`overlayMsg`) é removido dessas 5 páginas.
- `AbastecimentoColetaPage`, `AbastecimentoDestinoPage` — erros viram dialog; "Coleta confirmada!" / "Abastecimento registrado!" viram `showSuccess`; overlays verdes de endereço/produto e `toast.info` permanecem.

## Grupo 3 — Prioridade baixa (17 páginas)
Ajuste de toasts remanescentes em páginas que já usam o hook, e adição do hook onde falta:
`SeparacaoProdutoPage`, `SeparacaoEnderecoPage`, `SeparacaoOcorrenciasPage`, `SeparacaoLotePage`, `SeparacaoIniciarPage`, `ConferenciaIniciarPage`, `ConferenciaItensPage`, `InventarioLivreProdutoPage`, `InventarioProdutoPage`, `InventarioEnderecoPage`, `InventarioLivreEnderecoPage`, `InventarioListPage`, `RecebimentoIniciarPage`, `RecebimentoVolumesPage`, `ConfiguracoesPage`, `ConsultaEnderecoDetalhePage`, `AbastecimentoListPage`.

Em todas: `toast.error` → `showError`/`showWarning`; sucessos de operação completa → `showSuccess`; `toast.info` e `toast.success` de sub-etapa (EAN confirmado, endereço confirmado, lote selecionado, próximo produto) mantidos.

## Detalhe técnico relevante
Em `ConferenciaProdutoPage` (linhas ~464-470) e em `SeparacaoProdutoPage` (bloco de geração de volumes) existe uma variável local chamada `result` (retorno da RPC) que colide com o `result` do `useResultDialog`. Nesses blocos a variável local será renomeada (ex.: `rpcVolumes`) antes de trocar os toasts por chamadas do dialog — sem alterar a lógica de negócio.

Onde o código hoje faz `parseError(err)` só para extrair `parsed.title` em um toast, o `parseError` manual é removido e o erro original é passado para `result.showError(err, { context })`, que já parseia internamente. Blocos que usam `parsed` para outra finalidade permanecem.

## Critérios de aceite
1. Nenhum erro ou aviso aparece como toast ou como overlay auto-dismiss.
2. `StatusOverlay` restante apenas em confirmações verdes curtas de scan.
3. `toast.info`/`toast.success` restantes apenas nos casos listados como sub-etapa/info.
4. Erros de login (coletor e admin) exibem dialog com instrução.
5. Nenhuma mudança de fluxo, navegação, lógica offline ou infraestrutura; typecheck limpo.
