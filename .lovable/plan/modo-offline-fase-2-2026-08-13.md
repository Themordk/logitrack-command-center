# Modo Offline — Fase 2

Correções na infraestrutura offline e expansão do suporte offline para os demais fluxos do coletor.

## Parte A — Ajustes na infraestrutura (7 itens)

1. **A1 — Lazy import**: em `src/App.tsx`, trocar o import estático da `OfflineStatusPage` (linha 110) por `lazy(() => import(...).then(m => ({ default: m.OfflineStatusPage })))`, junto aos demais lazy imports do coletor.
2. **A2 — Ping sem apikey**: remover a constante `SUPABASE_KEY` e o header `apikey` do fetch em `useOnlineStatus.ts`.
3. **A3 — HEAD + no-cors**: o ping passa a usar `method: "HEAD"`, `mode: "no-cors"`, tratando resposta opaca (`type === "opaque"`) ou `ok` como online. Timeout e lógica de recuperação (2 sucessos consecutivos) preservados.
4. **A4 — Banner mais claro**: quando `isOnline && pendingCount > 0 && !isSyncing`, o `OfflineBanner` exibe "Conexão restaurada — sincronizando em instantes...".
5. **A5 — Indicador SYNC**: no `ColetorLayout`, durante `isSyncing` o indicador do header mostra `RefreshCw` girando + texto "SYNC" em azul; caso contrário ONLINE/OFFLINE como hoje.
6. **A6 — Descartar ação**: na `OfflineStatusPage`, botão "Descartar" ao lado de "Tentar novamente" para ações com falha, chamando `OfflineStore.deleteAction(id)` (já existe no store) + recarregar lista e contagens.
7. **A7 — Idempotência**: em `useOfflineSync.ts`, `isAlreadyProcessed` passa a considerar `err.status`/`err.statusCode === 409`, `code === "23505"` e as mensagens de unique violation.

## Parte B — Expansão por fluxo

Padrão aplicado: telas de listagem/consulta passam a usar `useOfflineCache` (com badge "Cache" quando os dados vêm do IndexedDB); telas de execução passam a usar `useOfflineAction` (enfileira a RPC e avança localmente com dados do sessionStorage, exibindo toast "salvo offline").

- **Conferência**: `ConferenciaIniciarPage` (cache de `conferencia_buscar_ondas` e `conferencia_buscar_tarefas`), `ConferenciaProdutoPage` (`conferencia_saida_confirmacao` via fila, avanço local da lista), `ConferenciaItensPage` (`separacao_conferencia_limpar_item` via fila, limpeza otimista da lista em sessão).
- **Armazenagem**: `ArmazenagemDashboardPage`, `ArmazenagemMovimentosPage`, `ArmazenagemItensPage` e `ArmazenagemIniciarPage` com cache das RPCs de listagem/busca; `ArmazenagemExecucaoPage` enfileira `rpc_coletor_armazenagem_execucao` e `finalizar_armazenagem`. As validações auxiliares (`rpc_sugerir_endereco_picking`, `rpc_validar_endereco_picking`) são puladas quando offline, com aviso ao operador.
- **Inventário**: `InventarioListPage` (cache de `fn_inventario_buscar_tarefas`), `InventarioEnderecoPage` (cache do endereço/setor consultado), `InventarioProdutoPage` (`fn_inventario_registrar_contagem` via fila) e `InventarioLivreProdutoPage` (`fn_inventario_contagem_livre` via fila), com avanço local para o próximo item.
- **Recebimento**: `RecebimentoMenuPage`/`RecebimentoIniciarPage` com cache das consultas de documentos e itens; `RecebimentoExecucaoPage` enfileira `finalizar_conferencia_entrada_item` e `fn_limpar_conferencia_entrada`; `RecebimentoConferenciaPage` enfileira `finalizar_conferencia_entrada_movimento`. A busca por barcode (`fn_conferencia_buscar_produto_por_barcode`) resolve pelo cache de itens do documento quando offline.
- **Abastecimento**: `AbastecimentoListPage` (cache de `rpc_coletor_abastecimento_listar_tarefas`); `AbastecimentoColetaPage` (`rpc_coletor_abastecimento_confirmar_coleta`) e `AbastecimentoDestinoPage` (`rpc_coletor_abastecimento_confirmar_entrega`) via fila.
- **Consultas** (`ConsultaProdutoPage`, `ConsultaProdutoDetalhePage`, `ConsultaEnderecoPage`, `ConsultaEnderecoDetalhePage`, `ConsultaHUPage`): somente `useOfflineCache` (TTL 60 min). Sem conexão e sem cache, empty state "Sem conexão e sem dados em cache para esta consulta."

Telas puramente visuais (`ArmazenagemConcluidoPage`, `TransferenciaConcluidoPage`, `TransferenciaDetalhePage`, `MudancaPickingConcluidoPage`, `RecebimentoConcluidoPage`) não mudam.

## Fora de escopo nesta fase: Transferência e Mudança de Picking

Esses dois fluxos permanecem **online-only**. Motivo: `TransferenciaDestinoPage` e `MudancaPickingDestinoPage` gravam direto nas tabelas `tarefa`/`tarefa_execucao`, e a fila offline só reexecuta RPCs — não haverá extensão da fila para escritas em tabela nesta fase.

Comportamento nas telas de Transferência (`TransferenciaOrigemPage`, `TransferenciaProdutoPage`, `TransferenciaDestinoPage`) e Mudança de Picking (`MudancaPickingListaPage`, `MudancaPickingOrigemPage`, `MudancaPickingDestinoPage`): quando offline, exibir aviso "Este fluxo exige conexão" e desabilitar a confirmação, sem enfileirar nada. Nenhum cache offline é adicionado a elas.

Etapa futura: criar RPCs dedicadas para esses destinos e então habilitá-los offline.

## Parte C — ACTION_LABELS

O mapa da `OfflineStatusPage` será preenchido com os nomes reais das RPCs enfileiradas: `separacao_executar_coleta`, `separacao_confirmar_endereco`, `conferencia_saida_confirmacao`, `separacao_conferencia_limpar_item`, `gerar_volumes_expedicao`, `rpc_coletor_armazenagem_execucao`, `finalizar_armazenagem`, `fn_inventario_registrar_contagem`, `fn_inventario_contagem_livre`, `finalizar_conferencia_entrada_item`, `finalizar_conferencia_entrada_movimento`, `fn_limpar_conferencia_entrada`, `rpc_coletor_abastecimento_confirmar_coleta`, `rpc_coletor_abastecimento_confirmar_entrega`.

## Restrições respeitadas

Nenhuma biblioteca nova; sem alterações em `vite.config.ts`, manifest/Workbox, `integrations/supabase/client.ts`, componentes shadcn ou telas do backoffice; hash routing preservado; nenhum token/senha em IndexedDB; operador nunca bloqueado por falta de rede.
