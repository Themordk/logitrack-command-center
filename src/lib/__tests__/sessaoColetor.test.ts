import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { abrirSessaoColetor, CHAVE_SESSAO, encerrarSessaoColetor, heartbeatSessaoColetor } from "../sessaoColetor";

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

  it("logout encerra no servidor e limpa o id", async () => {
    localStorage.setItem(CHAVE_SESSAO, "s1");
    rpc.mockResolvedValue({ data: { sucesso: true }, error: null });
    await encerrarSessaoColetor("s1");
    expect(rpc).toHaveBeenCalledWith("rpc_sessao_encerrar", { p_sessao_id: "s1" });
    expect(localStorage.getItem(CHAVE_SESSAO)).toBeNull();
  });
});
