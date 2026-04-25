
## Plano: Seletor de Empresa restrito ao ADMINISTRADOR + Reatividade Global

### Diagnóstico atual

| Aspecto | Estado hoje | Gap |
|---|---|---|
| Seletor no `TopNav` | Visível para todos | Deve ser exclusivo do perfil **ADMINISTRADOR** |
| Estado global da empresa | `TenantContext.empresaId` (localStorage `core_empresa_id`) | OK, mas não há broadcast/invalidação ao trocar |
| Filtro nas queries | `useCrud` filtra apenas por `tenant_id`. Páginas operacionais filtram inconsistentemente por `empresa_id` | Vazamento entre empresas do mesmo tenant |
| Reatividade | Páginas só refazem fetch se `tenantId` mudar; `empresaId` muda mas não dispara reload | Dados ficam "presos" na empresa anterior |
| Persistência | `localStorage.core_empresa_id` | OK — manter |
| Validação backend | RLS é por `tenant_id`. Usuário não-admin pode forçar `empresa_id` em payloads | Necessário guard server-side |

### Arquitetura proposta

#### 1. Identificação de ADMIN (`useIsAdmin` hook)

Critério: `perfil.nome === 'ADMINISTRADOR'` em `usuario_perfil` para o `usuarioId` corrente. Buscado uma vez no login, cacheado em `sessionStorage` (mesmo padrão do `PermissionsContext`).

```ts
// src/hooks/useIsAdmin.ts
export function useIsAdmin() {
  const { usuarioId } = useTenant();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!usuarioId) { setIsAdmin(false); return; }
    const cached = sessionStorage.getItem(`core_is_admin_${usuarioId}`);
    if (cached !== null) { setIsAdmin(cached === "1"); return; }
    supabase.from("usuario_perfil")
      .select("perfil!inner(nome)")
      .eq("usuario_id", usuarioId)
      .then(({ data }) => {
        const adm = (data || []).some((r:any) => r.perfil?.nome === "ADMINISTRADOR");
        sessionStorage.setItem(`core_is_admin_${usuarioId}`, adm ? "1" : "0");
        setIsAdmin(adm);
      });
  }, [usuarioId]);

  return isAdmin === true;
}
```

#### 2. `TenantContext`: bump de versão ao trocar empresa

Adicionar `empresaVersion: number` que **incrementa** a cada `changeEmpresa()`. Páginas listam essa versão como dependência do `useEffect` de fetch — assim, qualquer mudança de empresa força re-fetch sem precisar tocar em cada tela individualmente.

```ts
// TenantContext.tsx
const [empresaVersion, setEmpresaVersion] = useState(0);

const changeEmpresa = (newEmpresaId: string) => {
  if (newEmpresaId === empresaId) return;
  localStorage.setItem("core_empresa_id", newEmpresaId);
  setEmpresaId(newEmpresaId);
  setEmpresaVersion(v => v + 1);            // dispara reatividade
  // limpa caches dependentes de empresa
  sessionStorage.removeItem("core_rbac_permissions");
};
```

Expor `empresaVersion` no contexto. `useCrud` recebe-o como dep:

```ts
// useCrud.ts
const { empresaId, empresaVersion } = useTenant();
// adicionar empresaVersion ao deps de fetchData
}, [table, tenantId, empresaId, empresaVersion, page, ...])
// e filtrar por empresa_id quando a tabela tem essa coluna
```

#### 3. `TopNav`: gating do seletor

```tsx
const isAdmin = useIsAdmin();

{isAdmin ? (
  <select value={empresaId || ""} onChange={(e) => handleChangeEmpresa(e.target.value)}>
    {empresas.map(...)}
  </select>
) : (
  <span className="text-xs text-foreground font-medium">
    {empresaAtual?.codigo || empresaAtual?.razaosocial}
  </span>
)}
```

Não-admin vê **apenas o nome** da sua empresa (read-only, sem dropdown).

#### 4. Loading global na troca

Ao chamar `changeEmpresa`, exibir overlay leve ("Trocando empresa…") por ~400 ms enquanto o `empresaVersion` propaga. Implementação: estado `switchingEmpresa` no `TenantContext` + componente `<EmpresaSwitchOverlay />` no `Layout`.

#### 5. Validação server-side (defesa em profundidade)

**Migration**: criar trigger `BEFORE INSERT/UPDATE` nas tabelas críticas (`movimento_entrada`, `movimento_saida`, `documento_entrada`, `documento_saida`, `produto`, `parceiro`, `inventario`, `abastecimento`) que garante:

```sql
CREATE OR REPLACE FUNCTION public.fn_validar_empresa_usuario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_is_admin boolean;
  v_user_empresa uuid;
BEGIN
  -- bypass para service_role / sem auth context (jobs internos)
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM usuario u
    JOIN usuario_perfil up ON up.usuario_id = u.id
    JOIN perfil p ON p.id = up.perfil_id
    WHERE u.auth_user_id = auth.uid() AND p.nome = 'ADMINISTRADOR'
  ) INTO v_is_admin;

  IF v_is_admin THEN RETURN NEW; END IF;

  SELECT empresa_id INTO v_user_empresa FROM usuario WHERE auth_user_id = auth.uid();
  IF NEW.empresa_id IS DISTINCT FROM v_user_empresa THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pode operar nesta empresa';
  END IF;
  RETURN NEW;
END;$$;
```

Aplicada em todas as tabelas que possuem coluna `empresa_id`.

#### 6. `useCrud`: filtro automático por empresa

Quando a tabela tiver coluna `empresa_id`, anexar `.eq("empresa_id", empresaId)` automaticamente. Lista mantida no próprio hook (whitelist):

```ts
const TABLES_WITH_EMPRESA = new Set([
  "produto","parceiro","movimento_entrada","movimento_saida",
  "documento_entrada","documento_saida","abastecimento","inventario",
  "armazem","grupo_produto","subgrupo_produto","usuario","hu",
]);
if (TABLES_WITH_EMPRESA.has(table) && empresaId) query = query.eq("empresa_id", empresaId);
```

Em `create()`, injetar `empresa_id: empresaId` quando aplicável.

### Fluxo de dados na troca de empresa

```
[Admin clica no select]
        │
        ▼
TenantContext.changeEmpresa(novoId)
        │
        ├─► localStorage.setItem("core_empresa_id", novoId)
        ├─► setEmpresaId(novoId)
        ├─► setEmpresaVersion(v+1)   ◄── chave da reatividade
        ├─► limpa caches (RBAC, etc.)
        └─► setSwitchingEmpresa(true) → overlay 400ms
                │
                ▼
        Componentes consumindo useTenant() re-renderizam
                │
                ▼
        useCrud / useEffects que dependem de [empresaVersion]
        refazem fetch com novo empresa_id
                │
                ▼
        Dashboard, Cadastros, Atividades, Relatórios → recarregam
```

### Componentes/arquivos impactados

| Arquivo | Mudança |
|---|---|
| `src/contexts/TenantContext.tsx` | adicionar `empresaVersion`, `switchingEmpresa`, melhorar `changeEmpresa` |
| `src/hooks/useIsAdmin.ts` | **novo** — detecta perfil ADMINISTRADOR |
| `src/components/TopNav.tsx` | gate do seletor por `isAdmin`; mostrar nome read-only para não-admin |
| `src/components/Layout.tsx` | montar `<EmpresaSwitchOverlay />` |
| `src/components/EmpresaSwitchOverlay.tsx` | **novo** — overlay leve durante troca |
| `src/hooks/useCrud.ts` | filtro automático por `empresa_id` + `empresaVersion` na deps |
| `src/modules/reports/**/*.service.ts` | já recebem filtros; páginas adicionam `empresaVersion` no deps do `useEffect` (ou usam `useTenant`) |
| `src/pages/Dashboard.tsx` e demais que fazem queries diretas | adicionar `empresaVersion` como dep do `useEffect` de fetch |
| **Migration SQL** | função `fn_validar_empresa_usuario()` + triggers nas tabelas com `empresa_id` |

### Persistência

- **Empresa ativa**: `localStorage.core_empresa_id` (sobrevive entre sessões — UX desejada para admin que opera sempre na mesma empresa).
- **Flag `is_admin`**: `sessionStorage.core_is_admin_<uid>` (TTL = sessão; revalida a cada login).
- Ao logar, se `core_empresa_id` salvo **não pertencer** à empresa do usuário não-admin, sobrescrever com `usuario.empresa_id`.

### Casos de teste

| # | Cenário | Esperado |
|---|---|---|
| 1 | Login ADMIN | Seletor visível, lista todas empresas ativas do tenant |
| 2 | Login não-admin | Seletor **não renderiza**; aparece label estática com a empresa do usuário |
| 3 | Não-admin tenta forçar `core_empresa_id` no localStorage | Backend rejeita INSERT/UPDATE com `empresa_id` ≠ do usuário |
| 4 | ADMIN troca empresa | Overlay rápido; Dashboard, Cadastros, Atividades, Relatórios recarregam |
| 5 | F5 após troca | Mantém a empresa selecionada (localStorage) |
| 6 | ADMIN troca empresa em uma listagem aberta | Lista re-fetcha; sem dados da empresa anterior visíveis |
| 7 | Cache de RBAC | Limpo na troca; permissões revalidadas |

### Riscos e pontos de atenção

1. **Páginas que fazem queries diretas (não via `useCrud`)**: precisam adicionar `empresaVersion` como dep. Vou varrer relatórios/dashboard e ajustar caso a caso.
2. **Triggers SQL**: aplicar **gradualmente** (uma tabela por vez se necessário) para evitar quebrar fluxos legados que dependem de `service_role`. A função já tem `IF auth.uid() IS NULL THEN RETURN NEW` para edge functions.
3. **Coletor**: opera com `tipo_usuario=OPERADOR` e empresa fixa do usuário — **não impactado** pela troca de empresa do portal.
4. **`changeEmpresa` deve ser idempotente**: se mesmo ID, não dispara version bump (evita loops).
5. **Race condition**: durante o overlay (400 ms), bloquear cliques em "Salvar" globais; UX evita salvar com empresa em transição.
6. **Auditoria futura**: opcional — registrar trocas de empresa do admin em tabela `log_troca_empresa` para compliance.

### Escopo do que NÃO entra agora

- Multi-empresa por usuário (vários `usuario_perfil` × `empresa_id`): arquitetura preparada (`empresaVersion` + filtro automático), mas a UI de seleção continua single-select.
- Refactor para React Query: o sistema de `empresaVersion` é a alternativa simples e suficiente.
- Logs de auditoria de troca.

### Arquivos resumo

| Arquivo | Tipo |
|---|---|
| `src/hooks/useIsAdmin.ts` | novo |
| `src/components/EmpresaSwitchOverlay.tsx` | novo |
| `src/contexts/TenantContext.tsx` | alterado |
| `src/components/TopNav.tsx` | alterado |
| `src/components/Layout.tsx` | alterado |
| `src/hooks/useCrud.ts` | alterado |
| `src/pages/Dashboard.tsx` + páginas com fetch direto | alterado (deps `empresaVersion`) |
| Migration: `fn_validar_empresa_usuario` + triggers | nova |
