import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { listarEventosDocumento } from "./eventosDocumentoService";
import { eventosDocumentoKeys } from "./eventosDocumentoKeys";
import type { EntidadeDocumentoEvento, FiltrosEventos } from "./eventosDocumento.types";

export const LIMITE_PAGINA_EVENTOS = 100;

interface Params {
  tenantId: string;
  empresaId: string;
  entidade: EntidadeDocumentoEvento;
  documentoId: string;
  filtros: FiltrosEventos;
  habilitado?: boolean;
}

export function useEventosDocumento({ tenantId, empresaId, entidade, documentoId, filtros, habilitado = true }: Params) {
  return useInfiniteQuery({
    queryKey: eventosDocumentoKeys.lista(tenantId, empresaId, entidade, documentoId, filtros),
    queryFn: ({ pageParam }) => listarEventosDocumento({
      tenantId, empresaId, entidade, documentoId,
      direcao: filtros.direcao,
      somenteProblemas: filtros.somenteProblemas,
      ordem: filtros.ordem,
      limite: LIMITE_PAGINA_EVENTOS,
      offset: pageParam,
    }),
    initialPageParam: 0,
    getNextPageParam: (ultima) => {
      const proximo = ultima.offset + ultima.eventos.length;
      return proximo < ultima.total_filtrado && ultima.eventos.length > 0 ? proximo : undefined;
    },
    enabled: habilitado && !!documentoId,
    placeholderData: keepPreviousData,
    retry: false,
    refetchInterval: (query) => ((query.state.data?.pages[0]?.resumo.pendentes ?? 0) > 0 ? 15_000 : false),
  });
}
