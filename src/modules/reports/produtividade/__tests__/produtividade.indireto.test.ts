import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { fetchExecucoesOperador, fetchIndiretoDetalhe, fetchLmsMetricas } from "../produtividade.service";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe("Fase 10.35 · divisão do tempo e de onde veio o indireto", () => {
  beforeEach(() => rpc.mockReset());

  it("lista do indireto vem da RPC com os números convertidos e o consolidado", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, fuso: "America/Fortaleza", linhas: [
      { tipo: "ESQUECIDA", dia: "2026-11-26", descricao: "INV-ATU · INVENTÁRIO", detalhe: "Ficou aberta 87 min",
        inicio_local: "2026-11-26T12:00:00", fim_local: "2026-11-26T13:27:00", duracao_seg: "5220", considerado_seg: "4161" },
      { tipo: "CANCELADA", dia: "2026-11-26", descricao: "SEP · SEPARAÇÃO", detalhe: null,
        inicio_local: "2026-11-26T15:48:00", fim_local: "2026-11-26T15:58:00", duracao_seg: 600, considerado_seg: 600 },
    ], consolidado: { tempo_indireto: 5339, indireto_apontado: 0, indireto_cancelada: 1178, indireto_esquecida: "4161" } }, error: null });
    const r = await fetchIndiretoDetalhe("t1", "u1", "2026-11-26", "2026-11-26");
    expect(rpc).toHaveBeenCalledWith("rpc_lms_indireto_detalhe", {
      p_tenant_id: "t1", p_usuario_id: "u1", p_data_ini: "2026-11-26", p_data_fim: "2026-11-26",
    });
    expect(r.linhas[0]).toMatchObject({ tipo: "ESQUECIDA", duracao_seg: 5220, considerado_seg: 4161, detalhe: "Ficou aberta 87 min" });
    expect(r.linhas[1].detalhe).toBeNull();
    expect(r.consolidado).toEqual({ tempo_indireto: 5339, indireto_apontado: 0, indireto_cancelada: 1178, indireto_esquecida: 4161 });
  });

  it("recusa do servidor vira erro com a mensagem do banco", async () => {
    rpc.mockResolvedValue({ data: { sucesso: false, mensagem: "Informe um período de até 31 dias." }, error: null });
    await expect(fetchIndiretoDetalhe("t1", "u1", "2026-10-01", "2026-11-26")).rejects.toThrow("31 dias");
  });

  it("ficha marca a tarefa esquecida aberta", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, fuso: "America/Fortaleza", linhas: [
      { execucao_id: "e1", tarefa_id: "t1", dia: "2026-11-26", duracao_bruta_seg: 5220, duracao_efetiva_seg: 0, tempo_padrao_seg: 0, esquecida: true },
      { execucao_id: "e2", tarefa_id: "t2", dia: "2026-11-26", duracao_bruta_seg: 20, duracao_efetiva_seg: 20, tempo_padrao_seg: 12, esquecida: false },
    ] }, error: null });
    const r = await fetchExecucoesOperador("t1", "u1", "2026-11-26", "2026-11-26");
    expect(r.linhas.map((l) => l.esquecida)).toEqual([true, false]);
  });

  it("métricas trazem o indireto por tipo, o entre tarefas e o horário do cálculo", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, linhas: [{
      chave: "u1", usuario_id: "u1", tempo_disponivel: "28296", tempo_direto: "5114", tempo_indireto: "3044", tempo_ocioso: "20138",
      indireto_apontado: "0", indireto_cancelada: "1200", indireto_esquecida: "1844", tempo_entre_tarefas: "16862",
    }], total: { tempo_indireto: "3044", indireto_cancelada: "1200", tempo_entre_tarefas: "16862", calculado_em: "2026-11-26T20:45:00+00:00" } }, error: null });
    const r = await fetchLmsMetricas({ tenantId: "t", dataInicio: "2026-11-26", dataFim: "2026-11-26" } as never, "OPERADOR");
    expect(r.linhas[0]).toMatchObject({ indireto_cancelada: 1200, indireto_esquecida: 1844, tempo_entre_tarefas: 16862 });
    expect(r.total?.calculado_em).toBe("2026-11-26T20:45:00+00:00");
    expect(r.total?.tempo_entre_tarefas).toBe(16862);
  });
});
