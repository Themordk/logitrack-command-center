## Modernização Visual — Tela de Login (CORE LogiTrack)

Aplicar o conceito **Warehouse Intelligence** apenas na camada visual de `src/pages/LoginPage.tsx`. Toda a lógica de autenticação, fluxo de suporte, troca de senha forçada, validação de tenant por subdomínio e overlay anti-flash será **preservada integralmente**.

### Escopo

- Atualizar **somente** o portal administrativo (`LoginPage.tsx`).
- **Não** alterar `ColetorLoginPage.tsx` (mantém visual atual do coletor).
- **Não** alterar fluxos, RPCs, contextos (`TenantBootContext`, `TenantContext`), nem `ForcePasswordChangeModal`.

### Mudanças

**1. Fontes (Google Fonts)**
- Adicionar `Syne` (400, 700) e manter `JetBrains Mono` (400, 500) no `@import` de `src/index.css`.
- `Inter` permanece como fonte global (resto do app usa Inter).
- Aplicar Syne/JetBrains Mono **localmente** no LoginPage via classes utilitárias inline (`style={{ fontFamily: '...' }}` ou classes `font-syne`, `font-mono`).

**2. Background animado (Canvas)**
- Novo componente local (dentro do mesmo arquivo ou `src/components/login/WarehouseCanvas.tsx`):
  - `<canvas>` fullscreen, `position: fixed`, `z-index: 0`, base `#05101f`.
  - Grid 80px (`rgba(30,70,130,0.18)`, 0.5px).
  - Dots nas interseções (`rgba(59,130,246,0.25)`, r=1.5).
  - Pulsos radiais a cada ~1.8s a partir de interseções aleatórias (`rgba(96,165,250,0.6)`, fade out ao expandir).
  - 18 partículas flutuantes (`rgba(96,165,250,0.35)`, r=0.5–2px), movimento lento aleatório.
  - Loop com `requestAnimationFrame`, cleanup no `useEffect` return, redimensionamento com `resize` listener e `devicePixelRatio` para nitidez.
  - Respeita `prefers-reduced-motion` (estático se ativo).

**3. Card de login**
- Container central, `z-index: 10`, `width: 360px`, `padding: 40px`.
- `background: rgba(8,20,40,0.82)`, `backdrop-filter: blur(16px)`.
- `border: 1px solid rgba(59,130,246,0.25)`, `border-radius: 16px`.
- `box-shadow: 0 0 60px rgba(59,130,246,0.08), inset 0 1px 0 rgba(255,255,255,0.06)`.
- Animação de entrada: fade-in + `translateY(16px → 0)` em 0.5s ease-out (keyframe novo em `tailwind.config.ts` ou inline `<style>`).

**4. Logo + título**
- Ícone (Boxes lucide) 46x46, `border-radius: 12px`, `background: linear-gradient(135deg,#1d4ed8,#3b82f6)`.
- Anel orbital ao redor: `border-radius: 50%`, `border: 2px solid transparent`, `border-top-color: #60a5fa`, gira 360° / 3s linear infinite.
- Título "CORE LogiTrack" — Syne 700, 18px, `#e2e8f0`; "LogiTrack" em `#60a5fa`.
- Subtítulo "Sistema de Gestão de Armazém" — uppercase, 10px, `letter-spacing: 0.1em`, `#4b6fa8`.
- No modo `support`, subtítulo vira "Painel de Suporte".

**5. Badge de acesso**
- Pill: `background: rgba(59,130,246,0.1)`, `border: 1px solid rgba(59,130,246,0.3)`, `border-radius: 20px`, padding horizontal.
- Dot verde pulsante 6px `#22c55e` (scale 0.7↔1.0, opacity 0.5↔1.0, 2s).
- Texto: `ACESSO: {bootTenant.nome.toUpperCase()}` em JetBrains Mono 10px, `letter-spacing: 0.12em`, `#93c5fd`.
- No modo support: `ACESSO: SUPORTE DA PLATAFORMA` (com cor âmbar mantida ou azul — usar âmbar para diferenciar).
- Sem tenant e sem support: badge oculto.

**6. Campos do formulário**
- Labels: uppercase, 9px, `letter-spacing: 0.14em`, JetBrains Mono, `#4b6fa8`.
- Inputs: `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(59,130,246,0.2)`, `border-radius: 8px`, padding `10px 12px`, font 13px JetBrains Mono `#cbd5e1`.
- Foco: `border-color: rgba(96,165,250,0.6)`, `background: rgba(59,130,246,0.06)`.

**7. Botão Entrar**
- Full width, padding 12px, `border-radius: 8px`, `background: linear-gradient(90deg,#1d4ed8,#3b82f6)`.
- Texto "Entrar" + ícone `LogIn` (lucide).
- Shimmer: pseudo-elemento (ou span absoluto) com banda branca translúcida varrendo da esquerda para direita a cada 3s no hover (keyframe).
- Font: Syne 600, 14px, branco, `letter-spacing: 0.03em`.
- Estado loading: spinner Loader2 mantido.

**8. Footer link**
- "Acessar Coletor de Dados" — 11px, `#4b6fa8`, sublinhado, centralizado.
- No modo support: "← Voltar à identificação do cliente" mantém comportamento.

**9. Overlay anti-flash do redirect de suporte**
- Aplicar mesmo background `#05101f` + canvas (ou versão simplificada estática) para consistência visual durante o redirect.

### Detalhes técnicos

- **Keyframes novos** em `tailwind.config.ts`:
  - `orbit-spin` (360° / 3s linear)
  - `dot-pulse` (scale + opacity, 2s)
  - `card-enter` (fade + translateY, 0.5s ease-out)
  - `btn-shimmer` (translateX -100% → 200%, 3s)
- Alternativa: definir keyframes em `<style>` inline dentro do componente para isolar do resto do app.
- **z-index**: canvas `z-0`, card `z-10`.
- **Acessibilidade**: manter `<label>`, `required`, `type="password"`; `aria-hidden` no canvas.
- **Performance**: canvas pausado quando aba inativa (`document.hidden` check no RAF loop).
- **Sem dependências novas** — apenas Google Fonts já compatível com o `@import` existente.

### Arquivos modificados

```text
src/index.css                  -> +Syne no @import; opcional: classe .font-syne
src/pages/LoginPage.tsx        -> reescrita da camada visual; lógica intacta
tailwind.config.ts             -> +keyframes/animations (orbit, pulse-dot, card-enter, shimmer)
```

### Critérios de aceite

- Login admin (tenant + support) funciona idêntico ao atual.
- Fluxo de troca de senha forçada continua disparando o modal.
- Visual reflete spec: canvas animado, card glass, badge, fontes corretas.
- Coletor (`/coletor`) permanece com visual atual.
- Sem novos warnings no console; animações suaves a 60fps em desktop.
