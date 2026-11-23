import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { fetchLmsMetricas, fetchQualidadeDado } from "../produtividade.service";
import {
  faixaDe, dominioEixo, janelaPaginas, qualidadePct, tipoDominante, composicaoHoras, formatarPct, FAIXAS_PADRAO,
} from "../produtividadeCalculo";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const filtros = {
  tenantId: "t1", empresaId: "e1", armazemId: "a1", dataInicio: "2026-11-01", dataFim: "2026-11-18",
  usuarioId: "u1", turnoId: "tn1",
};

describe("fetchLmsMetricas (fonte única)", () => {
  beforeEach(() => rpc.mockReset());

  it("envia todos os filtros para rpc_lms_metricas, inclusive empresa e turno", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, linhas: [], total: null }, error: null });
    await fetchLmsMetricas(filtros, "OPERADOR_DIA");
    expect(rpc).toHaveBeenCalledWith("rpc_lms_metricas", {
      p_tenant_id: "t1", p_data_ini: "2026-11-01", p_data_fim: "2026-11-18", p_armazem_id: "a1",
      p_usuario_ids: ["u1"], p_tipo_tarefa_ids: null, p_granularidade: "OPERADOR_DIA",
      p_empresa_id: "e1", p_turno_id: "tn1",
    });
  });

  it("converte números e mantém percentuais nulos como nulos (sem tempo não vira 0%)", async () => {
    rpc.mockResolvedValue({
      data: {
        sucesso: true,
        linhas: [{ chave: "u1", tempo_direto: "120", tempo_disponivel: "420", utilizacao_pct: "28.57", performance_pct: null, origem: "REAL" }],
        total: { tempo_direto: "120", eficiencia_pct: null, origem: "ESTIMADO" },
      },
      error: null,
    });
    const r = await fetchLmsMetricas(filtros, "OPERADOR");
    expect(r.linhas[0].tempo_direto).toBe(120);
    expect(r.linhas[0].utilizacao_pct).toBe(28.57);
    expect(r.linhas[0].performance_pct).toBeNull();
    expect(r.total?.eficiencia_pct).toBeNull();
  });

  it("repassa o erro de negócio da RPC", async () => {
    rpc.mockResolvedValue({ data: { sucesso: false, mensagem: "Informe um período de até 366 dias." }, error: null });
    await expect(fetchLmsMetricas(filtros, "TOTAL")).rejects.toThrow("366 dias");
  });

  it("qualidade do dado usa rpc_lms_qualidade_dado com o armazém", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, total: {}, por_tipo: [], casos: [] }, error: null });
    await fetchQualidadeDado(filtros);
    expect(rpc).toHaveBeenCalledWith("rpc_lms_qualidade_dado", {
      p_tenant_id: "t1", p_data_ini: "2026-11-01", p_data_fim: "2026-11-18", p_armazem_id: "a1",
    });
  });
});

describe("regras de apresentação", () => {
  it("faixa vem das faixas do armazém (F6)", () => {
    expect(faixaDe(111, FAIXAS_PADRAO)).toBe("EXCELENTE");
    expect(faixaDe(90, FAIXAS_PADRAO)).toBe("BOM");
    expect(faixaDe(69.9, FAIXAS_PADRAO)).toBe("CRITICO");
    expect(faixaDe(null)).toBe("SEM_DADOS");
    expect(faixaDe(80, { excelente: 100, bom: 80, atencao: 60 })).toBe("BOM");
  });

  it("eixo do ranking não corta acima de 100% e inclui a meta (F5)", () => {
    expect(dominioEixo([302.29, 50], 90)).toEqual([0, 340]);
    expect(dominioEixo([20], 90)).toEqual([0, 100]);
    expect(dominioEixo([], 90)[1]).toBeGreaterThanOrEqual(90);
  });

  it("paginação com janela deslizante (F10)", () => {
    expect(janelaPaginas(1, 3)).toEqual([1, 2, 3]);
    expect(janelaPaginas(10, 20)).toEqual([8, 9, 10, 11, 12]);
    expect(janelaPaginas(20, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(janelaPaginas(1, 0)).toEqual([]);
  });

  it("qualidade = tarefas sem ocorrência", () => {
    expect(qualidadePct(100, 3)).toBe(97);
    expect(qualidadePct(2, 5)).toBe(0);
    expect(qualidadePct(0, 0)).toBeNull();
  });

  it("UPH usa o tipo com mais tempo direto (não soma unidades diferentes)", () => {
    const t = tipoDominante([
      { codigo: "INV", descricao: "", unidade_medida: "UN", tempo_direto: 60, uph: 1650000 },
      { codigo: "SEP", descricao: "", unidade_medida: "CX", tempo_direto: 3600, uph: 42 },
    ]);
    expect(t?.codigo).toBe("SEP");
    expect(tipoDominante([])).toBeNull();
  });

  it("composição soma o disponível (F1)", () => {
    const c = composicaoHoras({ tempo_direto: 7200, tempo_indireto: 1800, tempo_ocioso: 5400, tempo_disponivel: 14400 });
    expect(c.direto + c.indireto + c.ocioso).toBeCloseTo(c.disponivel, 2);
  });

  it("formata percentual em pt-BR e trata vazio", () => {
    expect(formatarPct(31.43)).toBe("31,4%");
    expect(formatarPct(null)).toBe("—");
  });
});
