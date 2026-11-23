import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { abrirSessaoColetor, CHAVE_SESSAO, encerrarSessaoColetor, heartbeatSessaoColetor, manterSessaoColetor } from "../sessaoColetor";

describe("sessaoColetor — sessão pelo servidor (Fase 3.1)", () => {
  beforeEach(() => {
    rpc.mockReset();
    localStorage.clear();
  });

  it("abre a sessão pelo servidor e guarda o id", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, dados: { sessao_id: "s1" } }, error: null });
    expect(await abrirSessaoColetor("t1", "u1")).toBe("s1");
    expect(rpc).toHaveBeenCalledWith("rpc_sessao_abrir", { p_tenant_id: "t1", p_usuario_id: "u1" });
    expect(localStorage.getItem(CHAVE_SESSAO)).toBe("s1");
  });

  it("heartbeat de sessão encerrada pelo servidor passa a usar a sessão nova", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, codigo: "SESSAO_REABERTA", dados: { sessao_id: "s2" } }, error: null });
    expect(await heartbeatSessaoColetor("s1")).toBe("s2");
    expect(localStorage.getItem(CHAVE_SESSAO)).toBe("s2");
  });

  it("heartbeat sem rede mantém a sessão atual", async () => {
    rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await heartbeatSessaoColetor("s1")).toBe("s1");
  });

  it("sem sessão guardada neste navegador, abre uma nova", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, dados: { sessao_id: "s9" } }, error: null });
    expect(await manterSessaoColetor(null, "t1", "u1")).toBe("s9");
    expect(rpc).toHaveBeenCalledWith("rpc_sessao_abrir", { p_tenant_id: "t1", p_usuario_id: "u1" });
    expect(localStorage.getItem(CHAVE_SESSAO)).toBe("s9");
  });

  it("sessão apagada no servidor: abre uma nova em vez de insistir no id antigo", async () => {
    rpc.mockResolvedValueOnce({ data: { sucesso: false, codigo: "SESSAO_INEXISTENTE" }, error: null })
       .mockResolvedValueOnce({ data: { sucesso: true, dados: { sessao_id: "s3" } }, error: null });
    expect(await manterSessaoColetor("velha", "t1", "u1")).toBe("s3");
    expect(rpc).toHaveBeenNthCalledWith(2, "rpc_sessao_abrir", { p_tenant_id: "t1", p_usuario_id: "u1" });
  });

  it("sessão ativa só recebe o sinal; sem login não faz nada", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, codigo: "SESSAO_ATIVA", dados: { sessao_id: "s1" } }, error: null });
    expect(await manterSessaoColetor("s1", "t1", "u1")).toBe("s1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await manterSessaoColetor(null, null, null)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("logout encerra no servidor e limpa o id", async () => {
    localStorage.setItem(CHAVE_SESSAO, "s1");
    rpc.mockResolvedValue({ data: { sucesso: true }, error: null });
    await encerrarSessaoColetor("s1");
    expect(rpc).toHaveBeenCalledWith("rpc_sessao_encerrar", { p_sessao_id: "s1" });
    expect(localStorage.getItem(CHAVE_SESSAO)).toBeNull();
  });
});
