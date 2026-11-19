import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));

import {
  codigoDeNome, descreverPadrao, horasPadraoSeg, validarPadrao,
} from "../configuracao/lmsConfig.service";
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
