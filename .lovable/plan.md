## Objetivo
Tornar a rota `/config/integracao/:erpId` (já existente como hash route) totalmente funcional para qualquer ERP do catálogo `middleware.erp_provedor`, renderizando o formulário de credenciais a partir de `esquema_credencial`, com salvamento via edge function dedicada e Logs/Filas filtrados por `sistema_origem`.

> Observação de rota: a descrição menciona `/configuracoes/integracao-erp/:erpId`, mas a rota efetiva já implementada e ligada ao menu/breadcrumbs é `/config/integracao/:erpId`. Mantenho esse caminho para não quebrar navegação atual.

## Novos arquivos

- `src/pages/integracao/useErpProvedor.ts` — hook que busca `middleware.erp_provedor` por id e devolve `{ nome, disponivel, esquema_credencial }`.
- `src/pages/integracao/CredenciaisDinamicasTab.tsx` — substitui `CredenciaisTab` para qualquer ERP; monta o form a partir do `esquema_credencial`.
- `supabase/functions/salvar-erp-credenciais/index.ts` — edge function que valida JWT + vínculo do usuário, valida campos obrigatórios e persiste em `middleware.erp_integracao` com `service_role`. Para `erpId='omie'`, replica também em `middleware.omie_config` (compatibilidade legada).

## Arquivos alterados

- `src/pages/integracao/IntegracaoErpDetalhePage.tsx`
  - Título "Integração ERP — {nome}" e subtítulo "Painel de gerenciamento do middleware de integração via API REST."
  - Botão "← Voltar para provedores" (já é SPA via `onNavigate("/config/integracao")`).
  - `StatusBar` no topo.
  - Tabs sempre visíveis para ERPs com `disponivel=true`.
  - Usa `CredenciaisDinamicasTab` no lugar do antigo `CredenciaisTab`.
  - Repassa `sistemaOrigem={erpId}` para `LogsFilasTab`.
- `src/pages/integracao/LogsFilasTab.tsx`, `LogsPanel.tsx`, `FilasPanel.tsx`
  - Aceitam prop opcional `sistemaOrigem`. Quando informado, aplicam `.eq("sistema_origem", sistemaOrigem)` em `sync_log` e `sync_queue`.

## Aba Credenciais — regras

1. Carrega `esquema_credencial` via `useErpProvedor(erpId)`.
2. Carrega valores existentes em `middleware.erp_integracao` por `(tenant_id, empresa_id, erp_provedor_id)`. Se `erpId='omie'` e não existir, fallback via `omie-config-get` (mapeando `app_key`, `omie_base_url`, `has_secret`).
3. Renderização dinâmica:
   - `tipo='texto'`: input text.
   - `tipo='senha'`: input password com toggle Eye/EyeOff.
   - `rotulo` → label; `placeholder` → placeholder; `padrao` → valor inicial; `obrigatorio` → validação no salvar.
4. Toggle "Integração ativa" controla `ativo`.
5. Botão **Testar Conexão**:
   - `erpId='omie'`: chama `omie-test-connection` com os valores correntes do form.
   - Demais: mensagem inline "Teste de conexão disponível após configuração completa".
   - Resultado inline em Badge (sucesso/erro).
6. Botão **Salvar Configurações**:
   - Validação client de obrigatórios (toast).
   - Chama `supabase.functions.invoke("salvar-erp-credenciais", { body: { erpId, empresaId, credenciais } })`.
   - Toast de sucesso/erro; recarrega valores.
   - Nunca grava direto do frontend.

## Edge function `salvar-erp-credenciais`

- CORS via `npm:@supabase/supabase-js@2/cors`.
- Valida `Bearer` token; confirma `public.usuario` com `(auth_user_id, tenant_id, empresa_id, ativo=true)` — mesmo padrão de `omie-test-connection`.
- Lê `middleware.erp_provedor` pelo `erpId` (`disponivel=true`) e usa `esquema_credencial` para validar `obrigatorio` server-side.
- Para campos `tipo='senha'` vazios, preserva o valor anterior (suporta o padrão "deixe em branco para manter").
- Faz upsert em `middleware.erp_integracao` por `(tenant_id, empresa_id, erp_provedor_id)` com `credenciais`, `ativo`, `status='ativo'`, `mensagem_erro=null`.
- Quando `erpId='omie'`: também upsert em `middleware.omie_config` mapeando `app_key`/`app_secret`/`omie_base_url`/`ativo`, para manter `StatusBar`, `omie-test-connection` e funções legadas funcionando.
- Retorna `{ ok: true, id }` ou `{ ok: false, message }`.

## Aba Sincronização
- `erpId='omie'`: `SincronizacaoTab` atual sem mudanças (já filtra por `tenant_id`+`empresa_id`).
- Demais: painel informativo "Configuração de sincronização disponível após ativação da integração".

## Aba Logs e Filas
- `LogsPanel` filtra `sync_log` por `tenant_id` + `empresa_id` + `sistema_origem=erpId`.
- `FilasPanel` filtra `sync_queue` por `tenant_id` + `empresa_id` + `sistema_origem=erpId`.
- Para Omie, o `DEFAULT 'omie'` em `sistema_origem` cobre registros antigos.

## Fora de escopo
- Sem migrações de schema/RLS.
- Sem alterações de menu lateral, permissões ou outras telas.
- `CredenciaisTab.tsx` (Omie estático) permanece no repo mas deixa de ser usado pela tela; pode ser removido em outro passo se desejado.
