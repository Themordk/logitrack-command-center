## Plano: Armazenagem Dirigida por Movimento (Coletor)

Refatorar o fluxo do coletor para que o operador escolha um **movimento de entrada** e depois um **item** (ordenado por endereço de picking), em vez de escanear EAN "cego". As RPCs backend já existem (`rpc_coletor_armazenagem_listar_movimentos`, `rpc_coletor_armazenagem_itens_movimento`, `fn_buscar_dados_armazenagem`, `finalizar_armazenagem`) e serão reutilizadas.

### Novo fluxo de navegação

```text
/coletor/armazenagem (Dashboard)
  → /coletor/armazenagem/movimentos   [NOVA] lista movimentos pendentes
    → /coletor/armazenagem/itens      [NOVA] lista itens do movimento (ordem picking)
      → /coletor/armazenagem/iniciar  confirma EAN (existente)
        → /coletor/armazenagem/execucao (existente)
          → /coletor/armazenagem/concluido (existente)
            → volta para /coletor/armazenagem/itens
```

### Arquivos a criar

1. **`src/pages/coletor/ArmazenagemMovimentosPage.tsx`** — lista de movimentos com armazenagem pendente. Cards clicáveis (sem checkbox), badge de status (`LIB_ARMAZENAGEM` → azul "LIBERADO"; `ARMAZENAGEM_PARCIAL` → amarelo "PARCIAL"), barra de progresso verde, contadores de itens pendentes/armazenados. Ao clicar, grava `coletor_armazenagem_movimento_id`/`_numero` em `sessionStorage` e navega para `/coletor/armazenagem/itens`.

2. **`src/pages/coletor/ArmazenagemItensPage.tsx`** — lista de itens do movimento selecionado, ordenados pelo endereço de picking. Cada card destaca o endereço de picking (roxo, com badge PICKING OK/BAIXO/SEM PICKING), saldo/min/max do picking, SKU + referência, descrição e grid de quantidades (A armazenar / Armazenado / Restante). Empty state "Todos os itens foram armazenados!" com botão de voltar. Ao clicar num item, grava todos os campos necessários em `sessionStorage` (tarefa_id, produto_id, sku, descrição, qtd_restante, lote, validade, fabricação, picking sugerido, varios_pickings) e navega para `/coletor/armazenagem/iniciar`.

### Arquivos a alterar (mudanças mínimas)

3. **`ArmazenagemDashboardPage.tsx`** — botão "INICIAR ARMAZENAGEM" passa a navegar para `/coletor/armazenagem/movimentos`.
4. **`ArmazenagemIniciarPage.tsx`** — `backPath` passa para `/coletor/armazenagem/itens`; título vira "Confirmar Produto". Lógica de scan/confirmação inalterada.
5. **`ArmazenagemExecucaoPage.tsx`** — `backPath` passa para `/coletor/armazenagem/itens`. Lógica de `finalizar_armazenagem` inalterada.
6. **`ArmazenagemConcluidoPage.tsx`** — botão "NOVA ARMAZENAGEM" vira "PRÓXIMO ITEM" apontando para `/coletor/armazenagem/itens`; título "Item Armazenado!" e subtítulo ajustados. Botão "VOLTAR AO MENU" permanece em `/coletor/home`.
7. **`src/App.tsx`** — adicionar 2 imports e 2 cases no `renderColetorPage` (linhas ~381-384), entre `/coletor/armazenagem` e `/coletor/armazenagem/iniciar`.

### Padrões respeitados

- `ColetorLayout` wrapper, prop `onNavigate`, sem `react-router`.
- Tenant/empresa via `localStorage` (`core_tenant_id`, `core_empresa_id`).
- Chamadas: `supabase.rpc("nome" as any, { params })`.
- Toasts `sonner`, ícones `lucide-react`, datas via `@/utils/dateTime`.
- Componentes existentes reutilizados: `ColetorLayout`, `RefreshListButton`, `ActionButton`.

### Fora de escopo

- Sem novas tabelas, RPCs, triggers, componentes compartilhados ou dependências.
- Sem mexer em recebimento, conferência, separação, inventário, abastecimento ou `ColetorHomePage`.
- Sem alterar a lógica interna de `fn_buscar_dados_armazenagem` e `finalizar_armazenagem`.
- Sem tela de "detalhes do movimento" nem seleção múltipla de itens.

### Critérios de aceitação

1. `/coletor/armazenagem/movimentos` lista movimentos pendentes com status, doca, data, progresso e contadores.
2. Clicar num movimento leva a `/coletor/armazenagem/itens` com os itens ordenados por endereço de picking.
3. Clicar num item leva ao scan de EAN (`/coletor/armazenagem/iniciar`) já preparado com os dados do item.
4. Após concluir uma armazenagem, o botão "PRÓXIMO ITEM" retorna à lista de itens do mesmo movimento.
5. `backPath` das telas intermediárias aponta para `/coletor/armazenagem/itens`.
6. TypeScript compila sem erros; nenhuma RPC nova é criada.
