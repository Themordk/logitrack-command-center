## Objetivo
Refatorar `supabase/functions/salvar-erp-credenciais/index.ts` para seguir o contrato definido (payload `{ erp_id, empresa_id, credenciais, ativo }`, response `{ sucesso, id }`), com validações estritas, uso de `service_role`, mascaramento em logs e compatibilidade Omie.

## Alterações no arquivo `supabase/functions/salvar-erp-credenciais/index.ts`

1. **Payload de entrada** (snake_case oficial; manter aceite de camelCase para não quebrar o frontend já implementado):
   - Aceitar `erp_id` (e fallback `erpId`)
   - Aceitar `empresa_id` (e fallback `empresaId`)
   - `credenciais: Record<string, unknown>`
   - `ativo: boolean` (default `true`)
   - `tenant_id` **não é mais lido do body** — extraído do JWT/`public.usuario`

2. **Autenticação (401)**:
   - Exigir `Authorization: Bearer <jwt>`
   - Validar via `supabase.auth.getClaims(token)` (signing-keys) usando `SUPABASE_URL` + `SUPABASE_ANON_KEY`
   - Em falha → `401 { sucesso: false, codigo: "unauthorized", mensagem }`

3. **Resolução de tenant + autorização (403)**:
   - Com `service_role`, buscar `public.usuario` por `(auth_user_id, ativo=true)` para obter `tenant_id` e `empresa_id` do usuário
   - Validar que `empresa_id` recebido **existe em `public.empresa` e pertence ao `tenant_id` do usuário**
   - Para usuários não-administradores, exigir que `empresa_id` recebido == `empresa_id` do usuário (mantém a regra de isolamento 1:1 já existente no projeto)
   - Em falha → `403 { sucesso: false, codigo: "forbidden", mensagem: "empresa_id não pertence ao tenant" }`

4. **Validação do ERP**:
   - Buscar `middleware.erp_provedor` por `id = erp_id`
   - Se inexistente → `404 { sucesso: false, codigo: "erp_nao_encontrado" }`
   - Se `disponivel = false` → `400 { sucesso: false, codigo: "erp_indisponivel" }`
   - Ler `esquema_credencial` (array)

5. **Validação de campos obrigatórios (400)**:
   - Para cada campo com `obrigatorio = true`:
     - Se `tipo='senha'` e vazio: aceitar se já existe valor anterior em `erp_integracao.credenciais` (padrão "deixe em branco para manter")
     - Caso contrário, exigir valor não vazio
   - Coletar **todos os campos faltantes** e retornar de uma vez:
     ```
     400 { sucesso: false, codigo: "campos_obrigatorios", campos: ["app_key","app_secret"], mensagem }
     ```

6. **Persistência (UPSERT em `middleware.erp_integracao`)**:
   - Chave de conflito: `(tenant_id, empresa_id, erp_provedor_id)`
   - Implementação: `select` por essas 3 chaves; se existe → `update`; senão → `insert`
   - Campos gravados: `credenciais` (objeto final, com senhas preservadas), `ativo`, `status='ativo'`, `mensagem_erro=null`, `atualizado_em=now()`, `atualizado_por=auth_user_id`; no insert também `criado_por`
   - Em erro de DB → log detalhado no servidor, response `500 { sucesso: false, codigo: "erro_persistencia", mensagem: "Erro ao salvar credenciais" }`

7. **Compatibilidade Omie (`erp_id === 'omie'`)**:
   - Upsert também em `middleware.omie_config` por `(tenant_id, empresa_id)`
   - Mapear: `app_key ← credenciais.app_key`, `app_secret ← credenciais.app_secret` (se informado), `omie_base_url ← credenciais.url_base || 'https://app.omie.com.br/api/v1'`, `ativo`, `updated_at`
   - No insert, exigir `app_key` e `app_secret` presentes (regra atual do legado); caso só haja update, não sobrescreve `app_secret` quando vazio

8. **Logging com mascaramento**:
   - Helper `mask(v)`: retorna `v.slice(0,4) + '***'` para strings com `length > 4`, senão `'***'`
   - Aplicar mascaramento em **todo** valor cuja chave contenha `secret|senha|password|token|key` (case-insensitive) antes de qualquer `console.log`
   - Logar: `{ acao: 'salvar-erp-credenciais', auth_user_id, tenant_id, empresa_id, erp_id, campos: <obj mascarado>, ativo }` no início; no fim, `{ resultado: 'ok'|'erro', id, codigo? }`
   - **Nunca** retornar `credenciais` no response

9. **Response de sucesso**:
   - `200 { sucesso: true, id: "<uuid_do_registro_erp_integracao>" }`

10. **CORS**:
    - Manter cabeçalhos atuais; responder `OPTIONS` com 204/200

## Ajuste no frontend (mínimo, para casar com o novo contrato)

- `src/pages/integracao/CredenciaisDinamicasTab.tsx`:
  - Alterar a chamada para enviar `{ erp_id: erpId, empresa_id: empresaId, credenciais, ativo }`
  - Tratar `data.sucesso === true` (em vez de `data.ok`), mantendo `toast` de erro com `data.mensagem` / `data.campos`
  - Sem mudança visual; apenas chaves do payload e leitura do response

## Fora de escopo
- Sem alterações em `middleware.erp_provedor`, `middleware.erp_integracao` ou `middleware.omie_config` (schema/RLS)
- Sem criar tabela `audit_log`: como ela não existe no projeto, item 8 do enunciado é atendido via `console.log` estruturado e mascarado (logs ficam em Edge Function Logs)
- Sem mudanças em outras edge functions (`omie-config-get`, `omie-test-connection`)

## Riscos / Observações
- O frontend atual envia `erpId/tenantId/empresaId` (camelCase). A função aceitará ambos os formatos durante a transição, mas o frontend será atualizado para o contrato novo no mesmo passo para evitar ambiguidade.
- `tenant_id` deixará de ser aceito via body — sempre derivado do JWT (mais seguro). Qualquer caller que enviava `tenant_id` no body será ignorado.
