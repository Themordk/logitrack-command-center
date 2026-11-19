import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));

import {
  estiloClassificacao, formatarScore, obterScoreOperador, participacaoPeso, textoSemScore, type FichaScore, type MetricaScore,
} from "../score/score.service";
import { ScoreBadge, ScoreDetalhe } from "../score/ScoreDetalhe";
import { validarMeta, type MetaEntrada, type MetricaInfo } from "../metas/metas.service";
import { RankingOperadores } from "@/pages/dashboard/components/RankingOperadores";
import { MetasListaTab } from "@/pages/coletor/metas/MetasListaTab";
import { ehRecusaScorecard, fetchScorecardOperador } from "@/pages/dashboard/dashboard.service";

const metrica = (o: Partial<MetricaScore>): MetricaScore => ({
  meta_id: "m1", nome: "UPH separação", metrica: "UPH", rotulo_metrica: "Unidades por hora", unidade: "POR_HORA", direcao: "MAIOR",
  atividade: "TODAS", tipo_codigo: null, categoria: null, periodicidade: "DIARIO", peso: 2, teto: 120, periodos: 2, periodos_contados: 2,
  conta: true, atingimento_pct: 120, atingimento_bruto_pct: 140, limitado: true, faixa: "EXCELENTE", motivo: null,
  ultimo: { periodo_ref: "2026-11-17", periodo_ini: "2026-11-17", periodo_fim: "2026-11-17", realizado: 130, alvo: 100, minimo: 85,
            excelencia: 120, atingimento_pct: 130, faixa: "EXCELENTE", parcial: false, semana_rampa: null },
  ...o,
});

const FICHA: FichaScore = {
  score: 95, situacao: "OK", classificacao: { codigo: "BOM", nome: "Bom", cor: "azul" }, score_esperado: 90, teto_pct: 120,
  metas_total: 2, metas_contadas: 1, peso_total: 2,
  metricas: [
    metrica({}),
    metrica({ meta_id: "m2", nome: "Performance geral", metrica: "PERFORMANCE", unidade: "PCT", peso: 1, conta: false, atingimento_pct: null,
              atingimento_bruto_pct: null, limitado: null, faixa: "ESTIMADO", motivo: "Resultado estimado: o início das tarefas não foi registrado no coletor." }),
  ],
  evolucao: [], faixas_lista: [], periodo: { inicio: "2026-11-16", fim: "2026-11-17" },
};

beforeEach(() => rpc.mockReset());

describe("Fase 10 · score global (textos e chamada)", () => {
  it("formata o score e o texto de quem não tem score", () => {
    expect(formatarScore(95)).toBe("95,0%");
    expect(formatarScore(null)).toBe("—");
    expect(textoSemScore("SEM_DADOS")).toBe("Sem dados");
    expect(textoSemScore("SEM_METAS")).toBe("Sem metas");
    expect(estiloClassificacao({ codigo: "SEM_METAS", nome: "Sem metas", cor: "cinza" }).nome).toBe("Sem metas");
  });
  it("participação no score sai do peso contado", () => {
    expect(participacaoPeso({ conta: true, peso: 2 }, 3)).toBe(67);
    expect(participacaoPeso({ conta: false, peso: 2 }, 3)).toBeNull();
  });
  it("chama a RPC do score e devolve a mensagem do banco quando recusa", async () => {
    rpc.mockResolvedValueOnce({ data: { sucesso: true, ...FICHA, usuario_id: "u", nome: "Ana" }, error: null });
    const r = await obterScoreOperador("t", "u", "2026-11-16", "2026-11-17");
    expect(rpc).toHaveBeenCalledWith("rpc_lms_score_operador", { p_tenant_id: "t", p_usuario_id: "u", p_data_ini: "2026-11-16", p_data_fim: "2026-11-17" });
    expect(r.score).toBe(95);
    rpc.mockResolvedValueOnce({ data: { sucesso: false, codigo: "SOMENTE_PROPRIOS_DADOS", mensagem: "Você só pode ver os seus próprios números." }, error: null });
    await expect(obterScoreOperador("t", "x", "2026-11-16", "2026-11-17")).rejects.toThrow("próprios números");
  });
  it("peso da meta: de 0,1 a 10", () => {
    const info: MetricaInfo = { codigo: "UPH", rotulo: "UPH", unidade: "POR_HORA", direcao: "MAIOR", permite_atividade: true, trava_origem: false, ajuda: "" };
    const e: MetaEntrada = { empresa_id: "e", metrica: "UPH", atividade: "TODAS", periodicidade: "DIARIO", alvo: 100 };
    expect(validarMeta({ ...e, peso: 2 }, info)).toBeNull();
    expect(validarMeta({ ...e, peso: 0 }, info)).toMatch("0,1 a 10");
    expect(validarMeta({ ...e, peso: 11 }, info)).toMatch("0,1 a 10");
  });
});

describe("Fase 10 · telas do score", () => {
  it("detalhe mostra score, classificação, meta limitada e o motivo da meta que não conta", () => {
    render(<ScoreDetalhe ficha={FICHA} />);
    expect(screen.getByText("95,0%")).toBeInTheDocument();
    expect(screen.getByText("Bom")).toBeInTheDocument();
    expect(screen.getByText(/1 de 2 meta\(s\) contam/)).toBeInTheDocument();
    expect(screen.getByText(/limitado \(140,0%\)/)).toBeInTheDocument();
    expect(screen.getByText("100% do score")).toBeInTheDocument();
    expect(screen.getByText(/início das tarefas não foi registrado/)).toBeInTheDocument();
  });
  it("sem metas: selo e explicação", () => {
    render(<ScoreDetalhe ficha={{ ...FICHA, score: null, situacao: "SEM_METAS", classificacao: { codigo: "SEM_METAS", nome: "Sem metas", cor: "cinza" }, metricas: [] }} />);
    expect(screen.getByText("Sem metas")).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma meta ativa vale/)).toBeInTheDocument();
  });
  it("selo de quem tem metas sem amostra diz 'Sem dados'", () => {
    render(<ScoreBadge classificacao={{ codigo: "SEM_DADOS", nome: "Sem dados", cor: "cinza" }} situacao="SEM_DADOS" />);
    expect(screen.getByText("Sem dados")).toBeInTheDocument();
  });
  it("ranking do painel mostra o score e quem está sem metas", () => {
    render(<RankingOperadores data={[
      { usuario_id: "a", nome: "Ana Lima", tarefas: 10, produtividade: 1, score: 112.5, score_situacao: "OK", score_metas_contadas: 2, score_metas_total: 3,
        classificacao: { codigo: "EXCELENTE", nome: "Excelente", cor: "verde" }, eficiencia_pct: 80, performance_pct: 100 },
      { usuario_id: "b", nome: "Bruno Reis", tarefas: 5, produtividade: 1, score: null, score_situacao: "SEM_METAS",
        classificacao: { codigo: "SEM_METAS", nome: "Sem metas", cor: "cinza" }, eficiencia_pct: 90 },
    ]} />);
    expect(screen.getByText("Ranking LMS · score das metas")).toBeInTheDocument();
    expect(screen.getByText("112,5%")).toBeInTheDocument();
    expect(screen.getByText("Excelente")).toBeInTheDocument();
    expect(screen.getAllByText("Sem metas").length).toBeGreaterThan(0);
    expect(screen.getByText(/2\/3 metas/)).toBeInTheDocument();
  });
  it("coletor · Minhas metas lista cada meta e o vazio", () => {
    const { unmount } = render(<MetasListaTab ficha={FICHA} />);
    expect(screen.getByText("UPH separação")).toBeInTheDocument();
    expect(screen.getByText("130/h de 100/h")).toBeInTheDocument();
    expect(screen.getByText(/Conta no máximo 120%/)).toBeInTheDocument();
    expect(screen.getByText("Estimado (não conta)")).toBeInTheDocument();
    unmount();
    render(<MetasListaTab ficha={{ ...FICHA, metricas: [] }} />);
    expect(screen.getByText(/ainda não tem metas/)).toBeInTheDocument();
  });
});

describe("Fase 10.3 · ficha do operador confere a permissão", () => {
  it("reconhece a recusa do banco e a repassa à tela", async () => {
    rpc.mockResolvedValueOnce({ data: { sucesso: false, codigo: "SOMENTE_PROPRIOS_DADOS", mensagem: "Você só pode ver os seus próprios números." }, error: null });
    const r = await fetchScorecardOperador("t", "u", "2026-11-13", "2026-11-19");
    expect(ehRecusaScorecard(r)).toBe(true);
    expect(ehRecusaScorecard({ operador: {}, metricas_periodo: {} })).toBe(false);
    expect(ehRecusaScorecard(null)).toBe(false);
  });
});
