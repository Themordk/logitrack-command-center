
## Objetivo

Garantir que a tela `src/pages/coletor/ColetorLoginPage.tsx` caiba inteira (sem scroll) em coletores com tela a partir de 3,5"–4" (≈ 320×480 a 360×640 CSS px), mantendo a identidade visual atual.

## Diagnóstico

A tela hoje empilha verticalmente:
- Header (logo orbitando 80px + título + subtítulo mono + badge "Sistema Online" + badge do tenant) → ~220px
- Card glass com padding 24px, dois inputs h-14 (56px) + labels + espaçamentos + botão h-60px → ~340px
- Link "Painel Administrativo" + margens → ~60px
- Padding vertical do container (`py-5` + safe-area) → ~40px

Total ≈ 660px de conteúdo, ultrapassando 480–568px de altura típica de coletores pequenos → força scroll.

## Mudanças (apenas em `ColetorLoginPage.tsx`)

Tornar a página adaptativa via breakpoints de altura, sem mexer em lógica de auth.

1. **Container**
   - Trocar `min-h-screen` por `h-screen` + `overflow-hidden`.
   - Reduzir padding vertical: `py-3` em telas baixas, mantendo `env(safe-area-inset-*)` mínimo.
   - Usar `justify-center` mas permitir encolhimento (`flex-col` com `gap` compacto).

2. **Header (logo + títulos)**
   - Logo: reduzir wrapper de 80×80 para 56×56 e ícone `Boxes` de 30 → 22.
   - Título `text-3xl` → `text-2xl`.
   - Remover (ou esconder via `hidden`) o subtítulo "WMS · LOGIN DO OPERADOR" e o badge "Sistema Online" em telas baixas — informação redundante para o operador.
   - Badge do tenant: manter, mas com `text-[9px]` e padding menor.
   - `gap-3 mb-6` → `gap-2 mb-3`.

3. **Card glass**
   - Padding `p-6` → `p-4`.
   - `space-y-5` entre campos → `space-y-3`.
   - Inputs `h-14` → `h-12`; ícones e textos proporcionais.
   - Label margin `mb-2` → `mb-1`.
   - Botão "Entrar": manter `ActionButton` (60px) — é o alvo de toque principal, não reduzir.

4. **Rodapé**
   - Link "Acessar Painel Administrativo": `mt-6` → `mt-3`, `text-[11px]` → `text-[10px]`.

5. **Estratégia responsiva**
   - Aplicar as reduções acima de forma incondicional (são suaves o suficiente para telas grandes) **ou** condicionadas via Tailwind arbitrary `max-h-[640px]:` para preservar o visual atual em smartphones maiores. Recomendado: aplicar incondicionalmente, pois o coletor é mobile-first e a economia de espaço beneficia todos.

6. **Animação**
   - Manter shimmer, orbit e pulse — apenas o tamanho da logo muda.

## Fora de escopo

- Lógica de autenticação, RPCs, tenant boot, modal de troca de senha.
- Outras páginas do coletor.
- Tokens globais do design system.

## Validação

- Abrir preview no viewport 320×568 (iPhone SE clássico, ~4") e 360×640 — confirmar que logo, inputs e botão "Entrar" cabem sem scroll.
- Confirmar em 390×844 que o layout continua agradável (não fica "pequeno demais").
