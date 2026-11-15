# Fluxo de Expedição — pacote de publicação (F8)

Pacote das fases F1 a F7 + correções do N5 + F8.1 (validadas no QA `pwynobnbftqcqygjtrdk` com a bateria de 93 cenários e com os testes de isolamento entre clientes).
Destino: produção `dcpmykhxysvxnpgmlyli`. **Nada aqui é aplicado automaticamente**: a pasta fica fora de
`supabase/migrations` de propósito. Depois de publicado, os arquivos de `migrations/` são movidos para
`supabase/migrations/`.

## Conteúdo

| Arquivo | Para quê |
|---|---|
| `00_foto_pre_deploy.sql` | Tira a foto do banco (schema fechado `deploy_f8`) imediatamente antes do pacote |
| `migrations/` (34 arquivos) | As migrations, na ordem do nome, idênticas ao que foi aplicado no QA (conferido por hash, ignorando só comentários) |
| `99_reversao.sql` | Devolve o banco à foto: funções, gatilhos e permissões voltam; tabelas, colunas, índices, políticas, tipos, módulos e permissões novos saem. Uma transação só, com conferência final |

## Comparação QA × produção (14/11/2026)

- Produção tem as migrations de relatórios (12/11) e a correção de corte total (09/11) que o QA não tem; **nenhuma toca funções do pacote**.
- As funções que o pacote reescreve por inteiro estão em produção iguais ao ponto de partida do QA, ou só com diferenças de comentário/quebra de linha (`preparar_dados_agrupamento`, `tg_mov_saida_gerar_conferencia`).
- As que o pacote altera por troca de trecho (`_fn_remocao_doc_saida_core`, `fn_provisionar_tenant_completo`, `conferencia_buscar_tarefas`, `rpc_coletor_onda_resumo`, `gerar_volumes_expedicao`, `cron_liberar_separacao_automatica`, `integracao.trg_retorno_status`) preservam as diferenças de produção; os trechos procurados existem lá.
- Colunas: só mudam as 5 tabelas que o pacote altera (`movimento_saida`, `tarefa`, `tarefa_execucao`, `tipo_saida`, `veiculos`) + 8 tabelas novas. Enums existentes idênticos.
- Os 6 clientes de produção agrupam ondas por Documento → viram "Movimento por Documento" no N2, sem mudança de comportamento.
- Embarque e carga só entram em uso quando o tipo de saída liga "Realiza embarque" (padrão desligado).

## Testes feitos no QA (14/11/2026)

- **Bateria de fluxo** (`qa.fn_bateria_fluxo_expedicao`): 93 cenários, N2/N3/N4/N5, liberação, montagem e liberação da carga — 93/93.
- **Isolamento entre clientes** (`qa.fn_teste_isolamento`): cria um cliente B completo dentro do teste e desfaz no fim.
  - B chamando as 33 funções do pacote com o cliente A: 33/33 recusadas (42501).
  - B com o próprio cliente e ids do A (carga, onda, veículo, volume): nada encontrado, nada alterado.
  - Leitura e gravação direta nas tabelas novas e alteradas: sem linhas do outro cliente; gravação bloqueada.
  - Sem login: tabelas e funções bloqueadas.
  - Duas empresas do mesmo cliente: carga com onda de outra empresa recusada; simulação e sugestão sem mistura.
  - Dados do cliente A idênticos antes e depois.
- **F8.1** nasceu desses testes: cliente novo sem os módulos do fluxo/carga/embarque e sem N2 padrão; gravação direta do roteiro sem checagem de permissão; itens do verificador de segurança.
- Verificador de segurança do Supabase: nada pendente nos objetos do pacote (as RPCs de tela rodam com direitos próprios de propósito, com checagem de cliente testada).

## Roteiro de publicação

Janela: fora do horário de ondas (produção gera ondas das 7h às 18h). Sugestão: depois das 18h30 ou domingo.

1. **Ensaio** (com aprovação): rodar `00` + as 34 migrations numa transação desfeita no fim, para provar que todas as trocas de trecho encontram o que procuram em produção.
2. `00_foto_pre_deploy.sql`.
3. As 34 migrations, uma a uma, na ordem do nome (a `f4_3a` precisa ser aplicada e confirmada antes da `f4_3b`: valor novo de enum).
4. Conferências: advisors de segurança; `roteiro_saida_obter` de cada tenant; `carga_sugerir`, `conferencia_buscar_ondas` e `separacao_buscar_ondas` respondendo; módulos `web.config.fluxo-expedicao` ativos e `web.armazem.roteiro-separacao` inativo.
5. Publicar o frontend (`feat/armazenagem-fluxo`) na Vercel.
6. Teste de fumaça no CORELOGITRACK: gerar onda → separar → conferir → (se embarque ligado) carga → embarque.
7. Mover `migrations/*` para `supabase/migrations/`.

## Reversão

`99_reversao.sql` recusa rodar se houver carga liberada ou em carregamento (forçar: `SET logitrack.reversao_forcar = 'on'`).
Apaga os dados das tabelas novas (cargas, grupos, roteiro). O frontend volta junto (deploy anterior na Vercel).
Testada no QA em 14/11 com mudanças de todos os tipos (a F8.1 só altera funções e permissões, tipos de mudança cobertos pelo teste): banco voltou idêntico à foto (funções, permissões, gatilhos, relações, colunas, índices, políticas, tipos e módulos).
