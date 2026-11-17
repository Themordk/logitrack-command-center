# Etiqueta de volume de expedição — Fases 0 a 4

Plano: "Etiqueta de Volume de Expedição — do volume à etiqueta" (decisões D1–D7 aprovadas em 15/11/2026, todas na recomendação).
Aplicado no QA `pwynobnbftqcqygjtrdk` em 15/11/2026. **Produção ainda não** (precisa de aprovação).
Como no S1, as migrations ficam em `deploy/etiqueta_volume/migrations` (fora de `supabase/migrations`) até a publicação; depois são movidas.
O registro detalhado (testes, efeito em produção, roteiro) está na aba "Registro QA → Produção" do documento do plano.

## O que muda

- **F0 — segurança:** exclusão de volume confere tenant, usuário e permissão; funções do agente de impressão só respondem ao usuário do próprio agente; só quem tem `web.config.impressao` edita impressoras e agentes; nome de impressora com caracteres de terminal é recusado.
- **F1 — fonte única:** os dados da etiqueta de VOLUME são preenchidos no servidor (`_fn_etiqueta_volume_dados`, gatilho em `fila_impressao`), com cliente, pedido, NF autorizada, onda, data e usuário. Backfill do pedido nos volumes antigos; template padrão único; espera entre tentativas e rotina `impressao-manutencao-fila` (recupera jobs presos e cancela pendentes com mais de 24 h).
- **F2 — regras de geração:** volume sempre ligado a um pedido (onda com 2+ pedidos pede a quantidade de cada um), onda travada durante a geração, número único por pedido, tipo de saída coerente com as etapas; embarque fora da configuração exige motivo e registra ocorrência. Corrige B14 (exclusões nunca auditadas) e B15 (segundo conjunto de volumes no embarque).
- **F4 — tela Volumes:** lista com cards, filtros e busca no servidor (`rpc_volumes_listar`), detalhe (`rpc_volume_detalhe`), impressão/reimpressão em lote com motivo (`rpc_volume_imprimir`), reenvio de job (`rpc_volume_reenviar_job`), cancelamento com histórico (`fn_cancelar_volume_expedicao` → `volume_expedicao_cancelado`), acrescentar volume ao pedido, ligar a pedido e peso/cubagem (`rpc_volume_*`). Só acréscimos: nada existente muda.
- **F3 — nota fiscal:** novos campos na etiqueta (volume/total, número e série da NF, espécie); reimpressão automática quando a NF é autorizada (`tipo_saida.reimprime_volume_nf`, desligada por padrão); conferência de volumes WMS × NF (`tipo_saida.divergencia_volume_nf`: AVISAR padrão, BLOQUEAR, IGNORAR) na autorização, na geração e no fechamento da carga. F3c corrige B16 (`{{trasportadora}}` / `{{total_volume}}` em templates).

## Arquivos

| Arquivo | Para quê |
|---|---|
| `migrations/20261115213000_etq_f0_seguranca.sql` | F0 (bloco ROLLBACK no fim) |
| `migrations/20261115214500_etq_f1_fonte_unica.sql` | F1 (cria `ops.rollback_definicao` com as definições anteriores) |
| `migrations/20261115215500_etq_f1b_cidade_uf.sql` | Ajuste da cidade/UF e permissão do gatilho |
| `migrations/20261115220000_etq_f2_regras_geracao.sql` | F2 |
| `migrations/20261115220500_etq_f2b_embarque_volumes_existentes.sql` | B15 |
| `migrations/20261115221000_etq_f2c_ocorrencia_prioridade.sql` | B14 |
| `migrations/20261115223000_etq_f3_nota_fiscal.sql` | F3 |
| `migrations/20261115224500_etq_f3c_template_chaves.sql` | B16 (textos anteriores em `ops.rollback_definicao`) |
| `migrations/20261115231000_etq_f4_tela_volumes.sql` | F4 (bloco ROLLBACK no fim) |
| `migrations/20261115233000_etq_f5_remetente.sql` | F5 — remetente na etiqueta (`remetente_nome`, `remetente_cnpj`, `remetente`), empresa que fatura o pedido |
| `qa_teste_etiqueta_volume.sql` | A17 — bateria de regressão **só do QA** (não vai para produção): `SELECT qa.fn_teste_etiqueta_volume();`, 21 casos, desfaz tudo no fim |

No QA, F1b foi aplicada em duas partes (`etq_f1b_cidade_uf` + `etq_f1c_revoke_trigger_fn`) e F3 recebeu o ajuste `etq_f3b_avisos_formato`; os arquivos daqui já têm a versão final.

Reversão: cada migration guarda as definições anteriores em `ops.rollback_definicao` (`SELECT definicao FROM ops.rollback_definicao WHERE migration = '<arquivo>'`) e traz o bloco ROLLBACK comentado no fim.

## Publicação em produção (quando aprovada)

0. No QA, `SELECT qa.fn_teste_etiqueta_volume();` com 0 falhas (rodar de novo depois de qualquer ajuste).
1. Fora do pico (18h–20h), evitando segunda e sexta; backup (PITR) conferido.
2. **Banco primeiro**: as 9 migrations na ordem dos arquivos. A tela Volumes nova depende da F4, que depende da F1 e da F3.
3. **Frontend logo em seguida** (commits `feat(etiqueta-volume)`). Entre os dois passos, com o coletor antigo: onda com 2+ pedidos na conferência e geração no embarque fora da configuração ficam recusadas até o frontend subir (0 ondas com 2+ pedidos no histórico). A tela Volumes antiga continua funcionando com o banco novo.
4. Conferência: heartbeat dos agentes em até 5 min; uma etiqueta de volume pela tela Volumes e uma pelo coletor com cliente, pedido e NF em `fila_impressao.dados`; rotina `impressao-manutencao-fila` rodou; no dia seguinte, sem `WARNING tg_documento_saida_nf_volume` nos logs.
5. Agente de impressão 1.1.0 (fora do repositório): gerar o `.exe`, testar com impressora real e distribuir.
