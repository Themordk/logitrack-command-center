## Objetivo
Alterar a edge function `create-usuario` para que o e-mail sintético do Auth utilize o **nome do tenant** do solicitante como domínio, no lugar do sufixo fixo `@internal.logitrack`.

### Padrão atual
```
LOGIN@internal.logitrack
```

### Padrão novo
```
LOGIN@<NOME_DO_TENANT_NORMALIZADO>.logitrack
```

Exemplo: tenant `EMPRESA 1` + login `PEDRO` → `pedro@empresa1.logitrack`

## Regras de normalização do nome do tenant
Para garantir um e-mail válido (RFC 5321) a partir de um nome livre:
1. Remover acentos (NFD).
2. Remover espaços (concatenar tudo).
3. Manter apenas `[a-z0-9]` (descartar pontuação como `.,/-&`).
4. Converter para minúsculas.
5. Se o resultado ficar vazio (nome só com símbolos), usar fallback `internal`.
6. O `login` também é normalizado para minúsculas (mantendo o padrão atual da base).

## Implementação

### 1) Edge Function `supabase/functions/create-usuario/index.ts`
Logo após derivar o `tenant_id` do solicitante (passo já existente), buscar o `nome` do tenant via `service role` e montar o e-mail:

```ts
// Buscar nome do tenant para compor o domínio do e-mail sintético
const { data: tenantRow } = await supabaseAdmin
  .from("tenant")
  .select("nome")
  .eq("id", tenant_id)
  .maybeSingle();

const tenantSlug = (tenantRow?.nome ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "") // remove acentos
  .replace(/\s+/g, "")              // remove espaços
  .replace(/[^a-zA-Z0-9]/g, "")     // mantém só alfanumérico
  .toLowerCase() || "internal";

const email = `${String(login).toLowerCase()}@${tenantSlug}.logitrack`;
```

Resto do fluxo permanece idêntico (criação no Auth, insert em `usuario`, vínculo em `usuario_perfil`, rollback em caso de erro).

### 2) Login e demais fluxos
**Nenhuma alteração necessária.** O login (`LoginPage`, `ColetorLoginPage`) usa a RPC `fn_buscar_email_por_login`, que resolve o e-mail real a partir do `login` armazenado em `public.usuario.email`. O `reset-password` usa `auth_user_id` diretamente. Portanto:
- Usuários **legados** com `@internal.logitrack` continuam logando normalmente.
- Usuários **novos** serão criados com o novo padrão.

### 3) Sem migração de dados
Os 2 usuários existentes com sufixo antigo permanecem como estão (não há necessidade técnica de renomear; o login não depende do domínio). Caso você queira normalizar o histórico depois, posso criar uma migração separada — mas envolve `auth.admin.updateUserById` para cada um (alteração tanto em `auth.users` quanto em `public.usuario.email`).

## Arquivos afetados
- `supabase/functions/create-usuario/index.ts` (única alteração)

## Validação pós-implantação
1. Cadastrar um novo usuário pela tela `Configurações → Usuários`.
2. Verificar em `auth.users` que o e-mail segue o padrão `login@<tenant>.logitrack`.
3. Logar com o novo usuário (login + senha) — deve funcionar via `fn_buscar_email_por_login`.
4. Confirmar que usuários antigos ainda logam normalmente.
