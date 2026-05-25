## Diagnóstico

As duas telas usam corretamente `formatDateTime` de `src/utils/dateTime.ts`. O problema **não está no frontend**, mas na **origem dos dados**:

- `vw_estoque_movimento_relatorio.criado_em` → `timestamp without time zone`
- `estoque_geral.atualizado_em` → `timestamp without time zone`

(Confirmado via consulta a `information_schema.columns`.)

Como essas colunas **não são `timestamptz`**, o PostgREST devolve o valor **sem offset** (ex.: `"2026-05-25T21:31:30.198549"`). O `formatDateTime` foi desenhado sob a premissa "banco em UTC real" — ele chama `new Date(value)` e converte para `America/Fortaleza`. Quando a string não tem offset:

- O `new Date()` interpreta como horário **local do navegador** (pela spec ES).
- Se o navegador está em UTC (ou diferente de UTC-3), o `Intl` reconverte e o valor exibido **fica 3h atrás** do real — exatamente o sintoma relatado ("padrão UTC").
- Mesmo em navegador Brasília, o resultado é frágil (depende do TZ da máquina, não do dado).

Esses dois campos são gravados por triggers/serviços que usam o legado "Brasília mascarado" — então o valor cru já está em horário de Brasília, só falta o offset `-03:00` para ser interpretado corretamente.

## Plano (Fase 1 — exibição)

### 1. Adicionar variante `formatDateTimeNaive*` em `src/utils/dateTime.ts`

Helpers que tratam strings sem offset como **Brasília mascarada** (anexa `-03:00` antes de parsear). Para `Date` ou string com offset, comporta-se igual a `formatDateTime`.

```ts
// pseudo
function parseNaiveAsBrasilia(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string' && /T?\d{2}:\d{2}/.test(v) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) {
    return new Date(v.replace(' ', 'T') + '-03:00');
  }
  return new Date(v);
}
export function formatDateTimeNaive(v) { /* mesmo formato dd/MM/yyyy HH:mm */ }
export function formatDateTimeNaiveFull(v) { /* dd/MM/yyyy HH:mm:ss */ }
```

Mantém `formatDateTime` (real UTC) intacto para colunas `timestamptz`.

### 2. Trocar as duas chamadas problemáticas

- `src/modules/reports/movimentacoes/MovimentacoesReportPage.tsx` → coluna `criado_em` usa `formatDateTimeNaive`.
- `src/modules/reports/estoque/EstoqueReportPage.tsx` → coluna `atualizado_em` usa `formatDateTimeNaive`.

Nada mais muda nessas telas.

### 3. Atualizar memória do projeto

Acrescentar regra em `mem://architecture/timestamp-standard`: campos vindos de colunas `timestamp without time zone` devem usar `formatDateTimeNaive*`; campos `timestamptz` continuam com `formatDateTime`. Listar as colunas conhecidas hoje (`estoque_geral.atualizado_em`, `vw_estoque_movimento_relatorio.criado_em`).

## Fora de escopo (Fase 2)

- Converter as colunas `timestamp` para `timestamptz` no banco e migrar dados históricos.
- Corrigir `nowBrasilia()` para gravar UTC real.
- Após Fase 2, `formatDateTimeNaive*` pode ser deprecado.

## Critérios de aceite

- Relatório de Posição de Estoque: coluna "Última Atualização" exibe horário Brasília correto independente do TZ do navegador.
- Relatório de Histórico de Movimentações: coluna "Data/Hora" exibe horário Brasília correto.
- `formatDateTime` (UTC real) segue funcionando nas outras telas.
- Build verde.
