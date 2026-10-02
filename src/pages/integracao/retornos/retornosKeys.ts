import type { FiltrosExecucao } from "./retornos.types";

type Id = string | null;

export const retornosKeys = {
  catalogo: () => ["retorno-catalogo"] as const,
  config: (tenantId: Id, empresaId: Id, empresaVersion = 0) => ["retorno-config", tenantId, empresaId, empresaVersion] as const,
  fluxos: (tenantId: Id, empresaId: Id, incluirArquivados: boolean) => ["retorno-fluxos", tenantId, empresaId, incluirArquivados] as const,
  fluxo: (fluxoId: Id) => ["retorno-fluxo", fluxoId] as const,
  destinos: (tenantId: Id, empresaId: Id) => ["retorno-destinos", tenantId, empresaId] as const,
  mapa: (tenantId: Id, empresaId: Id, fluxoId: Id) => ["retorno-mapa", tenantId, empresaId, fluxoId] as const,
  execucoes: (tenantId: Id, empresaId: Id, filtros: FiltrosExecucao, pagina: number) =>
    ["retorno-execucoes", tenantId, empresaId, filtros, pagina] as const,
  execucao: (execucaoId: Id) => ["retorno-execucao", execucaoId] as const,
  versoes: (fluxoId: Id) => ["retorno-versoes", fluxoId] as const,
  docsRecentes: (tenantId: Id, empresaId: Id, evento: string, filtrosHash: string, busca: string) =>
    ["retorno-docs-recentes", tenantId, empresaId, evento, filtrosHash, busca] as const,
};
