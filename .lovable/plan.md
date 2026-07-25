## Objetivo

Resolver 2 problemas visuais/técnicos com a nova logo do CORE LogiTrack:

1. **Container azul atrás da logo** prejudica a leitura da marca (a logo já tem identidade visual própria com fundo/emblema — colocá-la dentro de um quadrado `bg-primary` cria um "duplo fundo azul" desagradável — visível na tela Portal de Acesso / identificação de tenant e também no Login / Coletor / Splash).
2. **Ícone quebrado da logo** em algumas telas (ex.: TopNav) apesar da URL do asset ser a mesma usada em outras telas — indica falha de resolução do path `/__l5e/assets-v1/...` em determinados contextos (provavelmente subdomínio de tenant / service worker cache).

## Mudanças

### 1. Remover fundo azul atrás da logo (5 pontos)

Em todos os lugares, trocar o wrapper `bg-primary rounded-* p-*` por um container transparente, deixando a logo se apresentar sozinha (ela já contém o "badge" azul característico da marca). Aumentar levemente o tamanho para compensar a perda do fundo.

- **`src/components/tenant/TenantBootScreens.tsx`** (Portal de Acesso — screenshot enviado):
  - `TenantBootPortal`: remover o quadrado `w-14 h-14 bg-primary` e usar somente `<img className="w-16 h-16 object-contain" />`.
  - `TenantBootSplash`: mesmo tratamento.
- **`src/pages/LoginPage.tsx`**: remover o gradiente azul `linear-gradient(#1d4ed8,#3b82f6)` do orbital central e exibir a logo direta (mantendo o anel animado externo intacto).
- **`src/pages/coletor/ColetorLoginPage.tsx`**: remover o quadrado com gradiente azul; exibir a logo direta com sombra sutil.
- **`src/components/suporte/SupportLayout.tsx`**: já está sem fundo (revisar apenas o tamanho para 28×28).
- **`src/components/TopNav.tsx`**: já está sem fundo (só validar).

### 2. Corrigir logo quebrada em outras telas

Diagnóstico: o `.asset.json` aponta para `/__l5e/assets-v1/…`, que depende do proxy do Lovable. Em contextos onde a página é servida (subdomínio de tenant, cache de service worker antigo, ou preview iframe) esse path pode ser interceptado e devolver HTML em vez do PNG (`Content-Type: text/html` confirmado no dev-server local).

Correção: converter a logo para um **asset local do Vite** (importado como módulo, servido pelo bundler com hash e URL relativa da própria origem), eliminando a dependência do caminho `/__l5e/`:

1. Baixar o binário atual da CDN de volta para `src/assets/corelogitrack-logo.png` (via `curl` no CDN público, usando o `asset_id` do `.asset.json`).
2. Trocar em todos os 5 arquivos:
   ```ts
   // antes
   import logoAsset from "@/assets/corelogitrack-logo.png.asset.json";
   <img src={logoAsset.url} ... />
   // depois
   import logoUrl from "@/assets/corelogitrack-logo.png";
   <img src={logoUrl} ... />
   ```
3. Remover o `.asset.json` (não é mais usado). Manter os PNGs de `public/` (favicon, pwa-192, pwa-512) como estão.

Isso garante que a logo carregue em qualquer subdomínio, preview ou tela, sem depender de rota externa.

## Arquivos alterados

- `src/components/tenant/TenantBootScreens.tsx`
- `src/pages/LoginPage.tsx`
- `src/pages/coletor/ColetorLoginPage.tsx`
- `src/components/suporte/SupportLayout.tsx`
- `src/components/TopNav.tsx`
- `src/assets/corelogitrack-logo.png` (recriado a partir da CDN)
- `src/assets/corelogitrack-logo.png.asset.json` (removido)

## Verificação

- `bun run build` deve passar (o Vite hash-inclui a nova imagem).
- Verificar visualmente no preview: Portal de Acesso, Login Portal, Login Coletor, TopNav, Splash — logo aparece sem quadrado azul atrás e sem ícone quebrado.
