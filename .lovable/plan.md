# Correção — Troca de senha obrigatória no painel administrativo

## Problema

No painel administrativo, o modal de troca de senha obrigatória nunca aparece após um reset.

Causa confirmada pela leitura do código:

- `LoginPage.tsx` (linhas 127-132) detecta `deve_trocar_senha` e ativa o modal, que é renderizado **dentro** da própria `LoginPage`.
- Porém, o `signInWithPassword` já criou a sessão. O `TenantContext` escuta `onAuthStateChange` e marca `authenticated = true`.
- `App.tsx` (linha 597) só renderiza `LoginPage` quando `!authenticated`. Assim que a sessão existe, a `LoginPage` é desmontada e o `Layout` entra no lugar — levando o modal junto.
- No coletor isso não acontece porque as rotas `/coletor/*` são tratadas antes do gate de `authenticated` (linha 593), então a `ColetorLoginPage` permanece montada.

## Solução

Mover a verificação para um gate global pós-autenticação, em vez de depender da tela de login continuar montada.

1. Novo hook/estado no `App.tsx` (área de tenant autenticada): ao ficar autenticado, consultar `usuario` (por `auth_user_id`) o campo `deve_trocar_senha`.
2. Enquanto `deve_trocar_senha = true`, renderizar `ForcePasswordChangeModal` (variante `admin`) bloqueando a aplicação — sem acesso ao Layout/rotas.
3. Ao concluir com sucesso, limpar o estado local e liberar a navegação normal (o modal já grava `deve_trocar_senha = false` no banco).
4. Manter também o comportamento atual na `LoginPage` como caminho rápido (não prejudica; o gate global cobre inclusive recargas de página com a senha temporária ativa).

## Detalhes técnicos

- Arquivos alterados: `src/App.tsx` (gate) e, se necessário, um pequeno hook `src/hooks/useForcePasswordChange.ts` para encapsular a consulta.
- Consulta: `select id, deve_trocar_senha from usuario where auth_user_id = <uid>` (respeita RLS existente).
- Escopo: apenas rotas de tenant autenticadas. Suporte da plataforma (`/suporte/*`) e coletor ficam fora do gate — o coletor já funciona.
- Sem migrations, sem mudanças em edge functions (`reset-password` já está correto).
