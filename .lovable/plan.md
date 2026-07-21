## Objetivo
Adicionar um seletor de **Armazém** no topo do formulário de `RegraArmazenagemPage.tsx`, permitindo ao usuário escolher qual armazém está sendo configurado — em vez de depender exclusivamente do `armazemId` do `TenantContext`.

## Alterações em `src/pages/RegraArmazenagemPage.tsx`

1. **Estado local `selectedArmazemId`**
   - Inicializar com o `armazemId` do `useTenant()` (armazém atual do contexto) para manter compatibilidade.
   - Adicionar estado `armazemOptions` carregado via `fetchOptions("armazem", tenantId, "descricao")` (mesmo padrão de `ArmazensPage`).

2. **Novo Card "Armazém" no topo do formulário**
   - Posicionado antes do card "Regras de mistura".
   - Contém um `Select` (shadcn) com a lista de armazéns da empresa/tenant.
   - Label: "Armazém" + `HelpTip` explicando que cada armazém pode ter regras próprias.
   - Texto auxiliar mostrando o armazém selecionado.

3. **Refatorar o `useEffect` de carregamento**
   - Passar a depender de `selectedArmazemId` (em vez de `armazemId` do contexto).
   - Ao trocar o armazém no seletor: recarrega a regra correspondente (SELECT em `regra_armazenagem` filtrando pelo novo `armazem_id`).
   - Se não existir regra para o armazém escolhido, monta o estado com `DEFAULTS` (mesmo comportamento atual).
   - Resetar `hasChanges` ao trocar de armazém; se houver alterações não salvas, exibir `confirm()` antes de trocar.

4. **Ajustar `handleSave`**
   - Usar `selectedArmazemId` no payload em vez de `armazemId` do contexto.
   - Manter validação: se nenhum armazém selecionado, desabilita o botão Salvar.

5. **Estado de loading/empty**
   - Enquanto `selectedArmazemId` for `null`, exibir mensagem "Selecione um armazém para configurar as regras" no lugar dos cards de regras.
   - Loader do carregamento da regra continua funcionando ao trocar de armazém.

## Fora de escopo
- Nenhuma alteração de banco de dados, RPC ou RLS.
- Sem mudança em `TopNav`, `App.tsx` ou outras páginas.
- Sem alteração no fluxo do coletor (`ColetorSugestaoPickingPage`).
