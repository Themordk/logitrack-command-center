## Correção de Timezone — Etapa 1: substituir `nowBrasilia()` por `new Date().toISOString()`

### Problema
`nowBrasilia()` gera timestamp em horário de São Paulo **sem offset**. PostgreSQL interpreta como UTC → gravações ficam 3h atrasadas, quebrando comparações com `now()` (ex.: indicador de Operadores Ativos).

### Correção
Substituir chamadas de escrita por `new Date().toISOString()` (UTC real). A função `nowBrasilia()` **permanece** em `src/lib/dateUtils.ts` (dívida Fase 2). Nenhuma mudança em RPC, banco, UI, lógica ou estilos.

### Arquivos alterados (7)

| # | Arquivo | Ação |
|---|---------|------|
| 1 | `src/pages/coletor/ColetorLoginPage.tsx` | `inicio_sessao` e `ultimo_heartbeat` → `toISOString()`; remover import |
| 2 | `src/components/coletor/ColetorLayout.tsx` | `ultimo_heartbeat` e `fim_sessao` → `toISOString()`; remover import |
| 3 | `src/lib/lmsTimestamp.ts` | `iniciado_em` → `toISOString()`; remover import |
| 4 | `src/pages/coletor/RecebimentoIniciarPage.tsx` | `conferencia_iniciada_em` → `toISOString()`; remover `nowBrasilia` do import |
| 5 | `src/pages/coletor/MudancaPickingDestinoPage.tsx` | `const now = new Date().toISOString()`; remover import |
| 6 | `src/pages/coletor/TransferenciaDestinoPage.tsx` | `const now = new Date().toISOString()`; remover import |
| 7 | `src/components/movimentos/ReatribuirTarefasModal.tsx` | `const agora = new Date().toISOString()`; remover import |

**Total:** 10 substituições, 7 imports removidos.

### Fora do escopo
- Não alterar `nowBrasilia()` em `dateUtils.ts` (pode ter outros usos).
- Não alterar `src/utils/dateTime.ts`, RPCs, migrations, UI, lógica de negócio ou qualquer outro arquivo.
