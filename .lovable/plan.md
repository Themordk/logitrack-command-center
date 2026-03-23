

# Plano de Desacoplamento: Cadastro de Usuários × Autenticação

## Diagnóstico Atual

**Acoplamento identificado:**
- `usuario.id` = `auth.users.id` (PK compartilhada)
- Login (admin e coletor) faz `signInWithPassword` → busca `usuario` por `auth.user.id`
- Cadastro de usuário (`UsuariosPage`) exige informar manualmente o UUID do `auth.users`
- RLS usa `auth.uid()` e `get_current_tenant()` que dependem de sessão Auth ativa
- 22+ arquivos referenciam `core_usuario_id` via localStorage (populado após auth)
- Funções RPC recebem `p_usuario` como UUID vinculado ao auth

**Consequência:** Não é possível criar um operador sem antes criar conta no Supabase Auth.

---

## Fase 1 — Preparação do Banco (Desacoplar PK)

**Objetivo:** Permitir que `usuario` tenha ID próprio, independente de `auth.users`.

### Passo 1.1 — Adicionar coluna `auth_user_id` na tabela `usuario`
- **Ação:** `ALTER TABLE usuario ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL`
- **Impacto DB:** Nova coluna nullable. Migrar dados existentes: `UPDATE usuario SET auth_user_id = id`
- **Riscos:** Nenhum — coluna aditiva, sem quebra

### Passo 1.2 — Alterar PK de `usuario` para UUID auto-gerado
- **Ação:** Criar nova coluna `new_id uuid DEFAULT gen_random_uuid()`, migrar FKs, trocar PK
- **Impacto DB:** Todas as tabelas que referenciam `usuario.id` precisam ser atualizadas (log_sessao_usuario, tarefa_execucao, estoque_movimento, etc.)
- **Riscos:** ALTO — migração de FKs em produção. Requer janela de manutenção
- **Alternativa segura:** Manter `id` atual como está, mas permitir cadastro SEM exigir match com auth.users. Usar `auth_user_id` como vínculo opcional

### Passo 1.3 (Abordagem recomendada) — Manter ID, remover constraint
- **Ação:** Se existir FK `usuario.id → auth.users.id`, removê-la. Permitir inserção de qualquer UUID
- **Impacto:** Usuários podem ser criados com `gen_random_uuid()` sem existir no Auth
- **Riscos:** Baixo. Dados existentes mantêm IDs válidos

---

## Fase 2 — Novo Fluxo de Cadastro (UI)

**Objetivo:** Cadastrar operadores sem depender do Auth.

### Passo 2.1 — Reformular `UsuariosPage`
- **Ação:** Remover campo "ID (UUID do auth.users)". Gerar ID automaticamente via `gen_random_uuid()`
- **Novos campos:** Adicionar campo `senha` (para criação futura de conta Auth, ou login interno)
- **Impacto UI:** Formulário simplificado. Administrador não precisa conhecer UUID do Auth

### Passo 2.2 — Criar função RPC `fn_cadastrar_usuario`
- **Ação:** Função que insere na tabela `usuario` com ID auto-gerado, sem tocar Auth
- **Parâmetros:** tenant_id, empresa_id, armazem_id, nome, login, email, tipo_operacao, etc.
- **Impacto Functions:** Nova função. Sem breaking change

### Passo 2.3 — Opcional: Botão "Vincular Auth" na listagem
- **Ação:** Botão que cria conta no Supabase Auth e atualiza `auth_user_id`
- **Quando usar:** Quando o operador precisar fazer login no sistema
- **Impacto UI:** Novo componente. Ação administrativa explícita

---

## Fase 3 — Adaptar Login (Modelo Híbrido)

**Objetivo:** Suportar login com Auth existente E futuro login interno.

### Passo 3.1 — Ajustar fluxo de login atual
- **Ação:** Após `signInWithPassword`, buscar `usuario` por `auth_user_id` (ao invés de `id`)
- **Impacto:** `LoginPage.tsx`, `ColetorLoginPage.tsx` — alterar query de `.eq("id", userId)` para `.eq("auth_user_id", userId)`
- **Riscos:** Baixo se Passo 1 populou `auth_user_id` corretamente

### Passo 3.2 — Adaptar funções RLS
- **Ação:** `get_current_tenant()` e `get_user_tenant_id()` devem usar `auth_user_id` para localizar o tenant do usuário autenticado
- **Impacto Functions:** Atualizar funções SQL auxiliares
- **Riscos:** CRÍTICO — RLS quebra se mal implementado. Testar exaustivamente

### Passo 3.3 — Manter `core_usuario_id` no localStorage
- **Ação:** Continuar armazenando o ID do `usuario` (não do auth.users) no localStorage
- **Impacto:** Nenhum nos 22+ arquivos que leem `core_usuario_id` — já usam o ID operacional

---

## Fase 4 — Login por Credenciais Internas (Futuro)

**Objetivo:** Permitir login sem Supabase Auth (ex: login/senha armazenados no banco).

### Passo 4.1 — Adicionar campo `senha_hash` na tabela `usuario`
- **Ação:** Coluna para armazenar hash bcrypt da senha
- **Impacto DB:** Nova coluna nullable

### Passo 4.2 — Edge Function para autenticação interna
- **Ação:** Criar edge function que valida login/senha_hash e retorna JWT customizado
- **Riscos:** Complexidade de segurança (tokens, refresh, expiração)
- **Alternativa:** Usar `supabase.auth.admin.createUser()` via edge function para criar conta Auth sob demanda no primeiro login

### Passo 4.3 — Alternativa pragmática (recomendada)
- **Ação:** No cadastro do usuário, criar automaticamente conta Auth via edge function com `supabase.auth.admin.createUser({ email, password })`
- **Vantagem:** Mantém infraestrutura Auth do Supabase sem exigir ação manual do admin
- **O admin define email+senha no formulário → sistema cria Auth + usuario automaticamente

---

## Sequência Recomendada de Implementação

```text
FASE 1.3 → FASE 2.1 → FASE 2.2 → FASE 3.1 → FASE 3.2 → FASE 4.3
  │            │           │           │           │           │
  │ Remover    │ Novo      │ RPC       │ Login     │ RLS       │ Auto-criar
  │ constraint │ form UI   │ cadastro  │ por       │ adaptar   │ Auth via
  │ FK auth    │ sem UUID  │           │ auth_user │           │ edge fn
  └────────────┴───────────┴───────────┴───────────┴───────────┘
```

## Riscos Técnicos Principais

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| RLS quebra ao mudar lookup de `id` para `auth_user_id` | CRÍTICO | Testar em ambiente isolado antes. Deploy em janela de baixo uso |
| Usuários existentes sem `auth_user_id` populado | ALTO | Script de migração: `UPDATE usuario SET auth_user_id = id` antes de mudar queries |
| Edge function para criar Auth precisa de `service_role_key` | MÉDIO | Configurar como secret na edge function |
| Funções RPC que recebem `p_usuario` podem receber ID errado | MÉDIO | Auditar todas as RPCs para garantir que recebem o ID operacional |

## Decisão Pendente

Antes de implementar, preciso saber:

1. **A tabela `usuario` possui FK para `auth.users`?** (Se sim, precisamos removê-la na Fase 1)
2. **Prefere a abordagem 4.3 (auto-criar Auth no cadastro) ou 4.1/4.2 (login interno sem Auth)?**

