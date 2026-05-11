## Causa raiz

**Erro 42501 ao testar conexão (`permission denied for table omie_config`)** vem de duas frentes:

1. **Edge functions** (`omie-config-get`, `omie-config-save`, `omie-test-connection`) usam o cliente `service_role` para ler/gravar em `middleware.omie_config`. A migration anterior **não concedeu privilégios de tabela ao role `service_role`** no schema `middleware` (só concedeu ao `authenticated` para as outras tabelas, e bloqueou `omie_config` totalmente). Resultado: o próprio service_role recebe "permission denied".
2. A view `middleware.omie_config_public` foi criada com `security_invoker = on`. Isso significa que ela executa com o privilégio do chamador (`authenticated`), que **não tem SELECT** na tabela base `omie_config` (proibido propositalmente). Logo, qualquer SELECT na view retorna 42501. É o que o `StatusBar` está disparando.

**Erro de "credenciais no cabeçalho da solicitação":** o screenshot exibe a requisição `POST https://app.omie.com.br/api/v1/geral/produtos/` com "cabeçalhos provisórios" (request bloqueada por CORS antes de sair). Isso vinha do código anterior ao refactor. Hoje, `CredenciaisTab.handleTest` invoca a edge function `omie-test-connection`, que faz a chamada server-to-server — o navegador não envia mais credenciais diretamente. Provavelmente o usuário viu o registro antigo no DevTools. Vamos confirmar varrendo todo o frontend (já confirmado: nenhuma chamada direta para `omie.com.br` resta) e adicionar uma proteção extra para garantir que o `app_secret` jamais saia do servidor.

## Correções

### 1. Migration — privilégios e view

```sql
-- Garante que o service_role (usado pelas edge functions) acesse omie_config
GRANT ALL ON middleware.omie_config TO service_role;
GRANT ALL ON middleware.id_map      TO service_role;
GRANT ALL ON middleware.sync_config, middleware.sync_log,
             middleware.sync_queue,  middleware.return_queue
  TO service_role;

-- Recria a view sem security_invoker para que rode com o owner
DROP VIEW IF EXISTS middleware.omie_config_public;
CREATE VIEW middleware.omie_config_public AS
  SELECT id, tenant_id, empresa_id, app_key, omie_base_url, ativo,
         (app_secret IS NOT NULL AND length(app_secret) > 0) AS has_secret,
         created_at, updated_at
  FROM middleware.omie_config
  WHERE public.user_has_empresa_access(tenant_id, empresa_id);
GRANT SELECT ON middleware.omie_config_public TO authenticated;

-- Mantém o bloqueio total à tabela base (defense in depth)
-- (policy "omie_config_no_direct_access" já existe e permanece)
```

A view sem `security_invoker` roda com privilégios do owner (postgres), portanto consegue ler `omie_config`, mas o `WHERE` com `user_has_empresa_access(...)` garante isolamento por tenant/empresa do usuário autenticado. O `app_secret` segue ausente da projeção.

### 2. Edge function `omie-config-save` — endurecimento

Garantir que o body nunca devolva o `app_secret`, e logar avisos se algum cliente tentar enviá-lo numa rota errada. (Já está OK — apenas auditar.)

### 3. Frontend

Não há nenhuma chamada direta a `app.omie.com.br` no código atual. Nada a alterar — apenas pedir ao usuário para limpar o registro antigo do DevTools (Ctrl+L) e refazer o teste.

## Arquivos

- ➕ `supabase/migrations/<ts>_fix_middleware_grants_and_view.sql`

Sem mudanças em código TypeScript.

## Fora de escopo

Outras rotas, estilos, lógica de sincronização.