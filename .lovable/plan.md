## Criar Tenant a partir do módulo de Suporte

Adicionar fluxo para que o suporte da plataforma cadastre um novo cliente (tenant) já com sua primeira empresa, diretamente em `/#/suporte/tenants`.

---

### 1) UI — botão e modal em `SupportTenantsPage.tsx`

- Adicionar botão **"+ Novo Tenant"** no cabeçalho do card (à esquerda do campo de busca), no mesmo padrão visual usado em outras telas administrativas (ícone `Plus`, primário).
- Ao clicar, abrir um novo modal `SupportCreateTenantModal` (componente novo em `src/components/suporte/SupportCreateTenantModal.tsx`), seguindo o mesmo design do `SupportCreateUsuarioModal` (overlay escuro + card com bordas/cores do tema).

**Campos do formulário** (todos obrigatórios salvo indicação):

Seção **Tenant**
- Nome do Tenant (texto)
- Slug (texto, lowercase, `[a-z0-9-]{2,40}`) — usado no subdomínio `{slug}.corelogitrack.com.br`. Sugerir slug automaticamente a partir do nome (normaliza acentos, espaços → `-`), mas editável.

Seção **Primeira Empresa**
- Razão Social (texto)
- CNPJ (texto, máscara opcional)
- Código (texto curto, exibido no seletor de empresa do TopNav)

Validações no front (zod ou inline): nome ≥ 2 chars, slug com regex acima, CNPJ não vazio (apenas dígitos, 14), razão social ≥ 2 chars, código não vazio.

Após sucesso: fechar modal, exibir `toast.success`, chamar `fetchTenants(filtro)` para refletir o novo tenant na lista.

---

### 2) Edge function nova — `support-create-tenant`

Local: `supabase/functions/support-create-tenant/index.ts`.
Reutiliza `authenticateSupport` e `corsHeaders` do `_shared/support-auth.ts` (mesmo padrão das outras edge functions de suporte, usando service role para contornar RLS).

Fluxo:
1. `OPTIONS` → CORS.
2. Autenticar via `authenticateSupport(req)` (whitelist + `platform_support_user.ativo`).
3. Validar body com zod: `nome`, `slug`, `razaosocial`, `cnpj`, `codigo`.
4. Normalizar: `slug.toLowerCase().trim()`, `cnpj` apenas dígitos.
5. Verificar unicidade:
   - `tenant.slug` já existente → 409 "Slug já em uso".
   - `empresa.cnpj` (globalmente, ou ao menos dentro do tenant — manter consistente com regra atual; usar global por segurança) → 409 se existir.
6. Inserir em `tenant` (`nome`, `slug`, `ativo: true`) → obter `tenant.id`.
7. Inserir em `empresa` (`tenant_id`, `razaosocial`, `cnpj`, `codigo`, `ativo: true`).
8. Em caso de erro no insert da empresa: rollback manual deletando o tenant recém-criado para não deixar tenant órfão.
9. Retornar `{ success: true, tenant: { id, nome, slug }, empresa: { id, codigo } }`.

Não cria usuário nesta etapa — o suporte já tem o botão "Cadastrar usuário" por linha na lista para popular o tenant em seguida.

---

### 3) Sem migrações de banco

As tabelas `tenant` e `empresa` já têm todas as colunas necessárias (`tenant`: `nome`, `slug`, `ativo`; `empresa`: `tenant_id`, `razaosocial`, `cnpj`, `codigo`, `ativo`). A edge function usa `service_role`, então as RLS de tenant_id não bloqueiam o insert.

---

### 4) Memória

Atualizar `mem://features/platform-support-module.md` (sem alterar `mem://index.md`) acrescentando que o módulo de suporte agora também provisiona novos tenants (tenant + 1ª empresa) via `support-create-tenant`.

---

### Arquivos

**Novos**
- `supabase/functions/support-create-tenant/index.ts`
- `src/components/suporte/SupportCreateTenantModal.tsx`

**Editados**
- `src/pages/suporte/SupportTenantsPage.tsx` (botão + estado do modal + refresh)
- `mem://features/platform-support-module.md`
