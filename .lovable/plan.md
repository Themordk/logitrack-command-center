## Objetivo

Implementar 3 entregas no frontend conforme spec do prompt:

1. Modal unificado de Liberação de Armazenagem (substitui as duas opções atuais no menu).
2. Página de Ocorrências Operacionais (`/atividades/ocorrencias`).
3. Página de Detalhe da Ocorrência (`/atividades/ocorrencias/:id`).

Backend (tabelas `ocorrencia_operacional`, `ocorrencia_historico`, RPC `liberar_armazenagem`) já existe — apenas consumo no frontend.

---

## Entrega 1 — Modal de Liberação de Armazenagem

**Novo arquivo:** `src/components/movimento-entrada/LiberarArmazenagemModal.tsx`

- Props: `open`, `onClose`, `movimentoEntradaId`, `statusMovimento`, `onSuccess?`.
- Ao abrir: carrega `movimento_entrada_item` (com produto) + `motivo_ocorrencia` (ativos).
- Classifica em 4 grupos (Conferidos / Divergentes / Pendentes / Já armazenados).
- Layout: 4 cards KPI, banner de modo (completo/parcial), tabela conferidos, cards de divergentes com Select de motivo obrigatório + observação opcional, alerta de pendentes.
- Footer: Cancelar + "Liberar X item(ns)" desabilitado se sem itens ou divergente sem motivo.
- Submete via `supabase.rpc("liberar_armazenagem" as any, { ... p_itens_divergentes: JSON.stringify(arr) })` com modo `TODOS` (sem pendentes/divergentes) ou `CONFERIDOS`.
- Sucesso: `toast.success(resultado.mensagem)`, chama `onSuccess()`, fecha.

**Editar:** `src/pages/MovimentoEntradaPage.tsx`

- Remover do dropdown as duas opções `liberar_armazenagem` e `liberar_armazenagem_divergencia`.
- Inserir UM único item "Liberar armazenagem" (ícone `Package`), habilitado quando status ∈ {CONFERIDO, DIVERGENCIA, LIB_ARMAZENAGEM, ARMAZENAGEM_PARCIAL}.
- Ao clicar: abre `LiberarArmazenagemModal` com `movimentoEntradaId` e `statusMovimento`.
- Remover o modal antigo de divergência e handlers obsoletos (mantendo o reload da lista via `onSuccess`).

---

## Entrega 2 — Página de Ocorrências Operacionais

**Novo arquivo:** `src/pages/OcorrenciasOperacionaisPage.tsx`

- Props: `{ onNavigate: (path: string) => void }`.
- Cabeçalho + botão "Atualizar".
- 4 KPIs (Abertas, Em investigação, Resolvidas hoje, Tempo médio em horas) calculados a partir de query agregada por `tenant_id` (+ `empresa_id` quando disponível) trazendo `status, criado_em, resolvido_em`.
- Filtros (card): Status, Etapa, Prioridade, busca por nº/SKU/produto, botão "Limpar filtros".
- Tabela paginada (pageSize 15) com joins de `produto`, `motivo_ocorrencia`, `usuario_criador`, `usuario_resolvedor`.
- Busca client-side por nº, SKU, descrição.
- Empty state e paginação Anterior/Próxima.
- Ações: ícone Eye → `onNavigate("/atividades/ocorrencias/" + id)`.

**Editar `src/App.tsx`:**

- Import `OcorrenciasOperacionaisPage`.
- `case "/atividades/ocorrencias": return <OcorrenciasOperacionaisPage onNavigate={onNavigate} />;`
- Breadcrumb: `"/atividades/ocorrencias": [..., { label: "Atividades" }, { label: "Ocorrências Operacionais" }]` (alinhado com padrão das outras rotas do arquivo).

**Editar `src/components/TopNav.tsx`:**

- Adicionar `{ label: "Ocorrências", path: "/atividades/ocorrencias", icon: AlertTriangle }` no grupo Atividades.

---

## Entrega 3 — Página de Detalhe da Ocorrência

**Novo arquivo:** `src/pages/OcorrenciaDetalhePage.tsx`

- Props: `{ onNavigate, ocorrenciaId }`.
- Carrega ocorrência (com joins) + histórico ordenado asc.
- Header: Voltar, "Ocorrência #N", badges status/prioridade, subtexto "Etapa · Tipo".
- Layout grid lg:grid-cols-3:
  - Col span-2: Card "Informações" (Produto, Motivo, Registrada por, Data, quantidades grid 3, observação/resolução condicionais) + Card "Ações" (visível se status não é RESOLVIDA/CANCELADA): "Iniciar investigação" (se ABERTA), "Resolver", "Cancelar". Cada ação abre Dialog com textarea (obrigatório para Resolver, opcional para os demais).
  - Col span-1: Card "Histórico" — timeline vertical com bolinhas coloridas por `status_novo`, "anterior → novo", data/hora, autor, observação.
- Ações fazem `update` em `ocorrencia_operacional` (status + updated_by; em RESOLVIDA também `resolvido_por`, `resolvido_em`, `resolucao`) e recarregam dados. Histórico é populado pelo trigger.

**Editar `src/App.tsx`:**

- Antes do default no `renderPage()`:
```tsx
if (currentPage.startsWith("/atividades/ocorrencias/")) {
  const ocorrenciaId = currentPage.replace("/atividades/ocorrencias/", "");
  return <OcorrenciaDetalhePage onNavigate={onNavigate} ocorrenciaId={ocorrenciaId} />;
}
```

---

## Padrões aplicados

- `useTenant()` para `tenantId`, `empresaId`, `armazemId`, `usuarioId`.
- Navegação somente via `onNavigate(path)` — sem react-router.
- shadcn/ui + lucide-react + sonner (`toast`).
- Todas as queries filtram por `tenant_id`.
- Datas formatadas via `src/utils/dateTime.ts` (regra de projeto), mantendo a especificação dd/mm/yyyy HH:mm.
- Tema dark-first com tokens semânticos.

## Fora de escopo

- Criação de tabelas, RPCs ou triggers (já existem).
- Alterações em permissões/RBAC.
- Edição de outras telas além das listadas.
