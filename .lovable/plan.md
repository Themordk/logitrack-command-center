

# Plano PWA - CORE LogiTrack WMS

## Estado Atual

O projeto e um SPA React/Vite sem nenhuma configuracao PWA. Nao existe manifest, service worker, nem icones PWA. O modulo Coletor ja possui indicador online/offline e layout mobile-first, o que e uma base solida.

---

## Fase 1 - MVP PWA (Quick Wins)

### 1.1 Instalar e configurar vite-plugin-pwa

**Arquivo: `vite.config.ts`**
- Instalar `vite-plugin-pwa`
- Configurar com `VitePWA()` incluindo:
  - `registerType: 'prompt'` (atualizar com confirmacao do operador, nunca no meio de uma tarefa)
  - `workbox.navigateFallbackDenylist: [/^\/~oauth/]` (obrigatorio para OAuth)
  - Cache strategy: **NetworkFirst** para chamadas Supabase RPC, **CacheFirst** para assets estaticos (JS, CSS, fontes, icones)
  - `workbox.runtimeCaching` com rotas especificas para `/rest/v1/` (NetworkFirst, fallback 5s)

### 1.2 Web App Manifest

**Arquivo: `public/manifest.json`**
```text
name:         CORE LogiTrack
short_name:   CORE Coletor
display:      standalone
orientation:  portrait
theme_color:  hsl(217,91%,40%)  (azul do header do coletor)
background:   #0f1117            (bg do coletor)
start_url:    /#/coletor/login
scope:        /
```
- Gerar icones PWA: 192x192, 512x512, maskable
- Splash screen automatico via manifest icons

### 1.3 Meta tags no index.html
- `<meta name="theme-color">` 
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<link rel="apple-touch-icon">`

### 1.4 Componente de Update Prompt
- Criar `src/components/pwa/UpdatePrompt.tsx`
- Quando nova versao disponivel, exibir banner fixo no topo: "Nova versao disponivel - Atualizar"
- Nunca forcar reload automatico (operador pode estar no meio de contagem)

---

## Fase 2 - UX Operacional

### 2.1 Feedback sonoro/vibratil no ScanField
- **Arquivo: `src/components/coletor/ScanField.tsx`**
- Sucesso: `navigator.vibrate(100)` + beep curto via AudioContext (400Hz, 150ms)
- Erro: `navigator.vibrate([100,50,100])` + beep grave (200Hz, 300ms)
- Criar hook `src/hooks/useFeedback.ts` reutilizavel

### 2.2 Auto-focus agressivo
- Ja existe no ScanField, mas reforcar: ao voltar de overlay/dialog, re-focar input
- Prevenir teclado virtual: `inputMode="none"` nos campos de scan (coletor envia como teclado)

### 2.3 Reducao de cliques
- Na tela de inventario/produto: apos confirmar contagem com sucesso, navegar automaticamente para proximo endereco (ja implementado)
- Nos scans: processar no Enter sem botao de confirmacao (ja implementado)

---

## Fase 3 - Resiliencia Offline

### 3.1 Fila de operacoes offline
- Criar `src/lib/offlineQueue.ts`
- Quando offline, salvar chamadas RPC (ex: `fn_inventario_finalizar_conferencia_endereco`) em IndexedDB
- Quando online, processar fila em ordem FIFO
- Exibir badge no header do coletor: "3 operacoes pendentes"

### 3.2 Cache de dados operacionais
- Pre-carregar lista de tarefas ao iniciar contagem (ja feito via RPC)
- Salvar resultado de `fn_inventario_buscar_tarefas` em IndexedDB para consulta offline
- Produtos/embalagens frequentes: cache local com TTL de 4h

### 3.3 Indicador visual melhorado
- Ja existe indicador ONLINE/OFFLINE no ColetorLayout
- Adicionar: cor do header muda para amarelo quando ha itens na fila offline
- Toast ao reconectar: "Sincronizando X operacoes..."

---

## Fase 4 - Performance

### 4.1 Code splitting por modulo
- Lazy load das rotas do painel administrativo (nao carrega no coletor)
- Lazy load das rotas do coletor (nao carrega no admin)
- `React.lazy()` + `Suspense` no `renderColetorPage` e `renderPage` do App.tsx

### 4.2 Precaching critico
- Service worker pre-cacheia: shell HTML, CSS, JS do coletor
- Fontes e icones em CacheFirst

### 4.3 Otimizacao de bundle
- Ja usa Vite com tree-shaking
- Considerar `manualChunks` para separar vendor (supabase, lucide, react)

---

## Fase 5 - Integracao com Hardware

### 5.1 Leitores de codigo de barras
- Coletores Zebra/Honeywell enviam dados como keystrokes terminados em Enter
- O ScanField atual ja captura isso corretamente (input hidden + onKeyDown Enter)
- Adicionar: timeout de 50ms entre chars para distinguir digitacao manual de scan rapido
- `inputMode="none"` para suprimir teclado virtual em dispositivos com leitor fisico

### 5.2 Pagina de configuracoes do coletor
- Ja existe `/coletor/configuracoes`
- Adicionar opcao: "Tipo de dispositivo" (Coletor com leitor / Celular com camera)
- Se celular: mostrar botao para ativar camera como scanner (futuro)

---

## Fase 6 - Seguranca

### 6.1 Autenticacao
- Sessao Supabase ja persiste via localStorage (token JWT)
- Service worker NAO deve cachear respostas autenticadas com dados sensiveis
- Token refresh: Supabase client ja faz automaticamente

### 6.2 Dados locais
- IndexedDB para fila offline: dados minimos (tarefa_id, quantidade, timestamps)
- Limpar IndexedDB no logout (ja limpa localStorage)
- Nao armazenar senhas localmente

---

## Fase 7 - Instalacao e Distribuicao

### 7.1 Pagina de instalacao
- Criar `/coletor/instalar` com instrucoes visuais
- Detectar se ja instalado via `window.matchMedia('(display-mode: standalone)')`
- Interceptar `beforeinstallprompt` para botao "Instalar App"
- Para iOS: instrucoes com screenshots (Compartilhar > Adicionar a Tela de Inicio)

### 7.2 Distribuicao
- QR Code na tela de login do painel admin apontando para `/coletor/login`
- Apos login no coletor, sugerir instalacao se nao instalado

---

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---|---|
| `vite.config.ts` | Adicionar VitePWA plugin |
| `public/manifest.json` | Criar manifest PWA |
| `public/pwa-192x192.png` | Icone PWA |
| `public/pwa-512x512.png` | Icone PWA |
| `index.html` | Meta tags PWA + Apple |
| `src/components/pwa/UpdatePrompt.tsx` | Criar prompt de atualizacao |
| `src/hooks/useFeedback.ts` | Criar hook de feedback sonoro/vibratil |
| `src/components/coletor/ScanField.tsx` | Integrar feedback |
| `src/App.tsx` | Lazy loading de rotas + UpdatePrompt |

---

## Riscos e Pontos de Atencao

1. **iOS Safari**: Push notifications nao funcionam. Install prompt nao existe (manual via Share). Service worker tem limite de 50MB de cache.
2. **Coletores Android antigos**: Verificar versao do Chrome/WebView. PWA requer Chrome 40+.
3. **Offline com Supabase RPC**: RPCs que fazem UPDATE/INSERT precisam de fila com retry. Conflitos de concorrencia (dois operadores no mesmo endereco) devem ser tratados no servidor.
4. **Atualizacao forcada**: Se houver mudanca critica no schema do banco, o service worker antigo pode causar erros. Implementar versao minima obrigatoria no servidor.
5. **Teclado virtual**: Em celulares sem leitor fisico, `inputMode="none"` esconde o teclado. Precisa de toggle nas configuracoes.

---

## Ordem de Implementacao Recomendada

1. **Fase 1** (MVP PWA) - Maior impacto com menor esforco. App instalavel imediatamente.
2. **Fase 2.1** (Feedback sonoro) - Quick win operacional critico para coletores.
3. **Fase 4.1** (Code splitting) - Reduz tempo de carga no coletor.
4. **Fase 7** (Instalacao) - Facilita adocao.
5. **Fase 3** (Offline) - Mais complexo, implementar por ultimo.

