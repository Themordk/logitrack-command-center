import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    listarArmazens: vi.fn().mockResolvedValue([{ id: "a1", nome: "CD Fortaleza" }]),
    obterConfigLms: vi.fn().mockResolvedValue({
      sucesso: true, nivel: "EMPRESA", empresa_id: "e1", armazem_id: null, data: "2026-11-18", hoje: "2026-11-18",
      pode_editar: true, pode_reprocessar: true,
      parametros: [{
        codigo: "faixa_bom_pct", grupo: "CLASSIFICACAO", rotulo: "Faixa Bom a partir de", ajuda: "ajuda", unidade: "PERCENTUAL",
        padrao_sistema: 90, minimo: 30, maximo: 300, niveis: ["EMPRESA", "ARMAZEM"], editavel_neste_nivel: true,
        efetivo: { valor: 90, nivel: "SISTEMA", vigente_desde: null }, herdado: { valor: 90, nivel: "SISTEMA" },
        proprio: null, agendados: [{ id: "x", valor: 95, vigente_desde: "2026-12-01" }],
      }],
      padroes_tempo: [{
        tipo_tarefa_id: "tt1", codigo: "SEP", descricao: "SEPARAÇÃO", unidade_medida: "Unidade", categoria: "SEPARACAO",
        efetivo: { tempo_fixo_seg: 90, nivel: "EMPRESA", vigente_desde: "2000-01-01", origem: "MIGRADO" },
        herdado: { tempo_fixo_seg: 90, nivel: "CADASTRO" }, proprio: null, agendados: [],
      }],
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
    expect(screen.getByText("Definido na empresa")).toBeInTheDocument();
    expect(screen.getByText("Faixa Bom a partir de")).toBeInTheDocument();
    expect(screen.getByText(/95% em/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Alterar tempo padrão de SEP"));
    expect(screen.getByLabelText(/Novo valor \(segundos\)/)).toHaveValue("90");
  });
});
