# Correção do contexto de armazém e blindagem da tela Novo Inventário

Escopo aprovado: Pontos 1, 2 e 4 agora (hotfix). Ponto 3 fica registrado como refactor separado.

## 1. Resolução de armazém (TenantContext + Login)

Hoje o armazém só existe se `usuario.armazem_id` estiver preenchido (`LoginPage.tsx` linhas 150-153) — se for NULL, o `core_armazem_id` é removido e a tela de inventário para de funcionar em silêncio (`if (!armazemId) return`).

Mudanças:

- Criar um resolvedor único `resolveArmazemAtivo(tenantId, empresaId)` reutilizado no login, no `changeEmpresa` e no boot do contexto.
- Regra de resolução:
  1. Se `usuario.armazem_id` estiver preenchido e o armazém estiver ativo na empresa atual, usa esse.
  2. Senão, busca o primeiro armazém ativo do par tenant/empresa.
  3. Se não houver nenhum, o contexto entra em estado `semArmazem` com mensagem clara: "Sua empresa não possui armazém ativo. Contate o administrador." — em vez de simplesmente ficar nulo e silencioso.
- Ordem determinística: `ORDER BY codigo_erp ASC NULLS LAST, created_at ASC, id ASC` (substitui o `order("descricao")` atual do `changeEmpresa`, que pode variar quando descrições se repetem).
- Expor no contexto: `armazemId`, `armazemNome`, `armazemLoading`, `armazemErro`, para que as telas distingam "carregando" de "não existe".
- Backlog registrado (não implementado agora): seletor de armazém no TopNav quando houver 2+ armazéns ativos.

## 2. Blindagem da tela Novo Inventário

`NovoInventarioPage.tsx` mistura três estados no mesmo "—". Ajustes:

- Card de contexto no topo do resumo mostrando **Empresa** e **Armazém** que serão enviados ao backend.
- Enquanto o contexto resolve: skeleton/"Carregando contexto…" em vez de "—".
- Se a RPC `fn_preview_inventario` falhar: mensagem de erro persistente com botão "Tentar novamente" (reexecuta o preview sem recarregar a página).
- Prévia zerada legítima: texto explícito ("Nenhum endereço com saldo para este escopo"), diferente de erro.
- Botão **Criar Inventário**:
  - Tipo `GERAL`: habilitado mesmo com estoque zero (contagem livre é válida).
  - Tipos dirigidos: bloqueado com tooltip explicando o motivo.
  - Sem armazém resolvido: bloqueado com a mensagem do contexto, nunca em silêncio.
- Todo `return` silencioso por falta de contexto passa a produzir feedback visível.

## 3. Ponto 3 (usuario_id via auth.uid()) — adiado

Não entra neste hotfix. Fica como ticket de refactor no backend, cobrindo em conjunto `fn_criar_inventario_v2` e `fn_gerar_tarefas_inventario`, com `p_usuario_id` tornando-se opcional (resolvido por `auth.uid()` quando ausente) para preservar compatibilidade do contrato atual.

## 4. Verificações

- JRLUB: criar inventário GERAL (2 endereços / 403 SKUs) e confirmar persistência + geração de tarefas.
- JRLUB: tipo dirigido sem saldo → botão bloqueado com motivo visível, sem falha silenciosa.
- Usuário de teste com `armazem_id = NULL` → contexto resolve o armazém ativo da empresa automaticamente.
- Empresa sem armazém ativo → mensagem de bloqueio clara.
- Troca de empresa no TopNav → armazém recalculado de forma determinística e resumo refeito.
- Regressão multi-tenant: dois tenants com `inventario_tipo_tarefa` AUDITORIA simultâneo, sem conflito de PK.

## Detalhes técnicos

- `src/contexts/TenantContext.tsx`: novo resolvedor compartilhado, novos campos no provider, ordem determinística na consulta a `armazem`.
- `src/pages/LoginPage.tsx`: passa a usar o resolvedor em vez de gravar apenas `usuario.armazem_id`.
- `src/pages/NovoInventarioPage.tsx`: card de contexto, estados de loading/erro/vazio separados, retry do preview, regra de habilitação do botão por tipo.
- Sem migrations nesta fase.
