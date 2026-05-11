## Causa raiz

O 404 no `OPTIONS /functions/v1/omie-config-save` (e o "Failed to send a request to the edge function" ao testar conexão) é provocado porque as edge functions de integração ERP **não estão implantadas** no projeto Supabase. Confirmei via curl interno: `omie-config-save` e `omie-config-get` retornam `{"code":"NOT_FOUND","message":"Requested function was not found"}`. Os arquivos existem em `supabase/functions/` mas o deploy nunca aconteceu (provavelmente porque a última migração foi executada sem que o pipeline reimplantasse as funções criadas anteriormente).

## Plano

1. **Reimplantar as três edge functions** do módulo Omie:
   - `omie-config-get`
   - `omie-config-save`
   - `omie-test-connection`

2. **Confirmar via curl** após o deploy que cada uma responde (esperado 401 Unauthorized para POST sem token, em vez de 404).

3. **Hardening leve** (mesmo escopo, sem mudar UI):
   - `omie-config-save` passa a **nunca** retornar `app_secret` no payload (já não retorna, apenas adiciono comentário e mantenho `select("id")`).
   - Garantir que o `omie-config-get` continue devolvendo apenas `has_secret` (booleano) e nunca o segredo bruto — já está assim, apenas reforço.

4. **Sem alterações de schema** — a migração anterior (grants em `middleware.*` para `service_role` e recriação da view `omie_config_public`) já está aplicada.

5. **Sem mudanças no frontend** — `CredenciaisTab` já invoca as funções corretas via `supabase.functions.invoke`.

## Validação

- `curl POST /functions/v1/omie-config-save` → 401 (não 404).
- Na UI: Configurações → Integração ERP → Salvar credenciais funciona e "Testar Conexão" retorna OK/erro de credencial real (não mais erro de transporte).

## Arquivos afetados

- Redeploy: `supabase/functions/omie-config-get/index.ts`, `supabase/functions/omie-config-save/index.ts`, `supabase/functions/omie-test-connection/index.ts` (sem mudança de lógica relevante; apenas garantir publicação).
