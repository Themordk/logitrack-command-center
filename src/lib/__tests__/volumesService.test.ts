import { describe, it, expect, vi, beforeEach } from "vitest";
import { volumesService, VolumeRpcError } from "../volumesService";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

const rpcMock = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe("volumesService", () => {
  beforeEach(() => rpcMock.mockReset());

  it("chama a RPC com o cliente como this (sem ele o supabase-js falha antes de enviar)", async () => {
    const thisRecebidos: unknown[] = [];
    rpcMock.mockImplementation(function (this: unknown) {
      thisRecebidos.push(this);
      return Promise.resolve({ data: { sucesso: true, codigo: "OK", dados: { linhas: [], total: 0, pagina: 1, tamanho: 50, resumo: {} } }, error: null });
    });
    await volumesService.listar("e1", { busca: " VOL-1 ", status: "" }, 1, 50);
    expect(thisRecebidos[0]).toBe(supabase);
    expect(rpcMock).toHaveBeenCalledWith("rpc_volumes_listar", { p_empresa_id: "e1", p_filtros: { busca: "VOL-1" }, p_pagina: 1, p_tamanho: 50 });
  });

  it("erro de negócio vira VolumeRpcError com o código do servidor", async () => {
    rpcMock.mockResolvedValue({ data: { sucesso: false, codigo: "SEM_PERMISSAO", mensagem: "Sem permissão." }, error: null });
    await expect(volumesService.detalhe("v1")).rejects.toMatchObject({ codigo: "SEM_PERMISSAO", message: "Sem permissão." });
    await expect(volumesService.detalhe("v1")).rejects.toBeInstanceOf(VolumeRpcError);
  });

  it("imprimir devolve a resposta inteira, inclusive o pedido de motivo", async () => {
    rpcMock.mockResolvedValue({ data: { sucesso: false, codigo: "MOTIVO_REIMPRESSAO_OBRIGATORIO", ja_impressos: ["VOL-1"] }, error: null });
    const r = await volumesService.imprimir({ volumeIds: ["v1"], armazemId: "a1", impressoraId: null, templateId: null, copias: 1, motivo: "  " });
    expect(r.codigo).toBe("MOTIVO_REIMPRESSAO_OBRIGATORIO");
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_motivo: null, p_volume_ids: ["v1"] });
  });
});
