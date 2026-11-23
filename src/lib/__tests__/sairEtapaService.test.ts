import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { modoPadrao, opcoesSair, pedirLiberacao, sairEtapa, simularSairEtapa } from "../sairEtapaService";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const p = { tenantId: "t", empresaId: "e", usuarioId: "u", contextoTipo: "MOVIMENTO_ENTRADA" as const, contextoId: "m", etapa: "ENTR-ARMZ" };

describe("sairEtapaService", () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: { sucesso: true, codigo: "OK" }, error: null }); });

  it("simular pede a prévia sem mudar nada", async () => {
    await simularSairEtapa(p);
    expect(rpc).toHaveBeenCalledWith("rpc_coletor_sair_etapa", expect.objectContaining({
      p_contexto_tipo: "MOVIMENTO_ENTRADA", p_contexto_id: "m", p_etapa: "ENTR-ARMZ", p_movimento_saida_id: null, p_simular: true,
    }));
  });

  it("sair envia modo e motivo; onda também preenche p_movimento_saida_id (compatível)", async () => {
    await sairEtapa({ ...p, contextoTipo: "ONDA", contextoId: "onda" }, "TODAS", "FIM_TURNO");
    expect(rpc.mock.calls[0][1]).toEqual(expect.objectContaining({ p_movimento_saida_id: "onda", p_modo: "TODAS", p_motivo: "FIM_TURNO", p_simular: false }));
  });

  it("pedir liberação usa a mesma RPC com p_pedir_liberacao", async () => {
    await pedirLiberacao(p, null);
    expect(rpc.mock.calls[0][1]).toEqual(expect.objectContaining({ p_pedir_liberacao: true }));
  });
});

describe("opções da tela", () => {
  const resumo = { total: 4, nao_iniciadas: 2, em_execucao: 1, com_progresso: 1, produto_em_maos: 1, devolve_nao_iniciadas: 2, devolve_todas: 3 };

  it("mostra quanto cada opção devolve e o efeito da execução", () => {
    const [nao, todas] = opcoesSair(resumo);
    expect(nao).toMatchObject({ modo: "NAO_INICIADAS", quantidade: 2, disponivel: true });
    expect(nao.detalhe).toMatch(/1 já começada/);
    expect(todas).toMatchObject({ modo: "TODAS", quantidade: 3 });
    expect(todas.detalhe).toMatch(/1 em execução será\(ão\) interrompida/);
  });

  it("padrão é o menos destrutivo que devolve algo", () => {
    expect(modoPadrao(resumo)).toBe("NAO_INICIADAS");
    expect(modoPadrao({ ...resumo, nao_iniciadas: 0, devolve_nao_iniciadas: 0 })).toBe("TODAS");
  });
});
