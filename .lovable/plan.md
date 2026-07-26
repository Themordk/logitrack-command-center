## 1) Mover "Templates de Etiqueta" para Configurações

- **TopNav** (`src/components/TopNav.tsx`): remover item "Templates de Etiqueta" do submenu Armazém e adicioná-lo em Configurações.
- **App** (`src/App.tsx`): mover a rota `/config/etiquetas` (novo caminho) mantendo o componente `EtiquetaTemplatesPage`. Atualizar breadcrumb para "Configurações › Templates de Etiqueta". Manter um alias temporário `/armazem/etiquetas` redirecionando para o novo path para não quebrar bookmarks.
- **Migration** — atualizar registro do módulo `web.armazem.etiquetas` → renomear para `web.config.etiquetas` (update em `modulo`) para refletir agrupamento correto na tela de Perfis de Acesso. Permissões atuais permanecem intactas (apenas o código muda).

## 2) Unificar "Regras de Armazenagem" com o modal de configurações do Armazém

- **Remover do menu**: retirar "Regras de Armazenagem" do submenu Armazém no `TopNav.tsx` e a rota `/armazem/regras-armazenagem` do `App.tsx` (breadcrumb + case do router).
- **Refatorar `ArmazemConfigModal.tsx`** (acionado pelo ícone de engrenagem em `ArmazensPage.tsx`):
  - Manter as 4 seleções de endereço já existentes (Cancelamento, Avaria, Quarentena, Armazenagem Automática).
  - Adicionar as demais configurações que hoje vivem em `RegraArmazenagemPage.tsx` (parâmetros de motor de armazenagem, tolerâncias, flags de comportamento, etc.), organizadas em seções colapsáveis/tabs para manter o modal legível.
  - Migrar de `<Dialog>` para `<Sheet>` lateral (padrão do sistema para telas de edição), com largura consistente às demais Sheets (ex.: `sm:max-w-2xl`), header fixo, corpo com scroll e footer com Salvar/Cancelar/Remover.
- **Deletar** `src/pages/RegraArmazenagemPage.tsx` após migrar seu conteúdo. Ajustar imports órfãos no `App.tsx`.
- **Migration**: atualizar `modulo.codigo` `web.armazem.regras_armazenagem` para apontar ao mesmo módulo de Cadastro de Armazém (ou inativar), removendo a entrada duplicada em Perfis de Acesso.

## 3) Cadastro de Documento de Entrada / Saída

**3.1 — Valor total da nota calculado**
- `src/pages/CadastroDocEntradaPage.tsx`:
  - Remover o input manual "Valor Total Nota" (linhas ~227-228) e o estado `valorTotalNota`.
  - Ao gravar, usar `valor_total_nota = valorTotalProdutos` (soma dos itens).
  - Exibir o total calculado como texto readonly no rodapé do formulário para transparência ao usuário.

**3.2 — Parceiro com busca (Entrada e Saída)**
- Criar componente reutilizável `src/components/parceiro/ParceiroSearchInput.tsx` seguindo o padrão de `ProdutoSearchInput.tsx`/`EnderecoSearchInput.tsx`:
  - Input com debounce (250-300ms) filtrando `parceiro` por `razaosocial`, `nome_fantasia`, `cnpj_cpf` e `codigo_erp` (ILIKE, escopo por tenant/empresa e `ativo=true`).
  - Chip do parceiro selecionado com botão de limpar; dropdown com lista compacta mostrando razão social + CNPJ + código ERP.
- Substituir o `<select>` de parceiro em `CadastroDocEntradaPage.tsx` (linhas ~197-206) e `CadastroDocSaidaPage.tsx` (linhas ~197-200) pelo novo componente.
- Remover o preload da lista completa de parceiros (`parceiros` state) — passa a ser sob demanda pelo componente.

## Detalhes técnicos

- Nenhum schema novo é necessário; apenas atualização de `modulo.codigo` para reposicionamento nas Perfis de Acesso.
- Cache de permissões (`sessionStorage core_rbac_permissions`) será invalidado automaticamente após 5 min; opcional: bump manual documentado para o admin fazer logout/refresh.
- Manter compatibilidade: se preferir, no lugar de renomear `modulo.codigo` podemos manter os códigos atuais — decisão de execução na migration.
