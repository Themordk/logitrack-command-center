import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from "@/integrations/supabase/client";
import { buscarPickingsTransferencia, excessoPicking, quantidadeNaEmbalagem } from "../transferenciaService";

describe("Contrato da consulta de picking da transferência", () => {
  beforeEach(() => { vi.mocked(supabase.rpc).mockReset(); localStorage.clear(); });
  it("usa a RPC exclusiva com contexto e aceita JSON string", async () => {
    localStorage.setItem("core_tenant_id", "tenant"); localStorage.setItem("core_empresa_id", "empresa"); localStorage.setItem("core_armazem_id", "armazem");
    const resposta = { sucesso: true, usa_picking: false, varios_pickings: false, pickings: [] };
    vi.mocked(supabase.rpc).mockResolvedValue({ data: JSON.stringify(resposta), error: null, count: null, status: 200, statusText: "OK" });
    await expect(buscarPickingsTransferencia({ produtoId: "produto", origemId: "origem" })).resolves.toEqual(resposta);
    expect(supabase.rpc).toHaveBeenCalledWith("rpc_coletor_transferencia_picking", { p_tenant_id: "tenant", p_empresa_id: "empresa", p_armazem_id: "armazem", p_produto_id: "produto", p_endereco_origem_id: "origem" });
  });
  it("lança erro quando sucesso é falso", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { sucesso: false, mensagem: "Produto não encontrado" }, error: null, count: null, status: 200, statusText: "OK" });
    await expect(buscarPickingsTransferencia({ produtoId: "produto", origemId: "origem" })).rejects.toThrow("Produto não encontrado");
  });
  it("sem picking não calcula excesso e fator 1 mantém UN", () => {
    expect(excessoPicking(undefined, 36)).toBe(0);
    expect(quantidadeNaEmbalagem(26, 1, "UN")).toBe("26 UN");
  });
});