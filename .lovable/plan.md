# Integrar `fn_provisionar_tenant_completo` na criação de tenant

## Contexto

A Edge Function `support-create-tenant` cria o tenant e a primeira empresa, mas não provisiona as configurações obrigatórias (módulos, perfis, permissões, tipos de tarefa/estoque/entrada/saída, motivos de ocorrência, agrupamentos e sequências). O resultado é um tenant novo completamente sem configurações.

Já existe no banco a função `fn_provisionar_tenant_completo(p_tenant_id uuid)` que faz todo esse provisionamento. **Ela não deve ser alterada** — está correta e testada.

## Confirmação da função (já verificada no banco)

- `fn_provisionar_tenant_completo` retorna `jsonb` com:
  - `sucesso` (boolean)
  - `registros_criados` (objeto com contagens por categoria)
  - `total_criados` (número total de registros)
- Em caso de falha interna, a função **não lança exceção** — captura `EXCEPTION WHEN OTHERS` e retorna `{ "sucesso": false, "erro": SQLERRM }`. Portanto, a falha de provisionamento chega pelo `sucesso === false`, não pelo `error` da chamada RPC.

## Alterações

### 1. `supabase/functions/support-create-tenant/index.ts`

Após a criação do tenant + empresa com sucesso, adicionar a chamada RPC de provisionamento:

- Chamar `admin.rpc("fn_provisionar_tenant_completo", { p_tenant_id: tenantRow.id })`.
- Se a chamada RPC falhar (`provError`), fazer rollback (deletar empresa e tenant) e retornar 500.
- Interpretar o resultado:
  - O RPC de uma função que retorna `jsonb` já devolve o objeto parseado (não é string), então tratar o caso string como tolerância extra apenas (manter o `typeof provResult === "string" ? JSON.parse(...) : provResult` já previsto — é inofensivo).
  - Se `sucesso === false`, fazer rollback e retornar 500 com a mensagem de `erro`.
- Em sucesso, incluir `provisionamento` na resposta (`{ success, tenant, empresa, provisionamento }`).

Mantém intactas as validações, unicidade de slug/CNPJ e criação do tenant/empresa. O rollback só ocorre se o provisionamento falhar.

### 2. `src/components/suporte/SupportCreateTenantModal.tsx`

Substituir o toast de sucesso genérico pela mensagem com a quantidade provisionada:

```ts
const totalCriados = data.provisionamento?.total_criados ?? 0;
toast.success(
  `Tenant "${data.tenant.nome}" criado e provisionado com sucesso! (${totalCriados} registros de configuração criados)`
);
```

### 3. Deploy

Após editar o arquivo, fazer deploy da Edge Function `support-create-tenant` via ferramenta de deploy (deploy automático também cobre; confirmar o deploy antes de finalizar).

## O que NÃO será alterado

- `fn_provisionar_tenant_completo` (no banco) — não tocar.
- `supabase/functions/_shared/support-auth.ts` — sem mudanças.
- Nenhum arquivo novo.
- Lógica de validação e de criação de tenant/empresa — inalterada; apenas adicionado o passo de provisionamento depois da criação com sucesso.

## Verificação

- Deploy da Edge Function sem erros.
- Teste manual (ou via `supabase--test_edge_functions`) criando um tenant e conferindo que o toast exibe `total_criados` e que o tenant nasce com perfis/módulos/permisões preenchidos.
- Conferir nos logs da Edge Function (`support-create-tenant`) a ausência de erros de provisionamento.