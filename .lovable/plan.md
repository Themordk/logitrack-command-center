## Objetivo

Centralizar a exibição de data/hora num único utilitário `src/utils/dateTime.ts` que converte UTC real → `America/Fortaleza` (UTC-3, sem horário de verão) usando `Intl.DateTimeFormat` nativo, e migrar 100% das telas para usar essa API.

Migração em **duas fases**, conforme decidido. Esta tarefa cobre **apenas a Fase 1 (exibição)**. A Fase 2 (corrigir `nowBrasilia()` para gravar UTC real + migração de dados antigos) fica como tarefa separada futura.

> Aviso importante: durante a Fase 1, dados gravados anteriormente via `nowBrasilia()` (que estão "Brasília mascarado de UTC") serão exibidos **3h atrasados**. Isso é esperado e será resolvido na Fase 2.

---

## Fase 1 — Escopo desta entrega

### 1. Criar `src/utils/dateTime.ts`

Único arquivo, sem dependências externas, usando `Intl.DateTimeFormat` com `timeZone: 'America/Fortaleza'`. Exporta:

- `formatDateTime(v)` → `dd/MM/yyyy HH:mm`
- `formatDate(v)` → `dd/MM/yyyy`
- `formatTime(v)` → `HH:mm`
- `formatDateTimeFull(v)` → `dd/MM/yyyy HH:mm:ss`

Regras comuns:
- Aceita `string | Date | null | undefined`
- Retorna `'—'` para nulo/indefinido/`Date` inválido
- Locale `pt-BR`, timezone fixo `America/Fortaleza`

### 2. Substituir em todo o projeto

Varrer todos os `.ts`/`.tsx` (44 arquivos identificados) e trocar:

| Padrão atual | Substituir por |
|---|---|
| `new Date(v).toLocaleDateString("pt-BR", …)` | `formatDate(v)` |
| `new Date(v).toLocaleTimeString("pt-BR", …)` | `formatTime(v)` |
| `new Date(v).toLocaleString("pt-BR", …)` | `formatDateTime(v)` ou `formatDateTimeFull(v)` conforme granularidade atual |
| `format(v, "dd/MM/yyyy …")` de `date-fns` (sem tz) | função equivalente do utilitário |
| Render direto `{row.created_at}` etc. | `formatDateTime(row.created_at)` |
| `formatBrasiliaDateTime` / `formatBrasiliaDate` / `formatBrasiliaTime` / `formatBrasiliaDateTimeShort` / `nowBrasiliaDisplay` (de `src/lib/dateUtils.ts`) | equivalentes do novo utilitário |

Manter intactos:
- `nowBrasilia()` em `src/lib/dateUtils.ts` (é gravação, não exibição) — será tratado na Fase 2.
- `new Date().toISOString()` usado para envio ao Supabase.
- Qualquer cálculo de duração (`diff` em ms) — não é formatação.
- Pickers (`react-day-picker`, `<Calendar>`) que usam `Date` local do navegador para seleção — apenas troque a exibição do valor escolhido se houver.

### 3. Limpeza do `dateUtils.ts`

Após migrar todos os usos, remover os exports `formatBrasiliaDateTime`, `formatBrasiliaDate`, `formatBrasiliaTime`, `formatBrasiliaDateTimeShort`, `nowBrasiliaDisplay` e o helper interno `stripOffset`/`toNaiveDate`. Manter apenas `nowBrasilia()` no arquivo (com comentário marcando-o como gravação legada a ser revista na Fase 2).

### 4. Memória do projeto

Atualizar a Core memory para refletir a nova regra:

> "Exibição de data/hora SEMPRE via `src/utils/dateTime.ts` (America/Fortaleza). Nunca usar `toLocaleString`, `date-fns format` cru ou render direto de campo de data."

E atualizar o mem leaf `mem://architecture/timestamp-standard` apontando que gravação (Fase 2) ainda usa `nowBrasilia()` mascarado e que isso é dívida técnica conhecida.

---

## Arquivos afetados (Fase 1)

**Novo:** `src/utils/dateTime.ts`

**Edição:** ~44 arquivos. Principais clusters:
- Páginas admin: `ProdutosPage`, `EntradasPage`, `SaidasPage`, `MovimentoEntradaPage`, `MovimentoSaidaPage`, `DocEntradaDetalhePage`, `DocSaidaDetalhePage`, `CadastroDocEntradaPage`, `CadastroDocSaidaPage`, `InventarioPage`, `NovoInventarioPage`, `InventarioExecucaoPage`, `AbastecimentoPage`, `VolumesPage`, `EnderecosBatchPage`.
- Coletor: `RecebimentoExecucaoPage`, `SeparacaoLotePage`, `SeparacaoProdutoPage`, `ConsultaHUPage`, `AbastecimentoListPage`.
- Relatórios (`src/modules/reports/*`): todos os `*ReportPage.tsx` e `TarefaDetalhePage.tsx`.
- Suporte: `SupportTenantDetailPage`, `SupportChamadosPage`.
- Integração: `FilasPanel`, `LogsPanel`, `SincronizacaoTab`, `StatusBar`.
- Modais/erp: `ImportarPedidoSaidaModal`, `CrudTable`.

**Edição final:** `src/lib/dateUtils.ts` (remover exports de formatação).

---

## Fora de escopo (vira Fase 2 separada)

- Corrigir `nowBrasilia()` para gravar UTC real (`new Date().toISOString()` puro).
- Auditar e migrar dados históricos gravados como "Brasília mascarado de UTC" (`UPDATE … SET col = col - INTERVAL '3 hours'` ou similar, por tabela).
- Auditar funções/triggers SQL que usam `now()` vs valores recebidos pelo cliente.
- Auditar RPCs que recebem timestamp do cliente.

## Critérios de aceite

- [ ] `src/utils/dateTime.ts` criado conforme assinatura solicitada.
- [ ] `rg "toLocaleDateString|toLocaleTimeString|toLocaleString\\(" src` retorna apenas resultados não-data (ex.: `Number.toLocaleString`) ou zero ocorrências em campos de data.
- [ ] `rg "formatBrasilia" src` retorna zero.
- [ ] `rg "from ['\"]date-fns['\"]" src` revisado — apenas usos sem timezone removidos; `Calendar`/`format(range.from, …)` permanecem onde forem entrada de UI.
- [ ] Build/typecheck verde.
- [ ] Memória do projeto atualizada.
