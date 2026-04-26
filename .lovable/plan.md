# Plano — Módulo "Suporte da Plataforma" (Gestão de Tenants)

Objetivo: criar uma área administrativa **fora do RLS multi-tenant**, acessível apenas ao e-mail `suporte.corelogitrack@gmail.com`, para gerenciar todos os Tenants do sistema.

Princípios de segurança:
- **RLS permanece intacto** em todas as tabelas dos clientes.
- Toda leitura/escrita do módulo passa por **edge functions com service_role**, validando JWT + flag `is_platform_support` em cada chamada.
- Whitelist de e-mail no servidor (não confia em flag de localStorage).

---

## Fase 1 — Banco de dados

### 1.1 Nova tabela `platform_support_user`
Marca quais `auth.users` são suporte da plataforma (não pertencem a nenhum tenant).

```sql
CREATE TABLE public.platform_support_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_support_user ENABLE ROW LEVEL SECURITY;
-- Sem políticas públicas: só service_role acessa.
```

### 1.2 Função utilitária
```sql
CREATE OR REPLACE FUNCTION public.is_platform_support(p_auth_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_support_user
    WHERE auth_user_id = p_auth_user_id AND ativo = true
  );
$$;
```

### 1.3 Seed do primeiro suporte
Migration cria o usuário em `auth.users` (se não existir) com senha inicial `Suporte@Core2026` e insere em `platform_support_user`. Email **whitelisted no código** das edge functions: `suporte.corelogitrack@gmail.com`.

### 1.4 Bloqueio de login para tenant inativo
Atualizar `fn_buscar_email_por_login` (e/ou validação no `LoginPage`) para rejeitar quando `tenant.ativo = false`.

### 1.5 View agregada de métricas (consumida só pela edge function)
```sql
CREATE OR REPLACE VIEW public.vw_tenant_resumo AS
SELECT
  t.id, t.nome, t.ativo, t.created_at,
  (SELECT count(*) FROM empresa  WHERE tenant_id = t.id) AS total_empresas,
  (SELECT count(*) FROM usuario  WHERE tenant_id = t.id) AS total_usuarios,
  (SELECT count(*) FROM produto  WHERE tenant_id = t.id) AS total_produtos,
  (SELECT count(*) FROM estoque_movimento WHERE tenant_id = t.id) AS total_movimentos
FROM public.tenant t;
```

---

## Fase 2 — Edge Functions (todas validam JWT + `is_platform_support`)

Helper comum em cada function:
```ts
const { data } = await supabase.auth.getClaims(token);
const email = data?.claims?.email;
if (email !== "suporte.corelogitrack@gmail.com") return 403;
const { data: sup } = await admin.from("platform_support_user")
  .select("id").eq("auth_user_id", data.claims.sub).eq("ativo", true).maybeSingle();
if (!sup) return 403;
```

Funções a criar:

| Function | Método | Descrição |
|---|---|---|
| `support-list-tenants` | GET | Lista tenants com filtro por nome (usa `vw_tenant_resumo`) |
| `support-tenant-detail` | GET `?tenant_id=` | Informações gerais: contagens detalhadas, último login, etc. |
| `support-tenant-toggle` | POST | Ativa/desativa `tenant.ativo` |
| `support-create-usuario` | POST | Cadastra usuário em qualquer tenant (reusa lógica de `create-usuario` mas suporte injeta o `tenant_id` alvo) |
| `support-list-chamados` | GET | Lista chamados (Fase 4 — placeholder retorna `[]` por enquanto) |

Notas:
- `create-usuario` original **não** será reaproveitado diretamente: hoje ele força `tenant_id = solicitante.tenant_id`. A nova `support-create-usuario` usa o mesmo fluxo Auth, mas aceita `tenant_id` no body **somente** após validar suporte.

---

## Fase 3 — Frontend

### 3.1 Login (mesmo formulário)
`LoginPage.handleLogin`: se `login.trim().toLowerCase() === "suporte.corelogitrack@gmail.com"`, pular `fn_buscar_email_por_login` e fazer `signInWithPassword({ email: login, password })` direto. Após sucesso, chamar uma edge function leve (`support-whoami`) que confirma e retorna `{ nome }`. Setar:
```
localStorage.setItem("core_is_platform_support", "1");
localStorage.setItem("core_usuario_nome", nome);
```
e navegar para `#/suporte/tenants`.

### 3.2 Novo `SupportLayout` + `SupportTopNav`
Mesmo padrão visual do TopNav admin (logo CORE LogiTrack, badge "SUPORTE" em destaque, sem seletor de empresa). Itens do menu: **Tenants**, **Chamados** (placeholder), **Sair**.

Guard `SupportRoute`: bloqueia se `localStorage.core_is_platform_support !== "1"` E revalida via `support-whoami` no mount (defesa em profundidade — localStorage é só hint, autoridade real é o JWT).

### 3.3 Páginas
- `src/pages/suporte/SupportTenantsPage.tsx` — tabela central com:
  - Filtro por nome
  - Colunas: Nome, Status, Empresas, Usuários, Criado em
  - Ações por linha: **Informações** | **Cadastrar Usuário** | **Chamados** | **Ativar/Desativar**
- `src/pages/suporte/SupportTenantDetailPage.tsx` — KPIs do tenant (empresas, usuários, produtos, movimentos, requisições por período via analytics se viável; senão ocultar essa seção na v1).
- `src/pages/suporte/SupportCreateUsuarioModal.tsx` — replica `UsuariosPage` form (login, nome, email, perfis), chamando `support-create-usuario` com `tenant_id` da linha selecionada.
- `src/pages/suporte/SupportChamadosPage.tsx` — lista vazia + aviso "Em breve" (estrutura pronta para Fase 4).

### 3.4 Roteamento (`App.tsx`)
Adicionar rotas hash:
- `#/suporte/tenants`
- `#/suporte/tenants/:id`
- `#/suporte/chamados`
- `#/suporte/chamados/:tenantId`

Todas envolvidas por `<SupportRoute>`. **Não** entram em `Layout` admin nem em `PermissionsProvider` (RBAC do tenant não se aplica).

### 3.5 Logout
Limpar `core_is_platform_support` no `logout()` do TenantContext.

---

## Fase 4 — Chamados (estrutura mínima, sem CRUD completo nessa entrega)

Tabela criada agora para evitar migration futura:
```sql
CREATE TABLE public.support_chamado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id),
  titulo text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'ABERTO',
  criado_por uuid,  -- usuario do tenant
  criado_em timestamptz NOT NULL DEFAULT now(),
  atendido_por uuid, -- platform_support_user
  atendido_em timestamptz
);
ALTER TABLE public.support_chamado ENABLE ROW LEVEL SECURITY;
-- RLS: usuários do tenant podem ver/criar os próprios; suporte acessa via service_role.
CREATE POLICY chamado_tenant_select ON public.support_chamado
  FOR SELECT USING (tenant_id = get_current_tenant());
CREATE POLICY chamado_tenant_insert ON public.support_chamado
  FOR INSERT WITH CHECK (tenant_id = get_current_tenant());
```
A UI de criação pelo cliente fica para depois — agora a página de listagem do suporte já consegue exibir.

---

## Riscos & mitigações
- **Bypass do guard front**: mitigado porque toda action chama edge function que revalida JWT + tabela.
- **Vazamento via service_role**: edge functions nunca retornam dados sem antes confirmar `is_platform_support`.
- **Tenant desativado ainda logado**: opcionalmente forçar `signOut` no próximo heartbeat se `tenant.ativo=false` (incluso em 1.4).
- **Senha inicial do suporte**: marcada com `deve_trocar_senha=true`-equivalente; instruir trocar imediatamente após o primeiro login.

## Entregáveis
1. Migration criando `platform_support_user`, `support_chamado`, `vw_tenant_resumo`, `is_platform_support()` e seed.
2. 6 edge functions: `support-whoami`, `support-list-tenants`, `support-tenant-detail`, `support-tenant-toggle`, `support-create-usuario`, `support-list-chamados`.
3. Front: `SupportLayout`, `SupportTopNav`, `SupportRoute`, 4 páginas + modal de criação de usuário, ajuste em `LoginPage` e `App.tsx`.
4. Atualização da `core memory` registrando o novo módulo isolado.
