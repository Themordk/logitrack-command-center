# Correção definitiva — criação de inventário no tenant JRLUB

## Diagnóstico confirmado

- O tenant **JRLUB / FJG DISTRIBUIDORA / CD Principal** possui **2 endereços ativos**, mas **nenhuma posição em `estoque_geral`**; portanto existem **0 endereços e 0 SKUs com saldo elegíveis** para geração de tarefas.
- Os vínculos de execução já existem e estão ativos para o tenant: `AUDITORIA → INV-AUDIT` e `ATUALIZACAO → INV-ATU`.
- Não há registro recente de inventário no tenant, confirmando que o clique não chegou a persistir a criação.
- A tela atual ignora o erro retornado pela pré-checagem de `inventario_tipo_tarefa` e habilita a criação de inventários não gerais mesmo quando o resumo confirma que nenhuma tarefa pode ser gerada.
- A sessão autenticada do tenant não está disponível para teste automatizado neste ambiente (`external_unmanaged`); por isso, o ponto exato de falha do clique ainda precisa ser capturado na requisição real. **Authenticated path: UNVERIFIED.**

## Implementação

### 1. Tornar o resumo inequívoco
- Para inventário **Geral (contagem livre)**, mostrar os cadastros disponíveis no armazém: endereços ativos e produtos ativos da empresa, deixando explícito que não dependem de saldo pré-existente.
- Para os demais tipos, continuar mostrando apenas endereços/SKUs com saldo elegível, exatamente como o gerador de tarefas.
- Trocar consultas client-side com `limit` e contagem por `Set` por uma RPC de prévia que retorne contagens exatas e um código de diagnóstico (`SEM_ESTOQUE`, `SEM_ENDERECOS`, `SEM_PRODUTOS` ou sucesso), respeitando tenant, empresa, armazém e escopo.
- Exibir separadamente “cadastrados” e “elegíveis” quando isso ajudar a explicar o zero do JRLUB.

### 2. Corrigir e blindar a criação
- Validar e exibir também o `error` da consulta de configuração; nunca tratar falha de RLS/rede como simples “configuração ausente”.
- Bloquear **Criar Inventário** para tipos que exigem tarefas quando a prévia estiver carregando, tiver erro ou retornar zero endereços elegíveis; manter **Geral** permitido para contagem livre.
- Garantir que todo caminho de falha — pré-checagem, RPC de criação, resposta inválida e geração de tarefas — produza mensagem persistente na página, toast e libere o estado de carregamento.
- Adicionar um identificador de etapa à mensagem (`configuração`, `criação` ou `geração`) para tornar o próximo diagnóstico objetivo.

### 3. Reforçar o backend
- Revisar `fn_criar_inventario_v2` e `fn_gerar_tarefas_inventario` para validar a coerência tenant/empresa/armazém/usuário antes de gravar, sem confiar apenas nos IDs enviados pelo navegador.
- Criar a RPC de prévia com as mesmas regras e filtros usados pelo gerador, evitando divergência futura entre resumo e tarefas efetivamente criadas.
- Preservar a contagem livre: inventário `GERAL` deve criar o registro mesmo sem linhas em `estoque_geral`.

### 4. Verificação
- No JRLUB, confirmar que o resumo Geral mostra **2 endereços cadastrados** e a quantidade real de produtos ativos da FJG; nos tipos dirigidos, confirmar **0 elegíveis** e botão bloqueado com explicação.
- Executar a criação real de um inventário Geral com usuário autenticado e conferir o registro persistido, tenant, empresa, armazém, criador e status `EM_CONTAGEM`.
- Em um tenant com estoque, criar um inventário dirigido e confirmar que resumo e quantidade de tarefas coincidem.
- Forçar falha de configuração e falha da RPC para confirmar que ambas aparecem de forma persistente na tela.
- Rodar o linter de segurança do Supabase após a migration.

## Arquivos e banco

- `src/pages/NovoInventarioPage.tsx`: estados do resumo, bloqueio contextual e tratamento completo dos erros.
- Migration Supabase: RPC de prévia e, se a revisão confirmar necessidade, reforço das validações das RPCs de inventário existentes.
