# Release · Retorno ao ERP · novos eventos (backend)

Cenário A (botão "Importar do ERP" configurável) e cenário B (movimentação interna que troca
armazém, setor ou tipo de estoque). Inventário fica fora (plano próprio).

## Ordem de publicação

1. `supabase/migrations/20261126190000_retorno_novos_eventos_00_base.sql`
2. `supabase/migrations/20261126190100_retorno_novos_eventos_01_movimentacao_interna.sql`
3. `supabase/migrations/20261126190200_retorno_novos_eventos_02_importacao.sql`
4. `supabase/migrations/20261126190300_retorno_novos_eventos_03_funcoes_compartilhadas.sql`
5. Edge Function `retorno-dispatcher` (`supabase/functions/retorno-dispatcher`, `verify_jwt=false`, igual hoje)
6. QA: `qa_teste_retorno_novos_eventos.sql` e `select qa.fn_teste_retorno_novos_eventos();` (nunca em produção)

Reverter: `supabase/rollback/20261126_retorno_novos_eventos_reverter.sql`.

## Estado no QA (pwynobnbftqcqygjtrdk) em 26/11/2026

- Migrations 00–03 aplicadas; `retorno-dispatcher` v4 publicado (mesmo conteúdo do repositório).
- Bateria `qa.fn_teste_retorno_novos_eventos()`: 25 casos, 0 falhas (roda como usuário real e desfaz tudo).
- Advisors: só os avisos esperados (RLS sem policy no catálogo interno, RPCs SECURITY DEFINER para `authenticated`).

## Antes de produção

- `fn_retorno_validar_referencias` em produção é mais nova que a do QA: a migration 02 altera só a
  lista de nós que geram saída (bloco `DO $patch$`), sem recriar a função.
- `integracao_retorno_svc_atualizar_documento`: a migration 03 inclui o comentário que existe em produção.
- Demais funções alteradas tinham o mesmo corpo em QA e produção (comparado por md5 em 26/11).
- O dispatcher do repositório é o de produção + S1 (nó Atualizar documento com resultado): publique junto.
- Cron novo: `retorno-interativo-expirar` (a cada 5 min).

## Decisões de implementação (diferenças em relação ao plano)

- Sem alteração no integration-gateway: o nó "Gravar no LogiTrack" chama a própria API com a chave
  da conexão ERP ativa da empresa (`erp_conexao.webhook_secret`, a mesma que o ERP usa), lida só pelo
  serviço (`integracao_retorno_svc_chave_api`, só `service_role`). Empresa sem API ativa → o nó sai por erro
  com mensagem clara.
- Sem evento de estorno: transferência e mudança de picking não têm estorno no WMS.
- Nenhuma RPC do coletor foi alterada: a detecção é um gatilho em `estoque_movimento`
  (tarefa `TRANF`; `tipo_documento_origem` NULL = Transferência, `MUDANCA_PICKING` = Mudança de picking).
