import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { fetchCapturaPeriodo, fetchExecucoesOperador, formatarLocalCurto, minutosDoDiaLocal, textoSemCaptura } from "../produtividade.service";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe("Fase 10.15 · execuções detalhadas com o tempo que entra na conta (P3)", () => {
  beforeEach(() => rpc.mockReset());

  it("lê da RPC (não mais da visão) e converte os números", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, fuso: "America/Fortaleza", linhas: [{
      execucao_id: "e1", tarefa_id: "t1", dia: "2026-11-18", tipo_tarefa_codigo: "SEP", tipo_tarefa_descricao: "SEPARAÇÃO",
      inicio_local: "2026-11-18T08:00:00", fim_local: "2026-11-18T08:01:30", inicio_real: true,
      pausa_seg: 10, duracao_bruta_seg: "90.4", sobreposicao_seg: "0", duracao_efetiva_seg: 80, tempo_padrao_seg: "30", quantidade: "2",
    }] }, error: null });
    const r = await fetchExecucoesOperador("t1", "u1", "2026-11-18", "2026-11-18");
    expect(rpc).toHaveBeenCalledWith("rpc_lms_execucoes_operador", {
      p_tenant_id: "t1", p_usuario_id: "u1", p_data_ini: "2026-11-18", p_data_fim: "2026-11-18",
    });
    expect(r.fuso).toBe("America/Fortaleza");
    expect(r.linhas[0]).toMatchObject({ duracao_efetiva_seg: 80, duracao_bruta_seg: 90.4, tempo_padrao_seg: 30, quantidade: 2, cor_interface: null });
  });

  it("recusa do servidor vira erro com a mensagem do banco", async () => {
    rpc.mockResolvedValue({ data: { sucesso: false, mensagem: "Seu perfil não tem acesso aos dados de produtividade." }, error: null });
    await expect(fetchExecucoesOperador("t1", "u1", "2026-11-18", "2026-11-18")).rejects.toThrow("não tem acesso");
  });

  it("hora local do armazém não passa pelo fuso do navegador", () => {
    expect(minutosDoDiaLocal("2026-11-18T23:45:10")).toBe(23 * 60 + 45);
    expect(formatarLocalCurto("2026-11-18T07:05:00")).toBe("18/11 07:05");
    expect(formatarLocalCurto(null)).toBe("—");
  });
});

describe("Fase 10.19 · aviso de período sem captura (P8)", () => {
  beforeEach(() => rpc.mockReset());

  it("pede ao banco com o operador e trata recusa como 'sem aviso'", async () => {
    rpc.mockResolvedValueOnce({ data: { sucesso: true, captura_desde: "2026-11-18", dias_sem_captura: 17, dias_periodo: 20, dias_estimados: 9, dias_operador: 10 }, error: null });
    const c = await fetchCapturaPeriodo("t1", "2026-11-01", "2026-11-20", ["u1"]);
    expect(rpc).toHaveBeenCalledWith("rpc_lms_captura_periodo", { p_tenant_id: "t1", p_data_ini: "2026-11-01", p_data_fim: "2026-11-20", p_usuario_ids: ["u1"] });
    expect(c?.dias_sem_captura).toBe(17);
    rpc.mockResolvedValueOnce({ data: { sucesso: false, codigo: "SEM_PERMISSAO_MODULO" }, error: null });
    expect(await fetchCapturaPeriodo("t1", "2026-11-01", "2026-11-20")).toBeNull();
  });

  it("frase só aparece quando há dias sem captura", () => {
    const base = { captura_desde: "2026-11-18", dias_periodo: 20, dias_estimados: 0, dias_operador: 0 };
    expect(textoSemCaptura({ ...base, dias_sem_captura: 0 })).toBeNull();
    expect(textoSemCaptura({ ...base, dias_sem_captura: 17 })).toMatch(/^17 de 20 dias .* \(começou em 18\/11\/2026\)/);
    expect(textoSemCaptura({ ...base, dias_sem_captura: 20 })).toMatch(/^Todo o período/);
    expect(textoSemCaptura({ ...base, captura_desde: null, dias_sem_captura: 20 })).toMatch(/ainda não há execução/);
    expect(textoSemCaptura(null)).toBeNull();
  });
});
