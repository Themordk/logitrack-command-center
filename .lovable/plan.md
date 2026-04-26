# Corrigir acesso ao login do suporte da plataforma

## Problema identificado

Na tela de identificação do cliente (`TenantPickerPage`), o botão **"Sou do suporte da plataforma"** apenas executa `window.location.hash = "/"`. Como o usuário já está em `/` no domínio neutro (sem subdomínio), a guarda em `App.tsx` (linhas 393-398) renderiza **a mesma tela de novo** — o usuário fica preso, sem acesso ao formulário de login do suporte.

```ts
// App.tsx — guarda atual
if (boot.status === "no-subdomain"
    && !currentPath.startsWith("/suporte")
    && !isColetor
    && !authenticated) {
  return <TenantPickerPage />;   // ⚠️ Sempre cai aqui no domínio neutro
}
```

## Solução

Criar uma "via de escape" explícita para o login do suporte, sem afrouxar a regra do tenant picker.

### 1. `src/components/tenant/TenantBootScreens.tsx`
- Mudar o `goSupport()` para navegar a uma rota dedicada: `window.location.hash = "/suporte-login"`.

### 2. `src/App.tsx`
- Adicionar `"/suporte-login"` à lista de exceções da guarda do `TenantPickerPage`:
  ```ts
  if (boot.status === "no-subdomain"
      && !currentPath.startsWith("/suporte")
      && currentPath !== "/suporte-login"
      && !isColetor
      && !authenticated) { ... }
  ```
- Quando `currentPath === "/suporte-login"` e usuário não autenticado, renderizar diretamente o `LoginPage` em modo suporte.
- O `LoginPage` já reconhece o e-mail `suporte.corelogitrack@gmail.com` e redireciona para `/suporte/tenants` após login.

### 3. `src/pages/LoginPage.tsx`
- Aceitar prop opcional `mode?: "support"` para:
  - Pré-preencher placeholder com `suporte.corelogitrack@gmail.com`.
  - Ocultar o link "Acessar Coletor de Dados".
  - Exibir um chip "Acesso: Suporte da Plataforma" no lugar do badge de tenant.
  - Mostrar link "Voltar à identificação do cliente" → `navigate("/")`.
- A lógica de autenticação **não muda** — o fluxo `isSupportEmail` em `handleLogin` já trata o redirect para `/suporte/tenants` após `support-whoami`.

## Fluxo final

1. Usuário acessa `corelogitrack.com.br` → vê `TenantPickerPage`.
2. Clica em "Sou do suporte da plataforma" → vai para `#/suporte-login`.
3. `App.tsx` renderiza `LoginPage` em modo suporte.
4. Usuário digita `suporte.corelogitrack@gmail.com` + senha → autentica.
5. `LoginPage` detecta o e-mail, chama `support-whoami`, redireciona para `#/suporte/tenants`.
6. `SupportRoute` valida e mostra o painel.

## Arquivos a editar

- `src/components/tenant/TenantBootScreens.tsx` — alterar `goSupport()`.
- `src/App.tsx` — exceção da guarda + render do `LoginPage` em `/suporte-login`.
- `src/pages/LoginPage.tsx` — prop `mode="support"` com pequenos ajustes visuais e link de voltar.

Sem alterações em banco de dados ou edge functions.