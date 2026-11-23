import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  fetchItensDetalheOnda,
  fetchListaOndas,
  invalidarOnda,
  invalidarTodasOndas,
  normalizarLinhaLista,
  ondasKeys,
  revalidarSeAntigo,
  rotulosOperadores,
  type FiltrosListaOndas,
} from "@/lib/ondaCarregamentoService";

const filtros: FiltrosListaOndas = {
  empresaId: "e", status: null, dataDe: "2026-11-22", dataAte: "2026-11-22", numeroOnda: null, numeroDocumento: null,
  numeroNf: null, tipoSaidaId: null, parceiroCodigoErp: null, vendedor: null, transportador: null, sku: null, page: 1, pageSize: 20,
};

describe("ondaCarregamentoService", () => {
  beforeEach(() => rpc.mockReset());

  it("rótulos de operadores seguem a regra da tela antiga (ativos primeiro, etapas agrupadas)", () => {
    expect(rotulosOperadores([
      { nome: "Lucas", codigo: "SEP", ativo: false },
      { nome: "Lucas", codigo: "SEP-CONF", ativo: false },
      { nome: "Ana", codigo: null, ativo: true },
      { nome: "Bia", codigo: "OUTRA", ativo: false },
    ])).toEqual(["Ana", "Bia", "Lucas (SEP, CONF)"]);
    expect(rotulosOperadores(null)).toEqual([]);
  });

  it("lista: uma chamada com todos os filtros e linha normalizada", async () => {
    rpc.mockResolvedValue({
      data: [{ id: "o1", numero_onda: 10, status: "LIBERADO", total_itens: "3", total_esperado: "5", total_registros: "1",
        tipo_saida_descricao: "Venda", integracao_resumo: "ok", operadores: [{ nome: "Ana", codigo: "SEP", ativo: true }],
        docs_sem_nf: null, qtd_sem_saldo: "2" }],
      error: null,
    });
    const r = await fetchListaOndas(filtros);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("rpc_ondas_carregamento_lista");
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_empresa_id: "e", p_data_de: "2026-11-22", p_page: 1, p_page_size: 20 });
    expect(r[0]).toMatchObject({ total_itens: 3, total_esperado: 5, operadores: ["Ana (SEP)"], docs_sem_nf: null, qtd_sem_saldo: 2, tipo_saida_descricao: "Venda" });
  });

  it("docs_sem_nf: 0 vira número (selo só quando a RPC devolve valor)", () => {
    expect(normalizarLinhaLista({ id: "x", docs_sem_nf: 2, operadores: "[]" }).docs_sem_nf).toBe(2);
    expect(normalizarLinhaLista({ id: "x" }).docs_sem_nf).toBeNull();
  });

  it("detalhe itens: pendências e contagens vêm na mesma chamada", async () => {
    rpc.mockResolvedValue({
      data: { cabecalho: { movimento_id: "o1", numero_onda: 1, status: "EM_PICKING" }, itens: [{ id: "i", qtd_esperada: "2", qtd_separada: null }],
        pendencias: [{ movimento_saida_item_id: "i", situacao_saldo: "SEM_SALDO_PICKING" }], contagens: { separacao: "1", conferencia: 0, documentos: 2 } },
      error: null,
    });
    const r = await fetchItensDetalheOnda("o1");
    expect(rpc).toHaveBeenCalledWith("rpc_onda_carregamento_detalhe", { p_movimento_id: "o1", p_secao: "itens" });
    expect(r.itens[0]).toMatchObject({ qtd_esperada: 2, qtd_separada: 0 });
    expect(r.pendencias).toHaveLength(1);
    expect(r.contagens).toEqual({ separacao: 1, conferencia: 0, documentos: 2 });
  });

  it("ação numa onda invalida a lista e o detalhe DAQUELA onda, mesmo não selecionada", async () => {
    const qc = new QueryClient();
    qc.setQueryData(ondasKeys.lista("t", filtros), []);
    qc.setQueryData(ondasKeys.secao("t", "o1", "separacao"), [{ a: 1 }]);
    qc.setQueryData(ondasKeys.secao("t", "o2", "separacao"), [{ a: 1 }]);
    await invalidarOnda(qc, "t", "o1");
    expect(qc.getQueryState(ondasKeys.lista("t", filtros))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(ondasKeys.secao("t", "o1", "separacao"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(ondasKeys.secao("t", "o2", "separacao"))?.isInvalidated).toBe(false);
  });

  it("Filtrar invalida todas as listas e todos os detalhes do tenant", async () => {
    const qc = new QueryClient();
    qc.setQueryData(ondasKeys.secao("t", "o1", "itens"), {});
    qc.setQueryData(ondasKeys.secao("t", "o2", "conferencia"), []);
    qc.setQueryData(ondasKeys.secao("outro", "o3", "itens"), {});
    await invalidarTodasOndas(qc, "t");
    expect(qc.getQueryState(ondasKeys.secao("t", "o1", "itens"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(ondasKeys.secao("t", "o2", "conferencia"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(ondasKeys.secao("outro", "o3", "itens"))?.isInvalidated).toBe(false);
  });

  it("revalidarSeAntigo só busca quando os dados exibidos passaram do limite", () => {
    const refetch = vi.fn();
    revalidarSeAntigo({ data: [], dataUpdatedAt: Date.now(), isFetching: false, refetch });
    expect(refetch).not.toHaveBeenCalled();
    revalidarSeAntigo({ data: [], dataUpdatedAt: Date.now() - 10_000, isFetching: false, refetch });
    expect(refetch).toHaveBeenCalledTimes(1);
    revalidarSeAntigo({ data: [], dataUpdatedAt: 0, isFetching: true, refetch });
    revalidarSeAntigo({ data: undefined, dataUpdatedAt: 0, isFetching: false, refetch });
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
