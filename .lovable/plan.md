# Redesign Visual — CORE Coletor Login

Aplicar o mesmo tratamento "Warehouse Intelligence" (já usado no `LoginPage.tsx` administrativo) à tela `ColetorLoginPage.tsx`, adaptado para mobile/PWA do coletor. **Apenas a camada visual será alterada** — toda a lógica de autenticação, RPC de tenant, gravação em `localStorage`, criação de sessão, heartbeat e modal de troca de senha permanecem intactas.

## Escopo

- Reaproveitar o componente `WarehouseCanvas` já existente (`src/components/login/WarehouseCanvas.tsx`) como background animado.
- Reaproveitar as fontes `Syne` + `JetBrains Mono` já importadas em `src/index.css` (não há mudança em `index.html` nem em `index.css`).
- Substituir o JSX visual de `src/pages/coletor/ColetorLoginPage.tsx` mantendo intactos: `handleLogin`, `completeLogin`, estados (`login`, `password`, `loading`, `forceChange`, `pendingUsuario`), `useTenant`, `useTenantBoot`, `ForcePasswordChangeModal` e o botão "Acessar Painel Administrativo".

## Estrutura visual nova (apenas o `return`)

```text
<div wrapper> (relative, overflow-hidden, min-h-screen, bg #020c1b, flex center)
 ├─ <WarehouseCanvas />                 (z-0, fixed inset-0)
 ├─ vinheta radial topo-esquerda        (gradiente azul suave, z-0)
 └─ <main card>                         (z-10, w-full max-w-[360px], px-6)
     ├─ Header
     │   ├─ Logo 64×64 com orbit ring (animação wi-orbit 3s linear infinite)
     │   │   └─ ícone Boxes centralizado
     │   ├─ "CORE Coletor" Syne 700, branco + accent
     │   ├─ subtítulo JetBrains Mono 11px uppercase: "WMS · LOGIN DO OPERADOR"
     │   ├─ status dot verde pulsante (wi-dot-pulse) + "SISTEMA ONLINE"
     │   └─ chip Cliente (quando bootTenant): mono uppercase, borda azul
     ├─ Card glass
     │   (bg rgba(10,22,40,.6), backdrop-blur-xl, border azul translúcido,
     │    rounded-2xl, shadow alta, animação wi-card-in fade+translateY)
     │   ├─ Campo LOGIN  (label mono uppercase, input h-14, ícone à esquerda)
     │   ├─ Campo SENHA  (idem, ícone cadeado)
     │   └─ Botão Entrar (ActionButton, com shimmer wi-shimmer 3s)
     └─ link discreto "Acessar Painel Administrativo"
```

## Detalhes técnicos

- **Cores principais**: bg `#020c1b`, surfaces `rgba(10,22,40,.6)`, borda `rgba(96,165,250,.18)`, accent `hsl(217 91% 60%)`, success `hsl(142 76% 45%)`.
- **Tipografia**:
  - títulos / botão: `font-family:'Syne'`
  - labels, chips e código: `font-family:'JetBrains Mono'`, `letter-spacing:.08em`, uppercase
  - inputs: Syne 16px (mobile-friendly, evita zoom no iOS).
- **Inputs**: altura 56px (touch target), `bg rgba(2,12,27,.6)`, borda `rgba(96,165,250,.2)`, foco com `ring` azul + leve glow `box-shadow 0 0 0 4px rgba(59,130,246,.15)`.
- **Animações** (keyframes inline no componente, escopo local — mesmo padrão do `LoginPage.tsx` admin):
  - `wi-orbit`: rotate 360° / 3s linear infinite no anel SVG do logo.
  - `wi-dot-pulse`: scale 0.7↔1 + opacity 0.5↔1 / 2s ease-in-out infinite.
  - `wi-shimmer`: faixa translúcida varrendo o botão a cada 3s.
  - `wi-card-in`: fade-in + translateY(16px→0) 0.5s ease-out no carregamento.
- **Background**: `<WarehouseCanvas />` posicionado como `fixed inset-0 z-0 pointer-events-none` (já encapsulado no componente). Respeita `prefers-reduced-motion` (já tratado).
- **Mobile-first**: card com `max-w-[360px]`, padding seguro `pt-[env(safe-area-inset-top)]` e `pb-[env(safe-area-inset-bottom)]`. Sem scroll horizontal.
- **Acessibilidade**: contraste mantido (texto branco / muted `hsl(213 31% 70%)`), `aria-hidden` no canvas e no anel orbital, foco visível nos inputs e botões.

## Lógica preservada (não tocar)

- Função `handleLogin` (RPC `fn_buscar_email_por_login`, `fn_user_belongs_to_tenant`, `signInWithPassword`, query `usuario`, fluxo `deve_trocar_senha`).
- Função `completeLogin` (gravação em `localStorage`, `syncTenantSession`, insert em `log_sessao_usuario`, `coletor_session_id`).
- `ForcePasswordChangeModal` com `variant="coletor"`.
- Botão "Acessar Painel Administrativo" com `onNavigate("/")`.
- Toda a integração com `useTenant` e `useTenantBoot`.

## Arquivos afetados

- `src/pages/coletor/ColetorLoginPage.tsx` — reescrita apenas do JSX retornado e adição de `<style>` com keyframes locais.

Nenhum outro arquivo será modificado (fontes, canvas e tema dark já estão disponíveis no projeto).
