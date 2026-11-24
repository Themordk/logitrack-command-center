import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const minhas = vi.fn();
const tocarAlerta = vi.fn(() => true);

vi.mock("@/contexts/PermissionsContext", () => ({
  usePermissions: () => ({ can: (m: string) => m === "coletor.entregas", loading: false }),
}));
vi.mock("@/lib/entregaService", () => ({ entregaService: { minhas: (...a: unknown[]) => minhas(...a) } }));
vi.mock("@/pages/tv/tvAlertaSonoro", () => ({ tocarAlerta: () => tocarAlerta(), liberarAudio: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const canal = { on: () => canal, subscribe: () => canal };
  return { supabase: { channel: () => canal, removeChannel: vi.fn() } };
});

import { __resetEntregaAlerta, avisarEntregasAtualizadas, useEntregaPendenteAlerta } from "@/hooks/useEntregaPendenteAlerta";

const entrega = (status: string) => ({
  id: "e1", carga_id: "c1", numero_carga: 1042, status, veiculo: "Fiorino", placa: null, tipo_veiculo: "VUC",
  atribuida_em: "2026-11-23T10:00:00Z", aceita_em: null, total_paradas: 3, paradas_entregues: 0, paradas_nao_entregues: 0,
});

describe("useEntregaPendenteAlerta (RN17)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetEntregaAlerta();
    localStorage.setItem("core_tenant_id", "t1");
    localStorage.setItem("core_usuario_id", "u1");
    minhas.mockReset();
    tocarAlerta.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("toca na hora, repete a cada 30 s e para depois do aceite", async () => {
    minhas.mockResolvedValue([entrega("AGUARDANDO_ACEITE")]);
    const { result } = renderHook(() => useEntregaPendenteAlerta());
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.pendentes).toHaveLength(1);
    expect(tocarAlerta).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(tocarAlerta).toHaveBeenCalledTimes(2);

    minhas.mockResolvedValue([entrega("EM_ROTA")]);
    await act(async () => { avisarEntregasAtualizadas(); await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.pendentes).toHaveLength(0);
    const tocadas = tocarAlerta.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(tocarAlerta).toHaveBeenCalledTimes(tocadas);
  });

  it("sem entrega aguardando, não toca", async () => {
    minhas.mockResolvedValue([entrega("EM_ROTA")]);
    renderHook(() => useEntregaPendenteAlerta());
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(tocarAlerta).not.toHaveBeenCalled();
  });
});
