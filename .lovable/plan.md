# Eliminar páginas intermediárias no login do suporte da plataforma

## 🔍 Diagnóstico — Por que aparecem páginas erradas antes do destino correto

Ao logar como suporte da plataforma em `#/suporte-login`, o usuário vê 1 ou 2 "flashes" de páginas incorretas (TenantPicker, Dashboard ou tela de Carregando) antes de cair em `#/suporte/tenants`. Isso acontece por **três causas combinadas**, todas reproduzíveis no fluxo atual:

### Causa 1 — `window.location.reload()` recarrega ANTES da nova rota ser aplicada
Em `src/pages/LoginPage.tsx` (linhas 57-58):
```ts
window.location.hash = "/suporte/tenants";
window.location.reload();
```
O `reload()` é síncrono e o navegador aplica o reload imediatamente. Em alguns navegadores/condições, o hash novo nem chega a ser persistido antes do reload, ou o reload acontece e a UI inicial (que ainda não recebeu o estado autenticado nem o hash novo no estado React) renderiza por alguns frames a tela errada.

### Causa 2 — `AppContent` decide a rota inicial antes do `TenantContext` confirmar a sessão
No `App.tsx`:
- `useTenant()` começa com `loading=true, authenticated=false`.
- O guard `boot.status === "no-subdomain" && !isSupportArea && !isSupportLogin && !authenticated` **não bloqueia em `loading`**, mas também não trata a transição: assim que `boot.status` vira `no-subdomain`, se o hash ainda for `/` (porque o reload preservou o hash anterior) e `authenticated` ainda for `false` por uma fração de segundo, o `TenantPickerPage` aparece como flash.
- Logo depois, quando `useTenant.loading` muda para `false` e `authenticated` para `true`, mas o hash continua `/` (rota raiz), o `Dashboard` é renderizado por um instante — porque o caminho `/` não é uma rota de suporte e cai no `renderPage` padrão. Esse é o "Dashboard piscando" antes de `#/suporte/tenants`.

### Causa 3 — `TenantBootSplash` é o único loader; após `boot=ready`, qualquer "indecisão" cai em UI real
Não há um estado de "sessão sendo restaurada / decidindo destino pós-login". O `loading` do `TenantContext` só é exibido como texto puro `"Carregando..."` em uma única condição muito estreita; em outras transições, a UI já renderiza páginas finais.

### Bônus — Warnings de `forwardRef` no console
Os componentes `TenantBootSplash`, `TenantPickerPage`, `LoginPage` e `ForcePasswordChangeModal` recebem refs implicitamente do React DevTools/StrictMode, gerando warnings (não causam o bug, mas serão eliminados como limpeza).

---

## ✅ Solução — Estratégia em 4 camadas

### Camada 1 — Não recarregar a página após login do suporte
Em `src/pages/LoginPage.tsx`, no fluxo do suporte:
- Remover o `window.location.reload()`.
- Definir o hash **antes** de chamar `onLogin()`.
- Chamar `onLogin()` (que dispara `useTenant.login()`), permitindo que o React reaja sem recarregar.

```ts
// Antes do onLogin, garantir que o hash já é o destino final
window.location.hash = "/suporte/tenants";
localStorage.setItem("core_is_platform_support", "1");
localStorage.setItem("core_usuario_nome", who.nome || "Suporte");
toast.success(`Bem-vindo, ${who.nome || "Suporte"}!`);
// Sem reload — o AppContent reage ao hashchange + onAuthStateChange
onLogin();
```

### Camada 2 — Tela de transição dedicada para "Pós-login do Suporte"
Criar um estado local `redirectingSupport` no `LoginPage` que, durante a janela entre `signInWithPassword.success` e a primeira renderização de `SupportTenantsPage`, exibe um overlay full-screen com:
- Logo CORE LogiTrack
- Spinner
- Texto "Acessando painel de suporte..."

Isso garante que **nenhuma página intermediária seja vista**, mesmo que haja pequenos atrasos de reidratação.

### Camada 3 — Guarda anti-flash no `AppContent`
Em `src/App.tsx`, adicionar uma "porta de saída" que retém o splash enquanto a decisão de rota não está estável:

1. **Bloquear render durante `useTenant.loading`** mesmo quando a rota não é suporte (hoje só bloqueia em uma condição parcial). Mover o `if (loading) return <Splash />;` para **antes** do guard de `no-subdomain`.
2. **Detectar "intenção de rota suporte" via flag** `core_is_platform_support` no `localStorage`. Se essa flag existir mas `currentPath` ainda não estiver em `/suporte/...`, redirecionar (via `useEffect`) para `/suporte/tenants` e renderizar splash neste meio-tempo — em vez de renderizar Dashboard ou TenantPicker.

```tsx
// Em AppContent, logo após detectar paths
const isPlatformSupport = !!localStorage.getItem("core_is_platform_support");

useEffect(() => {
  if (isPlatformSupport && authenticated && !isSupportArea && !isSupportLogin) {
    navigate("/suporte/tenants");
  }
}, [isPlatformSupport, authenticated, isSupportArea, isSupportLogin]);

// Render splash enquanto o redirect não acontece
if (isPlatformSupport && !isSupportArea && !isSupportLogin) {
  return <TenantBootSplash />;
}
```

### Camada 4 — Splash unificado para "pós-login decidindo destino"
Reaproveitar `TenantBootSplash` (renomeando internamente para `AppLoadingSplash` quando usado fora do boot do tenant) para todas as três janelas:
- Boot do tenant (já existe)
- `useTenant.loading=true` (atualmente texto puro)
- "Suporte autenticado, redirecionando" (novo)

Com isso, o usuário verá apenas: **Login do Suporte → Splash unificado → Painel de Suporte**.

### Limpeza extra — Warnings de `forwardRef`
Envolver os componentes de tela com `React.forwardRef` (ou ignorar o `ref` explicitamente) para silenciar os warnings vistos no console:
- `TenantBootSplash`
- `TenantPickerPage`
- `LoginPage`
- `ForcePasswordChangeModal`

---

## 📂 Arquivos que serão modificados

1. **`src/pages/LoginPage.tsx`**
   - Remover `window.location.reload()` no fluxo do suporte.
   - Definir hash antes de `onLogin()`.
   - Adicionar estado `redirectingSupport` + overlay full-screen.

2. **`src/App.tsx`**
   - Mover `if (loading) return <Splash />` para antes dos guards de rota.
   - Adicionar guarda anti-flash baseada em `core_is_platform_support`.
   - Trocar o texto puro `"Carregando..."` por `<TenantBootSplash />`.

3. **`src/components/tenant/TenantBootScreens.tsx`**
   - Exportar splash genérico reutilizável.
   - (Opcional) Envolver componentes com `forwardRef` para silenciar warnings.

4. **`src/contexts/TenantContext.tsx`**
   - Garantir que `setAuthenticated(true)` aconteça **antes** de `setLoading(false)` (já é o caso, mas reforçar a ordem para evitar renders intermediários onde `authenticated=true && loading=true` causam decisões parciais).

---

## 🎯 Resultado esperado

Sequência visual ao clicar em "Entrar" como suporte:

| Antes (com flashes) | Depois (limpo) |
|---|---|
| Login → flash TenantPicker → flash Dashboard → SupportTenants | Login → Splash unificado → SupportTenants |

E, ao recarregar `#/suporte/tenants` com sessão já existente:

| Antes | Depois |
|---|---|
| Splash boot → flash Dashboard → SupportTenants | Splash boot → Splash "redirecionando" → SupportTenants |

Sem reloads de página, sem "Dashboard piscando", sem "TenantPicker piscando".

---

## ⚠️ Riscos e mitigação

- **Risco**: remover `reload()` pode deixar caches antigos (RBAC, permissões). 
  **Mitigação**: já invalidamos `sessionStorage.removeItem("core_rbac_permissions")` no logout; no fluxo de suporte podemos limpar caches do tenant antes de `onLogin()`.

- **Risco**: usuário comum logado no mesmo navegador depois acessa suporte e fica preso no redirect.
  **Mitigação**: limpar `core_is_platform_support` no logout (já é feito) e ao detectar `authenticated=false` no guard.
