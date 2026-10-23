 # Frontend rules
 
- Transfer picking hints come exclusively from rpc_coletor_transferencia_picking via transferenciaService; they are guidance only and never replace rpc_validar_endereco_picking.

- Storage destination availability and recommendations come exclusively from the existing RPC; reuse storage-service helpers for preselection, offline availability and suggested quantities to keep the collector steps consistent.
- Collector display defaults and name visibility checks are shared through exibicaoColetor helpers so output-type forms and wave lists obey the same rules.
- Picking pending-task contracts, live status interpretation and ordering are shared through pendenciasPickingService and pendenciasPicking.types so web and collector use the same backend status without hiding pending work.
- Product group filter options come from the dedicated RPC through the product listing service, while product editing keeps the complete group catalogue; this avoids empty filter groups without restricting registration.
- Asynchronous product printing reserves its window in the click handler and passes it to the shared PDF exporter; this preserves browser popup authorization.
- Storage item-list scans accept only packaging EANs (or an HU to locate the task); resolution and the EAN handoff to the start step go through armazenagemService helpers, so the start step only skips its own EAN check for the same task.
- Receiving movement status shown in the collector comes from recebimentoStatus helpers; storage statuses (LIB_ARMAZENAGEM / ARMAZENAGEM_PARCIAL) stay in the conference list while items are pending and are flagged as storage in parallel, since the backend never moves them back to EM_CONFERENCIA.
