# Plano — Arquitetura Multi-Tenant por Subdomínio

## 🎯 Objetivo

Identificar o tenant **automaticamente pelo subdomínio** de `corelogitrack.com.br`, validar no backend antes do login, travar a sessão a esse tenant e impedir qualquer acesso cruzado entre clientes.

Exemplo:
- `jrpneus.corelogitrack.com.br` → tenant **Jrpneus** (`0619c6ea-…`)
- `tiaotruck.corelogitrack.com.br` → tenant **Tiaotruck**
- `app.corelogitrack.com.br` ou domínio raiz → portal neutro (escolha de tenant / suporte)

---

## 🧱 Estado Atual (descoberto na inspeção)

- `TenantContext` lê `tenant_id` do `localStorage` (gravado pelo login do usuário).
- `fn_buscar_email_por_login(p_login)` busca e-mail por login **sem filtrar por tenant** — hoje, dois tenants com o mesmo `login` causariam ambiguidade.
- `get_current_tenant()` no banco deriva tenant do `auth.uid()` (usuario.auth_user_id) — isso é seguro **após** o login, mas hoje **antes do login não há trava por subdomínio**.
- Tabela `tenant` tem apenas `id`, `nome`, `ativo` (sem `slug`).
- Há 3 tenants reais: CORE LogiTrack, Jrpneus, Tiaotruck.

**Gap crítico:** nada hoje impede que um usuário do tenant A digite suas credenciais em `tenantB.corelogitrack.com.br` e acesse o sistema (o login resolveria pelo `auth.uid()`).

---

## 🗺️ Fluxo Alvo

```
1. Usuário acessa  jrpneus.corelogitrack.com.br
2. UI extrai subdomínio → "jrpneus"
3. UI chama edge function pública: resolve-tenant?slug=jrpneus
4. Backend valida (slug existe + ativo) e devolve { tenant_id, nome, ativo }
5. UI grava tenant em sessionStorage + contexto global (TenantBootContext)
6. Tela de Login fica "amarrada" ao tenant — login só aceita usuário daquele tenant
7. Sessão inteira opera com esse tenant; qualquer divergência derruba a sessão
```

---

## 📦 Fase 1 — Banco de Dados

### 1.1. Adicionar coluna `slug` em `tenant`
```sql
ALTER TABLE public.tenant ADD COLUMN IF NOT EXISTS slug text;

-- Backfill normalizado (lowercase, sem espaços/acentos)
UPDATE public.tenant
SET slug = lower(regexp_replace(unaccent(nome), '[^a-z0-9]', '', 'g'))
WHERE slug IS NULL;

ALTER TABLE public.tenant ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_slug ON public.tenant(lower(slug));
```
> Ex: `Jrpneus` → `jrpneus`, `Tiaotruck` → `tiaotruck`, `CORE LogiTrack` → `corelogitrack`.

### 1.2. Função pública `fn_resolve_tenant_by_slug(p_slug text)`
- `SECURITY DEFINER`, retorna **apenas** `id`, `nome`, `slug`, `ativo` quando ativo. Caso inativo/inexistente, retorna `NULL`.
- `GRANT EXECUTE … TO anon, authenticated`.
- Não expõe nenhum outro dado do tenant.

### 1.3. Reforçar `fn_buscar_email_por_login` para travar pelo tenant
Nova assinatura: `fn_buscar_email_por_login(p_login text, p_tenant_id uuid)`.
- Filtra `usuario.login = p_login AND usuario.tenant_id = p_tenant_id AND tenant.ativo = true`.
- Se o usuário existir em outro tenant, retorna `NULL` (sem vazar).
- Mantém comportamento de bloquear tenant inativo.

### 1.4. Função `fn_user_belongs_to_tenant(p_tenant_id uuid)`
- Pós-login: `SECURITY DEFINER`, verifica se `auth.uid()` pertence ao `p_tenant_id` informado pelo subdomínio.
- Usada pela UI (RPC) imediatamente após `signInWithPassword` para abortar a sessão se houver mismatch.

---

## ⚙️ Fase 2 — Edge Functions

### 2.1. `resolve-tenant` (público, sem JWT)
- `GET /resolve-tenant?slug=jrpneus`
- Sanitiza slug (`/^[a-z0-9-]{2,40}$/`), faz `rpc('fn_resolve_tenant_by_slug', { p_slug })`.
- Resposta:
  - 200 `{ id, nome, slug, ativo: true }`
  - 404 `{ error: "TENANT_NOT_FOUND" }`
  - 403 `{ error: "TENANT_INACTIVE" }`
- Rate limit simples por IP (in-memory) para evitar enumeração.
- CORS aberto, `verify_jwt = false`.

### 2.2. (opcional) `tenant-health` para diagnóstico
Apenas devolve status do tenant resolvido — útil para tela de erro.

---

## 🖥️ Fase 3 — Frontend

### 3.1. Util `getSubdomainTenantSlug()`
`src/lib/tenantSubdomain.ts`:
```ts
export function getSubdomainTenantSlug(): string | null {
  const host = window.location.hostname.toLowerCase();
  // Ignora localhost / preview lovable / IPs
  if (host === "localhost" || host.endsWith(".lovable.app") || /^\d+\.\d+\.\d+\.\d+$/.test(host))
    return null;
  if (!host.endsWith("corelogitrack.com.br")) return null;
  const parts = host.split(".");
  // app.corelogitrack.com.br, www.corelogitrack.com.br, corelogitrack.com.br → neutro
  if (parts.length < 4) return null;
  const sub = parts[0].trim();
  if (["www", "app", ""].includes(sub)) return null;
  if (!/^[a-z0-9-]{2,40}$/.test(sub)) return null;
  return sub;
}
```

### 3.2. Novo `TenantBootContext` (executa **antes** de tudo)
`src/contexts/TenantBootContext.tsx`:
- Estados: `status: 'loading' | 'ready' | 'no-subdomain' | 'not-found' | 'inactive' | 'error'`, `tenant: { id, nome, slug } | null`.
- No mount:
  1. Se não há subdomínio → `status = 'no-subdomain'` (mostra portal neutro).
  2. Chama `supabase.functions.invoke('resolve-tenant', { query: { slug } })` (com timeout 8s + 1 retry).
  3. Sucesso → grava em `sessionStorage('boot_tenant_id', boot_tenant_slug)` e seta `tenant`.
  4. Erro → seta status apropriado.
- **Bloqueia render do app** até `status !== 'loading'`.

### 3.3. Telas de Erro e Portal Neutro
- `<TenantNotFoundPage>`: "Cliente não encontrado" + botão para `https://app.corelogitrack.com.br`.
- `<TenantInactivePage>`: "Acesso suspenso. Contate o suporte."
- `<TenantPickerPage>` (rota neutra `app.*` ou raiz): permite digitar slug e redireciona via `window.location = https://${slug}.corelogitrack.com.br`. Não lista tenants.

### 3.4. Ajuste no `LoginPage`
- Lê `useTenantBoot()` para saber `tenant.id`.
- Mostra **nome do tenant** acima do form ("Acesso: Jrpneus").
- Chama `fn_buscar_email_por_login(login, tenant.id)`.
- Após `signInWithPassword`, chama `rpc('fn_user_belongs_to_tenant', { p_tenant_id: tenant.id })`. Se `false` → `signOut()` + toast "Usuário não pertence a este cliente."
- Carrega `usuario` filtrando **também** por `tenant_id = boot.tenant.id` (defesa extra).
- Caso especial **suporte** (`suporte.corelogitrack@gmail.com`): só permitido em `app.corelogitrack.com.br` (sem subdomínio). Em qualquer subdomínio de cliente, bloqueia com mensagem.

### 3.5. Ajuste no `TenantContext` existente
- `loadFromStorage` valida que `core_tenant_id === boot.tenant.id`. Se divergir → `logout()`.
- `logout` mantido, mas **nunca** apaga o `boot_tenant_id` (ele pertence ao subdomínio, não à sessão).

### 3.6. Ajuste no `ColetorLoginPage`
- Mesma lógica do LoginPage: amarra ao tenant do subdomínio antes de buscar e-mail.
- Em previews/lovable.app sem subdomínio, mantém comportamento atual (modo dev).

### 3.7. Guarda contínua no `App.tsx`
- Envolver tudo com `<TenantBootProvider>` no `main.tsx`.
- `App` decide qual UI renderizar baseado em `useTenantBoot().status`:
  - `loading` → splash
  - `no-subdomain` → portal neutro / suporte
  - `not-found | inactive | error` → tela de erro
  - `ready` → fluxo atual (Login, Coletor, etc.)

### 3.8. Interceptor leve nas requests Supabase
Wrapper opcional em `src/integrations/supabase/withTenantGuard.ts`:
- Antes de qualquer query autenticada, valida `boot.tenant.id === localStorage.core_tenant_id`. Mismatch → `signOut()` + reload. Defesa contra trocas manuais de localStorage.

---

## 🔐 Segurança — Itens Obrigatórios

| Risco | Mitigação |
|---|---|
| Frontend forjar tenant | Edge function valida slug; RPC `fn_user_belongs_to_tenant` valida pós-login |
| Usuário do tenant A logar no subdomínio do tenant B | `fn_buscar_email_por_login` agora exige `tenant_id`; segunda checagem com RPC após auth |
| Enumeração de tenants | Slug sanitizado, rate limit por IP no edge, mensagens genéricas |
| Tenant leakage via RLS | Mantemos `get_current_tenant()` (deriva de `auth.uid`); subdomínio é **camada extra**, não substitui RLS |
| Suporte global confundir tenants | Login do suporte só funciona em domínio neutro `app.corelogitrack.com.br` |
| Localhost / preview Lovable | Subdomínio ignorado → cai no portal neutro (modo legado) |

---

## 🌐 Fase 4 — DNS / Custom Domain

- `corelogitrack.com.br` (raiz) e `*.corelogitrack.com.br` (wildcard) já configurados como custom domain Lovable.
- Confirmar no painel do Lovable que **wildcard** está marcado como **Active**.
- SSL wildcard provisionado automaticamente.
- Caso o wildcard ainda não esteja ativo, instruções de DNS (A 185.158.133.1 + TXT _lovable) devem ser revisadas — fora do escopo de código.

---

## 🚦 Tratamento de Erros (UX)

| Cenário | Tela | CTA |
|---|---|---|
| Sem subdomínio (raiz / app.) | Portal "Selecione seu cliente" | Input de slug |
| Slug inválido / inexistente | "Cliente **xxx** não encontrado" | Voltar ao portal |
| Tenant inativo | "Acesso suspenso. Contate o suporte." | Email do suporte |
| Edge function offline / timeout | "Não foi possível conectar. Tente novamente." | Retry manual |
| Mismatch usuário×tenant pós-login | Toast vermelho + signOut imediato | Permanece no Login |

---

## 📋 Entregáveis (ordem de implementação)

1. **Migração SQL**: coluna `slug`, índice, função `fn_resolve_tenant_by_slug`, nova `fn_buscar_email_por_login(login, tenant_id)`, `fn_user_belongs_to_tenant`.
2. **Edge function** `resolve-tenant` (pública).
3. **Frontend core**: `tenantSubdomain.ts`, `TenantBootContext`, telas de erro/portal, integração no `main.tsx` e `App.tsx`.
4. **Login**: ajustes em `LoginPage` + `ColetorLoginPage` (RPC com tenant_id, double-check pós-auth, bloqueio de suporte fora do domínio neutro).
5. **Hardening**: validação contínua em `TenantContext` + (opcional) `withTenantGuard`.
6. **QA**: testar `jrpneus.…`, `tiaotruck.…`, slug inexistente, tenant inativo, login cruzado entre tenants, suporte em subdomínio cliente, fluxo localhost.

---

## ⚠️ Itens Fora do Escopo Desta Iteração

- Migração de slugs definitivos pelo cliente (usaremos slug normalizado do `nome`; cliente pode customizar depois via UI de suporte).
- Auto-cadastro de tenants.
- Onboarding via subdomínio personalizado (CNAME do cliente).
