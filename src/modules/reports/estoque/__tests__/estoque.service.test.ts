import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchEstoquePage, fetchEstoqueAll, type EstoqueFilter } from "../estoque.service";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const filtroBase: EstoqueFilter = { tenant_id: "t1", empresa_id: "e1" };

const linhaBackend = (id: string) => ({
  id,
  produto_id: `p-${id}`,
  sku: `SKU-${id}`,
  descricao: "Produto",
  marca: "AESA",
  fator_caixa: 12,
  preco_custo: "10.5",
  lote: "",
  data_validade: "1900-01-01",
  numero_serie: null,
  endereco_id: "end-1",
  codigo_endereco: "1023",
  endereco_descricao: "R18-P02-N01-A101",
  tipo_endereco: "PICKING",
  armazem_id: "a1",
  setor_id: "s1",
  tipo_estoque_id: "te1",
  rua: 18, predio: 2, nivel: 1, apto: 101,
  quantidade_disponivel: "8",
  quantidade_bloqueada: "2",
  quantidade_total: "10",
  valor_total: "105",
  vencido: false,
  enderecos_do_sku: 2,
  atualizado_em: "2026-11-12T14:00:00+00:00",
  total_registros: "25267",
  qtd_skus: "24748",
  qtd_skus_multi: "499",
  qtd_enderecos: "2580",
  pos_picking: "25267",
  pos_pulmao: "0",
  saldo_total: "269443",
  saldo_disponivel: "269443",
  saldo_bloqueado: "0",
  pos_bloqueadas: "0",
  valor_estoque: "9676109.12",
  qtd_skus_sem_custo: "224",
  pos_vencidas: "0",
  saldo_vencido: "0",
  pos_sem_atualizacao: "0",
});

describe("estoque.service", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("envia todos os filtros como parâmetros da RPC", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await fetchEstoquePage({
      ...filtroBase,
      armazem_id: "a1",
      tipo_endereco: "PICKING",
      tipo_estoque_id: "te1",
      setor_id: "s1",
      codigo_endereco: 1023,
      rua: 0,
      grupo_id: "g1",
      marca: " AESA ",
      parceiro_id: "par-1",
      sku: " 901 ",
      ean: " 7890000000017 ",
      apenas_multi_localizacao: true,
      apenas_com_saldo: false,
    }, 3);
    expect(rpcMock).toHaveBeenCalledWith("rpc_relatorio_posicao_estoque", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_armazem_id: "a1",
      p_tipo_endereco: "PICKING",
      p_tipo_estoque_id: "te1",
      p_setor_id: "s1",
      p_codigo_endereco: 1023,
      p_rua: 0, // zero é filtro válido
      p_predio: null,
      p_nivel: null,
      p_apto: null,
      p_grupo_id: "g1",
      p_subgrupo_id: null,
      p_marca: "AESA",
      p_parceiro_id: "par-1",
      p_sku: "901",
      p_ean: "7890000000017",
      p_apenas_com_saldo: false,
      p_apenas_multi_localizacao: true,
      p_dias_sem_atualizacao: 90,
      p_limit: 100,
      p_offset: 300,
    });
  });

  it("por padrão traz só posições com saldo", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await fetchEstoquePage(filtroBase, 0);
    expect(rpcMock.mock.calls[0][1].p_apenas_com_saldo).toBe(true);
    expect(rpcMock.mock.calls[0][1].p_apenas_multi_localizacao).toBe(false);
  });

  it("converte numéricos e lê o resumo da primeira linha", async () => {
    rpcMock.mockResolvedValue({ data: [linhaBackend("1")], error: null });
    const { rows, resumo } = await fetchEstoquePage(filtroBase, 0);
    expect(rows[0]).toMatchObject({
      preco_custo: 10.5, codigo_endereco: 1023,
      quantidade_disponivel: 8, quantidade_bloqueada: 2, quantidade_total: 10,
      valor_total: 105, vencido: false, enderecos_do_sku: 2, numero_serie: "",
    });
    expect(resumo).toEqual({
      total: 25267, qtd_skus: 24748, qtd_skus_multi: 499, qtd_enderecos: 2580,
      pos_picking: 25267, pos_pulmao: 0,
      saldo_total: 269443, saldo_disponivel: 269443, saldo_bloqueado: 0, pos_bloqueadas: 0,
      valor_estoque: 9676109.12, qtd_skus_sem_custo: 224,
      pos_vencidas: 0, saldo_vencido: 0, pos_sem_atualizacao: 0,
    });
  });

  it("sem linhas devolve resumo zerado e propaga erro da RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    expect((await fetchEstoquePage(filtroBase, 0)).resumo.total).toBe(0);
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "empresa_id obrigatório" } });
    await expect(fetchEstoquePage(filtroBase, 0)).rejects.toMatchObject({ message: "empresa_id obrigatório" });
  });

  it("exportação busca todas as páginas de 1000 e mantém a ordem", async () => {
    rpcMock.mockImplementation((_n: string, p: { p_offset: number }) =>
      Promise.resolve({
        data: Array.from({ length: Math.min(1000, 25267 - p.p_offset) }, (_, i) => linhaBackend(String(p.p_offset + i))),
        error: null,
      }),
    );
    const rows = await fetchEstoqueAll(filtroBase, 25267);
    expect(rpcMock).toHaveBeenCalledTimes(26);
    expect(rows).toHaveLength(25267);
    expect(rows[12000].id).toBe("12000");
    expect(rows[25266].id).toBe("25266");
  });
});
