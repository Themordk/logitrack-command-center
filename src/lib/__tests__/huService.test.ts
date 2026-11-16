import { describe, it, expect, vi, beforeEach } from "vitest";
import { huService, HuRpcError, acoesHU, pareceCodigoHU } from "../huService";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe("huService", () => {
  beforeEach(() => rpcMock.mockReset());

  it("gerar chama rpc_hu_gerar com o cliente como this e números vazios como null", async () => {
    const thisRecebidos: unknown[] = [];
    rpcMock.mockImplementation(function (this: unknown) {
      thisRecebidos.push(this);
      return Promise.resolve({ data: { sucesso: true, hus: [{ hu_id: "h1", codigo_hu: "HU-000000001" }] }, error: null });
    });
    const r = await huService.gerar({ quantidade: 2, tipo_hu: "PALLET", tamanho: "M", empresa_id: "e1", peso_bruto: "", m3: "1.5" });
    expect(thisRecebidos[0]).toBe(supabase);
    expect(rpcMock).toHaveBeenCalledWith("rpc_hu_gerar", {
      p_quantidade: 2, p_tipo_hu: "PALLET", p_tamanho: "M", p_empresa_id: "e1", p_armazem_id: null,
      p_peso_bruto: null, p_m3: 1.5, p_altura: null,
    });
    expect(r.hus[0].codigo_hu).toBe("HU-000000001");
  });

  it("erro de negócio vira HuRpcError com o código do servidor", async () => {
    rpcMock.mockResolvedValue({ data: { sucesso: false, codigo: "HU_VAZIA", mensagem: "A HU está vazia." }, error: null });
    await expect(huService.fechar("h1")).rejects.toMatchObject({ codigo: "HU_VAZIA", message: "A HU está vazia." });
    await expect(huService.fechar("h1")).rejects.toBeInstanceOf(HuRpcError);
  });

  it("reabrir e descartar mandam o motivo sem espaços nas pontas", async () => {
    rpcMock.mockResolvedValue({ data: { sucesso: true }, error: null });
    await huService.reabrir("h1", "  faltou item ");
    expect(rpcMock).toHaveBeenLastCalledWith("rpc_hu_reabrir", { p_hu_id: "h1", p_observacao: "faltou item" });
    await huService.descartar("h2", " etiqueta rasgada");
    expect(rpcMock).toHaveBeenLastCalledWith("rpc_hu_descartar", { p_hu_id: "h2", p_observacao: "etiqueta rasgada" });
  });
});

describe("acoesHU", () => {
  it("segue o ciclo de vida", () => {
    expect(acoesHU("ABERTA")).toEqual({ editar: true, fechar: true, reabrir: false, descartar: true });
    expect(acoesHU("FECHADA")).toEqual({ editar: true, fechar: false, reabrir: true, descartar: false });
    expect(acoesHU("ARMAZENADA")).toEqual({ editar: true, fechar: false, reabrir: false, descartar: false });
    expect(acoesHU("DESCARTADA")).toEqual({ editar: false, fechar: false, reabrir: false, descartar: false });
  });
});

describe("armazenagem da HU (H2)", () => {
  beforeEach(() => rpcMock.mockReset());

  it("resumo manda o código em maiúsculas e armazenar manda HU e endereço", async () => {
    rpcMock.mockResolvedValue({ data: { sucesso: true, hu: {}, itens: [], pode_armazenar: false, motivo: null }, error: null });
    await huService.armazenagemResumo(" hu-000000012 ");
    expect(rpcMock).toHaveBeenLastCalledWith("rpc_coletor_hu_armazenagem", { p_codigo_hu: "HU-000000012" });
    await huService.armazenar("h1", "e1");
    expect(rpcMock).toHaveBeenLastCalledWith("rpc_coletor_armazenar_hu", { p_hu_id: "h1", p_endereco_destino_id: "e1" });
  });

  it("reconhece código de HU", () => {
    expect(pareceCodigoHU("HU-000000012")).toBe(true);
    expect(pareceCodigoHU(" hu-12 ")).toBe(true);
    expect(pareceCodigoHU("7891234567895")).toBe(false);
    expect(pareceCodigoHU("HU-ABC")).toBe(false);
  });
});
