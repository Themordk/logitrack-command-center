import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Importacao } from "@/pages/integracao/retornos/retornos.types";

const svc = vi.hoisted(() => ({
  importacaoDisponivel: vi.fn(),
  iniciarImportacao: vi.fn(),
  obterImportacao: vi.fn(),
  confirmarImportacao: vi.fn(),
  cancelarImportacao: vi.fn(),
  invokeDispatcher: vi.fn(),
}));
vi.mock("@/pages/integracao/retornos/retornosService", () => svc);
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenantId: "t1", empresaId: "emp1" }) }));

import { useImportacaoFluxo } from "./useImportacaoFluxo";

const imp = (status: Importacao["status"], extra: Partial<Importacao> = {}): Importacao => ({
  execucao_id: "e1", importacao_id: "i1", evento: "importar.produto", entidade: "produto", tela: "Produtos",
  modo: "interativo", status, finalizado: ["sucesso", "erro", "filtrado", "descartado"].includes(status), valor: "4400619",
  parametros: {}, fluxo_id: "f1", fluxo_nome: "Omie — Produto", aguardando_confirmacao: status === "aguardando_confirmacao",
  confirmacao: status === "aguardando_confirmacao" ? { no_id: "confirmar_1", titulo: "Confirmar", mensagem: null, expira_em: null } : null,
  previa: status === "aguardando_confirmacao" ? { sku: "4400619" } : null,
  registro: status === "sucesso" ? { id: "p1", status: "inserido", gravado_em: null, dados: { id: "p1" } } : null,
  erro: null, erro_http_status: null, created_at: "2026-11-26T12:00:00Z", finalizado_em: null, passos: [],
  ...extra,
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const disponivel = (extra: Record<string, unknown> = {}) => [{
  evento: "importar.produto", entidade: "produto", tela: "Produtos", fluxos_ativos: 1, disponivel: true,
  fluxo_id: "f1", fluxo_nome: "Omie — Produto", tem_confirmacao: true, ...extra,
}];

describe("useImportacaoFluxo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.iniciarImportacao.mockResolvedValue({ execucao_id: "e1", importacao_id: "i1", status: "pendente", fluxo_id: "f1", fluxo_nome: "x", tem_confirmacao: true });
  });

  it("sem fluxo ativo: disponivel=false (a tela fica no caminho antigo)", async () => {
    svc.importacaoDisponivel.mockResolvedValue(disponivel({ fluxos_ativos: 0, disponivel: false, fluxo_id: null }));
    const { result } = renderHook(() => useImportacaoFluxo("importar.produto", true), { wrapper });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.disponivel).toBe(false);
    expect(result.current.ambiguo).toBe(false);
  });

  it("dois fluxos ativos: ambiguo", async () => {
    svc.importacaoDisponivel.mockResolvedValue(disponivel({ fluxos_ativos: 2, disponivel: false }));
    const { result } = renderHook(() => useImportacaoFluxo("importar.produto", true), { wrapper });
    await waitFor(() => expect(result.current.ambiguo).toBe(true));
  });

  it("buscar → prévia → confirmar → sucesso", async () => {
    svc.importacaoDisponivel.mockResolvedValue(disponivel());
    svc.invokeDispatcher
      .mockResolvedValueOnce({ executado: true, importacao: imp("aguardando_confirmacao") })
      .mockResolvedValueOnce({ executado: true, importacao: imp("sucesso") });
    svc.confirmarImportacao.mockResolvedValue(imp("pendente"));
    const { result } = renderHook(() => useImportacaoFluxo("importar.produto", true), { wrapper });
    await waitFor(() => expect(result.current.disponivel).toBe(true));

    await act(async () => { await result.current.buscar({ valor: "4400619" }); });
    expect(svc.iniciarImportacao).toHaveBeenCalledWith("t1", "emp1", "importar.produto", { valor: "4400619" });
    expect(svc.invokeDispatcher).toHaveBeenCalledWith({ acao: "executar_interativo", execucao_id: "e1" });
    expect(result.current.estado).toBe("aguardando");
    expect(result.current.importacao?.previa).toEqual({ sku: "4400619" });

    await act(async () => { await result.current.confirmar(); });
    expect(svc.confirmarImportacao).toHaveBeenCalledWith("e1");
    expect(result.current.estado).toBe("sucesso");
    expect(result.current.importacao?.registro?.id).toBe("p1");
  });

  it("busca barrada pelo filtro do gatilho: não chama o dispatcher", async () => {
    svc.importacaoDisponivel.mockResolvedValue(disponivel());
    svc.iniciarImportacao.mockResolvedValue({ execucao_id: "e1", importacao_id: "i1", status: "filtrado", fluxo_id: "f1", fluxo_nome: "x", tem_confirmacao: false });
    svc.obterImportacao.mockResolvedValue(imp("filtrado"));
    const { result } = renderHook(() => useImportacaoFluxo("importar.produto", true), { wrapper });
    await waitFor(() => expect(result.current.disponivel).toBe(true));
    await act(async () => { await result.current.buscar({ valor: "x" }); });
    expect(svc.invokeDispatcher).not.toHaveBeenCalled();
    expect(result.current.estado).toBe("filtrado");
  });

  it("erro do servidor vira mensagem do errorMapper", async () => {
    svc.importacaoDisponivel.mockResolvedValue(disponivel());
    svc.iniciarImportacao.mockRejectedValue({ message: "RETORNO_IMPORTACAO_SEM_PERMISSAO: requer web.dados-mestres.produtos/CREATE" });
    const { result } = renderHook(() => useImportacaoFluxo("importar.produto", true), { wrapper });
    await waitFor(() => expect(result.current.disponivel).toBe(true));
    await act(async () => { await result.current.buscar({ valor: "x" }); });
    expect(result.current.estado).toBe("erro");
    expect(result.current.erro?.titulo).toBe("Você não tem permissão para importar nesta tela.");
  });

  it("fechar o diálogo com a prévia aberta cancela a importação", async () => {
    svc.importacaoDisponivel.mockResolvedValue(disponivel());
    svc.invokeDispatcher.mockResolvedValueOnce({ executado: true, importacao: imp("aguardando_confirmacao") });
    svc.cancelarImportacao.mockResolvedValue(imp("descartado"));
    const { result, rerender } = renderHook(({ aberto }) => useImportacaoFluxo("importar.produto", aberto), {
      wrapper, initialProps: { aberto: true },
    });
    await waitFor(() => expect(result.current.disponivel).toBe(true));
    await act(async () => { await result.current.buscar({ valor: "4400619" }); });
    expect(result.current.estado).toBe("aguardando");
    rerender({ aberto: false });
    await waitFor(() => expect(svc.cancelarImportacao).toHaveBeenCalledWith("e1"));
  });
});
