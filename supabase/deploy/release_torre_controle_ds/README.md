# Release Torre de Controle + base do design system

Release só de frontend. Não há migration, função, gatilho nem Edge Function: o banco de produção não muda.

## O que entra

| Bloco | Commit original (feat/armazenagem-fluxo) | Conteúdo |
|---|---|---|
| A — base do design system | 49b6486 | Tokens semânticos (`success/warning/danger/info/neutral`, `zona-*`, `chart-1..6`, `shadow-overlay`), escala tipográfica, `cn()` com a escala, componentes `@/components/ds` (`PageHeader`, `SectionCard`, `KpiCard`, `StatusPill`, `EmptyState`), regras em `src/AGENTS.md`, catraca `npm run design:check` |
| B — Torre de Controle | cda6bd9 | `Dashboard.tsx` e `pages/dashboard/components/*` no padrão; `PageSection` e props de gráfico (`chart.ts`); `KpiCard` com variação, contexto, tom e ajuda |
| C — filtro padrão | 52247fb | A Torre de Controle abre com todos os armazéns |

Os três commits foram reaplicados sobre a `main` (cherry-pick) no branch `release/torre-controle-ds`.

## O que não entra

- `b860d47` e `9f8be72` (retorno ao ERP: eventos de movimentação interna e botão "Importar do ERP" por fluxo). Têm migrations e Edge Function; seguem em `feat/armazenagem-fluxo` para uma release própria.
- Proposta de redesign de Movimentos de entrada (só wireframe, sem código).

## Impacto fora da Torre de Controle

- Os tokens novos só existem onde são usados (Torre de Controle e `components/ds`). Nenhum token antigo foi alterado.
- `cn()` passou a usar `extendTailwindMerge` com as classes `text-caption … text-metric`; para as classes já existentes o resultado é o mesmo.
- O serviço da Torre de Controle (`dashboard.service`) e as RPCs que ele chama não mudaram.

## Conferência antes do merge (28/11/2026)

| Item | Resultado |
|---|---|
| Aprovação do dono | "Vamos subir apenas o painel de dashboard… pode fazer o merge para o main" (28/11/2026 12:19) |
| Banco | Sem alteração; nada a aplicar |
| `tsc --noEmit -p tsconfig.app.json` | 0 erros |
| `vitest run` | 98 arquivos, 649 testes ok |
| `vite build` | ok |
| `npm run design:check` | nenhum número subiu |
| Validação visual | Preview da Vercel em `feat/armazenagem-fluxo` (26/11/2026) |

## Reversão

Frontend apenas: na Vercel, promover de volta o deployment de produção anterior (Instant Rollback), ou `git revert -m 1 <merge>` na `main`. Não há passo de banco.

## Registro

Preenchido após o merge.
