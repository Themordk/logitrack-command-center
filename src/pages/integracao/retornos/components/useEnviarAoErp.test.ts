import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { VerificacaoEnvio } from "../retornos.types";

const svc = vi.hoisted(() => ({ executar: vi.fn(), invokeDispatcher: vi.fn(), verificarEnvio: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("../retornosService", () => svc);
vi.mock("sonner", () => ({ toast: toastMock }));

import { useEnviarAoErp } from "./useEnviarAoErp";

const base: VerificacaoEnvio = {
  fluxo_id: "f1", fluxo_versao: 21, evento: "entrada.conferencia_finalizada", entidade: "documento_entrada",
  movimento_status: "ARMAZENADO", documento_status_wms: "1", bloqueios: [], em_andamento: false,
};
const bloqueio = {
  id: "e-old", status: "erro" as const, modo: "automatico" as const, fluxo_versao: 18, erro: "HTTP 404",
  erro_http_status: 404, created_at: "2026-11-06T12:08:56Z", pode_descartar: true,
};

describe("useEnviarAoErp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.executar.mockResolvedValue({ execucao_id: "e-new", status: "pendente", modo: "manual", evento: base.evento, descartadas: [] });
    svc.invokeDispatcher.mockResolvedValue({ execucao_id: "e-new", executado: true, status: "sucesso" });
  });

  it("sem bloqueio: envia direto, sem descartar", async () => {
    svc.verificarEnvio.mockResolvedValue(base);
    const fim = vi.fn();
    const { result } = renderHook(() => useEnviarAoErp("doc", fim));
    await act(async () => { await result.current.enviar("f1", "Fluxo"); });
    expect(svc.executar).toHaveBeenCalledWith("f1", "doc", "manual", false, false);
    expect(result.current.confirmacao).toBeNull();
    expect(toastMock.success).toHaveBeenCalled();
    expect(fim).toHaveBeenCalled();
  });

  it("com retorno anterior em erro: pede confirmação e só descarta após confirmar", async () => {
    svc.verificarEnvio.mockResolvedValue({ ...base, bloqueios: [bloqueio] });
    svc.executar.mockResolvedValue({ execucao_id: "e-new", status: "pendente", modo: "manual", evento: base.evento, descartadas: ["e-old"] });
    const { result } = renderHook(() => useEnviarAoErp("doc", vi.fn()));
    await act(async () => { await result.current.enviar("f1", "Fluxo"); });
    expect(svc.executar).not.toHaveBeenCalled();
    expect(result.current.confirmacao?.verificacao.bloqueios).toHaveLength(1);

    await act(async () => { await result.current.confirmar(); });
    expect(svc.executar).toHaveBeenCalledWith("f1", "doc", "manual", false, true);
    expect(result.current.confirmacao).toBeNull();
  });

  it("cancelar não envia nada", async () => {
    svc.verificarEnvio.mockResolvedValue({ ...base, bloqueios: [bloqueio] });
    const { result } = renderHook(() => useEnviarAoErp("doc", vi.fn()));
    await act(async () => { await result.current.enviar("f1", "Fluxo"); });
    act(() => result.current.cancelar());
    expect(result.current.confirmacao).toBeNull();
    expect(svc.executar).not.toHaveBeenCalled();
  });

  it("com envio em andamento: avisa e não oferece descarte", async () => {
    svc.verificarEnvio.mockResolvedValue({ ...base, em_andamento: true, bloqueios: [{ ...bloqueio, status: "executando", pode_descartar: false }] });
    const { result } = renderHook(() => useEnviarAoErp("doc", vi.fn()));
    await act(async () => { await result.current.enviar("f1", "Fluxo"); });
    expect(result.current.confirmacao).toBeNull();
    expect(svc.executar).not.toHaveBeenCalled();
    expect(toastMock.info).toHaveBeenCalled();
  });

  it("corrida (bloqueio surge após a pré-checagem): reabre a confirmação", async () => {
    svc.verificarEnvio
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ ...base, bloqueios: [bloqueio] });
    svc.executar.mockRejectedValueOnce({ message: "RETORNO_DOCUMENTO_BLOQUEADO: existe retorno anterior" });
    const { result } = renderHook(() => useEnviarAoErp("doc", vi.fn()));
    await act(async () => { await result.current.enviar("f1", "Fluxo"); });
    expect(result.current.confirmacao?.verificacao.bloqueios).toHaveLength(1);
  });
});
