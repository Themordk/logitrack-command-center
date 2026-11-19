import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));

import { decompor, obterPainelTurno, semaforo, tempoDesde, type PainelTurno } from "../acompanhamento/acompanhamento.service";
import { PainelTurnoView } from "../acompanhamento/PainelTurnoView";
import { AtingimentoView } from "../acompanhamento/AtingimentoView";
import { VisaoEmpresaView } from "../acompanhamento/VisaoEmpresaView";
import { mensagemMeta } from "../score/score.service";
import { formatSegundos } from "@/modules/reports/produtividade/produtividade.service";

const PAINEL: PainelTurno = {
  data: "2026-11-19", atualizado_em: "2026-11-19T20:30:00Z", agora: "2026-11-19T20:31:00Z",
  turno: { id: "t1", descricao: "TURNO DIURNO", inicio: "2026-11-19T11:00:00Z", fim: "2026-11-19T21:00:00Z", intervalo_min: 120, fracao_decorrida: 0.5 },
  turnos: [{ id: "t1", descricao: "TURNO DIURNO", hora_inicio: "08:00:00", hora_fim: "18:00:00" }],
  resumo: { operadores: 2, em_tarefa: 1, indireta: 0, sem_tarefa: 1, sem_sessao: 0, tarefas: 40, quantidade: 1200,
            utilizacao_pct: 80, performance_pct: 98, eficiencia_pct: 78, score_medio: 101.5, metas: 1, metas_no_caminho: 1, metas_em_risco: 0 },
  metas: [{ meta_id: "m1", nome: "Volume do dia", metrica: "VOLUME_UNIDADES", rotulo_metrica: "Unidades no período", unidade: "QTD", direcao: "MAIOR",
            atividade: "TODAS", tipo_codigo: null, categoria: null, escopo: null, peso: 1, alvo: 2000, minimo: 1700, excelencia: 2400,
            realizado: 1200, atingimento_pct: 60, faixa_atual: "ABAIXO", participantes: 2, amostra_suficiente: true, origem: "REAL",
            projecao: 2400, atingimento_projetado_pct: 120, faixa_projetada: "EXCELENTE", projeta_ritmo: true }],
  operadores: [
    { usuario_id: "u1", nome: "Ana Lima", status: "EM_TAREFA", status_desde: "2026-11-19T20:20:00Z", tarefa: { desde: "2026-11-19T20:20:00Z", tipo: "SEP", descricao: "Separação" },
      indireta: null, tarefas: 25, quantidade: 800, tempo_disponivel: 18000, tempo_direto: 15000, tempo_indireto: 0,
      utilizacao_pct: 83.3, performance_pct: 104, eficiencia_pct: 86, origem: "REAL", score: 112, score_situacao: "OK",
      score_metas_total: 2, score_metas_contadas: 2, classificacao: { codigo: "EXCELENTE", nome: "Excelente", cor: "verde" } },
    { usuario_id: "u2", nome: "Bruno Reis", status: "SEM_TAREFA", status_desde: null, tarefa: null, indireta: null, tarefas: 15, quantidade: 400,
      tempo_disponivel: 18000, tempo_direto: 12000, tempo_indireto: 0, utilizacao_pct: 66.7, performance_pct: 90, eficiencia_pct: 60, origem: "ESTIMADO",
      score: null, score_situacao: "SEM_METAS", score_metas_total: 0, score_metas_contadas: 0, classificacao: { codigo: "SEM_METAS", nome: "Sem metas", cor: "cinza" } },
  ],
  faixas_lista: [], score_esperado: 90,
};

beforeEach(() => rpc.mockReset());

describe("Fase 10 · acompanhamento (regras de exibição)", () => {
  it("semáforo da projeção", () => {
    expect(semaforo("NA_META").texto).toBe("No caminho");
    expect(semaforo("ACEITAVEL").texto).toBe("Atenção");
    expect(semaforo("ABAIXO").texto).toBe("Em risco");
    expect(semaforo("SEM_DADOS").texto).toBe("Sem dados");
  });
  it("tempo desde e decomposição", () => {
    const agora = new Date("2026-11-19T12:00:00Z");
    expect(tempoDesde("2026-11-19T11:55:00Z", agora)).toBe("5 min");
    expect(tempoDesde("2026-11-19T10:50:00Z", agora)).toBe("1 h 10");
    const d = decompor([{ atingimento_pct: 120, n: "a" }, { atingimento_pct: 80, n: "b" }, { atingimento_pct: 95, n: "c" }, { atingimento_pct: null, n: "d" }]);
    expect(d.acima.map((x) => x.n)).toEqual(["a"]);
    expect(d.abaixo.map((x) => x.n)).toEqual(["b", "c"]);
    expect(d.sem_dados).toHaveLength(1);
  });
  it("mensagem curta do coletor", () => {
    const base = { metrica: "VOLUME_UNIDADES" as const, unidade: "QTD" as const, direcao: "MAIOR" as const };
    const ult = (realizado: number | null, alvo: number) => ({ periodo_ref: "", periodo_ini: "", periodo_fim: "", realizado, alvo, minimo: null,
      excelencia: null, atingimento_pct: null, faixa: "SEM_DADOS" as const, parcial: true, semana_rampa: null });
    expect(mensagemMeta({ ...base, ultimo: ult(1200, 2000) })).toBe("Faltam 800 para a meta.");
    expect(mensagemMeta({ ...base, ultimo: ult(2100, 2000) })).toBe("Meta batida!");
    expect(mensagemMeta({ metrica: "UPH", unidade: "POR_HORA", direcao: "MAIOR", ultimo: ult(80, 100) })).toBe("Ritmo 80/h · meta 100/h.");
    expect(mensagemMeta({ metrica: "TEMPO_INDIRETO_PCT", unidade: "PCT", direcao: "MENOR", ultimo: ult(8, 10) })).toBe("Dentro da meta.");
    expect(mensagemMeta({ ...base, ultimo: ult(null, 2000) })).toMatch("sem dados");
  });
  it("painel chama a RPC e repassa a recusa do banco", async () => {
    rpc.mockResolvedValueOnce({ data: { sucesso: false, mensagem: "Seu perfil não tem acesso ao acompanhamento do LMS." }, error: null });
    await expect(obterPainelTurno("t", "a", null)).rejects.toThrow("acompanhamento");
    expect(rpc).toHaveBeenCalledWith("rpc_lms_painel_turno", { p_tenant_id: "t", p_armazem_id: "a", p_turno_id: null });
  });
});

describe("Fase 10 · ajustes do teste com execuções reais", () => {
  it("duração curta não aparece zerada", () => {
    expect(formatSegundos(0)).toBe("0s");
    expect(formatSegundos(12.4)).toBe("12s");
    expect(formatSegundos(65)).toBe("1min 05s");
    expect(formatSegundos(120)).toBe("2min");
    expect(formatSegundos(3725)).toBe("1h02m");
  });
  it("tarefa parada aparece como parada, não como em tarefa", async () => {
    const op = { ...PAINEL.operadores[0], usuario_id: "u3", nome: "Carlos Dias", status: "TAREFA_PARADA" as const,
      status_desde: "2026-11-18T19:28:00Z", tarefa: { desde: "2026-11-18T19:28:00Z", tipo: "ENTR-ARMZ", descricao: "Armazenagem", em_andamento: false } };
    rpc.mockResolvedValueOnce({ data: { sucesso: true, ...PAINEL, resumo: { ...PAINEL.resumo, tarefa_parada: 1 }, operadores: [op] }, error: null });
    render(<PainelTurnoView tenantId="t" armazemId="a" onNavigate={() => {}} />);
    await waitFor(() => expect(screen.getByText("Tarefa parada")).toBeInTheDocument());
    expect(screen.getByText(/ENTR-ARMZ sem atividade/)).toBeInTheDocument();
    expect(screen.getByText(/1 parada/)).toBeInTheDocument();
  });
});

describe("Fase 10 · telas do acompanhamento", () => {
  it("painel do turno mostra a projeção, o semáforo e os operadores", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, ...PAINEL }, error: null });
    render(<PainelTurnoView tenantId="t" armazemId="a" onNavigate={vi.fn()} />);
    expect(await screen.findByText("Volume do dia")).toBeInTheDocument();
    expect(screen.getByText("2.400")).toBeInTheDocument();
    expect(screen.getByText("120% do alvo")).toBeInTheDocument();
    expect(screen.getByText("No caminho")).toBeInTheDocument();
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Em tarefa")).toBeInTheDocument();
    expect(screen.getByText("Sem tarefa")).toBeInTheDocument();
    expect(screen.getByText("50% do turno")).toBeInTheDocument();
    expect(screen.getAllByText("Sem metas").length).toBeGreaterThan(0);
  });
  it("atingimento lista as metas com média, períodos na meta e tendência", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, metas: [{
      meta_id: "m1", nome: "UPH separação", metrica: "UPH", rotulo_metrica: "Unidades por hora", unidade: "POR_HORA", direcao: "MAIOR",
      periodicidade: "DIARIO", status: "ATIVA", armazem_id: "a", armazem_nome: "Armazém 01", atividade: "TODAS", tipo_codigo: null, categoria: null,
      peso: 1, alvo: 100, vigente_desde: "2026-11-01", vigente_ate: null, qtd_periodos: 2, periodos_contados: 2, periodos_na_meta: 1,
      atingimento_medio_pct: 97.5, tendencia: "SUBINDO",
      periodos: [
        { periodo_ref: "2026-11-17", periodo_ini: "2026-11-17", periodo_fim: "2026-11-17", realizado: 90, alvo: 100, atingimento_pct: 90, faixa: "ACEITAVEL", participantes: 3, parcial: false },
        { periodo_ref: "2026-11-18", periodo_ini: "2026-11-18", periodo_fim: "2026-11-18", realizado: 105, alvo: 100, atingimento_pct: 105, faixa: "NA_META", participantes: 3, parcial: false },
      ] }] }, error: null });
    render(<AtingimentoView tenantId="t" empresaId="e" armazens={[{ id: "a", nome: "Armazém 01" }]} dataIni="2026-11-13" dataFim="2026-11-19" onNavigate={vi.fn()} />);
    expect(await screen.findByText("UPH separação")).toBeInTheDocument();
    expect(screen.getByText("97,5%")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByText("18/11 105%")).toBeInTheDocument();
    expect(screen.getByTitle("Subindo")).toBeInTheDocument();
  });
  it("visão da empresa compara os armazéns e mostra o total", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, faixas_lista: [],
      armazens: [{ armazem_id: "a", armazem: "Armazém 01", operadores: 3, dias: 5, tarefas: 300, quantidade: 9000, tempo_disponivel: 72000, tempo_direto: 54000,
                   tempo_indireto: 3600, horas_padrao_seg: 54000, utilizacao_pct: 75, performance_pct: 100, eficiencia_pct: 75, pct_inicio_real: 97, origem: "REAL",
                   score_medio: 104.2, operadores_com_score: 2, metas_com_resultado: 4, atingimento_medio_pct: 96.5 }],
      total: { operadores: 3, tarefas: 300, quantidade: 9000, tempo_disponivel: 72000, tempo_direto: 54000, horas_padrao_seg: 54000,
               utilizacao_pct: 75, performance_pct: 100, eficiencia_pct: 75, score_medio: 104.2, operadores_com_score: 2 } }, error: null });
    render(<VisaoEmpresaView tenantId="t" empresaId="e" dataIni="2026-11-13" dataFim="2026-11-19" />);
    expect(await screen.findByText("Armazém 01")).toBeInTheDocument();
    expect(screen.getByText("Empresa")).toBeInTheDocument();
    expect(screen.getAllByText("104,2%").length).toBe(2);
    await waitFor(() => expect(screen.getByText("96,5%")).toBeInTheDocument());
  });
});
