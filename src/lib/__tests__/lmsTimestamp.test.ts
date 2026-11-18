import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const enqueueAction = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/lib/offlineStore", () => ({ enqueueAction: (...a: unknown[]) => enqueueAction(...a) }));

import { assumirTarefas, iniciarContexto, iniciarHU, iniciarTarefas, limparInicioRecentes, markTarefaIniciadaByTarefa } from "../lmsTimestamp";

const online = (v: boolean) => Object.defineProperty(window.navigator, "onLine", { value: v, configurable: true });

describe("lmsTimestamp — início real no servidor (Fase 2)", () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: { sucesso: true }, error: null });
    enqueueAction.mockReset().mockResolvedValue("id");
    limparInicioRecentes();
    localStorage.setItem("core_tenant_id", "tenant-1");
    localStorage.setItem("core_usuario_id", "user-1");
    online(true);
  });

  it("chama rpc_tarefa_iniciar com as tarefas, o gatilho e o horário do bipe", async () => {
    await iniciarTarefas(["t1", "t2", null, "t1"], "BIPE_ENDERECO");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [nome, params] = rpc.mock.calls[0];
    expect(nome).toBe("rpc_tarefa_iniciar");
    expect(params.p_tarefa_ids).toEqual(["t1", "t2"]);
    expect(params.p_gatilho).toBe("BIPE_ENDERECO");
    expect(params.p_usuario_id).toBe("user-1");
    expect(Number.isNaN(Date.parse(params.p_ocorrido_em))).toBe(false);
  });

  it("não repete a mesma marcação a cada render (o servidor já é idempotente)", async () => {
    await markTarefaIniciadaByTarefa("t1", "user-1");
    await markTarefaIniciadaByTarefa("t1", "user-1");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("sem rede vai para a fila offline com o horário do bipe, sem lançar erro", async () => {
    online(false);
    await expect(iniciarTarefas(["t9"], "ABERTURA_TAREFA")).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
    expect(enqueueAction).toHaveBeenCalledTimes(1);
    const [nome, params, ctx] = enqueueAction.mock.calls[0];
    expect(nome).toBe("rpc_tarefa_iniciar");
    expect(params.p_ocorrido_em).toBeTruthy();
    expect(ctx).toEqual({ tenantId: "tenant-1", usuarioId: "user-1" });
  });

  it("falha de rede no meio da chamada também enfileira", async () => {
    rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    await iniciarTarefas(["t3"], "BIPE_PRODUTO");
    expect(enqueueAction).toHaveBeenCalledTimes(1);
  });

  it("recusa de regra (tarefa de outro operador) não enfileira nem trava o operador", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "USUARIO_DIVERGENTE", code: "42501" } });
    await expect(iniciarTarefas(["t4"], "BIPE_PRODUTO")).resolves.toBeUndefined();
    expect(enqueueAction).not.toHaveBeenCalled();
  });

  it("pré-início de contexto leva tenant, tipo e chave", async () => {
    await iniciarContexto("TRANSFERENCIA", "end-1");
    const [nome, params] = rpc.mock.calls[0];
    expect(nome).toBe("rpc_contexto_iniciar");
    expect(params).toMatchObject({ p_tenant_id: "tenant-1", p_contexto_tipo: "TRANSFERENCIA", p_contexto_chave: "end-1" });
  });

  it("assumir na lista grava a atribuição com o horário da escolha", async () => {
    await assumirTarefas(["t7"]);
    const [nome, params] = rpc.mock.calls[0];
    expect(nome).toBe("rpc_tarefa_assumir");
    expect(params.p_tarefa_ids).toEqual(["t7"]);
    expect(params.p_ocorrido_em).toBeTruthy();
  });

  it("início por HU delega ao servidor", async () => {
    await iniciarHU("hu-1");
    expect(rpc.mock.calls[0][0]).toBe("rpc_tarefa_iniciar_hu");
    expect(rpc.mock.calls[0][1].p_hu_id).toBe("hu-1");
  });
});
