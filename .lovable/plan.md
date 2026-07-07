## Plano: Refatoração do Abastecimento no Coletor

Substituir o fluxo atual (que faz UPDATEs/INSERTs diretos em `estoque_geral`, `tarefa_execucao` e `tarefa` e passa listas inteiras via `sessionStorage`) por chamadas às 3 novas RPCs, seguindo o padrão visual do fluxo de armazenagem. Nenhuma rota, componente ou dependência nova.

### Arquivos alterados (3)

1. **`src/pages/coletor/AbastecimentoListPage.tsx`** — reescrita completa
   - Chama `rpc_coletor_abastecimento_listar_tarefas` no load.
   - Estado `fase: "coleta" | "entrega"` com toggle sticky no topo (azul para Coleta, verde para Entrega, com contadores).
   - Fase Coleta: itens com `coleta_pendente === false`, ordem da RPC (origem/pulmão).
   - Fase Entrega: itens com `coleta_pendente === true`, reordenados no frontend por `destino_rua/predio/nivel/apto`.
   - Card clicável (sem checkbox / sem seleção múltipla). Layout diferente por fase:
     - Coleta: destaque no endereço de ORIGEM (ícone `Archive` azul), badge de prioridade, saldo do pulmão, grid Requerida/Executada/Restante.
     - Entrega: destaque no endereço de DESTINO (ícone `MapPin` roxo), badge "COLETADO" verde, mostra qtd coletada e origem como info secundária.
   - Ao clicar: grava chaves `abast_*` individuais em `sessionStorage` (não mais `abast_tarefas`/`abast_coletas` como listas) e navega para `/coletor/movimentos/abastecimento/coleta` ou `.../destino`.
   - Estados vazios com ícones `ArrowDownToLine` (coleta) e `PackageCheck` (entrega).
   - Mantém `RefreshListButton` e contador.

2. **`src/pages/coletor/AbastecimentoColetaPage.tsx`** — reescrita completa
   - Fluxo em 3 steps: scan endereço origem → scan produto (EAN/SKU) → quantidade → CONFIRMAR COLETA.
   - Lê tudo do `sessionStorage` (chaves `abast_tarefa_id`, `abast_produto_id`, `abast_produto_sku`, `abast_produto_desc`, `abast_qtd_restante`, `abast_endereco_origem_id`, `abast_endereco_origem_desc`, `abast_saldo_origem`).
   - Valida endereço via consulta a `endereco` (situação LIVRE/OCUPADO + id bate com o esperado) e produto via `produto_embalagem.ean` → fallback `produto.sku`.
   - Chama `rpc_coletor_abastecimento_confirmar_coleta` e volta para a lista após 1,2 s.
   - Usa `StatusOverlay`, `ScanField`, `ActionButton`, `Archive`, `CheckCircle2`.

3. **`src/pages/coletor/AbastecimentoDestinoPage.tsx`** — reescrita completa
   - Mesmo layout da coleta, com foco no endereço de DESTINO.
   - Lê `abast_tarefa_execucao_id`, `abast_qtd_coletada`, `abast_endereco_destino_*`.
   - Botão "CONFIRMAR ENTREGA" chama `rpc_coletor_abastecimento_confirmar_entrega` e volta para a lista.
   - Usa `MapPin`, `CheckCircle2`.

### Não alterado

- `src/App.tsx` — as 3 rotas (`/coletor/movimentos/abastecimento`, `.../coleta`, `.../destino`) permanecem exatamente como estão.
- Nenhum componente novo, nenhuma RPC nova, nenhuma tabela, nenhuma dependência.
- Outras páginas do coletor (armazenagem, separação, inventário, etc.) não são tocadas.

### Detalhes técnicos

- Padrões respeitados: `ColetorLayout` wrapper, prop `onNavigate`, dark theme com tokens `hsl(...)` do projeto, chamadas `supabase.rpc("nome" as any, {...})`, `toast` do sonner só quando necessário (overlay é o feedback primário).
- IDs de tenant/empresa/usuário via `localStorage` (`core_tenant_id`, `core_empresa_id`, `core_usuario_id`).
- Sem passar listas inteiras via `sessionStorage`; cada tela recarrega via RPC.
- Sem hardcode de `tipo_tarefa_id`; a RPC resolve internamente.
- Sem operações diretas em `estoque_geral`/`tarefa_execucao`/`tarefa`.
- Sem `nowBrasilia` nas páginas reescritas (a RPC grava timestamps no backend).
