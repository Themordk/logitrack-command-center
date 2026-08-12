# Modo Offline Real — Coletor PWA

Permitir que o operador continue trabalhando em áreas sem sinal: leitura de dados via cache local e ações gravadas numa fila que sincroniza sozinha quando a rede volta. Exclusivo do coletor — o painel administrativo não é tocado.

## Fase 1 — Infraestrutura

**`src/lib/offlineStore.ts`** — wrapper mínimo sobre IndexedDB nativo (sem bibliotecas novas). Banco `core_logitrack_offline` com dois object stores:
- `pending_actions`: id, timestamp, action (nome da RPC), params, status (pending/syncing/synced/failed), retryCount, errorMessage, tenantId, empresaId, usuarioId. Índices por status e timestamp.
- `cached_data`: key (único), data, cachedAt, expiresAt, tenantId.

API: `enqueueAction`, `getPendingActions`, `markActionSynced`, `markActionFailed`, `getPendingCount`, `clearSyncedActions` (>24h), `cacheData`, `getCachedData`, `clearExpiredCache`, `clearAllCache`.

**`src/hooks/useOnlineStatus.ts`** — `navigator.onLine` + ping HEAD leve ao Supabase (timeout 3s; 15s online, 5s offline). Só considera "voltou" após 2 pings consecutivos com sucesso. Não dispara sync.

**`src/hooks/useOfflineSync.ts`** — na transição offline→online, processa a fila em ordem FIFO, uma ação por vez, via `supabase.rpc`. Sucesso ou conflito (já processado) marca como sincronizado; erro de rede pausa a fila para o próximo ciclo; erro de negócio marca como falha sem retry automático. Expõe `pendingCount`, `isSyncing`, `syncProgress`, `lastSyncAt`, `failedCount`. Limpeza horária das sincronizadas.

**`src/contexts/OfflineContext.tsx`** — provider que combina os dois hooks e expõe `useOffline()` com status, `enqueueAction` (injeta tenant/empresa/usuário do localStorage), `cacheData` e `getCachedData`. Montado apenas no ramo de rotas do coletor no `App.tsx`.

**`src/components/coletor/OfflineBanner.tsx`** — faixa compacta abaixo do header: amarela quando offline com contagem de pendências, azul durante a sincronização com progresso, vermelha quando há falhas (com link para a tela de status). Invisível quando online e sem pendências.

**`ColetorLayout.tsx`** — troca do `navigator.onLine` local pelo contexto, inserção do banner entre header e conteúdo, e guarda no heartbeat para não disparar quando offline. Todo o resto permanece igual.

## Fase 2 — Fluxos operacionais

**`src/hooks/useOfflineAction.ts`** — `execute(rpcName, params)`. Online tenta a RPC; falha de rede cai para a fila; erro de negócio retorna falha. Offline vai direto para a fila. Retorna `{ success, offline, data }`.

**`src/hooks/useOfflineCache.ts`** — tenta a rede, grava no cache em caso de sucesso, cai para o cache local em caso de falha. Retorna `{ data, loading, isFromCache, error, refetch }`. TTL padrão 60 min.

**`SeparacaoIniciarPage.tsx`** (modelo de leitura) — lista de ondas via `useOfflineCache` (30 min), badge discreto "Dados em cache" ao lado do botão de atualizar, e as tarefas da onda escolhida gravadas tanto no sessionStorage quanto no cache offline.

**`SeparacaoEnderecoPage.tsx` e `SeparacaoProdutoPage.tsx`** (modelo de execução) — a confirmação de endereço, quando offline, é validada contra a lista de tarefas em cache e o operador avança normalmente; a coleta do item (`separacao_executar_coleta`) passa por `useOfflineAction`, com feedback háptico igual e aviso "Confirmação salva. Será enviada quando a conexão retornar." O avanço para o próximo item é local, sem esperar o servidor.

**`ColetorHomePage.tsx`** — linha informativa abaixo da saudação com "N ações aguardando sincronização" (ícone Cloud, amarelo). Não bloqueia nada.

## Fase 3 — Tela de status offline

**`src/pages/coletor/OfflineStatusPage.tsx`** — três seções: estado da conexão com horário da última verificação e botão de teste; fila de sincronização com nome traduzido da ação, data/hora, status, erro e retry individual, além de "Sincronizar agora"; e cache de dados com quantidade, tamanho aproximado e limpeza com confirmação.

Rota `/coletor/offline-status` registrada no `App.tsx` e acessível por um card na `ConfiguracoesPage`, além do link no banner de falha.

## Detalhes técnicos

- IndexedDB nativo, nenhuma dependência nova; nada de token, senha ou dado sensível persistido.
- `vite.config.ts`, manifest, Workbox e o client Supabase permanecem intocados — a fila de ações é complementar ao `NetworkFirst` de leitura já existente.
- Roteamento continua por hash via `onNavigate`.
- Sincronização unidirecional (cliente → servidor), sem resolução de conflito: rejeição do backend vira falha visível na tela de status.
- Idempotência: cada ação enfileirada carrega um `id` próprio, usado como chave de deduplicação ao reenviar.
- Design dark existente, ícones Lucide, `ActionButton`, toasts Sonner, alvos de toque de 48px.
