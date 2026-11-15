# Status S1 — status de integração com o ERP

Plano: "Plano — Status operacional, de entrega e de integração" (decisões aprovadas em 15/11/2026, todas na recomendação).
Aplicado no QA `pwynobnbftqcqygjtrdk` em 15/11/2026. **Produção ainda não** (precisa de aprovação).
Como no F8, as migrations ficam em `deploy/status_s1/migrations` (fora de `supabase/migrations`) até a publicação; depois são movidas.

## O que muda

- Documento de saída e de entrada ganham `integracao_estado` (nao_integra, pendente, integrado, erro, ignorado), o evento, a hora, a mensagem de erro, a execução de referência e `integracao_erros_outros`.
- Onda e recebimento ganham `integracao_resumo`, o pior caso dos documentos.
- O cálculo é feito só no banco, por um gatilho de fim de transação em `integracao.retorno_execucao`. Nenhum caminho do motor (dispatcher, envio manual, lote, reprocessar, descartar) precisou mudar.
- O nó "Atualizar documento" ganha "Resultado da integração": automático, integrado, não precisou enviar, erro de negócio ou não alterar.
- O texto livre continua em `status_integracao` (renomeado na tela para "Marcador da regra"), porque a API devolve esse campo.
- "Marcar como exportado" passa a valer na **conclusão** da execução com sucesso, e só quando nenhum documento da onda/recebimento está com erro ou aguardando envio. Antes, o primeiro documento marcava a onda inteira, mesmo se a execução falhasse depois do nó.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `deploy/status_s1/migrations/20261115210000_status_s1_1_colunas_integracao.sql` | Colunas, restrições e índices (só acréscimos) |
| `deploy/status_s1/migrations/20261115210100_status_s1_2_recalculo_integracao.sql` | Cálculo, resumo, gatilho, `svc_atualizar_documento` com resultado, leitura para telas |
| `deploy/status_s1/migrations/20261115210200_status_s1_3_carga_inicial_integracao.sql` | Carga inicial a partir do histórico (sem mexer em `updated_at`, sem exportar ondas) |
| `deploy/status_s1/migrations/20261115210300_status_s1_4_eventos_documento_integracao.sql` | `integracao_documento_eventos` devolve `documento.integracao` |
| `deploy/status_s1/migrations/20261115210400_status_s1_5_no_atualizar_documento.sql` | Descrição do nó no catálogo |
| `functions/retorno-dispatcher` | Código de produção (v5) + envio de `p_resultado`/`p_mensagem`. Sem o deploy, o dispatcher atual continua funcionando (parâmetros novos têm padrão) |
| `deploy/status_s1/qa_teste_status_s1.sql` | Bateria do QA (`SELECT qa.fn_teste_status_s1();`) — não vai para produção |
| `deploy/status_s1/99_reversao.sql` | Reversão em uma transação, com conferência |

No QA a migração 2/4 foi aplicada em duas partes (`status_s1_2_recalculo_integracao` + `status_s1_2b_lote_agrupado_pendente`); o arquivo do repositório já tem as duas juntas.

## Alinhamento do QA com produção (passo 0)

Aplicadas no QA, com o texto de produção: `doc_eventos_integracao_01` a `04` e `retorno_envio_manual_bloqueios` (as funções ficaram iguais às de produção, ignorando comentários). As quatro `doc_eventos_*` e a `fix_onda_corte_total_concluir_movimento` não estavam no repositório e foram copiadas para `supabase/migrations` com a versão de produção.

Ficou de fora: `fix_onda_corte_total_concluir_movimento` (o trecho que ela procura em `fn_gerar_conferencia_saida` não existe no QA, que já tem o fluxo de expedição por cima) e a diferença em `fn_cancelar_documento_entrada` (assunto do S2).

## Testes no QA (15/11/2026)

- **Bateria** `qa.fn_teste_status_s1()`: 24/24. Simula o dispatcher com as mesmas RPCs de serviço e desfaz tudo no fim. Casos:
  - pendente → Aguardando;
  - envio OK → Integrado com evento;
  - outro pedido pendente ou com erro → a onda não exporta;
  - erro com mensagem;
  - reenvio corrige;
  - todos integrados + marcar exportado → EXPORTADA_ERP;
  - "não precisou enviar" não apaga um Integrado;
  - erro de negócio do nó;
  - o mais recente vence;
  - aviso de 1 retorno anterior com erro;
  - só filtrado → Ignorado;
  - sucesso sem envio → Ignorado;
  - teste/simulação não contam;
  - lote (membro na fila → Aguardando; concluído → Integrado + marcador);
  - resultado inválido recusado;
  - entrada → recebimento EXPORTADO;
  - leitura para as telas.
- **Reversão** ensaiada no QA numa transação desfeita no fim:
  - a conferência passou;
  - `integracao_documento_eventos` voltou idêntica à de produção.
- **Permissões:** as funções novas não são executáveis por `authenticated`/`anon`. O verificador de segurança não aponta nada nos objetos do S1.
- **Prévia da carga inicial em produção** (consulta só de leitura, com a mesma regra):

  | Tipo | Integrado | Erro | Não enviado (ignorado) | Aguardando |
  |---|---|---|---|---|
  | Pedidos de saída | 1.423 | 155 | 274 | 9 |
  | NFs de entrada | 367 | 51 | — | 1 |

  Dos 274 ignorados, 269 hoje mostram "retornado": são execuções que só passaram por condições, sem nenhum envio ao ERP.

## Publicação em produção (quando aprovada)

1. Fora do horário de ondas.
2. Migrations 1 a 5, na ordem. A 3 desliga `trg_tocar_updated_at` só durante a carga.
3. Deploy do `retorno-dispatcher` (opcional no mesmo dia; sem ele, os nós continuam "automático").
4. Frontend.
5. Conferência:
   - contagens da carga inicial batem com a prévia;
   - uma execução real termina e atualiza o documento;
   - verificador de segurança.
6. Avisar os clientes:
   - regras com caminho "bloqueado" devem usar "Não precisou enviar" ou "Erro de negócio";
   - "marcar como exportado" agora espera a onda inteira.
