# Correção da criação de inventário no tenant JRLUB

## Diagnóstico confirmado

- A tela chama as RPCs corretas: `fn_preview_inventario`, `fn_criar_inventario_v2` e, para inventários dirigidos, `fn_gerar_tarefas_inventario`.
- O tenant JRLUB possui a empresa **FJG DISTRIBUIDORA**, o armazém ativo **CD Principal**, **2 endereços ativos**, **403 produtos ativos**, os dois vínculos de tipo de tarefa (`AUDITORIA` e `ATUALIZACAO`) e nenhum inventário criado.
- O usuário **admin** do JRLUB está ativo, mas possui `armazem_id = NULL`. O login remove `core_armazem_id` nesse caso e o `TenantContext` não resolve um armazém padrão. Sem `armazemId`, a prévia não é chamada e a criação não pode prosseguir. O usuário **MESSIAS** possui o CD Principal vinculado.
- O armazém ainda não possui posições em `estoque_geral`. Portanto, o inventário **Geral** deve permitir contagem livre com 2 endereços/403 SKUs, enquanto os tipos dirigidos devem informar que não há saldo elegível.
- Não houve chamada a `fn_criar_inventario_v2` nem a `fn_preview_inventario` nos logs/requisições disponíveis. O teste autenticado exato do usuário que relatou o erro permanece não confirmado neste ambiente externo.

## Implementação

### 1. Garantir um contexto operacional completo

- Centralizar no `TenantContext` a resolução do armazém ativo da empresa quando o usuário autenticado não possuir `armazem_id`.
- Persistir o armazém resolvido em `core_armazem_id` e atualizar o contexto antes de liberar as páginas protegidas.
- Reaplicar a mesma regra no login e na troca de empresa, evitando que usuários administrativos entrem com empresa válida e armazém vazio.
- Se não existir armazém ativo, manter o contexto bloqueado e mostrar uma mensagem explícita, em vez de deixar a tela silenciosamente incompleta.

### 2. Blindar a tela Novo Inventário

- Exibir empresa e armazém usados na criação, tornando o contexto enviado às RPCs verificável pelo usuário.
- Mostrar um estado de carregamento enquanto tenant, empresa, usuário e armazém são resolvidos; não tratar contexto incompleto como resumo zerado.
- Exibir erro persistente quando a prévia não puder ser chamada ou retornar falha, com ação para tentar novamente.
- Manter o inventário Geral habilitado quando a prévia confirmar os cadastros, mesmo sem `estoque_geral`; bloquear somente os tipos dirigidos sem posições elegíveis.
- Validar `usuarioId` antes da chamada e preservar as mensagens por etapa: contexto, prévia, configuração, criação e geração.

### 3. Alinhar e endurecer as RPCs

- Revisar `fn_preview_inventario` e `fn_criar_inventario_v2` para que validem os mesmos tenant, empresa e armazém.
- Fazer a RPC de criação resolver e validar o usuário operacional por `auth.uid()`, reduzindo dependência de um ID mantido no navegador e evitando falha por contexto local desatualizado.
- Preservar a regra atual: Geral cria diretamente em `EM_CONTAGEM`; os demais criam tarefas somente quando houver saldo elegível.
- Não ampliar acesso anônimo; manter execução restrita a usuários autenticados e `service_role`.

### 4. Verificação

- Testar o login do usuário JRLUB sem armazém vinculado e confirmar que o CD Principal é resolvido automaticamente.
- Confirmar que a prévia Geral retorna **2 endereços** e **403 SKUs** e que a criação persiste um inventário `EM_CONTAGEM`.
- Confirmar que os tipos dirigidos retornam **0 elegíveis**, explicam a ausência de estoque e não criam registros vazios.
- Testar também com o usuário que já possui armazém vinculado, para evitar regressão.
- Conferir no banco tenant, empresa, armazém, criador e status do registro; executar testes do frontend e o linter do Supabase.

## Arquivos e banco

- `src/contexts/TenantContext.tsx` e `src/pages/LoginPage.tsx`: resolução consistente do armazém ativo.
- `src/pages/NovoInventarioPage.tsx`: contexto visível, estados de carregamento e erros acionáveis.
- Migration Supabase: ajuste seguro das RPCs de prévia/criação, caso a revisão final confirme a necessidade de derivar o usuário por `auth.uid()`.