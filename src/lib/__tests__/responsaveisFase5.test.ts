import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { FONTE_ENTRADA, descreverPreviaOperadores } from "../responsaveisOndaService";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

describe("responsáveis do movimento de entrada", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { sucesso: true }, error: null }); });

  it("salvar vai para a RPC da entrada com o motivo aparado", async () => {
    await FONTE_ENTRADA.salvar({ id: "me", alteracoes: [{ tipo_tarefa_id: "tt", usuarios: ["u"] }], confirmarProgresso: true, motivo: "  doca 3 ", simular: false });
    expect(rpc).toHaveBeenCalledWith("rpc_movimento_entrada_responsaveis_salvar", {
      p_movimento_entrada_id: "me", p_alteracoes: [{ tipo_tarefa_id: "tt", usuarios: ["u"] }],
      p_confirmar_progresso: true, p_motivo: "doca 3", p_simular: false,
    });
  });
});

describe("prévia por operador", () => {
  it("descreve execução, progresso, só atribuídas e produto em mãos", () => {
    const linhas = descreverPreviaOperadores([{
      tipo_tarefa_id: "x", etapa: "SEPARAÇÃO", codigo_etapa: "SEP", ordem: 1, convocados: "PAULO", aplicado: true,
      por_operador: [{ usuario_id: "a", nome: "JOSE", tarefas: 4, em_execucao: 1, minutos_em_execucao: 5, com_progresso: 2, so_atribuidas: 1, produto_em_maos: 2 }],
    }]);
    expect(linhas[0]).toBe("JOSE: 1 em execução agora (há 5 min), 2 com progresso, 1 só atribuída(s).");
    expect(linhas[1]).toMatch(/produto de 2 tarefa\(s\) em mãos/);
  });
});
