import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));

import {
  codigoDeNome, descreverPadrao, horasPadraoSeg, validarPadrao, type PadraoTempoConfig,
} from "../configuracao/lmsConfig.service";
import { EditarPadraoDialog } from "../configuracao/EditarPadraoDialog";
import { criarAcessoLms } from "../lmsAcesso";
import { formatarDecorrido, segundosDesde } from "@/pages/coletor/atividades/atividadesIndiretas.service";

describe("Fase 8 · padrão em três partes", () => {
  it("horas padrão seguem a mesma fórmula do banco (fn_lms_hp_seg)", () => {
    // padrão antigo (só fixo) = fixo × min(1, executada/requerida)
    expect(horasPadraoSeg({ tempo_fixo_seg: 120 }, 1, 2)).toBe(60);
    expect(horasPadraoSeg({ tempo_fixo_seg: 120 }, 5, 2)).toBe(120);
    // (fixo × fator + unidade × qtd) × (1 + PFD)
    expect(horasPadraoSeg({ tempo_fixo_seg: 100, tempo_unidade_seg: 2, pfd_pct: 10 }, 10, 10)).toBeCloseTo(132);
  });

  it("descreve o padrão do jeito que o gerente lê", () => {
    expect(descreverPadrao({ tempo_fixo_seg: 120 })).toBe("2 min");
    expect(descreverPadrao({ tempo_fixo_seg: 30, tempo_unidade_seg: 3, pfd_pct: 10 }, "CX")).toBe("30 s + 3 s/cx · folga 10%");
    expect(descreverPadrao({ tempo_fixo_seg: 0, tempo_unidade_seg: 1.5 })).toBe("1,5 s/un");
    expect(descreverPadrao({ tempo_fixo_seg: 0 })).toBe("sem padrão");
  });

  it("valida como o banco", () => {
    expect(validarPadrao({ fixo: 30, unidade: 3, pfd: 10 })).toBeNull();
    expect(validarPadrao({ fixo: 0, unidade: 0, pfd: 0 })).toMatch("por tarefa ou o tempo por unidade");
    expect(validarPadrao({ fixo: 30, unidade: 0, pfd: 60 })).toMatch("entre 0% e 50%");
    expect(validarPadrao({ fixo: 30, unidade: 4000, pfd: 0 })).toMatch("3.600");
  });
});

const padrao: PadraoTempoConfig = {
  tipo_tarefa_id: "tt-1", codigo: "SEP-CONF", descricao: "Conferência", unidade_medida: "UN", categoria: null,
  efetivo: { tempo_fixo_seg: 120, tempo_unidade_seg: 0, pfd_pct: 0, nivel: "EMPRESA", vigente_desde: "2000-01-01", origem: "MIGRADO" },
  herdado: { tempo_fixo_seg: 120, tempo_unidade_seg: 0, pfd_pct: 0, nivel: "CADASTRO" },
  proprio: null, agendados: [],
};
const ctx = { tenantId: "t", empresaId: "e", armazemId: null };

describe("Fase 8 · diálogo do tempo padrão", () => {
  beforeEach(() => rpc.mockReset());

  it("grava as três partes", () => {
    const onSalvar = vi.fn();
    render(<EditarPadraoDialog padrao={padrao} nivelTela="EMPRESA" hoje="2026-11-19" podeRetroativo={false}
      salvando={false} contexto={ctx} onCancelar={() => {}} onSalvar={onSalvar} />);
    fireEvent.change(screen.getByLabelText("Por tarefa (s)"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Por un (s)"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Folga PFD (%)"), { target: { value: "10" } });
    expect(screen.getByTestId("lms-padrao-previa")).toHaveTextContent("10 un = 1 min 6 s");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSalvar).toHaveBeenCalledWith({ fixo: 30, unidade: 3, pfd: 10 }, "MANUAL", "2026-11-19", "");
  });

  it("amostra insuficiente: avisa e não oferece sugestão", async () => {
    rpc.mockResolvedValue({ data: {
      sucesso: true, suficiente: false, mensagem: "Amostra insuficiente: 3 execução(ões) com início real nos últimos 30 dias; são necessárias pelo menos 10.",
      amostra: { dias: 30, de: "", ate: "", encontradas: 3, usadas: 3, descartadas: 0, minimo: 10, operadores: 1 },
      observado: null, atual: padrao.efetivo, sugestao: null, impacto: null,
    }, error: null });
    render(<EditarPadraoDialog padrao={padrao} nivelTela="EMPRESA" hoje="2026-11-19" podeRetroativo={false}
      salvando={false} contexto={ctx} onCancelar={() => {}} onSalvar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sugerir" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Amostra insuficiente");
    expect(screen.queryByRole("button", { name: "Usar sugestão" })).toBeNull();
  });

  it("usar sugestão preenche os campos e grava como CALIBRADO", async () => {
    rpc.mockResolvedValue({ data: {
      sucesso: true, suficiente: true, mensagem: "Sugestão feita com 24 execuções reais de 1 operador(es) nos últimos 30 dias.",
      amostra: { dias: 30, de: "", ate: "", encontradas: 25, usadas: 24, descartadas: 1, minimo: 10, operadores: 1 },
      observado: { mediana_seg: 63, p25_seg: 48, p75_seg: 78, quantidade_media: 10.5, variacao_quantidade: 0.55 },
      atual: padrao.efetivo,
      sugestao: { modelo: "FIXO_MAIS_UNIDADE", tempo_fixo_seg: 27.5, tempo_unidade_seg: 2.72, pfd_pct: 10, r2: 0.99 },
      impacto: { atual: { performance_mediana_pct: 216.7, performance_total_pct: 206.9 }, sugerido: { performance_mediana_pct: 100.1, performance_total_pct: 100.3 } },
    }, error: null });
    const onSalvar = vi.fn();
    render(<EditarPadraoDialog padrao={padrao} nivelTela="EMPRESA" hoje="2026-11-19" podeRetroativo={false}
      salvando={false} contexto={ctx} onCancelar={() => {}} onSalvar={onSalvar} />);
    fireEvent.click(screen.getByRole("button", { name: "Sugerir" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar sugestão" }));
    expect(screen.getByTestId("lms-sugestao")).toHaveTextContent("216,7%");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onSalvar).toHaveBeenCalled());
    const [partes, origem, , motivo] = onSalvar.mock.calls[0];
    expect(partes).toEqual({ fixo: 27.5, unidade: 2.72, pfd: 10 });
    expect(origem).toBe("CALIBRADO");
    expect(motivo).toMatch("24 execuções reais");
    expect(rpc).toHaveBeenCalledWith("rpc_lms_padrao_sugerir", expect.objectContaining({ p_tipo_tarefa_id: "tt-1" }));
  });
});

describe("Fase 8 · atividades indiretas", () => {
  it("gera código a partir do nome", () => {
    expect(codigoDeNome("Limpeza de doca")).toBe("LIMPEZA_DE_DOCA");
    expect(codigoDeNome("Reunião / DDS")).toBe("REUNIAO_DDS");
  });

  it("cronômetro do coletor", () => {
    expect(formatarDecorrido(42)).toBe("42 s");
    expect(formatarDecorrido(12 * 60)).toBe("12 min");
    expect(formatarDecorrido(3900)).toBe("1 h 05 min");
    expect(segundosDesde({ segundos: 60 }, 1000, 31000)).toBe(90);
  });

  it("apontar no coletor depende de coletor.lms.atividades", () => {
    const so = (m: string) => (mod: string, acao: string) => mod === m && acao === "READ";
    expect(criarAcessoLms(so("coletor.lms.atividades")).pode("atividades")).toBe(true);
    expect(criarAcessoLms(so("coletor.lms.metas")).pode("atividades")).toBe(false);
    // não aparece como aba web do módulo
    expect(criarAcessoLms(so("coletor.lms.atividades")).temModuloWeb).toBe(false);
  });
});

import { AtividadeEmAndamentoBanner } from "@/pages/coletor/atividades/AtividadeEmAndamentoBanner";

describe("Fase 8 · faixa de atividade em andamento no coletor", () => {
  it("mostra a parada, o tempo decorrido e encerra", () => {
    const onEncerrar = vi.fn();
    render(<AtividadeEmAndamentoBanner
      aberto={{ id: "ap", atividade_id: "a", codigo: "SISTEMA_FORA", nome: "Sistema fora do ar", tipo: "EXCECAO",
        inicio: "", duracao_max_min: 120, encerra_automaticamente_em: "", segundos: 600 }}
      recebidoEm={Date.now()} encerrando={false} onEncerrar={onEncerrar} />);
    expect(screen.getByTestId("coletor-atividade-aberta")).toHaveTextContent("Parada há 10 min");
    fireEvent.click(screen.getByRole("button", { name: /Encerrar/ }));
    expect(onEncerrar).toHaveBeenCalled();
  });
});
