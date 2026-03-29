

# Plano de Desenvolvimento RBAC - CORE LogiTrack

## Visao Geral

Implementar controle de acesso baseado em papeis (RBAC) com permissoes granulares por modulo, rota e acao CRUD, cobrindo Painel Administrativo (Web) e Coletor (Mobile). O sistema atual usa `tipo_usuario` (ADMIN/OPERADOR/SUPERVISOR) na tabela `usuario` sem nenhuma validacao real de permissoes.

---

## Fase 1 - Modelagem de Dados (Migration SQL)

Criar as seguintes tabelas e funcoes no Supabase:

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   perfil     │────<│ perfil_permissao │>────│   permissao     │
│ (roles)      │     │ (role_perms)     │     │ (permissions)   │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │                                            │
       │                                     ┌──────┴──────┐
┌──────┴──────┐                              │   modulo    │
│usuario_perfil│                              │ (modules)   │
│(user_roles) │                              └─────────────┘
└──────┬──────┘
       │
┌──────┴──────┐
│   usuario   │
│ (existing)  │
└─────────────┘
```

### Tabelas novas

**modulo** - Registra modulos/rotas do sistema
- `id uuid PK`, `tenant_id uuid`, `codigo text UNIQUE` (ex: `web.config.usuarios`, `coletor.recebimento`), `descricao text`, `ambiente enum('WEB','COLETOR','AMBOS')`, `ativo boolean DEFAULT true`

**permissao** - Permissoes granulares por modulo
- `id uuid PK`, `tenant_id uuid`, `modulo_id uuid FK`, `acao enum('CREATE','READ','UPDATE','DELETE','EXECUTE')`, `descricao text`
- Unique constraint: `(tenant_id, modulo_id, acao)`

**perfil** - Papeis/roles configuráveis por tenant
- `id uuid PK`, `tenant_id uuid`, `nome text` (ex: ADMINISTRADOR, SUPERVISOR, OPERADOR), `descricao text`, `sistema boolean DEFAULT false` (perfis default imutaveis), `ativo boolean DEFAULT true`

**perfil_permissao** - Vinculo N:N entre perfil e permissao
- `id uuid PK`, `tenant_id uuid`, `perfil_id uuid FK`, `permissao_id uuid FK`

**usuario_perfil** - Vinculo N:N entre usuario e perfil
- `id uuid PK`, `tenant_id uuid`, `usuario_id uuid FK → usuario.id`, `perfil_id uuid FK → perfil.id`

### Funcoes SECURITY DEFINER

```sql
-- Verifica se usuario tem permissao para modulo+acao
CREATE FUNCTION fn_usuario_tem_permissao(
  p_usuario_id uuid, p_modulo_codigo text, p_acao text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM usuario_perfil up
    JOIN perfil_permissao pp ON pp.perfil_id = up.perfil_id
    JOIN permissao p ON p.id = pp.permissao_id
    JOIN modulo m ON m.id = p.modulo_id
    WHERE up.usuario_id = p_usuario_id
      AND m.codigo = p_modulo_codigo
      AND p.acao::text = p_acao
  )
$$;

-- Retorna lista de modulos permitidos para um usuario
CREATE FUNCTION fn_usuario_permissoes(p_usuario_id uuid)
RETURNS TABLE(modulo_codigo text, acao text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.codigo, p.acao::text
  FROM usuario_perfil up
  JOIN perfil_permissao pp ON pp.perfil_id = up.perfil_id
  JOIN permissao p ON p.id = pp.permissao_id
  JOIN modulo m ON m.id = p.modulo_id
  WHERE up.usuario_id = p_usuario_id
$$;
```

### RLS em todas as tabelas novas
Todas com policy `tenant_id = get_current_tenant()`.

### Seed de dados iniciais
Uma migration de seed insere os 3 perfis base (ADMINISTRADOR, SUPERVISOR, OPERADOR) e popula modulos/permissoes para cada rota existente do sistema.

---

## Fase 2 - Backend: RPC de Permissoes

### Edge Function `manage-perfis`
CRUD de perfis personalizados, vinculacao de permissoes a perfis, e atribuicao de perfis a usuarios. Somente ADMIN pode invocar.

### Ajuste no `create-usuario`
Ao criar usuario, atribuir automaticamente o perfil correspondente ao `tipo_usuario` selecionado via `usuario_perfil`.

---

## Fase 3 - Frontend: Context e Hook de Permissoes

### `PermissionsContext` / `usePermissions()`
- Apos login, chamar `fn_usuario_permissoes(usuario_id)` uma unica vez
- Armazenar em context como `Map<string, Set<string>>` (modulo → acoes)
- Expor helper: `can(modulo, acao): boolean`
- Cache em `sessionStorage` com TTL de 5 min para performance

### Componente `<ProtectedRoute>`
```tsx
// Envolve rotas e oculta se sem permissao READ
<ProtectedRoute modulo="web.config.usuarios" acao="READ">
  <UsuariosPage />
</ProtectedRoute>
```

### Componente `<PermissionGate>`
```tsx
// Oculta botoes/acoes especificas
<PermissionGate modulo="web.config.usuarios" acao="DELETE">
  <button onClick={onDelete}>Excluir</button>
</PermissionGate>
```

---

## Fase 4 - Integracao no Sistema Existente

### Painel Web (TopNav)
- Filtrar `navItems` e seus `children` com base nas permissoes READ do usuario logado
- Menus sem nenhum item permitido ficam ocultos

### Paginas CRUD (CrudTable/CrudModal)
- Ocultar botao "Novo" se sem `CREATE`
- Ocultar botao "Editar" se sem `UPDATE`
- Ocultar botao "Excluir" se sem `DELETE`
- Toda a pagina fica inacessivel se sem `READ`

### Coletor (ColetorHomePage)
- Filtrar cards de modulo com base nas permissoes do usuario
- Modulos sem permissao ficam hidden (nao apenas disabled)

### Mapeamento de codigos de modulo
```text
WEB:
  web.dashboard              → Dashboard
  web.rastreabilidade        → Rastreabilidade
  web.armazem.armazens       → Cadastro Armazens
  web.armazem.setores        → Setores
  web.armazem.enderecos      → Enderecos
  web.config.usuarios        → Usuarios
  web.config.empresas        → Empresas
  web.config.perfis          → Perfis de Acesso (novo)
  web.atividades.inventario  → Inventario
  web.relatorios.estoque     → Relatorio Estoque
  ... (uma entrada por rota)

COLETOR:
  coletor.recebimento        → Recebimento
  coletor.armazenagem        → Armazenagem
  coletor.movimentos         → Movimentos
  coletor.separacao          → Separacao
  coletor.conferencia        → Conferencia
  coletor.inventario         → Inventario
  coletor.consulta           → Consultas
```

---

## Fase 5 - Tela de Gestao de Perfis

Nova pagina em `/config/perfis` (ja prevista no TopNav):

1. **Lista de perfis** - CRUD de perfis personalizados por tenant
2. **Edicao de perfil** - Tela com arvore de modulos e checkboxes por acao (C/R/U/D/Execute)
3. **Atribuicao** - Na pagina de Usuarios, adicionar campo multi-select de perfis

---

## Fase 6 - Seguranca e Auditoria

### Validacao server-side
- Funcoes RPC criticas (ex: `fn_criar_inventario`) devem validar permissao internamente via `fn_usuario_tem_permissao` antes de executar

### Log de acesso
- Tabela `log_acesso` com: `usuario_id, modulo_codigo, acao, ip, timestamp`
- Trigger ou chamada explicita nas acoes sensiveis

### Bloqueios
- Usuario inativo (`ativo = false`) ja e bloqueado no login
- Perfil inativo impede login
- Sessao expirada invalida token via Supabase Auth

---

## Fase 7 - Coletor: Consideracoes Mobile

- Permissoes carregadas no login e cacheadas em `sessionStorage`
- Sem suporte offline para permissoes (requer conectividade para login)
- Token JWT do Supabase gerencia sessao com auto-refresh
- Modulos sem permissao nao aparecem na home do coletor

---

## Roadmap de Fases

| Fase | Descricao | Estimativa |
|------|-----------|------------|
| 1 | Migrations: tabelas, enums, funcoes, seed | 1 sprint |
| 2 | Edge function e ajuste create-usuario | 0.5 sprint |
| 3 | PermissionsContext, hooks, ProtectedRoute | 1 sprint |
| 4 | Integracao em TopNav, CrudTable, Coletor | 1 sprint |
| 5 | Tela de gestao de perfis /config/perfis | 1 sprint |
| 6 | Auditoria, validacao server-side | 0.5 sprint |
| 7 | Testes e2e, revisao seguranca | 0.5 sprint |

---

## Boas Praticas

- **Menor privilegio**: perfis novos comecam sem permissao; admin atribui explicitamente
- **Sem hardcode**: permissoes vem do banco, nunca de constantes no frontend
- **Perfis compostos**: usuario pode ter multiplos perfis; permissoes sao uniao de todos
- **Separacao auth/authz**: Supabase Auth cuida de autenticacao; RBAC cuida de autorizacao
- **Expansibilidade ABAC**: a tabela `permissao` pode receber colunas de condicao (ex: `condicao_jsonb`) para regras baseadas em atributo no futuro
- **Feature flags**: modulos podem ser desativados por tenant via `modulo.ativo`
- **Cache com invalidacao**: ao alterar perfil, limpar cache de permissoes dos usuarios afetados (evento via Supabase Realtime ou TTL curto)

---

## Detalhes Tecnicos de Implementacao

### Arquivos a criar/modificar

| Arquivo | Acao |
|---------|------|
| `supabase/migrations/xxx_rbac.sql` | Tabelas, enums, funcoes, seed |
| `src/contexts/PermissionsContext.tsx` | Context + hook `usePermissions` |
| `src/components/PermissionGate.tsx` | Componente de gate |
| `src/components/ProtectedRoute.tsx` | Wrapper de rota |
| `src/components/TopNav.tsx` | Filtrar menus por permissao |
| `src/components/crud/CrudTable.tsx` | Props opcionais `canCreate/canEdit/canDelete` |
| `src/pages/coletor/ColetorHomePage.tsx` | Filtrar modulos |
| `src/pages/PerfisAcessoPage.tsx` | Nova pagina de gestao |
| `src/App.tsx` | Envolver rotas com ProtectedRoute |
| `supabase/functions/create-usuario/index.ts` | Atribuir perfil automaticamente |

