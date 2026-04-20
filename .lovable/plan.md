

## Plano: Padronização Global de DataHora em Brasília (UTC-3)

### Diagnóstico da causa raiz

O problema atual é um **conflito entre escrita e leitura** de timestamps:

**Na escrita** (`nowBrasilia()` em `src/lib/dateUtils.ts`):
- Retorna string sem offset: `"2026-04-20T17:48:58"` (já convertida para horário de Brasília).
- Postgres recebe essa string em coluna `timestamp with time zone` e **interpreta como UTC** → grava `2026-04-20 17:48:58+00`.

**Na leitura** (relatórios e telas):
- `new Date(v).toLocaleString("pt-BR")` recebe `2026-04-20 17:48:58+00`, converte de UTC para Brasília subtraindo 3h → exibe `14:48:58`.
- Mas o operador realmente fez a ação às **17:48 (Brasília)**, então deveria aparecer **17:48**.

Resultado prático: **horário sempre 3h "adiantado" em relação ao real** (na verdade está 3h atrasado, porque está mostrando Brasília-3h quando o relógio do operador era Brasília).

Verificação em produção (`tarefa_execucao` mais recente): coluna `iniciado_em = 2026-04-20 20:48:58+00`. Como agora são ~20:52 UTC = 17:52 Brasília, os dados foram gravados como se fossem 20:48 UTC (= 17:48 Brasília no relógio do operador), e ao ler de volta exibimos 20:48 — **3h a mais que o esperado**.

### Estratégia de correção

Há duas escolhas arquiteturais. Recomendo a **Opção A** (mais simples, sem migração):

#### Opção A — Corrigir leitura (recomendada)
Manter `nowBrasilia()` gravando "horário local Brasília como UTC" (comportamento legado, milhares de registros já gravados assim) e **forçar a leitura também a interpretar como horário local**, sem aplicar conversão de timezone.

- **Vantagem**: zero migração de dados, retrocompatível com todos os registros históricos.
- **Como**: criar formatter `formatBrasilia(value)` que faz parse e formata **sem conversão** (trata o valor como já estando em Brasília).

#### Opção B — Corrigir escrita (descartada)
Reescrever `nowBrasilia()` para retornar ISO UTC real + migração para corrigir todos os registros históricos somando 3h. Risco alto, sem ganho prático.

### Implementação (Opção A)

**1. Centralizar formatação em `src/lib/dateUtils.ts`** — adicionar 3 helpers puros:

```ts
// Trata timestamp do banco como horário Brasília "cru" (sem reconverter TZ)
export function formatBrasiliaDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const s = typeof v === "string" ? v : v.toISOString();
  // Remove offset/Z para evitar conversão automática do JS
  const naive = s.replace(/(\+|-)\d{2}:?\d{2}$|Z$/, "");
  const d = new Date(naive); // interpretado como local time
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function formatBrasiliaDate(v: string | Date | null | undefined): string { /* idem, só data */ }
export function formatBrasiliaTime(v: string | Date | null | undefined): string { /* idem, só hora */ }
```

**Por que funciona**: ao remover o sufixo `+00`/`Z`, o `new Date` passa a interpretar a string como horário local do navegador. Como no banco gravamos "horário Brasília" mascarado como UTC, o JS lê os dígitos brutos (17:48) e os exibe sem subtrair 3h.

**2. Substituir todas as ocorrências de formatação** nos arquivos abaixo, trocando `new Date(v).toLocaleString("pt-BR")` por `formatBrasiliaDateTime(v)`:

| Arquivo | Ocorrências |
|---|---|
| `src/modules/reports/cortes/CortesReportPage.tsx` | `autorizado_em` + `generatedAt` |
| `src/modules/reports/estoque/EstoqueReportPage.tsx` | `atualizado_em` + `generatedAt` |
| `src/modules/reports/movimentacoes/MovimentacoesReportPage.tsx` | `criado_em` + `generatedAt` |
| `src/modules/reports/movimentacoes/TarefaDetalhePage.tsx` | `formatDate`, `formatDateShort` (substituir corpo) |
| `src/modules/reports/produtividade/ProdutividadeOperadorPage.tsx` | revisar campos de hora |
| `src/modules/reports/produtividade/ProdutividadeDashboardPage.tsx` | revisar `generatedAt` |
| `src/modules/reports/ocupacao/OcupacaoReportPage.tsx` | revisar `generatedAt` |
| `src/pages/MovimentoEntradaPage.tsx` | `fmtDateTime`, `fmtDate` |
| `src/pages/MovimentoSaidaPage.tsx` | 2x `concluido_em` |
| `src/pages/InventarioExecucaoPage.tsx` | `fmtDate` |
| `src/pages/coletor/ConsultaHUPage.tsx` | `concluido_em` |

**3. `generatedAt` dos cabeçalhos** (`new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })`):
- Esta linha está **correta** para o "agora do navegador" (converte UTC do cliente → Brasília).
- Mas para padronização, trocar para um único helper `nowBrasiliaDisplay()` que usa o mesmo padrão de exibição dos demais campos. Mantém o offset real (data/hora locais do cliente convertidas para Brasília) — o caso de uso é diferente: aqui sabemos que o `Date` é UTC real do relógio do navegador, não um timestamp do banco.

```ts
export function nowBrasiliaDisplay(): string {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
```

**4. Sem alterações em `nowBrasilia()`** (escrita) — comportamento legado preservado para manter compatibilidade com todos os registros já gravados.

### Diagrama do fluxo corrigido

```text
ANTES (bug)
─────
Operador clica 17:48 (Brasília)
  → nowBrasilia() retorna "2026-04-20T17:48:00"
  → Postgres grava como UTC: 2026-04-20 17:48:00+00
  → Frontend: new Date("2026-04-20 17:48:00+00").toLocaleString("pt-BR")
  → Converte UTC→Brasília: exibe 14:48:00  ❌ (3h atrasado)
  
Aguardando 1s e ler de novo, com `timeZone:Sao_Paulo`:
  → exibe 14:48:00  ❌ (mesmo erro)

DEPOIS (correção)
─────
Operador clica 17:48 (Brasília)
  → nowBrasilia() retorna "2026-04-20T17:48:00" (igual)
  → Postgres grava como UTC: 2026-04-20 17:48:00+00 (igual)
  → Frontend: formatBrasiliaDateTime("2026-04-20 17:48:00+00")
  → Remove "+00" → "2026-04-20 17:48:00"
  → new Date(naive).toLocaleString("pt-BR") → exibe 17:48:00  ✅
```

### Arquivos modificados

| Arquivo | Tipo | Mudança |
|---|---|---|
| `src/lib/dateUtils.ts` | alterado | Adiciona `formatBrasiliaDateTime`, `formatBrasiliaDate`, `formatBrasiliaTime`, `nowBrasiliaDisplay` |
| `src/modules/reports/cortes/CortesReportPage.tsx` | alterado | Usa novos helpers |
| `src/modules/reports/estoque/EstoqueReportPage.tsx` | alterado | Usa novos helpers |
| `src/modules/reports/movimentacoes/MovimentacoesReportPage.tsx` | alterado | Usa novos helpers |
| `src/modules/reports/movimentacoes/TarefaDetalhePage.tsx` | alterado | Usa novos helpers |
| `src/modules/reports/produtividade/ProdutividadeOperadorPage.tsx` | alterado | Usa novos helpers |
| `src/modules/reports/produtividade/ProdutividadeDashboardPage.tsx` | alterado | Usa novos helpers |
| `src/modules/reports/ocupacao/OcupacaoReportPage.tsx` | alterado | Usa novos helpers |
| `src/pages/MovimentoEntradaPage.tsx` | alterado | Usa novos helpers |
| `src/pages/MovimentoSaidaPage.tsx` | alterado | Usa novos helpers |
| `src/pages/InventarioExecucaoPage.tsx` | alterado | Usa novos helpers |
| `src/pages/coletor/ConsultaHUPage.tsx` | alterado | Usa novos helpers |

### Observações

- **Memória do projeto**: o padrão "Brasília UTC-3 via `nowBrasilia()`" continua válido; reforça-se a regra "para exibição use `formatBrasilia*`, nunca `new Date(v).toLocaleString` direto".
- **Não há migração de banco** — risco zero para dados históricos.
- **Após implantar**, tarefas/movimentos antigos passam a exibir o horário "real" que o operador viu no relógio quando executou — o que é o comportamento desejado e foi o que causou a abertura do chamado.
- **Edge case**: se um dia migrarmos `nowBrasilia()` para gravar UTC real, basta ajustar os helpers para voltar a aplicar `timeZone: "America/Sao_Paulo"` — fica isolado em um único arquivo.

