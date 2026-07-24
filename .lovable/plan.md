
## Objetivo
Mostrar, nas listas e nos detalhes de Movimentos de Entrada/Saída, se o movimento já foi sincronizado com o ERP (Omie), através de um badge padronizado, com filtro dedicado e uma nova coluna "ERP".

## Escopo — arquivos afetados
- `src/components/movimentos/ErpStatusBadge.tsx` (novo) — badge reutilizável
- `src/hooks/useTenantHasErp.ts` (novo) — verifica se o tenant tem `erp_conexao` ativo (cached via React Query)
- `src/pages/MovimentoEntradaPage.tsx` — coluna ERP na lista + filtro + badge no detalhe
- `src/pages/MovimentoSaidaPage.tsx` — coluna ERP na lista + filtro + badge no detalhe

Nenhuma alteração de schema, RPC ou lógica de negócio: apenas leitura do `status` já retornado.

## Regras (do prompt)

### Entrada (`movimento_entrada.status`)
- `EXPORTADO` → badge verde "Exportado ERP" (ícone `CheckCircle2`)
- `ARMAZENADO` → badge amarelo "Aguardando ERP" (ícone `Clock`)
- Demais status (inclusive `CANCELADO`) → sem badge

### Saída (`movimento_saida.status`)
- `EXPORTADA_ERP` → badge verde
- `CONCLUIDA` → badge amarelo
- Demais status (inclusive `CANCELADA`) → sem badge

## Componente `ErpStatusBadge`
- Props: `status: string`, `tipo: "entrada" | "saida"`
- Retorna `null` quando não se aplica
- Desktop: ícone + texto; Mobile (`< 768px` via `useIsMobile`): somente ícone com `title` (tooltip)
- Cores conforme spec (emerald/amber com `/10` bg e borda `/30`), dark-mode nativo

## Hook `useTenantHasErp`
- Query key `["tenant-has-erp", tenantId]`
- Consulta `erp_conexao` filtrando por `tenant_id` e `ativo = true` (limit 1, `head:true`, `count:exact`)
- `staleTime` 5 min; usado para condicionalmente renderizar a coluna ERP e o filtro

## Listagens (Entrada/Saída)
1. Nova coluna "ERP" (~140px) logo após a coluna Status, apenas quando `hasErp === true`. Header com `title` "Indica se o movimento foi sincronizado com o ERP".
2. Célula usa `<ErpStatusBadge status={mov.status} tipo="entrada|saida" />`.
3. Novo filtro "Status ERP" na barra de filtros (dropdown), opções:
   - Todos (default)
   - Exportado
   - Aguardando exportação
   - Sem integração
4. O filtro é aplicado **client-side sobre o resultado paginado** setando um estado adicional `filterErp`. Justificativa: as RPCs `p_status` já existentes aceitam apenas um status; ampliar isso exigiria mudança de backend. O filtro é opcional/complementar e não interfere com o filtro de status principal. Também esconde a coluna ERP quando o tenant não tem integração.

## Detalhe do movimento
- No cabeçalho/resumo do painel de detalhe (`MovimentoEntradaPage` e `MovimentoSaidaPage`), renderizar o `ErpStatusBadge` ao lado do bloco de Status.
- Quando o status for `EXPORTADO`/`EXPORTADA_ERP`, exibir também `updated_at` formatado via `formatDateTime` (`src/utils/dateTime.ts`). O `updated_at` já vem no `selectedMov`/`movimentoInfo` — se não vier, incluí-lo no select existente do detalhe (sem RPC nova).

## Não faremos
- Nenhuma migração de banco
- Nenhuma alteração em RPC/edge function
- Nada fora de Movimento de Entrada e Movimento de Saída
