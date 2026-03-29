

# Plano: Alteracao de Senhas de Usuarios

## Resumo

Implementar dois fluxos de gerenciamento de senha:
1. **Coletor** - Opcao em Configuracoes para o usuario alterar sua propria senha (confirma atual + nova 2x)
2. **Painel Admin** - Botao "Resetar Senha" na lista de usuarios que define senha padrao `123456` e marca flag para forcar troca no proximo login

---

## Fase 1 - Migration: Flag de troca obrigatoria

Adicionar coluna `deve_trocar_senha boolean DEFAULT false` na tabela `usuario`. Quando o admin resetar a senha, esta flag vira `true`. Apos o usuario trocar a senha, volta para `false`.

---

## Fase 2 - Edge Function `reset-password`

Nova edge function que recebe `{ usuario_id }` e:
1. Busca o `auth_user_id` do usuario na tabela `usuario`
2. Usa `supabaseAdmin.auth.admin.updateUserById(authUserId, { password: "123456" })` para resetar
3. Atualiza `usuario.deve_trocar_senha = true`
4. Retorna sucesso

Acesso restrito a admins (validar JWT + verificar permissao via `fn_usuario_tem_permissao`).

---

## Fase 3 - Painel Admin: Botao "Resetar Senha"

Em `UsuariosPage.tsx`, adicionar na listagem um botao/acao extra por linha usando a prop `extraRowActions` do `CrudTable`. O botao exibe um dialog de confirmacao e invoca a edge function `reset-password`.

---

## Fase 4 - Coletor: Tela "Alterar Senha"

Em `ConfiguracoesPage.tsx`, adicionar uma secao "Alterar Senha" com formulario:
- Campo "Senha atual" (password)
- Campo "Nova senha" (password, min 6 chars)
- Campo "Confirmar nova senha" (password)

O fluxo usa:
1. `supabase.rpc("fn_buscar_email_por_login", { p_login })` para obter email
2. `supabase.auth.signInWithPassword({ email, password: senhaAtual })` para validar a senha atual
3. `supabase.auth.updateUser({ password: novaSenha })` para alterar
4. Atualiza `usuario.deve_trocar_senha = false` se estava marcado

---

## Fase 5 - Interceptacao de Login: Forcar troca de senha

Nos dois fluxos de login (`LoginPage.tsx` e `ColetorLoginPage.tsx`), apos autenticar com sucesso e carregar o usuario, verificar `usuario.deve_trocar_senha`:
- Se `true`, exibir um modal/tela de troca obrigatoria de senha (nova + confirmacao)
- Apos trocar com sucesso, atualizar flag e prosseguir com o login normal
- O usuario NAO consegue pular esta etapa

Criar um componente reutilizavel `ForcePasswordChangeModal` usado em ambas as paginas de login.

---

## Arquivos a criar/modificar

| Arquivo | Acao |
|---------|------|
| Migration SQL | Adicionar `deve_trocar_senha boolean DEFAULT false` em `usuario` |
| `supabase/functions/reset-password/index.ts` | Nova edge function para reset de senha |
| `src/pages/UsuariosPage.tsx` | Adicionar botao "Resetar Senha" via `extraRowActions` |
| `src/pages/coletor/ConfiguracoesPage.tsx` | Adicionar secao "Alterar Senha" com formulario |
| `src/components/ForcePasswordChangeModal.tsx` | Modal reutilizavel para troca obrigatoria |
| `src/pages/LoginPage.tsx` | Verificar `deve_trocar_senha` e exibir modal |
| `src/pages/coletor/ColetorLoginPage.tsx` | Verificar `deve_trocar_senha` e exibir modal |

---

## Detalhes Tecnicos

- A coluna `deve_trocar_senha` precisa ser lida no select do login: adicionar ao `.select(...)` em ambas as paginas de login
- A edge function `reset-password` usa `SUPABASE_SERVICE_ROLE_KEY` para poder chamar `auth.admin.updateUserById`
- A alteracao de senha pelo proprio usuario no coletor usa a API client-side `supabase.auth.updateUser()` que so precisa do token JWT da sessao ativa
- Validacao de senha minima: 6 caracteres em ambos os fluxos

