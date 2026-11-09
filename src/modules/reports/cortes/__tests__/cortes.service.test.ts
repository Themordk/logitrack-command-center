import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchCortesReport,
  fetchMotivosCorte,
  extrairMensagemErroCortes,
} from "../cortes.service";
import { fetchAllRpcRows } from "../../utils/fetchAllRpcRows";
import { supabase } from "@/integrations/supabase/client";

vi.mock("../../utils/fetchAllRpcRows", () => ({
  fetchAllRpcRows: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const fetchAllRpcRowsMock = fetchAllRpcRows as unknown as ReturnType<typeof vi.fn>;
const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const filtroBase = {
  tenant_id: "t1",
  empresa_id: "e1",
  data_inicio: "2026-11-01",
  data_fim: "2026-11-09",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchCortesReport", () => {
  it("envia opcionais vazios como null (motivo_ids [] e tem_saldo undefined viram null)", async () => {
    fetchAllRpcRowsMock.mockResolvedValue([]);

    await fetchCortesReport({ ...filtroBase, motivo_ids: [] });

    expect(fetchAllRpcRowsMock).toHaveBeenCalledWith("fn_relatorio_cortes", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_data_inicio: "2026-11-01",
      p_data_fim: "2026-11-09",
      p_motivo_ids: null,
      p_usuario_autorizou_id: null,
      p_sku: null,
      p_tem_saldo: null,
    });
  });

  it("envia motivo_ids, sku aparado, autorizador e tem_saldo quando preenchidos", async () => {
    fetchAllRpcRowsMock.mockResolvedValue([]);

    await fetchCortesReport({
      ...filtroBase,
      motivo_ids: ["m1", "m2"],
      sku: "  ABC  ",
      usuario_autorizou_id: "u1",
      tem_saldo: "SIM",
    });

    expect(fetchAllRpcRowsMock).toHaveBeenCalledWith("fn_relatorio_cortes", {
      p_tenant_id: "t1",
      p_empresa_id: "e1",
      p_data_inicio: "2026-11-01",
      p_data_fim: "2026-11-09",
      p_motivo_ids: ["m1", "m2"],
      p_usuario_autorizou_id: "u1",
      p_sku: "ABC",
      p_tem_saldo: "SIM",
    });
  });

  it("converte numéricos e preserva saldo_disponivel_no_corte null", async () => {
    fetchAllRpcRowsMock.mockResolvedValue([
      {
        id: "1",
        movimento_saida_id: "ms1",
        numero_onda: "10",
        produto_id: "p1",
        sku: "SKU1",
        descricao: "Produto 1",
        qtde_cortada: "3",
        preco_custo: "12.5",
        custo_total: "37.5",
        saldo_disponivel_no_corte: null,
        tem_saldo: "SEM_REGISTRO",
        motivo_id: "m1",
        motivo: "PRODUTO EM FALTA",
        solicitante_login: "op1",
        solicitante_nome: "Operador",
        autorizador_login: "sup1",
        autorizador_nome: "Supervisor",
        metodo: "SENHA",
        autorizado_em: "2026-11-09T23:30:00",
      },
      {
        id: "2",
        movimento_saida_id: "ms2",
        numero_onda: "11",
        produto_id: "p2",
        sku: "SKU2",
        descricao: "Produto 2",
        qtde_cortada: "2",
        preco_custo: "10",
        custo_total: "20",
        saldo_disponivel_no_corte: "15",
        tem_saldo: "SIM",
        motivo_id: null,
        motivo: null,
        solicitante_login: null,
        solicitante_nome: null,
        autorizador_login: null,
        autorizador_nome: null,
        metodo: null,
        autorizado_em: "2026-11-09T10:00:00",
      },
    ]);

    const rows = await fetchCortesReport(filtroBase);

    expect(rows).toHaveLength(2);
    expect(rows[0].numero_onda).toBe(10);
    expect(rows[0].qtde_cortada).toBe(3);
    expect(rows[0].preco_custo).toBe(12.5);
    expect(rows[0].custo_total).toBe(37.5);
    expect(rows[0].saldo_disponivel_no_corte).toBeNull();
    expect(rows[1].saldo_disponivel_no_corte).toBe(15);
  });

  it("propaga o erro da RPC para a página tratar", async () => {
    fetchAllRpcRowsMock.mockRejectedValue(
      new Error("PERIODO_MUITO_LONGO: o período máximo é de 1 ano."),
    );

    await expect(fetchCortesReport(filtroBase)).rejects.toThrow("PERIODO_MUITO_LONGO");
  });
});

describe("fetchMotivosCorte", () => {
  it("chama a RPC com o tenant e retorna as opções agrupadas", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { descricao: "PRODUTO AVARIADO", motivo_ids: ["m1", "m2"], ativo: true },
        { descricao: "PRODUTO EM FALTA", motivo_ids: ["m3"], ativo: false },
      ],
    });

    const motivos = await fetchMotivosCorte("t1");

    expect(rpcMock).toHaveBeenCalledWith("fn_relatorio_cortes_motivos", { p_tenant_id: "t1" });
    expect(motivos).toHaveLength(2);
    expect(motivos[0].motivo_ids).toEqual(["m1", "m2"]);
    expect(motivos[1].ativo).toBe(false);
  });

  it("retorna lista vazia quando a RPC não traz dados", async () => {
    rpcMock.mockResolvedValue({ data: null });
    expect(await fetchMotivosCorte("t1")).toEqual([]);
  });
});

describe("extrairMensagemErroCortes", () => {
  it("remove o prefixo CODIGO: da mensagem da RPC", () => {
    expect(
      extrairMensagemErroCortes(new Error("EMPRESA_OBRIGATORIA: selecione uma empresa para gerar o relatório.")),
    ).toBe("selecione uma empresa para gerar o relatório.");
    expect(
      extrairMensagemErroCortes(new Error("PERIODO_MUITO_LONGO: o período máximo é de 1 ano.")),
    ).toBe("o período máximo é de 1 ano.");
  });

  it("mantém a mensagem genérica quando não há prefixo de código", () => {
    expect(extrairMensagemErroCortes(new Error("network failed"))).toBe("Erro ao gerar relatório.");
    expect(extrairMensagemErroCortes({})).toBe("Erro ao gerar relatório.");
  });
});
