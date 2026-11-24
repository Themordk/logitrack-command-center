# Release para produção — Entregas + Status S2 + correções (levantamento de 24/11/2026)

Produção: Supabase `dcpmykhxysvxnpgmlyli` · Vercel `logitrack-command-center` (produção = branch `main`).
Hoje em produção: banco até `ondas_carregamento_lista_detalhe_rpc` (23/11) · frontend `main` @ `1a922e50` (#53).

## O que entra (só o que foi alterado depois da última publicação)

| Bloco | Conteúdo | Commits |
|---|---|---|
| A · Módulo de Entregas | coletor de entregas (aceite, foto, ocorrência, tentativas, estorno, cache offline, alerta sonoro), aba Entrega na carga, motorista do veículo, telefone/contato/NF/observação na parada, config por tipo de saída, conferência de volume no cliente, carga fecha pela entrega, relatórios de entregas | a50387f5 → a901ecd0 |
| B · Retorno ao ERP | 8 eventos novos por pedido (carga montada, embarcado, carga fechada, saiu p/ entrega, entregue, não entregue, estorno, retirado da carga) + blocos `carga`/`entrega` no contexto | d4d25118 |
| C · Status S2 | etapa + entrega no pedido, Acompanhamento de Pedidos, card Situação do pedido, resumo de entrega nas Ondas, fim do EXPORTADA_ERP/EXPORTADO | c6f9f202, eabcf15f |
| D · Integração por documento | Ondas (S2.6) e Movimentos de Entrada (S2.7): coluna Integração nos documentos vinculados e selo "N com erro ERP" | a044316c, 27ab29a9 |
| E · Correção | onda presa em SEPARADO após corte total de item reaberto (`fn_gerar_conferencia_saida` v7) | 88b4f2ba |

Nenhuma Edge Function muda neste pacote.

## Passo a passo

### Fase 0 — antes (sem alterar nada)
- [ ] Aprovação do dono do produto e janela fora do pico (a carga inicial da S2 recalcula ~8.060 pedidos).
- [ ] Conferir que há backup diário/PITR recente no painel do Supabase.
- [ ] Rodar `00_foto_pre_deploy.sql` em produção: todos os `ok = true`. Se algum hash mudou, **parar** (alguém alterou a função depois de 24/11).

### Fase 1 — banco, nesta ordem (apply_migration com o conteúdo de cada arquivo)
Bloco A + B (Entregas e retorno):
1. [ ] `20261123120000_entregas_e1_enum_etapa`
2. [ ] `20261123120100_entregas_e1_e3_estrutura_rpcs`
3. [ ] `20261123120200_entregas_grants_leitura`
4. [ ] `20261123130000_entregas_d7_motorista_do_veiculo`
5. [ ] `20261123140000_entregas_nf_observacao_telefone`
6. [ ] `20261123150000_entregas_tentativas`
7. [ ] `20261123150100_entregas_eventos_ordem`
8. [ ] `20261123160000_relatorios_entregas`
9. [ ] `20261123170000_entregas_config_tipo_saida`
10. [ ] `20261123180000_entregas_fechamento_carga` (o acerto de dados no fim não faz nada em produção: não há entregas)
11. [ ] `20261123190000_retorno_eventos_embarque_entrega`

Bloco C + D + E (Status S2 e correções):
12. [ ] `20261123200000_status_s2_1_colunas_situacao_pedido`
13. [ ] `20261123200100_status_s2_2_calculo_gatilhos`
14. [ ] `20261123200200_status_s2_3_carga_inicial` (a mais demorada; acompanhar)
15. [ ] `20261123200300_status_s2_4_exportado_painel_cancelamento`
16. [ ] `20261123200400_status_s2_5_rpcs_telas`
17. [ ] `20261123210000_status_s2_6_ondas_integracao_documentos`
18. [ ] `20261124140000_fix_conferencia_ja_concluida`
19. [ ] `20261124150000_status_s2_7_entrada_integracao_documentos`

**Não vão para produção:** `qa_teste_situacao_pedido`, `qa_teste_status_s1_ajuste_s2` (baterias do QA).

- [ ] Rodar `98_verificacao_pos_deploy.sql`: 19 migrations novas, 6 tabelas de entrega, 9 gatilhos `trg_zz_situacao_*`, 8 eventos no catálogo, `fix_conferencia = true`.
- [ ] Advisors de segurança do Supabase sem item novo.

### Fase 2 — frontend
- [ ] PR `feat/armazenagem-fluxo` → `main` (13 commits, 87 arquivos). `tsc`, `vitest` (649) e `build` ok no branch.
- [ ] Merge → Vercel publica produção. Anotar o deployment novo.
- Ordem importa: **banco antes do frontend** (as telas novas chamam RPCs novas). O frontend atual continua funcionando com o banco novo (só ganha colunas).

### Fase 3 — destravar dados
- [ ] Onda **1970** (SEPARADO sem tarefa aberta e com conferência concluída): conferir de novo com o bloco `ondas_presas_separado` e, confirmada, rodar `fn_gerar_conferencia_saida(<id>, <tenant>)` com a sessão do tenant (mesmo procedimento da 2742 no QA).

### Fase 4 — teste rápido em produção (com o operador/supervisor)
- [ ] Operação › Acompanhamento de Pedidos abre, cartões e filtros respondem.
- [ ] Detalhe de um pedido mostra "Situação do pedido".
- [ ] Ondas: selos na 2ª linha, filtro Entrega, coluna Integração em Documentos vinculados.
- [ ] Movimentos de Entrada: coluna Integração e selos.
- [ ] Coletor: menu "Entregas" aparece só para quem tem permissão; nenhum tipo de saída gera entrega até ser configurado (`realiza_entrega` nasce desligado).
- [ ] Painel de TV: "expedidos hoje" igual ao de antes.

### Fase 5 — acompanhamento (24–48 h)
- [ ] `log_cron_execucao` e logs do Postgres sem WARNING de `trg_pedido_situacao`.
- [ ] Nenhuma onda nova em `ondas_presas_separado`.
- [ ] Ondas concluídas ficam CONCLUIDA (não viram EXPORTADA_ERP) e o retorno ao ERP segue saindo (13 fluxos ativos).
- [ ] Configurar com a operação os tipos de saída que fazem entrega e os entregadores nos veículos (só então o módulo começa a operar).

## Reversão (se precisar)
- Frontend: promover de volta o deployment `dpl_GRQb8mYAUKzxFJ8acR8BF8czsh5F` (main @ 1a922e50) no Vercel.
- Banco, na ordem inversa: `20261124_status_s2_7_reverter` → `20261124_fix_conferencia_ja_concluida_reverter` → `20261123_status_s2_6_reverter` → `20261123_status_s2_reverter` → `20261123_retorno_eventos_embarque_entrega_reverter` → `20261123_entregas_fechamento_carga_reverter` → `20261123_entregas_config_tipo_saida_reverter` → `20261123_relatorios_entregas_reverter` → `20261123_entregas_tentativas_reverter` → `20261123_entregas_reverter`. Todos ensaiados no QA.

## Fora deste pacote (decidir à parte)
- **Gateway `contato` (v1.23):** `docs/integration-gateway/index.ts` foi feito sobre a versão 1.22 do QA; a produção já está na **1.24**. Publicar esse arquivo em produção **voltaria** a versão. Se quiser o campo `contato` pela API, aplicar o ajuste sobre a 1.24. Sem isso, o telefone continua funcionando; só o nome do contato fica vazio.
- Documentação de etapa/entrega no portal da API (decisão 6 do plano).
- Pacote de correções do gateway (`_bkp`, cancelamento de entrada via RPC).
- S3 — o que fazer depois de "Não entregue".
- Diferenças antigas entre QA e produção: ~108 funções diferem e não são tocadas por este pacote (ex.: relatórios, LMS). Não bloqueiam, mas valem um saneamento depois.
