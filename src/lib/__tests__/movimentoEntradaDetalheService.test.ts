import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  detalheEntradaKeys,
  fetchArmazenagemDetalheEntrada,
  fetchInformacoesDetalheEntrada,
  fetchItensDetalheEntrada,
  normalizarItensDetalhe,
} from "@/lib/movimentoEntradaDetalheService";

describe("movimentoEntradaDetalheService", () => {
  beforeEach(() => rpc.mockReset());

  it("chama a RPC uma vez por aba, com a seção certa", async () => {
    rpc.mockResolvedValue({ data: { armazenagem: [] }, error: null });
    await fetchArmazenagemDetalheEntrada("mov-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("rpc_movimento_entrada_detalhe", { p_movimento_id: "mov-1", p_secao: "armazenagem" });
  });

  it("normaliza números e alertas da seção itens (aceita jsonb como string)", async () => {
    rpc.mockResolvedValue({
      data: JSON.stringify({
        cabecalho: { movimento_id: "mov-1", numero_movimento: 717, status: "EM_CONFERENCIA", armazem_id: "a" },
        itens: [{ movimento_item_id: "i1", sku: "1", descricao: "X", qtd_esperada: "23", qtd_conferida: null, qtd_armazenada: "0", qtd_ocorrencia: 0, status_item_movimento: "EM_ANDAMENTO", sem_picking: true, sem_ean: false }],
        contagens: { conferencias: "2", armazenagens: 0, documentos: 1 },
      }),
      error: null,
    });
    const r = await fetchItensDetalheEntrada("mov-1");
    expect(r.cabecalho.status).toBe("EM_CONFERENCIA");
    expect(r.itens[0]).toMatchObject({ qtd_esperada: 23, qtd_conferida: 0, qtd_armazenada: 0, sem_picking: true, sem_ean: false });
    expect(r.contagens).toEqual({ conferencias: 2, armazenagens: 0, documentos: 1 });
  });

  it("propaga o erro da RPC (ex.: MOVIMENTO_NAO_ENCONTRADO) para a aba mostrar", async () => {
    const erro = { message: '{"codigo":"MOVIMENTO_NAO_ENCONTRADO","mensagem":"x"}' };
    rpc.mockResolvedValue({ data: null, error: erro });
    await expect(fetchItensDetalheEntrada("mov-1")).rejects.toBe(erro);
  });

  it("informações: mantém nulos e converte valores", async () => {
    rpc.mockResolvedValue({
      data: {
        informacoes: { movimento_id: "m", numero_movimento: "5", status: "GERADO", total_volume: null, valor_descarga: "10.5", confirma_volume: null, crossdocking: true },
        documentos: [{ documento_entrada_id: "d", numero_nota: "123", razaosocial: null, valor_total_nota: "99.9", qtd_volume: null, total_skus: "3" }],
      },
      error: null,
    });
    const r = await fetchInformacoesDetalheEntrada("m");
    expect(r.informacoes).toMatchObject({ numero_movimento: 5, total_volume: null, valor_descarga: 10.5, confirma_volume: false, crossdocking: true });
    expect(r.documentos[0]).toMatchObject({ valor_total_nota: 99.9, qtd_volume: null, total_skus: 3 });
  });

  it("chaves de cache: a do movimento é prefixo de todas as abas (invalidação por movimento)", () => {
    const mov = detalheEntradaKeys.movimento("t", "m");
    for (const s of ["itens", "conferencia", "armazenagem", "informacoes"] as const) {
      expect(detalheEntradaKeys.secao("t", "m", s).slice(0, mov.length)).toEqual([...mov]);
    }
    expect(detalheEntradaKeys.secao("t", "m", "itens")).not.toEqual(detalheEntradaKeys.secao("t", "outro", "itens"));
  });

  it("normalizarItensDetalhe tolera contagens ausentes", () => {
    const r = normalizarItensDetalhe({ cabecalho: { movimento_id: "m", numero_movimento: 1, status: "GERADO", armazem_id: null }, itens: [], contagens: undefined as never });
    expect(r.contagens).toEqual({ conferencias: 0, armazenagens: 0, documentos: 0 });
  });
});
