# Plano para corrigir o acesso ao login do suporte

## Causa principal identificada

O botão **"Sou do suporte da plataforma"** já está chamando a navegação para `#/suporte-login`, porém a rota está sendo capturada pelo bloco errado em `App.tsx`.

Hoje existe esta condição:

```ts
if (currentPath.startsWith("/suporte")) {
  return <SupportRoute>...</SupportRoute>;
}
```

O problema é que:

```ts
"/suporte-login".startsWith("/suporte") === true
```

Ou seja, quando o usuário clica no botão:

```text
/#/  ->  /#/suporte-login
```

A aplicação interpreta `/suporte-login` como se fosse uma rota protegida do painel `/suporte/*`, renderiza `SupportRoute`, detecta que o usuário ainda não está autenticado, e redireciona de volta para `/`. Por isso visualmente parece que “não navegou”.

## Causas secundárias que podem contribuir

1. **Prefixo ambíguo da rota**
   - `/suporte-login` começa com `/suporte`, então entra no guard errado.

2. **Ordem dos guards no `App.tsx`**
   - O bloco de rotas protegidas `/suporte` roda antes do render explícito do login de suporte.

3. **Fallback de não autorizado do `SupportRoute`**
   - Como `/suporte-login` é tratado por engano como rota protegida, `SupportRoute` chama `onUnauthorized={() => navigate("/")}` e volta para o `TenantPickerPage`.

4. **Aparência de validação obrigatória do campo cliente**
   - O campo não é o bloqueio real neste estado atual. O botão está fora do `<form>`, tem `type="button"`, `formNoValidate`, `preventDefault()` e `stopPropagation()`.
   - O comportamento observado é causado pelo redirecionamento automático de volta para `/`.

## Correção proposta

### 1. Tornar a rota de suporte protegida mais específica

Em `src/App.tsx`, substituir o teste genérico:

```ts
currentPath.startsWith("/suporte")
```

por uma verificação que não capture `/suporte-login`:

```ts
const isSupportLogin = currentPath === "/suporte-login";
const isSupportArea = currentPath === "/suporte" || currentPath.startsWith("/suporte/");
```

Assim:

```text
/suporte-login       -> login público do suporte
/suporte             -> área protegida do suporte
/suporte/tenants     -> área protegida do suporte
/suporte/chamados    -> área protegida do suporte
```

### 2. Renderizar `/suporte-login` antes do `SupportRoute`

Adicionar um tratamento explícito antes das rotas protegidas:

```ts
if (!authenticated && isSupportLogin) {
  return (
    <LoginPage
      mode="support"
      onLogin={() => login()}
      onNavigateColetor={() => navigate("/coletor/login")}
      onBackToPicker={() => navigate("/")}
    />
  );
}
```

Isso impede que o `SupportRoute` intercepte a tela de login.

### 3. Manter o `TenantPickerPage` como fallback seguro

Manter a exceção já existente na guarda do domínio neutro:

```ts
currentPath !== "/suporte-login"
```

Assim, em domínio sem subdomínio:

```text
/#/                  -> TenantPickerPage
/#/suporte-login     -> LoginPage em modo suporte
/#/suporte/tenants   -> SupportRoute protegido
```

### 4. Ajustar o bloco de rotas protegidas do suporte

Trocar:

```ts
if (currentPath.startsWith("/suporte")) {
```

por:

```ts
if (isSupportArea) {
```

Isso garante que apenas `/suporte` e `/suporte/*` sejam protegidos pelo `SupportRoute`, sem capturar `/suporte-login`.

### 5. Opcional, para blindagem adicional

Adicionar uma constante centralizada para evitar novos erros de prefixo no futuro:

```ts
const SUPPORT_LOGIN_PATH = "/suporte-login";
const isSupportAreaPath = (path: string) => path === "/suporte" || path.startsWith("/suporte/");
```

## Resultado esperado após a correção

Fluxo correto:

```text
1. Usuário acessa /#/
2. Sistema mostra TenantPickerPage
3. Usuário clica em "Sou do suporte da plataforma"
4. URL muda para /#/suporte-login
5. App renderiza LoginPage em mode="support"
6. Campo de e-mail vem preenchido com suporte.corelogitrack@gmail.com
7. Usuário informa senha
8. Login valida support-whoami
9. Sistema redireciona para /#/suporte/tenants
10. SupportRoute protege apenas o painel autenticado
```

## Arquivo a editar

- `src/App.tsx`
  - Criar `isSupportLogin` e `isSupportArea`.
  - Renderizar `/suporte-login` antes do bloco protegido `/suporte`.
  - Trocar `currentPath.startsWith("/suporte")` por `isSupportArea`.

Não será necessário alterar banco de dados, edge functions ou a lógica de autenticação do suporte.