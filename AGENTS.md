 # Frontend rules

- Storage destination availability and recommendations come exclusively from the existing RPC; reuse storage-service helpers for preselection, offline availability and suggested quantities to keep the collector steps consistent.
- Collector display defaults and name visibility checks are shared through exibicaoColetor helpers so output-type forms and wave lists obey the same rules.
- Picking pending-task contracts, live status interpretation and ordering are shared through pendenciasPickingService and pendenciasPicking.types so web and collector use the same backend status without hiding pending work.
