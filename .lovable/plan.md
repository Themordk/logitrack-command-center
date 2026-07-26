## Painéis TV — Operacional e Vendas (Gestão à Vista)

Duas páginas fullscreen para TVs no armazém, acessadas por `tv_token` (sem autenticação de usuário). Backend (RPCs `rpc_painel_tv_operacional` e `rpc_painel_tv_vendas` + campo `armazem.tv_token`) já existe. Escopo: apenas frontend.

### Rotas

- `#/tv/operacional` — refresh 15s
- `#/tv/vendas` — refresh 30s
- Suporte a `?token=XXXXXXXX` na URL para abrir direto o painel; sem token, exibe tela de input de código (8 chars, alfanumérico, letter‑spacing amplo).
- Não aparecem no `TopNav`; não passam por `Layout`, `TenantProvider` nem `PermissionsProvider`.

### Arquivos novos

1. **`src/pages/tv/TvTokenGate.tsx`** — componente compartilhado:
   - Lê `?token=` do hash na montagem; se ausente, renderiza card centralizado com input grande de 8 caracteres (uppercase automático, `letter-spacing: 0.4em`, `font: JetBrains Mono`) e botão "Conectar".
   - Ao conectar, faz a 1ª chamada RPC para validar; erro amigável se `tv_token` inválido.
   - Persiste último token válido em `localStorage` (`core_tv_token`) para recuperar sozinho se a TV rebootar.
   - Expõe `token` via render‑prop para o painel filho.

2. **`src/pages/tv/TvShell.tsx`** — cabeçalho + rodapé comuns:
   - Header: logo do cliente (`empresa_logo`) à esquerda, título + `empresa` + `armazem` no centro, relógio + countdown de refresh + logo `CORE LogiTrack` (`/src/assets/corelogitrack-logo.png`, versão branca ou o asset local já existente) à direita.
   - Fallback textual "CORE LogiTrack" se o asset falhar.
   - Fundo global `#060b18`, tipografia Inter + JetBrains Mono.

3. **`src/pages/tv/PainelTvOperacional.tsx`**:
   - `useQuery` (chave `["tv-op", token]`, `refetchInterval: 15_000`) chamando `supabase.rpc("rpc_painel_tv_operacional", { p_tv_token })`.
   - Grid 3×2 com 6 cards (label uppercase pequeno cinza; número 56–64px JetBrains Mono):
     1. Aguardando separação (amarelo `#f59e0b` se `> 10`)
     2. Em separação (azul `#3b82f6`)
     3. Aguardando conferência (`separado + em_conferencia`, roxo `#a855f7`)
     4. Pronto para embarque (`conferido`, verde `#22c55e`)
     5. Expedidos hoje (ciano `#06b6d4`)
     6. Total em operação (soma 1–4, branco)
   - Rodapé com 3 indicadores: Falhas de operação (vermelho se `> 0`), Tempo médio separação `HH:MM:SS`, Tempo médio conferência `HH:MM:SS` (helper local para formatar segundos).
   - Cards `background:#0d1420; border:1px solid #1a2540; border-radius:16px`.

4. **`src/pages/tv/PainelTvVendas.tsx`**:
   - `useQuery` (`["tv-vd", token]`, `refetchInterval: 30_000`).
   - Duas colunas iguais:
     - Esquerda "Em processamento" (borda superior `#3b82f6`) — lista `em_processamento`.
     - Direita "Prontos" (borda superior `#22c55e`) — lista `prontos`.
   - Cada linha: nº pedido (JetBrains Mono grande), cliente, badge de prioridade se `URGENTE`/`ALTA`, badge de status com cores mapeadas do prompt.
   - Header de coluna com contador total.
   - Auto‑paginação: se `list.length > 8`, dividir em páginas de 8 e ciclar a cada 5s; dots indicando página atual.

### Integração no roteador (`src/App.tsx`)

- Adicionar bypass no topo de `App()` (antes de `TenantBootProvider`/`TenantProvider`):
  ```tsx
  const initial = window.location.hash.replace("#", "");
  if (initial.startsWith("/tv/")) return <TvRouter />;
  ```
  onde `TvRouter` também escuta `hashchange` e roteia entre `/tv/operacional` e `/tv/vendas`, envolvidos no `QueryClientProvider` já existente (mover o provider para ficar acima do split ou criar um local dedicado à área TV — preferido: manter o `QueryClientProvider` no topo, mover o gate de `/tv/` para dentro dele mas antes de `TenantBootProvider`).
- Confirmar que nenhum item de menu (`TopNav.tsx`) referencia `/tv/*`.

### Client Supabase e segurança

- Usar `supabase` já exportado por `@/integrations/supabase/client` (anon key). As RPCs listadas devem estar marcadas como `SECURITY DEFINER` e aceitar chamada anônima usando apenas o `p_tv_token` — assumir que já está assim (backend pronto). Se a chamada retornar erro de RLS/permissão, exibir mensagem "Token inválido ou armazém indisponível" e voltar ao gate.

### Fora de escopo

- Nenhuma alteração de backend, RPC, RLS, permissões RBAC ou tabela `armazem`.
- Sem novas dependências npm.
- Sem alterações em `Layout`, `TopNav`, contextos de tenant.
