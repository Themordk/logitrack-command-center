Aplicar as 4 alterações de frontend especificadas no documento de auditoria. Backend já foi corrigido — nenhuma migração / RPC será tocada.

## Arquivos a alterar

### 1. `src/pages/InventarioPage.tsx`
- Atualizar `TIPO_MAP`: remover não-existentes, adicionar `ROTATIVO` e `GRUPO_PRODUTO`.
- Atualizar `STATUS_MAP`: remover `EM_EXECUCAO`, `EM_REVISAO`, `CANCELADO`; adicionar `GERANDO_TAREFAS` e `AGUARDANDO_RECONTAGEM`; ajustar cor de `CRIADO` para cinza.

### 2. `src/pages/coletor/InventarioEnderecoPage.tsx`
- Adicionar filtro `.eq("tenant_id", tenantId)` na query de validação do endereço escaneado.
- Inserir badge "Nª Contagem — Recontagem" (âmbar) dentro do `<ColetorLayout>`, antes do container principal, condicional a `sessionStorage.coletor_inventario_contagem > 1`.

### 3. `src/pages/coletor/InventarioProdutoPage.tsx`
- Inserir o mesmo badge de contagem dentro do `<ColetorLayout>`.
- Adicionar estado `showZeroConfirm` e, em `handleConfirmar`, interceptar quantidade 0 abrindo um dialog de confirmação; após confirmar segue o fluxo. Dialog novo com aviso "Contagem Zero".
- Não alterar validação de EAN (já suportada pelo `produto_id` novo do backend).

### 4. `src/pages/coletor/InventarioListPage.tsx`
- Garantir que a função/mapa de cor de status trata `AGUARDANDO_RECONTAGEM` (âmbar).
- Garantir que o label exibido para `AGUARDANDO_RECONTAGEM` seja "Recontagem" (via `STATUS_LABEL` se ainda for texto raw).

## Fora de escopo
- Nenhuma alteração em RPCs, `App.tsx`, `NovoInventarioPage.tsx`, `InventarioItensPage.tsx`, nos arquivos de inventário livre, nem em dependências.
- Sem novas rotas, sem novas cores fora do padrão do projeto.

## Verificação
Após aplicar, checarei visualmente os arquivos alterados e rodarei o typecheck automático do harness. Nenhum teste E2E adicional será executado a menos que solicitado.
