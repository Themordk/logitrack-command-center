# Auditoria Multi-Tenant — Riscos e Plano de Correção

## 🔴 Achados Críticos (vetores reais de vazamento entre clientes)

A camada **RLS por `tenant_id` está bem coberta** nas tabelas (todas com policy `tenant_id = get_current_tenant()`, baseada em `auth.uid()` via `usuario.auth_user_id`). Porém, **existem 4 vetores reais** que permitem cross-tenant hoje:

### 1. ⛔ Tabela `v_reg` SEM RLS (CRÍTICO)
- Tabela real (não view), tem `tenant_id` mas **RLS desabilitado** e zero policies.
- Contém movimentos de estoque (produto, quantidade, lote, validade, endereços, usuário).
- Qualquer usuário autenticado lê dados de **todos os tenants**.
- **Correção:** habilitar RLS + policy `tenant_id = get_current_tenant()` (ALL).

### 2. ⛔ 20 Views SECURITY DEFINER (CRÍTICO)
Todas as 20 views (`vw_movimento_*`, `vw_inventario_*`, `vw_abastecimento_lista`, `vw_estoque_movimento_relatorio`, `vw_lms_timeline_operador`, `inventario_item_resumo`, `v_inventario_iniciar`, `v_recebimento_iniciar`, `v_separacao_iniciar`) são executadas como o owner (postgres = bypass de RLS).
- Embora a maioria filtre por `tenant_id` em um JOIN/WHERE interno, qualquer view que **não** tenha cláusula explícita pode retornar tudo.
- **Correção:** recriar todas com `WITH (security_invoker = true)` para herdar o RLS do usuário atual + auditar cada SELECT para incluir `tenant_id` no WHERE.

### 3. ⛔ Edge Functions sem validação de tenant (CRÍTICO)
- **`create-usuario`**: NÃO valida JWT nem cargo do solicitante. Qualquer requisição (mesmo anônima) pode criar `usuario` em qualquer `tenant_id`/`empresa_id` arbitrários (usa `service_role`, bypass total). Vetor catastrófico: criar admin em tenant alheio e logar.
- **`reset-password`**: valida JWT, mas NÃO confere se o `usuario_id` alvo pertence ao mesmo tenant do solicitante. Admin do tenant A reseta senha de qualquer usuário, inclusive de outros tenants.
- **Correção:**
  - `create-usuario`: exigir Authorization Bearer válido, derivar tenant via `usuario.auth_user_id` do solicitante e **forçar** `tenant_id = solicitante.tenant_id` (ignorar o do body), validar permissão `web.usuarios CREATE`.
  - `reset-password`: derivar tenant do JWT e validar que `usuario_alvo.tenant_id = solicitante.tenant_id` antes de resetar.

### 4. ⛔ Funções SECURITY DEFINER que confiam em `p_tenant_id` do cliente (CRÍTICO)
6 funções SECURITY DEFINER recebem `p_tenant_id` do front (vindo do `localStorage`, manipulável) e o usam como filtro **sem validar contra `auth.uid()`**:
- `conferencia_saida_confirmacao`
- `fn_gerar_abastecimento`
- `fn_seed_rbac_para_tenant`
- `gerar_tarefas_conferencia_entrada`
- `rpc_coletor_armazenagem_execucao`
- `separacao_executar_coleta` (2 overloads)

Um atacante autenticado pode passar o `tenant_id` de outra empresa e a função **executa, gravando/movendo estoque cross-tenant** (RLS não atua, é DEFINER).
- **Correção:** no início de cada função, validar:
  ```sql
  IF p_tenant_id <> public.get_current_tenant() THEN
     RAISE EXCEPTION 'Tenant inválido' USING ERRCODE = '42501';
  END IF;
  ```
  e idem para `p_usuario_id` (deve casar com `usuario.id` cujo `auth_user_id = auth.uid()`).

## 🟡 Achados de Risco Médio (cross-empresa dentro do mesmo tenant)

5. **120+ funções com `search_path` mutável** (linter WARN): vulnerabilidade a hijacking se um atacante criar objeto homônimo em outro schema. Adicionar `SET search_path = public` em todas as funções públicas.

6. **Buscas por `produto.sku` sem `empresa_id` no Coletor** (`SeparacaoProdutoPage`, `ConferenciaProdutoPage`, `AbastecimentoColetaPage`, `RecebimentoConferenciaPage`, etc.). Como o RLS filtra por tenant, mas SKUs podem repetir entre empresas do mesmo tenant, há risco de pegar produto da empresa errada. Adicionar `.eq("empresa_id", empresaId)`.

7. **`ConsultaEnderecoPage` (Coletor)** consulta `endereco` apenas por `descricao/codigo_endereco`. Sem filtro de `empresa_id` ou `armazem_id`, pode retornar endereço de outro armazém. Restringir.

8. **`tenant`** com RLS habilitado mas sem policies (bloqueia tudo) — OK, mas confirmar que nenhum código tenta ler/gravar diretamente.

## 📋 Plano de Execução (em ordem de criticidade)

### Fase 1 — Correções de banco (migration) — CRÍTICO
- [ ] Habilitar RLS em `v_reg` e adicionar policy `tenant_id = get_current_tenant()`.
- [ ] Recriar as 20 views com `WITH (security_invoker = true)` (preserva o SQL atual).
- [ ] Adicionar guard `IF p_tenant_id <> get_current_tenant() THEN RAISE` nas 6 funções SECURITY DEFINER que recebem tenant_id.
- [ ] Adicionar `SET search_path = public` nas funções listadas pelo linter (lote único).

### Fase 2 — Correções nas Edge Functions — CRÍTICO
- [ ] Reescrever `create-usuario`: validar JWT, derivar tenant do solicitante, ignorar `tenant_id` do body, checar permissão.
- [ ] Reescrever `reset-password`: validar mesmo tenant do solicitante e do alvo.

### Fase 3 — Frontend (escopo cross-empresa) — MÉDIO
- [ ] Adicionar filtro `.eq("empresa_id", empresaId)` em todas as buscas a `produto`/`endereco` no Coletor (lista priorizada acima).
- [ ] Restringir `ConsultaEnderecoPage` por `armazem_id` ativo.

### Fase 4 — Validação
- [ ] Re-executar `supabase--linter` (esperar zero ERRORs).
- [ ] Teste manual: tentar passar `p_tenant_id` adulterado em RPC e confirmar bloqueio.
- [ ] Teste manual: chamar `create-usuario` sem JWT → 401.

## ✅ O que JÁ está bem
- 100% das tabelas (exceto `v_reg`) têm RLS ativo com filtro por tenant.
- `get_current_tenant()` é SECURITY DEFINER e deriva o tenant via `auth.uid()` (não confia em parâmetros).
- Não existe nenhuma policy permissiva (`USING (true)`).
- Cliente Supabase usa apenas a `anon key`; nenhuma exposição de `service_role`.

---
**Aguardo aprovação para executar as Fases 1 e 2 (críticas) em uma única migração + atualização das edge functions, e em seguida as Fases 3 e 4.**