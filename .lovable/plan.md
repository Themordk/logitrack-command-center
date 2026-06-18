# Plano — Otimização de data-fetching: Movimentos de Entrada e Ondas de Carregamento

## Objetivo
Substituir as queries atuais das listas e da aba "Itens" por chamadas às novas RPCs do Supabase, adicionar cache via React Query, debounce nos filtros de texto e paginação server-side. **Nenhuma mudança visual, de layout ou de comportamento da UI.**

## Escopo
Apenas dois arquivos serão tocados:
- `src/pages/MovimentoEntradaPage.tsx`
- `src/pages/MovimentoSaidaPage.tsx`

E um hook reutilizável já existe (`src/hooks/useDebounce.ts`) — será aproveitado.

## O que muda

### 1. `MovimentoEntradaPage.tsx`
- **Lista lateral** (hoje em `vw_movimento_entrada_lista`, linha 202) → `useQuery` chamando `supabase.rpc('listar_movimentos_entrada', { p_tenant_id, p_empresa_id, p_status, p_data_de, p_data_ate, p_numero_movimento, p_numero_nf, p_page, p_page_size })`.
- **Aba "Itens"** (hoje em `vw_movimento_entrada_resumo`, linha 248) → `useQuery` chamando `supabase.rpc('buscar_itens_movimento_entrada', { p_tenant_id, p_movimento_entrada_id })`, com `enabled: activeTab === 'itens'`.
- **Filtros de texto** (Nº Movimento, Nº NF): aplicar `useDebounce(value, 400)` antes de ir para a `queryKey`/RPC.
- **Paginação server-side**: usar `total_registros` do primeiro registro retornado; resetar `page=1` quando filtros mudam.
- **Outras abas e queries** (linhas 360/386/421 — updates/inserts e outras views) permanecem inalteradas.

### 2. `MovimentoSaidaPage.tsx`
- **Lista lateral** (hoje em `vw_movimento_saida_lista`, linha 144) → `useQuery` chamando `supabase.rpc('listar_ondas_carregamento', { p_tenant_id, p_empresa_id, p_status, p_data_de, p_data_ate, p_numero_onda, p_page, p_page_size })`.
- **Aba "Itens"** (hoje em `vw_movimento_saida_resumo`, linha 192) → `useQuery` chamando `supabase.rpc('buscar_itens_onda_carregamento', { p_tenant_id, p_movimento_saida_id })`.
- **Debounce 400ms** no filtro Nº Onda.
- **Paginação server-side** via `total_registros`.
- **Outras queries** (linhas 278/495 — updates e outras views) permanecem.

### 3. Interfaces TypeScript
Adicionar localmente em cada página (ou em um arquivo `types.ts` co-localizado se preferir):
- `MovimentoEntradaListItem`, `MovimentoEntradaItem`
- `OndaCarregamentoListItem`, `OndaCarregamentoItem`

Conforme especificado no prompt. RPCs são chamadas com `as any` (padrão já usado no projeto, pois as RPCs novas ainda não estão no `types.ts` gerado).

## O que NÃO muda
- Layout, componentes visuais, badges, navegação, abas, sidebar, cores.
- Abas Conferência, Armazenagem, Separação, Informações e Documentos Vinculados — continuam consumindo as views atuais (podem ser envolvidas em `useQuery` com `enabled: activeTab === ...` para lazy-load se já não estiverem; manter o comportamento existente caso já estejam carregando sob demanda).
- Inserts/updates/mutations existentes.
- Regras de isolamento por tenant/empresa (parâmetros `p_tenant_id`/`p_empresa_id` continuam vindo de `useTenant()`).

## Padrão de implementação
- `useQuery` com `queryKey` incluindo `tenantId`, `empresaId`, todos os filtros (já debounced) e `page`.
- `staleTime: 30_000`.
- `enabled: !!tenantId` para a lista; `enabled: !!tenantId && !!selectedId && activeTab === 'itens'` para itens.
- `useEffect` para resetar `page` para 1 sempre que qualquer filtro debounced mudar.

## Validação
- Verificar que a lista carrega, filtros aplicam, paginação funciona e os contadores (esperado/conferido/armazenado/etc.) batem com a UI atual.
- Confirmar via Network que apenas a RPC é chamada (não há fallback para a view antiga).
- Garantir que nenhum outro fluxo (conferência, armazenagem, separação, criação/edição de movimentos) regrediu.
