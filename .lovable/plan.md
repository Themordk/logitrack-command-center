Atualizar tipagem TypeScript da RPC `middleware_get_sync_configs` em `src/integrations/supabase/types.ts` para refletir campos nullable corrigidos no backend.

**Alteração no arquivo `src/integrations/supabase/types.ts` (linhas ~6241-6246):**

```text
De:
  data_fim: string
  data_inicio: string
  last_omie_id: number
  last_omie_page: number

Para:
  data_fim: string | null
  data_inicio: string | null
  last_omie_id: number | null
  last_omie_page: number | null
```

**Verificação em `SincronizacaoTab.tsx`:**
- O tipo local `ConfigRow` já declara os 4 campos como nullable.
- O `handleRun` já passa `cfg?.data_inicio ?? null` e `cfg?.data_fim ?? null`.
- Nenhuma alteração de lógica, layout ou comportamento será feita.
