# Fix 24/11/2026 — onda presa em "Separado" após corte total

**Sintoma (QA, onda 2742, tipo RETIRA):** onda concluída → limpeza da conferência/separação de um item →
corte total desse item no coletor → onda fica em SEPARADO em vez de CONCLUIDA.

**Causa:** `fn_gerar_conferencia_saida` (disparada quando a onda vira SEPARADO) não cria SEP-CONF
(item cortado tem quantidade 0; os demais já têm conferência concluída) e caía em `JA_EXISTE`
sem encerrar a etapa. Quem encerra a conferência (`fn_onda_concluir_etapa(..., 2)`) só roda ao
concluir uma SEP-CONF — e não sobrou nenhuma aberta.

**Correção (v7):** sem nada novo a conferir, sem tarefa aberta na onda e com SEP-CONF concluída →
`fn_onda_concluir_etapa(tenant, onda, 2)` (CONFERIDO → CONCLUIDA se for a última etapa; com
embarque fica CONFERIDO aguardando a carga). Novo código de retorno `CONFERENCIA_JA_CONCLUIDA`.

| Arquivo | |
|---|---|
| `supabase/migrations/20261124140000_fix_conferencia_ja_concluida.sql` | splice com âncora única |
| `supabase/rollback/20261124_fix_conferencia_ja_concluida_reverter.sql` | volta à v6 (ensaiado: hash = produção `4c57438a…`) |

## Testes no QA
- Cenário da 2742 (tudo conferido + item cortado, onda volta a SEPARADO) → CONCLUIDA, pedido `expedido`.
- Regressão: com uma SEP-CONF ainda aberta → continua SEPARADO, sem duplicar conferência.
- Baterias: S2 20/20, S1 24/24, etiqueta 21/21, HU 17/17.
- Onda 2742 destravada (CONCLUIDA às 14:16 de 24/11).

## Produção
`fn_gerar_conferencia_saida` em produção é idêntica à do QA antes do fix (mesmo hash). Leitura em 24/11:
onda **1970** está SEPARADO sem tarefa aberta e com conferência concluída — candidata ao mesmo destravamento
(`SELECT fn_gerar_conferencia_saida(<id>, <tenant>)` com sessão do tenant) depois de publicar o fix.
