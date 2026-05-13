## Objetivo

Permitir, em **Configurações → Integração ERP → Sincronização**, que cada entidade do módulo **Movimentos** (Movimentos de Entrada, Notas de Entrada, Pedidos de Venda, Movimentos de Saída) tenha um **intervalo de data (De / Até)** configurável. As Edge Functions de sincronização passarão a usar esse intervalo como filtro ao consultar o Omie, evitando reimportar dados antigos já processados.

---

## 1. Banco de dados (migration)

Adicionar duas colunas opcionais em `middleware.sync_config`:

```sql
ALTER TABLE middleware.sync_config
  ADD COLUMN data_inicio date NULL,
  ADD COLUMN data_fim    date NULL;

COMMENT ON COLUMN middleware.sync_config.data_inicio IS
  'Filtro de data inicial (somente Movimentos). NULL = sem limite inferior.';
COMMENT ON COLUMN middleware.sync_config.data_fim IS
  'Filtro de data final (somente Movimentos). NULL = sem limite superior.';
```

As colunas ficam disponíveis para todas as entidades, mas só serão usadas pelas de Movimentos. Não há mudança de RLS — herdam as policies existentes.

---

## 2. Frontend

### 2.1 `src/pages/integracao/SincronizacaoTab.tsx`

- Estender a interface `ConfigRow` com `data_inicio: string | null` e `data_fim: string | null`.
- Na renderização da tabela, **somente quando `mod.key === 'movimentos'**`, renderizar duas colunas adicionais entre **Intervalo** e **Últ. exec**: `Data De` e `Data Até`, cada uma com `<input type="date">` controlado.
  - `onChange` chama `upsertConfig(mod.key, ent.id, { data_inicio: value || null })` (ou `data_fim`), reaproveitando o mesmo padrão otimista já existente.
  - Para os outros módulos (Cadastros, Retorno) as colunas aparecem vazias (`—`) ou são suprimidas via `colSpan` — manteremos cabeçalho condicional por módulo (cada `<table>` é renderizada por módulo, então o header de Movimentos terá +2 colunas).
- Visual: mesma classe dos selects (`h-7 px-2 rounded border border-border bg-secondary/40 text-foreground text-xs`).

### 2.2 `src/pages/integracao/SincronizacaoTab.tsx` — execução manual

Ao clicar em **Play** (`handleRun`), enviar também `data_inicio` e `data_fim` no body para a Edge Function quando o módulo for `movimentos`:

```ts
supabase.functions.invoke(fn, {
  body: {
    tenant_id, empresa_id,
    data_inicio: cfg?.data_inicio ?? null,
    data_fim:    cfg?.data_fim ?? null,
  },
});
```

Nenhuma alteração em rotas, layout geral ou outros módulos.

---

## 3. Edge Functions (alteração manual pelo usuário)

As três Edge Functions de Movimentos (`sync-recebimentos`, `sync-notas-entrada`, `sync-pedidos-saida`) — e futuramente `sync-movimentos-saida` — precisam:

1. **Ler do body** (execução manual) **ou da `sync_config**` (execução agendada) os campos `data_inicio` e `data_fim`:
  ```ts
   const { data: cfg } = await mw
     .from("sync_config")
     .select("data_inicio, data_fim, last_omie_page, last_omie_id")
     .eq("tenant_id", tenant_id)
     .eq("empresa_id", empresa_id)
     .eq("modulo", "movimentos")
     .eq("entidade", entidade)
     .maybeSingle();

   const dInicio = body.data_inicio ?? cfg?.data_inicio ?? null;
   const dFim    = body.data_fim    ?? cfg?.data_fim    ?? null;
  ```
2. **Repassar ao Omie** os filtros de data conforme o endpoint:

  | Entidade                                   | Endpoint Omie                           | Campos de filtro                                                          |
  | ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------- |
  | `movimentos_entrada` (`sync-recebimentos`) | `ListarMovimentosEstoque` / equivalente | `dDtEntradaDe`, `dDtEntradaAte`                                           |
  | `notas_entrada` (`sync-notas-entrada`)     | `ListarNF`                              | `dEmiInicial`, `dEmiFinal` (ou `dDtEntradaDe/Ate` conforme NF de entrada) |
  | `pedidos_saida` (`sync-pedidos-saida`)     | `ListarPedidos`                         | `dDtInicial`, `dDtFinal`                                                  |

   Formato exigido pelo Omie: `dd/mm/aaaa`. Converter `YYYY-MM-DD` antes de enviar:
3. **Quando ambos forem `null**`, não enviar os campos ao Omie (mantém comportamento atual).
4. **Logs** (`sync_log`): incluir `data_inicio`/`data_fim` no payload de detalhe quando presentes, para rastreabilidade.
5. Cron/scheduler agendado **não muda** — ele apenas invoca a função sem body, e a função lê da `sync_config`.

---

## 4. Tipagem

Após a migration ser aplicada, o `src/integrations/supabase/types.ts` será regenerado automaticamente expondo `data_inicio` / `data_fim`. Nenhuma edição manual nesse arquivo.

---

## Fora de escopo

- Não alterar Cadastros nem Retorno.
- Não alterar layout, rotas, StatusBar, CredenciaisTab, LogsFilasTab.
- Não alterar lógica de cursor (`last_omie_id` / `last_omie_page`).
- Não alterar permissões/RLS.