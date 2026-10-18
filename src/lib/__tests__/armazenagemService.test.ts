import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DestinoArmazenagem } from "@/types/armazenagem";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { guardarPulmaoHabilitado, lerPulmaoHabilitado, preSelecionarDestino, quantidadeSugerida } from "../armazenagemService";

const destino: DestinoArmazenagem = {
  sucesso: true,
  produto: { produto_id: "p", sku: "1", descricao: "Produto", usa_picking: true, varios_pickings: false, fator_caixa: 1 },
  tarefa: null, quantidade: 10, pickings: [],
  pulmao: { saldo: 0, enderecos: 0, habilitado: false, enderecos_disponiveis: 0 },
  recomendacao: { destino: "PICKING", endereco_id: null, endereco: null, quantidade_picking: 2, quantidade_pulmao: 0, quantidade_sem_destino: 8, motivo: "Capacidade parcial" },
};

describe("destino da armazenagem", () => {
  beforeEach(() => localStorage.clear());
  it("SEM_DESTINO nunca pré-seleciona um destino", () => {
    expect(preSelecionarDestino("SEM_DESTINO", false)).toBeNull();
    expect(preSelecionarDestino("SEM_DESTINO", true)).toBeNull();
  });
  it("SEM_PICKING sem pulmão segue para picking", () => {
    expect(preSelecionarDestino("SEM_PICKING", false)).toBe("PICKING");
  });
  it("SEM_PICKING com pulmão segue para pulmão", () => {
    expect(preSelecionarDestino("SEM_PICKING", true)).toBe("PULMAO");
  });
  it("PICKING e DIVIDIR pré-selecionam picking", () => {
    expect(preSelecionarDestino("PICKING", false)).toBe("PICKING");
    expect(preSelecionarDestino("DIVIDIR", true)).toBe("PICKING");
  });
  it("PULMAO pré-seleciona pulmão", () => {
    expect(preSelecionarDestino("PULMAO", true)).toBe("PULMAO");
  });
  it("capacidade parcial sugere somente as 2 unidades que cabem", () => {
    expect(quantidadeSugerida(destino, "PICKING", 10)).toBe(2);
  });
  it("DIVIDIR mantém apenas a parcela picking", () => {
    expect(quantidadeSugerida({ ...destino, recomendacao: { ...destino.recomendacao, destino: "DIVIDIR", quantidade_sem_destino: 0, quantidade_pulmao: 8 } }, "PICKING", 10)).toBe(2);
  });
  it("sem valor guardado exibe pulmão", () => {
    expect(lerPulmaoHabilitado("a")).toBe(true);
  });
  it("offline usa S/N por armazém sem misturar armazéns", () => {
    guardarPulmaoHabilitado("a", false);
    guardarPulmaoHabilitado("b", true);
    expect(localStorage.getItem("coletor_armazem_tem_pulmao_a")).toBe("N");
    expect(localStorage.getItem("coletor_armazem_tem_pulmao_b")).toBe("S");
    expect(lerPulmaoHabilitado("a")).toBe(false);
    expect(lerPulmaoHabilitado("b")).toBe(true);
  });
});