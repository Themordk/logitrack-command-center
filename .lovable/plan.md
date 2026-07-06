# Inventário Geral — Contagem Livre

Backend já tem as RPCs `fn_inventario_contagem_livre`, `fn_inventario_finalizar_geral`, `fn_inventario_cobertura` e ajustes em `fn_criar_inventario_v2` / `fn_inventario_buscar_tarefas`. Frontend precisa refletir isso em 5 arquivos.

## Escopo

### 1. `src/pages/NovoInventarioPage.tsx` (2 pontos)
- **handleSave**: após criar inventário, se `inv.proximo_passo === 'PRONTO'` (tipo GERAL), pular loop de `fn_gerar_tarefas_inventario`, exibir toast "Inventário geral criado! Pronto para contagem livre no coletor." e navegar. Caso contrário, manter loop atual intacto.
- **Texto informativo do tipo GERAL**: trocar o `<span>` para "Inventário de contagem livre — o operador escaneia qualquer endereço e produto diretamente no coletor. Nenhuma tarefa será pré-gerada."

### 2. `src/pages/coletor/InventarioListPage.tsx` (1 ponto)
- Em `handleSelectContagem`, detectar contagem livre: `tarefas.length === 1 && tarefas[0]?.status === "CONTAGEM_LIVRE"`.
  - Se livre: setar `coletor_inventario_modo=CONTAGEM_LIVRE`, não gravar tarefas, dialog "Contagem Livre iniciada".
  - Senão: gravar `modo=DIRIGIDO` + tarefas (comportamento atual).
- `handleDialogClose`: ler `coletor_inventario_modo` e rotear para `/coletor/inventario/livre/endereco` (livre) ou `/coletor/inventario/endereco` (dirigido).

### 3. NOVO `src/pages/coletor/InventarioLivreEnderecoPage.tsx`
Tela onde operador escaneia qualquer endereço. Componentes: `ColetorLayout`, `ScanField`, `ActionButton`. Estado: `lastScanned`, `loading`, `errorDialog`.
- `handleScan(code)`: `SELECT id, descricao, codigo_endereco, armazem_id FROM endereco WHERE descricao.eq OR codigo_endereco.eq`. Se não achou → error dialog "Endereço não encontrado". Se achou → salva `coletor_inventario_livre_endereco_{id,codigo,descricao}` no sessionStorage, toast sucesso, navega `/coletor/inventario/livre/produto`.
- Layout: badge "Contagem Livre" (amber), card informativo com ícone MapPin, ScanField, card com contador da sessão, botão "Encerrar Sessão" → `/coletor/inventario`.

### 4. NOVO `src/pages/coletor/InventarioLivreProdutoPage.tsx`
Tela para escanear EAN + informar quantidade. Componentes iguais + ícones lucide.
- Estado: `eanScanned`, `embalagemInfo`, `produtoInfo`, `eanConfirmado`, `quantidade`, `confirming`, `resultDialog`, `showEanErroDialog`.
- Ler do sessionStorage `coletor_inventario_id/numero` e `coletor_inventario_livre_endereco_{id,codigo,descricao}`; ler `core_tenant_id`/`core_usuario_id` do localStorage.
- `handleScanEan`: consulta `produto_embalagem` por EAN; se ok, consulta `produto` pelo `produto_id`; **não valida contra tarefa**.
- `handleConfirmar`: chama `supabase.rpc("fn_inventario_contagem_livre" as any, { p_tenant_id, p_inventario_id, p_usuario_id, p_endereco_codigo: Number(codigo), p_ean, p_quantidade: Number(qtd) })`. Trata `sucesso: false` via `ERROR_MAP` (INVENTARIO_NAO_ENCONTRADO, INVENTARIO_NAO_GERAL, INVENTARIO_STATUS_INVALIDO, ENDERECO_NAO_ENCONTRADO, ENDERECO_ARMAZEM_INVALIDO, EAN_NAO_ENCONTRADO, PRODUTO_EMPRESA_INVALIDO, JA_CONTADO, TIPO_TAREFA_NAO_CONFIGURADO). No sucesso, exibe divergência (card vermelho) ou "Sem divergência" (card verde).
- `handleDialogClose` (sucesso): limpa campos, permanece na tela, toast "Escaneie outro produto ou volte para endereços."
- Layout: card endereço, ScanField, se `eanConfirmado` mostra card produto + card embalagem + input quantidade (h-12 text-xl bold center) + ActionButton "Confirmar Contagem" (success), botão "Outro endereço" → `/coletor/inventario/livre/endereco`.
- Dialogs inline (fixed inset-0 z-50) — mesmo padrão de `InventarioProdutoPage`.

### 5. `src/App.tsx` (2 pontos)
- Importar `InventarioLivreEnderecoPage` e `InventarioLivreProdutoPage`.
- Adicionar em `renderColetorPage`, logo após o case `/coletor/inventario/produto`:
  - `case "/coletor/inventario/livre/endereco": return <InventarioLivreEnderecoPage onNavigate={onNavigate} />;`
  - `case "/coletor/inventario/livre/produto": return <InventarioLivreProdutoPage onNavigate={onNavigate} />;`
- Sem breadcrumbs.

## Fora de escopo
- Nenhuma mudança em RPC/DB.
- Não alterar `InventarioEnderecoPage.tsx` / `InventarioProdutoPage.tsx` / `InventarioItensPage.tsx`.
- Sem novas dependências; sem react-router; `.rpc(... as any)` no padrão do projeto.
