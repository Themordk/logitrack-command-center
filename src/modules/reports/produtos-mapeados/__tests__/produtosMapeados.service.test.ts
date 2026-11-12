import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchProdutosMapeadosPage,
  fetchProdutosMapeadosAll,
  type ProdutosMapeadosFilter,
} from "../produtosMapeados.service";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const filtroBase: ProdutosMapeadosFilter = { tenant_id: "t1", empresa_id: "e1" };

const linhaBackend = (id: string) => ({
  picking_id: id,
  produto_id: `p-${id}`,
  sku: `SKU-${id}`,
  referencia: null,
  descricao: "Produto",
  marca: "AESA",
  parceiro_id: "par-1",
  parceiro_nome: "FORNECEDOR LTDA",
  endereco_id: "end-1",
  endereco_descricao: "R18-P02-N01-A101",
  rua: 18, predio: 2, nivel: 1, apto: 101,
  est_minimo: "5.000",
  est_maximo: "20",
  tipo_picking: "FRACIONADO",
  mapeado_em: "2026-11-12T16:27:38Z",
  mapeado_por: "JOAO OPERADOR",
  total_registros: "6875",
});

describe("produtosMapeados.service", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("envia filtros (datas e endereço) como parâmetros da RPC", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await fetchProdutosMapeadosPage({
      ...filtroBase,
      armazem_id: "a1",
      sku: "  901 ",
      marca: "AESA",
      parceiro_id: "par-1",
      data_inicio: "2026-11-01",
      data_fim: "2026-11-12",
      rua: 18,
      apto: 0,
    }, 2);
    expect(rpcMock).toHaveBeenCalledWith("rpc_relatorio_produtos_mapeados", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_armazem_id: "a1",
      p_sku: "901",
      p_marca: "AESA",
      p_parceiro_id: "par-1",
      p_data_inicio: "2026-11-01",
      p_data_fim: "2026-11-12",
      p_rua: 18,
      p_predio: null,
      p_nivel: null,
      p_apto: 0, // zero é filtro válido
      p_limit: 100,
      p_offset: 200,
    });
  });

  it("converte numéricos, data e usuário do mapeamento e lê o total", async () => {
    rpcMock.mockResolvedValue({ data: [linhaBackend("1")], error: null });
    const { rows, total } = await fetchProdutosMapeadosPage(filtroBase, 0);
    expect(total).toBe(6875);
    expect(rows[0]).toMatchObject({
      picking_id: "1",
      est_minimo: 5, est_maximo: 20,
      rua: 18, apto: 101,
      mapeado_em: "2026-11-12T16:27:38Z",
      mapeado_por: "JOAO OPERADOR",
    });
  });

  it("mapeamento sem auditoria vem com data nula e usuário vazio", async () => {
    rpcMock.mockResolvedValue({ data: [{ ...linhaBackend("1"), mapeado_em: null, mapeado_por: null }], error: null });
    const { rows } = await fetchProdutosMapeadosPage(filtroBase, 0);
    expect(rows[0].mapeado_em).toBeNull();
    expect(rows[0].mapeado_por).toBe("");
  });

  it("sem linhas devolve total zero e propaga erro da RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    expect((await fetchProdutosMapeadosPage(filtroBase, 0)).total).toBe(0);
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "Data final não pode ser anterior à data inicial" } });
    await expect(fetchProdutosMapeadosPage(filtroBase, 0)).rejects.toMatchObject({
      message: "Data final não pode ser anterior à data inicial",
    });
  });

  it("exportação busca todas as páginas de 1000 e mantém a ordem", async () => {
    rpcMock.mockImplementation((_n: string, p: { p_offset: number }) =>
      Promise.resolve({
        data: Array.from({ length: Math.min(1000, 6875 - p.p_offset) }, (_, i) => linhaBackend(String(p.p_offset + i))),
        error: null,
      }),
    );
    const rows = await fetchProdutosMapeadosAll(filtroBase, 6875);
    expect(rpcMock).toHaveBeenCalledTimes(7);
    expect(rows).toHaveLength(6875);
    expect(rows[3000].picking_id).toBe("3000");
    expect(rows[6874].picking_id).toBe("6874");
  });
});
