# Plano de status · S2 — Situação do pedido (etapa + entrega)

Aplicado no **QA** (`pwynobnbftqcqygjtrdk`) em 23/11/2026. **Não aplicado em produção.**
Publicar em produção **junto com o módulo de entregas** (as funções dependem de `entrega`, `entrega_parada`, `entrega_tentativa` e `_fn_entrega_motivo_sem_entrega`).

## O que entra (ordem de aplicação)

| Migration | Conteúdo |
|---|---|
| `20261123200000_status_s2_1_colunas_situacao_pedido` | Colunas `etapa*`/`entrega_*` em `documento_saida`, `entrega_resumo`/`entrega_*` em `movimento_saida`, CHECKs e índices |
| `20261123200100_status_s2_2_calculo_gatilhos` | `_fn_pedido_situacao_calcular`, `_fn_onda_entrega_resumo`, `_fn_pedido_situacao_recalcular`, `trg_pedido_situacao` e 9 gatilhos `trg_zz_situacao_*` (deferidos, nunca bloqueiam) |
| `20261123200200_status_s2_3_carga_inicial` | Recalcula todos os pedidos (sem tocar `updated_at`) |
| `20261123200300_status_s2_4_exportado_painel_cancelamento` | Para de gravar EXPORTADA_ERP/EXPORTADO; ajusta `rpc_painel_tv_operacional` e `fn_cancelar_documento_entrada` |
| `20261123200400_status_s2_5_rpcs_telas` | `rpc_pedidos_acompanhamento`, `rpc_pedido_situacao`, colunas de entrega em `rpc_ondas_carregamento_lista`, `situacao`/`integracao` por parada em `_fn_entrega_json` |

Reversão: `supabase/rollback/20261123_status_s2_reverter.sql` (ensaiada no QA em BEGIN/ROLLBACK; painel e lista voltam com o mesmo hash da produção).

## Testes no QA

- `SELECT qa.fn_teste_situacao_pedido();` → **20/20** (`qa_teste_situacao_pedido.sql`, tudo em rollback).
- S1 `qa.fn_teste_status_s1()` → 24/24 (casos 09 e 21 agora esperam CONCLUIDA/ARMAZENADO).
- Etiqueta 21/21, HU 17/17.
- Isolamento: pedido de outro tenant → DOCUMENTO_NAO_ENCONTRADO; empresa de outro tenant → EMPRESA_INVALIDA; funções internas sem EXECUTE para `authenticated`.
- Frontend: `tsc`, `vitest` (649/649) e `npm run build` ok.

## Antes de publicar em produção

1. Módulo de entregas já publicado (ou no mesmo pacote, antes destas migrations).
2. Conferir as âncoras dos splices (o script falha se não encontrar): `rpc_painel_tv_operacional`, `fn_cancelar_documento_entrada`, `rpc_ondas_carregamento_lista`, `_fn_entrega_json`.
3. Depois: conferir distribuição `SELECT etapa, entrega_status, count(*) FROM documento_saida GROUP BY 1,2;` e o painel TV.
