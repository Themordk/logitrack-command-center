import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));

import {
  descreverQuem, formatarValorMeta, quantidadeLote, validarMeta, type CatalogoMetas, type Meta, type MetaEntrada, type MetricaInfo,
} from "../metas/metas.service";
import { EditarMetaDialog } from "../metas/EditarMetaDialog";

const METRICAS: MetricaInfo[] = [
  { codigo: "PERFORMANCE", rotulo: "Performance", unidade: "PCT", direcao: "MAIOR", permite_atividade: true, trava_origem: true, ajuda: "" },
  { codigo: "EFICIENCIA", rotulo: "Eficiência", unidade: "PCT", direcao: "MAIOR", permite_atividade: false, trava_origem: true, ajuda: "" },
  { codigo: "UPH", rotulo: "Unidades por hora", unidade: "POR_HORA", direcao: "MAIOR", permite_atividade: true, trava_origem: false, ajuda: "" },
  { codigo: "TEMPO_INDIRETO_PCT", rotulo: "Tempo indireto", unidade: "PCT", direcao: "MENOR", permite_atividade: false, trava_origem: false, ajuda: "" },
];
const info = (c: string) => METRICAS.find((m) => m.codigo === c);
const base: MetaEntrada = { empresa_id: "e", metrica: "PERFORMANCE", atividade: "TODAS", periodicidade: "DIARIO", alvo: 95, minimo: 85, excelencia: 110 };

describe("Fase 9 · validação da meta (mesmas regras do banco)", () => {
  it("aceita meta coerente e recusa faixas fora de ordem", () => {
    expect(validarMeta(base, info("PERFORMANCE"))).toBeNull();
    expect(validarMeta({ ...base, minimo: 99 }, info("PERFORMANCE"))).toMatch("mínimo ≤ alvo ≤ excelência");
  });
  it("menor é melhor inverte a ordem e não aceita rampa", () => {
    const e = { ...base, metrica: "TEMPO_INDIRETO_PCT" as const, alvo: 10, minimo: 15, excelencia: 5 };
    expect(validarMeta(e, info("TEMPO_INDIRETO_PCT"))).toBeNull();
    expect(validarMeta({ ...e, rampa: [{ ate_semana: 1, pct: 70 }] }, info("TEMPO_INDIRETO_PCT"))).toMatch("Rampa só vale");
  });
  it("eficiência não tem leitura por tipo; rampa não pode cair", () => {
    expect(validarMeta({ ...base, metrica: "EFICIENCIA", atividade: "TIPO", tipo_tarefa_id: "t" }, info("EFICIENCIA"))).toMatch("todas as tarefas");
    expect(validarMeta({ ...base, rampa: [{ ate_semana: 1, pct: 80 }, { ate_semana: 2, pct: 70 }] }, info("PERFORMANCE"))).toMatch("não pode cair");
  });
  it("conta as metas de um lote e formata valores", () => {
    expect(quantidadeLote({ atividade: "TIPO", tipo_tarefa_ids: ["a", "b", "c"], armazem_ids: ["x", "y"] })).toBe(6);
    expect(quantidadeLote({ atividade: "TODAS", armazem_ids: [] })).toBe(1);
    expect(formatarValorMeta(95, "PCT")).toBe("95%");
    expect(formatarValorMeta(120.5, "POR_HORA")).toBe("120,5/h");
    expect(formatarValorMeta(1200, "QTD")).toBe("1.200");
  });
  it("descreve para quem é a meta", () => {
    const m = { armazem_nome: "CD 1", escopo: [{ tipo: "TURNO" as const, ref_id: "1", nome: "Diurno" }] } as Pick<Meta, "escopo" | "armazem_nome">;
    expect(descreverQuem(m)).toBe("Turno: Diurno (armazém cd 1)");
    expect(descreverQuem({ armazem_nome: null, escopo: [] })).toBe("Toda a empresa");
  });
});

const catalogo: CatalogoMetas = {
  sucesso: true, metricas: METRICAS,
  tipos_tarefa: [
    { id: "t1", codigo: "SEP", descricao: "Separação", categoria: "SEPARACAO", unidade_medida: "UN" },
    { id: "t2", codigo: "CONF", descricao: "Conferência", categoria: "CONFERENCIA", unidade_medida: "UN" },
  ],
  categorias: ["SEPARACAO"], armazens: [{ id: "a1", nome: "CD 1" }, { id: "a2", nome: "CD 2" }],
  turnos: [{ id: "tu1", nome: "Diurno" }], equipes: [], operadores: [{ id: "u1", nome: "Ana" }], perfis: [],
  modelos: [], hoje: "2026-11-19", exige_aprovacao: true, pode_criar: true, pode_editar: true, pode_excluir: true, pode_aprovar: false,
};

describe("Fase 9 · diálogo de meta", () => {
  beforeEach(() => rpc.mockReset());

  it("lote: 2 tipos × 2 armazéns = 4 metas; supervisor envia para aprovação", () => {
    const onSalvar = vi.fn();
    render(<EditarMetaDialog aberto modo="NOVA" inicial={null} catalogo={catalogo} tenantId="t" empresaId="e" salvando={false}
      onCancelar={() => {}} onSalvar={onSalvar} />);
    fireEvent.change(screen.getByLabelText("Métrica"), { target: { value: "UPH" } });
    fireEvent.change(screen.getByLabelText("Tarefas"), { target: { value: "TIPO" } });
    fireEvent.click(screen.getByText("SEP"));
    fireEvent.click(screen.getByText("CONF"));
    fireEvent.click(screen.getByRole("button", { name: "CD 1" }));
    fireEvent.click(screen.getByRole("button", { name: "CD 2" }));
    fireEvent.change(screen.getByLabelText("Alvo"), { target: { value: "120" } });
    expect(screen.getByText(/4 metas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar para aprovação" }));
    const dados = onSalvar.mock.calls[0][0] as MetaEntrada;
    expect(dados.tipo_tarefa_ids).toEqual(["t1", "t2"]);
    expect(dados.armazem_ids).toEqual(["a1", "a2"]);
    expect(dados.ativar).toBe(true);
  });

  it("assistente: usar sugestão preenche alvo, mínimo e excelência", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, suficiente: true, mensagem: "Mediana 100", participantes: 4, com_dado: 4,
      mediana: 100, sugestao: { alvo: 105, minimo: 90, excelencia: 115 }, atingiriam_hoje: 2 }, error: null });
    const onSalvar = vi.fn();
    render(<EditarMetaDialog aberto modo="NOVA" inicial={null} catalogo={catalogo} tenantId="t" empresaId="e" salvando={false}
      onCancelar={() => {}} onSalvar={onSalvar} />);
    fireEvent.click(screen.getByRole("button", { name: /Sugerir alvo/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar 105%" }));
    expect(screen.getByLabelText("Alvo")).toHaveValue("105");
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    expect(onSalvar.mock.calls[0][0]).toMatchObject({ alvo: 105, minimo: 90, excelencia: 115, origem: "ASSISTENTE", ativar: false });
  });

  it("rampa: degraus padrão 70% e 85%", () => {
    const onSalvar = vi.fn();
    render(<EditarMetaDialog aberto modo="NOVA" inicial={null} catalogo={{ ...catalogo, exige_aprovacao: false }} tenantId="t" empresaId="e"
      salvando={false} onCancelar={() => {}} onSalvar={onSalvar} />);
    fireEvent.change(screen.getByLabelText("Alvo"), { target: { value: "95" } });
    fireEvent.click(screen.getByText(/Rampa para novatos/));
    fireEvent.click(screen.getByRole("button", { name: "Salvar e ativar" }));
    expect(onSalvar.mock.calls[0][0].rampa).toEqual([{ ate_semana: 1, pct: 70 }, { ate_semana: 3, pct: 85 }]);
  });
});

vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenantId: "t1", empresaId: "e1" }) }));
vi.mock("../configuracao/lmsConfig.service", async (orig) => {
  const real = await orig<typeof import("../configuracao/lmsConfig.service")>();
  return { ...real, listarEmpresas: vi.fn().mockResolvedValue([{ id: "e1", nome: "Empresa Um" }]) };
});

const metaPendente: Meta = {
  id: "m1", nome: "Performance do turno", metrica: "PERFORMANCE", atividade: "TODAS", tipo_tarefa_id: null, tipo_codigo: null, categoria: null,
  armazem_id: "a1", armazem_nome: "CD 1", periodicidade: "DIARIO", alvo: 95, minimo: 85, excelencia: 110,
  vigente_desde: "2026-11-20", vigente_ate: null, status: "EM_APROVACAO", origem: "MANUAL", rampa_base: "PRIMEIRA_EXECUCAO",
  observacao: null, motivo_status: null, versao_anterior_id: null, criado_por: "Sup", criado_em: "", aprovado_por: null, aprovado_em: null,
  escopo: [], rampa: [], ultimo: null,
};
const metaAtiva: Meta = { ...metaPendente, id: "m2", nome: "UPH da equipe", metrica: "UPH", status: "ATIVA",
  ultimo: { periodo_ini: "2026-11-19", periodo_fim: "2026-11-19", realizado: 80, atingimento_pct: 84.2, faixa: "SEM_DADOS", participantes: 3, parcial: true } };

function respostas(podeAprovar: boolean) {
  rpc.mockImplementation((fn: string) => {
    if (fn === "rpc_lms_metas_catalogo") return Promise.resolve({ data: { ...catalogo, pode_aprovar: podeAprovar }, error: null });
    if (fn === "rpc_lms_metas_listar") return Promise.resolve({ data: { sucesso: true, metas: [metaPendente, metaAtiva] }, error: null });
    if (fn === "rpc_lms_equipes_listar") return Promise.resolve({ data: { sucesso: true, pode_editar: true, equipes: [] }, error: null });
    if (fn === "rpc_lms_meta_acao") return Promise.resolve({ data: { sucesso: true, status: "ATIVA", mensagem: "Meta aprovada e ativa." }, error: null });
    return Promise.resolve({ data: { sucesso: true }, error: null });
  });
}

describe("Fase 9 · aba Metas", () => {
  beforeEach(() => rpc.mockReset());

  it("gerente vê a meta pendente e aprova", async () => {
    respostas(true);
    const { LmsMetasPage } = await import("../metas/LmsMetasPage");
    render(<LmsMetasPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /Aguardando aprovação \(1\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /Aprovar/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_lms_meta_acao", expect.objectContaining({ p_meta_id: "m1", p_acao: "APROVAR" })));
  });

  it("supervisor não vê aprovar; amostra insuficiente aparece como 'sem dados', não como meta perdida", async () => {
    respostas(false);
    const { LmsMetasPage } = await import("../metas/LmsMetasPage");
    render(<LmsMetasPage />);
    expect(await screen.findByText("UPH da equipe")).toBeInTheDocument();
    expect(screen.getByText("Sem dados suficientes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Aguardando aprovação/ }));
    expect(screen.queryByRole("button", { name: /Aprovar/ })).toBeNull();
  });
});
