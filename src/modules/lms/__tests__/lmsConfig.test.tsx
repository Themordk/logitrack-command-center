import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  descreverOrigem, ehRetroativa, formatarSegundos, formatarValor, validarValor,
} from "../configuracao/lmsConfig.service";
import { EditarRegraDialog, type RegraEmEdicao } from "../configuracao/EditarRegraDialog";

describe("Fase 7 · configuração em cascata (exibição)", () => {
  it("descreve de onde vem cada valor, do ponto de vista do nível aberto", () => {
    expect(descreverOrigem("EMPRESA", "EMPRESA")).toBe("Definido na empresa");
    expect(descreverOrigem("ARMAZEM", "ARMAZEM")).toBe("Definido neste armazém");
    expect(descreverOrigem("EMPRESA", "ARMAZEM")).toBe("Herdado da empresa");
    expect(descreverOrigem("SISTEMA", "ARMAZEM")).toBe("Padrão do sistema");
    expect(descreverOrigem("CADASTRO", "EMPRESA")).toBe("Herdado do cadastro do tipo");
  });

  it("formata tempos, percentuais e múltiplos", () => {
    expect(formatarSegundos(45)).toBe("45 s");
    expect(formatarSegundos(90)).toBe("1 min 30 s");
    expect(formatarSegundos(3600)).toBe("1 h");
    expect(formatarSegundos(28800)).toBe("8 h");
    expect(formatarValor(110, "PERCENTUAL")).toBe("110%");
    expect(formatarValor(10, "MULTIPLO")).toBe("10×");
    expect(formatarValor(null, "SEGUNDOS")).toBe("—");
  });

  it("valida faixa antes de mandar ao banco e reconhece data retroativa", () => {
    const p = { minimo: 50, maximo: 300, rotulo: "Faixa" };
    expect(validarValor(p, 110)).toBeNull();
    expect(validarValor(p, 20)).toMatch("entre 50 e 300");
    expect(validarValor(p, null)).toBeNull();
    expect(ehRetroativa("2026-11-17", "2026-11-18")).toBe(true);
    expect(ehRetroativa("2026-11-18", "2026-11-18")).toBe(false);
  });
});

const regra: RegraEmEdicao = {
  tipo: "PARAMETRO", chave: "faixa_bom_pct", rotulo: "Faixa Bom a partir de", unidade: "PERCENTUAL",
  minimo: 30, maximo: 300, valorEfetivo: 90, nivelEfetivo: "SISTEMA", valorHerdado: 90, nivelHerdado: "SISTEMA", temProprio: false,
};

describe("Fase 7 · diálogo de alteração", () => {
  it("salva o novo valor com vigência de hoje", () => {
    const onSalvar = vi.fn();
    render(<EditarRegraDialog regra={regra} nivelTela="EMPRESA" hoje="2026-11-18" podeRetroativo={false}
      salvando={false} onCancelar={() => {}} onSalvar={onSalvar} />);
    fireEvent.change(screen.getByLabelText(/Novo valor/), { target: { value: "95" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith(95, "2026-11-18", "");
  });

  it("bloqueia valor fora da faixa", () => {
    render(<EditarRegraDialog regra={regra} nivelTela="EMPRESA" hoje="2026-11-18" podeRetroativo={false}
      salvando={false} onCancelar={() => {}} onSalvar={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Novo valor/), { target: { value: "5" } });
    expect(screen.getByRole("alert")).toHaveTextContent("entre 30% e 300%");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("data no passado exige motivo", () => {
    const onSalvar = vi.fn();
    render(<EditarRegraDialog regra={regra} nivelTela="ARMAZEM" hoje="2026-11-18" podeRetroativo
      salvando={false} onCancelar={() => {}} onSalvar={onSalvar} />);
    fireEvent.change(screen.getByLabelText("Vale a partir de"), { target: { value: "2026-11-10" } });
    expect(screen.getByRole("alert")).toHaveTextContent("motivo");
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "ajuste do layout" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith(90, "2026-11-10", "ajuste do layout");
  });

  it("voltar a herdar envia valor nulo", () => {
    const onSalvar = vi.fn();
    render(<EditarRegraDialog regra={{ ...regra, temProprio: true, valorEfetivo: 95, nivelEfetivo: "EMPRESA" }}
      nivelTela="EMPRESA" hoje="2026-11-18" podeRetroativo={false}
      salvando={false} onCancelar={() => {}} onSalvar={onSalvar} />);
    fireEvent.click(screen.getByLabelText(/Voltar a herdar/));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith(null, "2026-11-18", "");
  });
});

vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenantId: "t1", empresaId: "e1" }) }));
vi.mock("../configuracao/lmsConfig.service", async (orig) => {
  const real = await orig<typeof import("../configuracao/lmsConfig.service")>();
  return {
    ...real,
    listarEmpresas: vi.fn().mockResolvedValue([{ id: "e1", nome: "Empresa Um" }]),
    obterSaudeConfig: vi.fn().mockResolvedValue({ pronto: true, passos: [] }),
    reprocessarLms: vi.fn().mockResolvedValue({ dias: 3, linhas: 5 }),
    listarArmazens: vi.fn().mockResolvedValue([{ id: "a1", nome: "CD Fortaleza" }]),
    listarTiposTarefaLms: vi.fn().mockResolvedValue({ pode_editar: true, historico: [], tipos: [{
      id: "tt1", codigo: "SEP", descricao: "SEPARAÇÃO", ativo: true, categoria: "SEPARACAO", tipo_movimento: 2, unidade_medida: "Unidade",
      peso_produtividade: 1, cor_interface: null, reserva_acao: "LIBERAR_SEM_EXECUCAO", reserva_expira_min: 240,
      acoes_reserva: ["LIBERAR_SEM_EXECUCAO", "ALERTAR", "NUNCA"] }] }),
    listarAtividadesLms: vi.fn().mockResolvedValue({ pode_editar: true, atividades: [
      { id: "a1", codigo: "LIMPEZA", nome: "Limpeza e organização (5S)", tipo: "INDIRETA", duracao_max_min: 60, ativo: true, ordem: 10, usos_30d: 2 },
      { id: "a2", codigo: "SISTEMA_FORA", nome: "Sistema fora do ar", tipo: "EXCECAO", duracao_max_min: 120, ativo: true, ordem: 60, usos_30d: 0 },
    ] }),
    obterConfigLms: vi.fn().mockResolvedValue({
      sucesso: true, nivel: "EMPRESA", empresa_id: "e1", armazem_id: null, data: "2026-11-18", hoje: "2026-11-18",
      pode_editar: true, pode_reprocessar: true,
      parametros: [{
        codigo: "pct_inicio_real_min", grupo: "QUALIDADE", rotulo: "Início real mínimo", ajuda: "ajuda", unidade: "PERCENTUAL", avancado: true,
        padrao_sistema: 95, minimo: 50, maximo: 100, niveis: ["EMPRESA"], editavel_neste_nivel: true,
        efetivo: { valor: 95, nivel: "SISTEMA", vigente_desde: null }, herdado: { valor: 95, nivel: "SISTEMA" },
        proprio: null, agendados: [{ id: "x", valor: 90, vigente_desde: "2026-12-01" }],
      }],
      padroes_tempo: [{
        tipo_tarefa_id: "tt1", codigo: "SEP", descricao: "SEPARAÇÃO", unidade_medida: "Unidade", categoria: "SEPARACAO",
        efetivo: { tempo_fixo_seg: 90, nivel: "EMPRESA", vigente_desde: "2000-01-01", origem: "MIGRADO" },
        herdado: { tempo_fixo_seg: 90, nivel: "CADASTRO" }, proprio: null, agendados: [],
      }],
      faixas: {
        paleta: ["verde", "azul"],
        efetivo: { lista: [
          { ordem: 1, codigo: "ELITE", nome: "Elite", cor: "roxo", a_partir_de_pct: 120, eh_meta: false },
          { ordem: 2, codigo: "META", nome: "Na meta", cor: "azul", a_partir_de_pct: 90, eh_meta: true },
          { ordem: 3, codigo: "ABAIXO", nome: "Abaixo", cor: "vermelho", a_partir_de_pct: 0, eh_meta: false },
        ], nivel: "EMPRESA", vigente_desde: "2026-11-18" },
        herdado: { lista: [], nivel: "SISTEMA" },
        agendados: [],
      },
      regras_sistema: [{ tipo_codigo: "SEP", captura_ativa: true, teto_ciclo_seg: 600, observacao: "Início: abertura" }],
      historico: [],
    }),
  };
});

describe("Fase 7 · painel de configurações", () => {
  it("mostra tempo padrão, origem, parâmetros e agendamento", async () => {
    const { LmsConfiguracaoPage } = await import("../configuracao/LmsConfiguracaoPage");
    render(<LmsConfiguracaoPage />);
    expect(await screen.findByText("SEPARAÇÃO")).toBeInTheDocument();
    expect(screen.getByText("1 min 30 s")).toBeInTheDocument();
    expect(screen.getAllByText("Definido na empresa").length).toBeGreaterThan(0);
    expect(screen.getByText("Início real mínimo")).toBeInTheDocument();
    expect(screen.getByText(/90% em/)).toBeInTheDocument();
    expect(screen.getByText("Elite")).toBeInTheDocument();
    expect(screen.getByText("90–120%")).toBeInTheDocument();
    expect(screen.getByText("Meta")).toBeInTheDocument();
    // Fase 10.11: tempo padrão fica dentro do painel do tipo de tarefa
    expect(screen.queryByText("Tempo padrão por tipo de tarefa")).not.toBeInTheDocument();
    expect(screen.queryByText(/Regras do sistema/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Editar SEP"));
    const aba = screen.getByRole("tab", { name: /Tempo padrão/ });
    fireEvent.mouseDown(aba, { button: 0 });
    fireEvent.click(aba);
    expect(await screen.findByLabelText("Por tarefa (s)")).toHaveValue("90");
    expect(screen.getByLabelText("Tolerância PFD (%)")).toHaveValue("0");
    expect(screen.getByTestId("lms-regra-sistema")).toHaveTextContent("Início: abertura");
    // Fase 8: catálogo de atividades indiretas e paradas
    expect(await screen.findByText("Limpeza e organização (5S)")).toBeInTheDocument();
    expect(screen.getByText("Parada fora do controle do operador")).toBeInTheDocument();
  });

  it("Fase 10.20: parâmetro avançado fica recolhido, padrão migrado tem selo e reprocessar fica sempre à mão", async () => {
    const svc = await import("../configuracao/lmsConfig.service");
    const { LmsConfiguracaoPage } = await import("../configuracao/LmsConfiguracaoPage");
    render(<LmsConfiguracaoPage />);
    expect(await screen.findByText("SEPARAÇÃO")).toBeInTheDocument();
    const avancado = screen.getByTestId("lms-parametros-avancados");
    expect(avancado).toHaveTextContent("Início real mínimo");
    expect(avancado).toHaveTextContent("só altere com orientação");
    expect(avancado).not.toHaveAttribute("open");
    expect(screen.getByText("Não calibrado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reprocessar período/ }));
    fireEvent.change(screen.getByLabelText("Recalcular a partir de"), { target: { value: "2026-11-10" } });
    fireEvent.click(screen.getByRole("button", { name: /^Reprocessar$/ }));
    await waitFor(() => expect(svc.reprocessarLms).toHaveBeenCalledWith("t1", "2026-11-10"));
  });
});
