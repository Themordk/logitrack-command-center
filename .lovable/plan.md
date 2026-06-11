# Refatoração — Zonas de Atividade

## Objetivo
Reescrever `src/pages/ZonasAtividadePage.tsx` e seus modais para entregar uma experiência densa, performática e visualmente alinhada às demais telas de cadastro (referência: `EnderecosPage.tsx`), com suporte a milhares de endereços vinculados por zona.

## Pontos a confirmar antes de codificar
1. **Enum `tipo_grupo`**: o schema atual aceita `PICKING | ARMAZENAGEM | INVENTARIO`. O briefing pede `PICKING / RECEBIMENTO / EXPEDIÇÃO / INVENTÁRIO`. Vou manter os valores do banco (`PICKING / ARMAZENAGEM / INVENTARIO`) e apenas exibir os rótulos solicitados quando houver correspondência — adicionar novos valores exigiria migração de enum. Confirmar se devo gerar migração para expandir o enum.
2. **Campo do código de endereço**: na tabela `endereco`, o padrão `R01-P01-N02-A01` vive em `descricao` (e existe também `codigo_endereco` opcional). Vou usar `descricao` como "código" exibido e parsear daí.

## Estrutura de arquivos
- `src/pages/ZonasAtividadePage.tsx` — reescrita completa
- `src/pages/zonas/ZonaEnderecosSheet.tsx` — novo (gerenciador lateral)
- `src/pages/zonas/AddEnderecosDialog.tsx` — novo (dialog de vínculo em lote)
- `src/pages/zonas/utils.ts` — `parseEndereco(desc)` → `{ ruela, predio, nivel, andar }`
- `src/hooks/useDebounce.ts` — criar se não existir

## Parte 1 — Página principal
- Layout idêntico a `EnderecosPage`: `CrudTable` com título "Zonas de Atividade", subtítulo dinâmico de contagem, toolbar com busca + filtros `Tipo` e `Status` + botão "+ Nova Zona".
- Colunas: `descricao`, `armazem_nome` (lookup em `armazemOptions`), `tipo` (badge outline), `total_enderecos` (badge circular `bg-muted`), `ativo` (`StatusBadge`), ações.
- `total_enderecos`: buscar via RPC agregada única — `select zona_atividade_id, count(*) from endereco_zona_atividade where tenant_id=... group by zona_atividade_id` — e mapear em memória para evitar N+1. Refetch após vincular/desvincular.
- Ações: `Link2` (abre Sheet), `Pencil` (editar), `Trash2` (delete) — todos `ghost` com `Tooltip` e `aria-label`.
- Linha clicável (exceto coluna ações) → abre Sheet.
- Empty state com `MapPin`; loading com skeleton rows.

## Parte 2 — Sheet lateral de gerenciamento
- `Sheet side="right"` com `sm:max-w-[720px]`, header (nome + armazém · tipo + badge contagem), Separator, toolbar sticky (busca + filtros Ruela/Prédio/Nível/Andar + Limpar + "Exibindo X de Y"), tabela com `ScrollArea h-[calc(100vh-280px)]`, footer sticky (paginação + "+ Adicionar Endereços").
- **Paginação server-side**, 50/pág. Query:
  ```ts
  supabase.from('endereco_zona_atividade')
    .select('id, endereco_id, created_at, endereco!inner(id, descricao, armazem_id)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('zona_atividade_id', zonaId)
    .eq('endereco.armazem_id', zona.armazem_id)
    .ilike('endereco.descricao', `%${search}%`)
    .order('descricao', { foreignTable: 'endereco', ascending: true })
    .range(offset, offset + 49);
  ```
- Filtros Ruela/Prédio/Nível/Andar derivam do `parseEndereco(descricao)`. Como vivem em string, aplicar via `ilike` no padrão (`R01-%`, `%-P02-%` etc.) para manter filtragem server-side.
- Colunas: `CÓDIGO` (font-mono primary), `RUELA` (badge), `PRÉDIO/NÍVEL/ANDAR` (text-center muted), `VINCULADO EM` (dd/mm/aaaa via `dateUtils`), ação `Unlink2`.
- Desvincular: sem dialog — `toast(`Desvincular ${cod}?`, { action: { label: 'Confirmar', onClick: ... } })`; sucesso → remove da lista (otimista) + refetch contador.
- Empty state com `Link2Off`.
- Busca/filtros com `useDebounce(300ms)`. Refetch preserva scroll (não desmontar `ScrollArea`).

## Parte 3 — Dialog "Adicionar Endereços"
- `Dialog` `max-w-3xl` por cima do Sheet.
- Toolbar: busca, badge "X selecionado(s) · Limpar seleção", filtros Ruela/Prédio/Nível + "Limpar filtros" + contagem, linha "Selecionar todos os visíveis (X)".
- Lista server-side, 100/pág, `ScrollArea h-[420px]`. Query usa `endereco` filtrado por `armazem_id` da zona + `ativo=true` + busca/filtros, **excluindo** os já vinculados.
  - Para evitar `not in` com listas gigantes: buscar todos `endereco_id` vinculados uma vez (já temos `total_enderecos`; aqui carregamos array completo só desta zona) e enviar `.not('id','in','(...)')`. Se passar de ~1k ids, fallback: criar view/RPC `enderecos_disponiveis_para_zona(zona_id, search, ...)`. Marcar como item de atenção e implementar fallback se necessário.
- Linha: checkbox + badge ruela + descrição font-mono + prédio/nível/andar; hover/selected estilizados; clique na linha = toggle.
- Seleção **cross-página** persistida em `Set<string>` no state do dialog.
- Footer: paginação | "X selecionado(s) no total" | Cancelar / "Vincular X endereço(s)" com `Loader2`.
- Vincular: `insert` em lote (`endereco_zona_atividade`) com `onConflict: 'endereco_id,zona_atividade_id'` ignorado; calcular ignorados e exibir `toast.warning` se houver duplicatas; `toast.success` com total efetivo; fecha dialog, refetch Sheet + contador da tabela principal.

## Parte 4 — CRUD Modal Nova/Editar Zona
- `CrudModal` com `descricao` (text, min 2), `armazem_id` (select), `tipo_grupo` (enum atual), `Ativo` (switch). Toasts de sucesso.

## Parte 5 — Performance, A11y, Erros
- `useDebounce(300ms)` em todas as buscas.
- Paginação server-side em Sheet (50) e Dialog (100); nunca carregar tudo.
- Refetch silencioso (sem reset de scroll) usando `keepPreviousData`-like manual: manter array atual até nova resposta.
- `aria-label` + `Tooltip` em todos os botões icon-only.
- Sem cores hardcoded — apenas tokens do design system.
- Erros: `toast.error` legível; conflito → `toast.warning`; zona inexistente fecha Sheet com `toast.error`.

## ASCII — layout do Sheet
```text
┌─────────────────── Sheet (720px, side=right) ──────────────────┐
│ ZONA A                                                  [ X ]  │
│ Armazém 01 · PICKING       [247 endereços vinculados]          │
├────────────────────────────────────────────────────────────────┤
│ [🔍 Buscar por código...                                    ]  │
│ [Ruela▾][Prédio▾][Nível▾][Andar▾][Limpar]   Exibindo 50 de 247│
├────────────────────────────────────────────────────────────────┤
│ CÓDIGO          R   P   N   A   VINCULADO EM         AÇÕES     │
│ R01-P01-N02-A01 01  01  02  01  10/06/2026           [⛓✕]      │
│ ...                                                            │
├────────────────────────────────────────────────────────────────┤
│ ‹ Anterior   Página 1 de 5   Próximo ›    [+ Adicionar Endereços]│
└────────────────────────────────────────────────────────────────┘
```

## Checklist final
Cobre todos os itens listados pelo usuário (Sheet não-bloqueante, paginação server-side, seleção cross-página, parsing automático, debounce, skeletons, tooltips/aria, contagem reativa, tokens do design system, font-mono, toast inline para desvincular, empty states, Esc isolado entre Dialog/Sheet).
