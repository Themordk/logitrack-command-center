import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { fetchExecucoesOperador, formatarLocalCurto, minutosDoDiaLocal } from "../produtividade.service";

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
