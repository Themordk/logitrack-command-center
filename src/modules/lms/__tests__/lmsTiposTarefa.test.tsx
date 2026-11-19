import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const listar = vi.fn();
const salvar = vi.fn();
const sugerir = vi.fn();
vi.mock("../configuracao/lmsConfig.service", async (orig) => {
  const real = await orig<typeof import("../configuracao/lmsConfig.service")>();
  return {
    ...real,
    listarTiposTarefaLms: (...a: unknown[]) => listar(...a),
    salvarTipoTarefaCompleto: (...a: unknown[]) => salvar(...a),
    sugerirPadraoLms: (...a: unknown[]) => sugerir(...a),
  };
});

import { TiposTarefaSection, cadastroAlterado, ordenarTipos, validarFormTipo } from "../configuracao/TiposTarefaSection";
import { edicaoPadraoInicial, validarEdicaoPadrao } from "../configuracao/PadraoTempoCampos";
import { descreverHistoricoTipo, descreverMudancaTipo, type PadraoTempoConfig, type TipoTarefaLms } from "../configuracao/lmsConfig.service";
import { reservaAcaoLabel } from "@/lib/reservaTarefa";

const ARMZ: TipoTarefaLms = {
  id: "tt-armz", codigo: "ENTR-ARMZ", descricao: "ARMAZENAGEM_ENTRADA", ativo: true, categoria: "ARMAZENAGEM", tipo_movimento: 1,
  unidade_medida: "UN", peso_produtividade: 1.1, cor_interface: "#0004ff",
  reserva_acao: "LIBERAR_SEM_EXECUCAO", reserva_expira_min: 240, acoes_reserva: ["LIBERAR_SEM_EXECUCAO", "ALERTAR", "NUNCA"],
};
const PADRAO: PadraoTempoConfig = {
  tipo_tarefa_id: "tt-armz", codigo: "ENTR-ARMZ", descricao: "ARMAZENAGEM_ENTRADA", unidade_medida: "UN", categoria: "ARMAZENAGEM",
  efetivo: { tempo_fixo_seg: 180, tempo_unidade_seg: 0, pfd_pct: 0, nivel: "EMPRESA", vigente_desde: "2000-01-01", origem: "MIGRADO" },
  herdado: { tempo_fixo_seg: 180, tempo_unidade_seg: 0, pfd_pct: 0, nivel: "CADASTRO" }, proprio: null,
  agendados: [{ id: "ag1", tempo_fixo_seg: 150, tempo_unidade_seg: 0, pfd_pct: 0, vigente_desde: "2026-12-01" }],
};
const REGRA = { tipo_codigo: "ENTR-ARMZ", captura_ativa: true, teto_ciclo_seg: 600, observacao: "Início: leitura do produto" };

function montar(over: Partial<React.ComponentProps<typeof TiposTarefaSection>> = {}) {
  const props = {
    tenantId: "t1", empresaId: "e1", armazemId: null, nivelTela: "EMPRESA" as const, nomeNivel: "Empresa Um", hoje: "2026-11-19",
    padroes: [PADRAO], regrasSistema: [REGRA], podeRetroativo: true, onSalvo: vi.fn(), onExcluirAgendado: vi.fn(), ...over,
  };
  render(<TiposTarefaSection {...props} />);
  return props;
}

async function abrirAba(nome: RegExp) {
  const aba = screen.getByRole("tab", { name: nome });
  fireEvent.mouseDown(aba, { button: 0 });
  fireEvent.click(aba);
}

beforeEach(() => {
  listar.mockReset(); salvar.mockReset(); sugerir.mockReset();
  listar.mockResolvedValue({ pode_editar: true, tipos: [ARMZ], historico: [] });
  salvar.mockResolvedValue({ alterou: true, mensagem: "ok", requer_reprocessamento: false, vigente_desde: null });
});

describe("Fase 10.11 · regras do painel", () => {
  it("validação do cadastro e detecção de mudança", () => {
    const ok = { peso_produtividade: "1", reserva_acao: "LIBERAR_SEM_EXECUCAO" as const, reserva_horas: "4", cor_interface: "#112233" };
    expect(validarFormTipo(ok)).toBeNull();
    expect(validarFormTipo({ ...ok, peso_produtividade: "0" })).toMatch("peso");
    expect(validarFormTipo({ ...ok, reserva_horas: "0.1" })).toMatch("15 minutos");
    expect(validarFormTipo({ ...ok, reserva_acao: "NUNCA", reserva_horas: "0" })).toBeNull();
    const f = { ativo: true, categoria: "ARMAZENAGEM", tipo_movimento: "1", peso_produtividade: "1.1",
      cor_interface: "#0004ff", reserva_acao: "LIBERAR_SEM_EXECUCAO" as const, reserva_horas: "4" };
    expect(cadastroAlterado(f, ARMZ)).toBe(false);
    expect(cadastroAlterado({ ...f, reserva_horas: "1" }, ARMZ)).toBe(true);
  });

  it("validação do tempo padrão como o banco", () => {
    const e = { ...edicaoPadraoInicial(PADRAO, "2026-11-19"), alterado: true };
    expect(validarEdicaoPadrao(e, { hoje: "2026-11-19", podeRetroativo: true, motivo: "" })).toBeNull();
    expect(validarEdicaoPadrao({ ...e, fixo: "0" }, { hoje: "2026-11-19", podeRetroativo: true, motivo: "" })).toMatch("por tarefa ou o tempo por unidade");
    expect(validarEdicaoPadrao({ ...e, vigencia: "2026-11-10" }, { hoje: "2026-11-19", podeRetroativo: true, motivo: "" })).toMatch("motivo");
    expect(validarEdicaoPadrao({ ...e, vigencia: "2026-11-10" }, { hoje: "2026-11-19", podeRetroativo: false, motivo: "x" })).toMatch("passado");
    expect(validarEdicaoPadrao({ ...e, herdar: true, fixo: "0" }, { hoje: "2026-11-19", podeRetroativo: true, motivo: "" })).toBeNull();
    expect(validarEdicaoPadrao({ ...e, alterado: false, fixo: "0" }, { hoje: "2026-11-19", podeRetroativo: true, motivo: "" })).toBeNull();
  });

  it("descreve o histórico de cadastro e de tempo padrão", () => {
    expect(descreverMudancaTipo({ antes: { reserva_expira_min: 240, ativo: true }, depois: { reserva_expira_min: 60, ativo: false } }, reservaAcaoLabel))
      .toBe("Ativo: sim → não · Prazo sem atividade: 4h → 1h");
    expect(descreverHistoricoTipo({ tipo: "PADRAO_TEMPO", tipo_tarefa_id: "x", codigo: "X", padrao: { tempo_fixo_seg: 30, tempo_unidade_seg: 3, pfd_pct: 10 },
      origem: "CALIBRADO", vigente_desde: "2026-11-19", motivo: null, alterado_por: null, alterado_em: "" }, reservaAcaoLabel, "UN"))
      .toBe("Tempo padrão → 30 s + 3 s/un · folga 10% (calibrado) a partir de 19/11/2026");
  });
});

const SEP: TipoTarefaLms = { ...ARMZ, id: "tt-sep", codigo: "SEP", descricao: "SEPARAÇÃO", categoria: "SEPARACAO", tipo_movimento: 2,
  reserva_acao: "ALERTAR", ativo: false };
const EMB: TipoTarefaLms = { ...ARMZ, id: "tt-emb", codigo: "EMB", descricao: "EMBARQUE", categoria: "EXPEDICAO", tipo_movimento: null };
const P_SEP: PadraoTempoConfig = { ...PADRAO, tipo_tarefa_id: "tt-sep", efetivo: { ...PADRAO.efetivo, tempo_fixo_seg: 90 } };

describe("Fase 10.12 · ordenação da grade", () => {
  const mapa = new Map([[PADRAO.tipo_tarefa_id, PADRAO], [P_SEP.tipo_tarefa_id, P_SEP]]);
  const cod = (l: TipoTarefaLms[]) => l.map((t) => t.codigo);
  it("ordena A→Z e Z→A, com vazios sempre no fim", () => {
    const l = [SEP, EMB, ARMZ];
    expect(cod(ordenarTipos(l, { coluna: "tipo", direcao: "asc" }, mapa))).toEqual(["EMB", "ENTR-ARMZ", "SEP"]);
    expect(cod(ordenarTipos(l, { coluna: "tipo", direcao: "desc" }, mapa))).toEqual(["SEP", "ENTR-ARMZ", "EMB"]);
    expect(cod(ordenarTipos(l, { coluna: "categoria", direcao: "asc" }, mapa))).toEqual(["ENTR-ARMZ", "EMB", "SEP"]);
    expect(cod(ordenarTipos(l, { coluna: "movimento", direcao: "asc" }, mapa))).toEqual(["ENTR-ARMZ", "SEP", "EMB"]);
    expect(cod(ordenarTipos(l, { coluna: "movimento", direcao: "desc" }, mapa))).toEqual(["SEP", "ENTR-ARMZ", "EMB"]);
    expect(cod(ordenarTipos(l, { coluna: "tempo", direcao: "asc" }, mapa))).toEqual(["SEP", "ENTR-ARMZ", "EMB"]);
    expect(cod(ordenarTipos(l, { coluna: "tempo", direcao: "desc" }, mapa))).toEqual(["ENTR-ARMZ", "SEP", "EMB"]);
    expect(cod(ordenarTipos(l, { coluna: "situacao", direcao: "desc" }, mapa))).toEqual(["SEP", "EMB", "ENTR-ARMZ"]);
  });
  it("clicar no título alterna A→Z e Z→A", async () => {
    listar.mockResolvedValue({ pode_editar: true, tipos: [SEP, EMB, ARMZ], historico: [] });
    montar({ padroes: [PADRAO, P_SEP] });
    await screen.findByText("EMBARQUE");
    const ordemNaTela = () => screen.getAllByRole("row").slice(1).map((r) => r.querySelector("td span.font-mono")?.textContent);
    expect(ordemNaTela()).toEqual(["EMB", "ENTR-ARMZ", "SEP"]);
    fireEvent.click(screen.getByRole("button", { name: /Tipo de tarefa/ }));
    expect(ordemNaTela()).toEqual(["SEP", "ENTR-ARMZ", "EMB"]);
    fireEvent.click(screen.getByRole("button", { name: /Categoria/ }));
    expect(ordemNaTela()).toEqual(["ENTR-ARMZ", "EMB", "SEP"]);
    expect(screen.getByRole("columnheader", { name: /Categoria/ })).toHaveAttribute("aria-sort", "ascending");
  });
});

describe("Fase 10.11 · tipo de tarefa e tempo padrão numa tela só", () => {
  it("a linha mostra o tempo padrão do nível, a origem e os agendamentos", async () => {
    montar();
    expect(await screen.findByText("ARMAZENAGEM_ENTRADA")).toBeInTheDocument();
    expect(screen.getByText("3 min")).toBeInTheDocument();
    expect(screen.getByText("Definido na empresa")).toBeInTheDocument();
    expect(screen.getByText(/1 agendado/)).toBeInTheDocument();
    expect(screen.getByText("Liberar se nada foi executado · 4h")).toBeInTheDocument();
    expect(listar).toHaveBeenCalledWith("t1", "e1", null);
  });

  it("só o cadastro mudou: envia o cadastro e não mexe no tempo padrão", async () => {
    montar();
    fireEvent.click(await screen.findByLabelText("Editar ENTR-ARMZ"));
    await abrirAba(/Sem atividade/);
    fireEvent.change(await screen.findByLabelText("Prazo sem atividade (horas)"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const arg = salvar.mock.calls[0][0];
    expect(arg.padrao).toBeNull();
    // Fase 10.12: "unidade de medida" saiu do cadastro e não é mais enviada
    expect(arg.cadastro).not.toHaveProperty("unidade_medida");
    expect(screen.queryByText("Unidade de medida")).not.toBeInTheDocument();
    expect(arg.cadastro).toMatchObject({ reserva_acao: "LIBERAR_SEM_EXECUCAO", reserva_expira_min: 60, categoria: "ARMAZENAGEM" });
  });

  it("só o tempo mudou: envia o tempo do nível em tela e não mexe no cadastro", async () => {
    const props = montar();
    fireEvent.click(await screen.findByLabelText("Editar ENTR-ARMZ"));
    await abrirAba(/Tempo padrão/);
    fireEvent.change(await screen.findByLabelText("Por tarefa (s)"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Por un (s)"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Folga PFD (%)"), { target: { value: "10" } });
    expect(screen.getByTestId("lms-padrao-previa")).toHaveTextContent("10 un = 1 min 6 s");
    expect(screen.getByTestId("lms-regra-sistema")).toHaveTextContent("teto de ciclo");
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const arg = salvar.mock.calls[0][0];
    expect(arg.cadastro).toBeNull();
    expect(arg.padrao).toEqual({ empresa_id: "e1", armazem_id: null, herdar: false, origem: "MANUAL", vigente_desde: "2026-11-19",
      tempo_fixo_seg: 30, tempo_unidade_seg: 3, pfd_pct: 10 });
    await waitFor(() => expect(props.onSalvo).toHaveBeenCalledWith({ requerReprocessamento: false, vigenteDesde: null }));
  });

  it("os dois juntos num Salvar só; data no passado exige motivo", async () => {
    salvar.mockResolvedValue({ alterou: true, mensagem: "ok", requer_reprocessamento: true, vigente_desde: "2026-11-10" });
    const props = montar();
    fireEvent.click(await screen.findByLabelText("Editar ENTR-ARMZ"));
    fireEvent.change(screen.getByLabelText("Peso de produtividade"), { target: { value: "2" } });
    await abrirAba(/Tempo padrão/);
    fireEvent.change(await screen.findByLabelText("Por tarefa (s)"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Vale a partir de"), { target: { value: "2026-11-10" } });
    expect(screen.getByRole("alert")).toHaveTextContent("motivo");
    expect(screen.getByRole("button", { name: /Salvar/ })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Ex.: estudo de tempos de outubro"), { target: { value: "estudo de tempos" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const arg = salvar.mock.calls[0][0];
    expect(arg.cadastro).toMatchObject({ peso_produtividade: 2 });
    expect(arg.padrao).toMatchObject({ tempo_fixo_seg: 120, vigente_desde: "2026-11-10" });
    expect(arg.motivo).toBe("estudo de tempos");
    await waitFor(() => expect(props.onSalvo).toHaveBeenCalledWith({ requerReprocessamento: true, vigenteDesde: "2026-11-10" }));
  });

  it("voltar a herdar e cancelar agendamento", async () => {
    const props = montar();
    fireEvent.click(await screen.findByLabelText("Editar ENTR-ARMZ"));
    await abrirAba(/Tempo padrão/);
    fireEvent.click(await screen.findByLabelText("Cancelar agendamento"));
    expect(props.onExcluirAgendado).toHaveBeenCalledWith("ag1");
    fireEvent.click(screen.getByLabelText(/Voltar a herdar/));
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar.mock.calls[0][0].padrao).toEqual({ empresa_id: "e1", armazem_id: null, herdar: true, origem: "MANUAL", vigente_desde: "2026-11-19" });
  });

  it("usar sugestão do histórico grava como CALIBRADO", async () => {
    sugerir.mockResolvedValue({
      sucesso: true, suficiente: true, mensagem: "Sugestão feita com 24 execuções reais de 1 operador(es) nos últimos 30 dias.",
      amostra: { dias: 30, de: "", ate: "", encontradas: 25, usadas: 24, descartadas: 1, minimo: 10, operadores: 1 },
      observado: { mediana_seg: 63, p25_seg: 48, p75_seg: 78, quantidade_media: 10.5, variacao_quantidade: 0.55 },
      atual: PADRAO.efetivo, sugestao: { modelo: "FIXO_MAIS_UNIDADE", tempo_fixo_seg: 27.5, tempo_unidade_seg: 2.72, pfd_pct: 10, r2: 0.99 },
      impacto: { atual: { performance_mediana_pct: 216.7, performance_total_pct: 206.9 }, sugerido: { performance_mediana_pct: 100.1, performance_total_pct: 100.3 } },
    });
    montar();
    fireEvent.click(await screen.findByLabelText("Editar ENTR-ARMZ"));
    await abrirAba(/Tempo padrão/);
    fireEvent.click(await screen.findByRole("button", { name: "Sugerir" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar sugestão" }));
    expect(screen.getByTestId("lms-sugestao")).toHaveTextContent("216,7%");
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    const arg = salvar.mock.calls[0][0];
    expect(arg.padrao).toMatchObject({ tempo_fixo_seg: 27.5, tempo_unidade_seg: 2.72, pfd_pct: 10, origem: "CALIBRADO" });
    expect(arg.motivo).toMatch("24 execuções reais");
    expect(sugerir).toHaveBeenCalledWith(expect.objectContaining({ tipoTarefaId: "tt-armz", empresaId: "e1" }));
  });

  it("amostra insuficiente: avisa e não oferece sugestão", async () => {
    sugerir.mockResolvedValue({
      sucesso: true, suficiente: false, mensagem: "Amostra insuficiente: 3 execução(ões) com início real nos últimos 30 dias; são necessárias pelo menos 10.",
      amostra: { dias: 30, de: "", ate: "", encontradas: 3, usadas: 3, descartadas: 0, minimo: 10, operadores: 1 },
      observado: null, atual: PADRAO.efetivo, sugestao: null, impacto: null,
    });
    montar();
    fireEvent.click(await screen.findByLabelText("Editar ENTR-ARMZ"));
    await abrirAba(/Tempo padrão/);
    fireEvent.click(await screen.findByRole("button", { name: "Sugerir" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Amostra insuficiente");
    expect(screen.queryByRole("button", { name: "Usar sugestão" })).toBeNull();
  });

  it("histórico junta cadastro e tempo padrão do tipo", async () => {
    listar.mockResolvedValue({ pode_editar: true, tipos: [ARMZ], historico: [
      { tipo: "PADRAO_TEMPO", tipo_tarefa_id: "tt-armz", codigo: "ENTR-ARMZ", padrao: { tempo_fixo_seg: 150, tempo_unidade_seg: 0, pfd_pct: 0 },
        origem: "MANUAL", vigente_desde: "2026-11-19", motivo: "ajuste", alterado_por: "Izaias", alterado_em: "2026-11-19T22:00:00Z" },
      { tipo: "CADASTRO", tipo_tarefa_id: "tt-armz", codigo: "ENTR-ARMZ", antes: { reserva_expira_min: 240 }, depois: { reserva_expira_min: 60 },
        motivo: null, alterado_por: "Izaias", alterado_em: "2026-11-19T21:00:00Z" },
    ] });
    montar();
    fireEvent.click(await screen.findByLabelText("Editar ENTR-ARMZ"));
    await abrirAba(/Histórico/);
    expect(await screen.findByText(/Tempo padrão → 2 min 30 s/)).toBeInTheDocument();
    expect(screen.getByText("Prazo sem atividade: 4h → 1h")).toBeInTheDocument();
  });

  it("somente leitura: abre para ver, sem Salvar", async () => {
    listar.mockResolvedValue({ pode_editar: false, tipos: [ARMZ], historico: [] });
    montar();
    fireEvent.click(await screen.findByLabelText("Ver ENTR-ARMZ"));
    expect(screen.queryByRole("button", { name: /Salvar/ })).not.toBeInTheDocument();
    await abrirAba(/Tempo padrão/);
    expect(await screen.findByText("Valendo hoje")).toBeInTheDocument();
    expect(screen.queryByLabelText("Por tarefa (s)")).not.toBeInTheDocument();
  });
});
