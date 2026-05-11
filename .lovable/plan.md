# Importar do ERP — 7 telas

Adicionar funcionalidade "Importar do ERP" (Omie via middleware) em 7 telas, usando um único componente modal reutilizável.

## 1. Componente reutilizável

Criar `src/components/erp/ImportarDoERPModal.tsx`:

- Props: `isOpen`, `onClose`, `onSuccess(registro)`, `config`
  - `config`: `titulo`, `icone`, `labelCampo`, `placeholderCampo`, `tipoCampo`, `entidade` (`'produto' | 'parceiro' | 'nota_entrada' | 'pedido_saida' | 'redirect_sync'`), `camposPrevia: { label, campo }[]`, `verRegistroPath?: (id) => string`, `mensagemRedirect?` (para entidades 3/4/5).
- 3 estados internos: `BUSCA`, `PREVIA`, `RESULTADO` (sucesso/erro), com loading intermediários ("Consultando ERP Omie...", "Importando...").
- Layout dark, acentos azuis, ícones lucide, padrão visual do sistema (Dialog + Card + Button + Input). Sem alterar tokens globais.
- Enter dispara busca; nunca consulta automática.

### Lógica por entidade

- **produto**: passo 1 `rpc('middleware_consultar_produto_omie', { p_tenant_id, p_empresa_id, p_codigo_produto: null, p_codigo: valor })`; aguarda 3s; passo 2 `rpc('middleware_processar_produto_omie', { p_tenant_id, p_empresa_id, p_request_id })`. Se `erro === 'Resposta ainda não disponível'`, repolling a cada 2s, máx 5 tentativas. Como `processar` já grava, a tela "PRÉVIA" mostra os dados; "Confirmar" apenas executa `onSuccess`. Se já existir antes (verificar via `select id from produto where id = produto_id`) o CTA vira "Já importado — Atualizar?".
- **parceiro**: análogo, `middleware_consultar_parceiro_omie` com `p_codigo_cliente_omie: parseInt(valor)` e `middleware_processar_parceiro_omie`.
- **nota_entrada**: POST `${VITE_SUPABASE_URL}/functions/v1/sync-notas-entrada` com `{ tenant_id, empresa_id, chave_nfe }` se 44 chars, senão `{ tenant_id, empresa_id, numero_nota }`. Header `Authorization: Bearer ${session.access_token}`, `apikey` anon. Aviso na confirmação sobre status "Aguardando".
- **pedido_saida**: POST `${VITE_SUPABASE_URL}/functions/v1/sync-pedidos-saida` (ainda não existe). Detectar 404/erro e exibir "Módulo em desenvolvimento. Disponível em breve." Aviso de status "Aguardando".
- **redirect_sync**: modal apenas informativo + botão "Ir para Sincronização" → navega para `#/configuracoes/integracao-erp?aba=sincronizacao`.

`tenant_id` e `empresa_id` vêm de `useTenant()` (`src/contexts/TenantContext.tsx`). Toast de erro/sucesso via `sonner`.

## 2. Botão padrão

Em cada tela, ao lado do botão "Novo X" do `CrudTable`, adicionar `[↓ Importar do ERP]` (variant `outline`, ícone `Download`/`ArrowDownToLine`). Como `CrudTable` já recebe `onNew`, vou adicionar uma prop opcional `extraHeaderActions?: ReactNode` no `CrudTable` para renderizar botões adicionais ao lado de "Novo". (Mudança mínima e isolada no `CrudTable`.)

## 3. Telas a alterar

| # | Rota | Arquivo | entidade | Campos prévia |
|---|------|---------|----------|---------------|
| 1 | Produtos | `src/pages/ProdutosPage.tsx` | `produto` | sku, descricao, codigo_produto, ativo |
| 2 | Parceiros | `src/pages/ParceirosPage.tsx` | `parceiro` | razao_social, cnpj_cpf, tipo_parceiro, codigo_cliente_omie |
| 3 | Grupos de Produto | `src/pages/GruposProdutoPage.tsx` | `redirect_sync` (`grupo_produto`) | — |
| 4 | Subgrupos | `src/pages/SubgruposPage.tsx` | `redirect_sync` (`subgrupo_produto`) | — |
| 5 | Rotas | `src/pages/RotasPage.tsx` | `redirect_sync` (`rotas`) | — |
| 6 | Entradas | `src/pages/EntradasPage.tsx` | `nota_entrada` | numero_nota, parceiro_nome, data_emissao, valor_total_nota, qtd_itens |
| 7 | Saídas | `src/pages/SaidasPage.tsx` | `pedido_saida` | numero_pedido, parceiro_nome, data_previsao, valor_total, qtd_itens, rota_nome |

Em cada tela: importar `ImportarDoERPModal`, adicionar `useState` `importOpen`, passar botão via `extraHeaderActions`, e em `onSuccess` chamar `crud.refetch()` (ou refetch equivalente). Navegação "Ver registro" usa `window.location.hash = '#/...'` seguindo o padrão hash routing do projeto.

## 4. Não alterado

- Sem mudanças em rotas, layout global, RLS ou edge functions já existentes.
- Sem alteração no fluxo de cadastro manual existente nem nas demais colunas/filtros.
- Sem nova migration: as RPCs `middleware_*` e edge functions `sync-notas-entrada`/`sync-pedidos-saida` são consumidas como já documentado.

## Detalhes técnicos

- Polling: helper `async function pollProcessar(rpcName, requestId, maxAttempts=5, delayMs=2000)`.
- Espera inicial após passo 1: 3s (`setTimeout`).
- Edge functions chamadas via `supabase.functions.invoke('sync-notas-entrada', { body })` para herdar Authorization automaticamente — fallback POST manual só se necessário.
- Detecção "já importado" para produto/parceiro: após `processar`, `select id from produto/parceiro where id = <retorno_id>` antes do estado PREVIA — se existir, label do CTA muda para "Atualizar".
- Tipos: `as any` em chamadas RPC não tipadas, sem editar `types.ts`.