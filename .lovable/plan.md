# Responsividade Mobile do Painel Administrativo — Fase 1

## Objetivo
Tornar o painel administrativo minimamente funcional em viewports menores que 768px. Nesta fase, apenas o Dashboard (Torre de Controle) ficará acessível no mobile, com um TopNav reduzido.

## Escopo incluído
- TopNav simplificado no mobile.
- Redirecionamento automático para `/` quando o usuário estiver em viewport mobile dentro do painel admin.
- Ajustes de padding e breadcrumb no Layout para mobile.
- Pequenos ajustes no header do Dashboard para empilhar em telas pequenas.

## Escopo EXPLICITAMENTE EXCLUÍDO
- Nenhum menu hambúrguer, sidebar, drawer ou bottom navigation.
- Nenhuma adaptação de outras páginas (Armazém, Produtos, Atividades, Relatórios, Configurações).
- Nenhuma alteração no coletor (`/coletor/*`), TV (`/tv/*`), suporte (`/suporte/*`) ou login.
- Nenhum novo componente, manifest mobile ou meta tag.
- Nenhuma alteração no hook `useIsMobile` ou nos sub-componentes do Dashboard.

## Alterações por arquivo

### 1. `src/components/TopNav.tsx`
- Importar `useIsMobile` de `@/hooks/use-mobile`.
- Quando `isMobile === true`:
  - Renderizar apenas: logo, seletor de empresa e botão de logout.
  - Não renderizar: `<nav>` com `filteredNavItems`, botão de notificações (Bell) e avatar/nome do usuário.
  - Aplicar `max-w-[120px] truncate` no `<select>` e no `<span>` do seletor de empresa para evitar estouro de largura.
  - Adicionar `flex-1` spacer entre o seletor de empresa e o logout para alinhar o logout à direita.
- Em desktop (`isMobile === false`), manter o comportamento atual sem alterações.

### 2. `src/App.tsx`
- Importar `useIsMobile` de `@/hooks/use-mobile`.
- No `AppContent`, após todos os gates existentes (boot, loading, suporte, coletor, autenticação, forcePwd) e antes da construção do breadcrumb e do `return <Layout>`, adicionar:
  - Verificação: se `isMobile === true` e `currentPath !== "/"`, agendar `navigate("/")` via `Promise.resolve().then(...)`.
  - Enquanto o redirecionamento não ocorre, retornar `<TenantBootSplash />` para evitar flash de tela errada.
- Garantir que rotas de coletor, TV e suporte não sejam afetadas (já tratadas antes deste gate).

### 3. `src/components/Layout.tsx`
- Importar `useIsMobile` de `@/hooks/use-mobile`.
- Quando mobile:
  - Esconder a linha do breadcrumb (`{!isMobile && ...}`).
  - Reduzir o padding do conteúdo de `p-6` para `p-3`.
- Em desktop, manter layout atual.

### 4. `src/pages/Dashboard.tsx`
- Importar `useIsMobile` de `@/hooks/use-mobile`.
- No header do Dashboard:
  - Trocar o container do título + status para `flex-col items-start gap-3` em mobile, mantendo `items-center justify-between` em desktop.
  - Reduzir o título de `text-xl` para `text-lg` em mobile.
- Manter os KPI cards com `onClick` inalterados; o gate em `App.tsx` já redirecionará qualquer navegação mobile de volta para `/`.

## Critérios de aceite
1. Desktop (>= 768px): nenhuma alteração visual ou funcional.
2. Mobile (< 768px):
   - TopNav exibe apenas logo, seletor de empresa e logout.
   - Usuário visualiza apenas o Dashboard.
   - Acesso direto a outras rotas via URL redireciona para `/`.
   - Breadcrumb não aparece.
   - Padding do conteúdo reduzido.
   - Dashboard empilha KPI cards em uma coluna.
   - Não há scroll horizontal.
3. Coletor, TV, suporte e login continuam funcionando normalmente no mobile.

## Testes sugeridos
- Chrome DevTools 375x812: Dashboard com TopNav simplificado.
- Redimensionar para >= 768px: layout completo restaurado.
- Em mobile, acessar `#/config/empresas`: redireciona para `#/`.
- Verificar troca de empresa e logout no mobile.
- Verificar que nada mudou no desktop.
