 # Frontend rules

- Mudança de Picking blocking reasons are normalized by montarMotivosBloqueio in its service, preserving legacy previews while blocked lists render only a single summary and session-clearing navigation.

- Inventory criterion labels are shared through the inventory criteria module; lists enrich rotational rows in one tenant/company-scoped batch because existing inventory views omit the criterion, avoiding per-row queries.
 
- Transfer picking hints come exclusively from rpc_coletor_transferencia_picking via transferenciaService; they are guidance only and never replace rpc_validar_endereco_picking.

- Storage destination availability and recommendations come exclusively from the existing RPC; reuse storage-service helpers for preselection, offline availability and suggested quantities to keep the collector steps consistent.
- Collector display defaults and name visibility checks are shared through exibicaoColetor helpers so output-type forms and wave lists obey the same rules.
- Picking pending-task contracts, live status interpretation and ordering are shared through pendenciasPickingService and pendenciasPicking.types so web and collector use the same backend status without hiding pending work.
- Product group filter options come from the dedicated RPC through the product listing service, while product editing keeps the complete group catalogue; this avoids empty filter groups without restricting registration.
- Asynchronous product printing reserves its window in the click handler and passes it to the shared PDF exporter; this preserves browser popup authorization.
- Storage item-list scans accept only packaging EANs (or an HU to locate the task); resolution and the EAN handoff to the start step go through armazenagemService helpers, so the start step only skips its own EAN check for the same task.
- Receiving movement status shown in the collector comes from recebimentoStatus helpers; storage statuses (LIB_ARMAZENAGEM / ARMAZENAGEM_PARCIAL) stay in the conference list while items are pending and are flagged as storage in parallel, since the backend never moves them back to EM_CONFERENCIA.
- Editor de fluxos de retorno: limites de nós/ligações vêm sempre de catalogo.limites (fallback 0 / max_nos*2), nunca de constantes no frontend; travessias de grafo passam por indexarGrafo (saidasAnteriores.ts), memoizado pela página e sem teto de profundidade; o estado do canvas é dividido em EditorEstaticoContext e EditorDinamicoContext para evitar re-render de todos os nós a cada edição.
- Separation cut permission is decided only by the corte_verificar_acesso RPC through useCorteAcesso (fail-safe: require supervisor); supervisor credentials live only in AutorizacaoCorteSheet component state and go solely to the autorizar-corte function.
- Envio manual de retorno ao ERP passa sempre por useEnviarAoErp + ConfirmarEnvioErpDialog (retornos/components): pré-checagem via integracao_retorno_verificar_envio e descarte de bloqueios só com confirmação explícita (p_descartar_bloqueios); a RPC recusa sem a flag, então não chame executar("manual") direto em telas novas.
