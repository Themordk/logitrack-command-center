import type { EntidadeDocumentoEvento, FiltrosEventos, FonteEvento } from "./eventosDocumento.types";

export const eventosDocumentoKeys = {
  lista: (tenantId: string, empresaId: string, entidade: EntidadeDocumentoEvento, documentoId: string, filtros: FiltrosEventos) =>
    ["doc-eventos", tenantId, empresaId, entidade, documentoId, filtros] as const,
  listaBase: (tenantId: string, empresaId: string, entidade: EntidadeDocumentoEvento, documentoId: string) =>
    ["doc-eventos", tenantId, empresaId, entidade, documentoId] as const,
  detalhe: (fonte: FonteEvento, id: string) => ["doc-evento-detalhe", fonte, id] as const,
};
