import { describe, it, expect, vi } from "vitest";
import { calcularResumoMovimentacoes } from "../movimentacoes.service";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// Ordem da RPC: mais recente primeiro.
const linhas = [
  { id: "e", criado_em: "2026-11-12T14:00:00.5+00:00", tipo_movimento: 99, estorno_da_execucao_id: "x",
    saldo_global_anterior: 7, saldo_global_posterior: 9, usuario: "ANA" },
  { id: "d", criado_em: "2026-11-11T10:00:00+00:00", tipo_movimento: 6, estorno_da_execucao_id: "",
    saldo_global_anterior: 8, saldo_global_posterior: 7, usuario: "ANA" },
  { id: "c", criado_em: "2026-11-10T10:00:00+00:00", tipo_movimento: 5, estorno_da_execucao_id: "",
    saldo_global_anterior: 10, saldo_global_posterior: 8, usuario: "BETO" },
  { id: "b", criado_em: "2026-11-09T10:00:00+00:00", tipo_movimento: 4, estorno_da_execucao_id: "",
    saldo_global_anterior: 10, saldo_global_posterior: 10, usuario: "BETO" },
  { id: "a", criado_em: "2026-11-08T10:00:00+00:00", tipo_movimento: 1, estorno_da_execucao_id: "",
    saldo_global_anterior: 0, saldo_global_posterior: 10, usuario: "—" },
];

describe("calcularResumoMovimentacoes", () => {
  it("classifica pelo efeito no saldo global e calcula saldo inicial/final", () => {
    const r = calcularResumoMovimentacoes(linhas);
    expect(r).toMatchObject({
      total: 5,
      entradas_qtd: 12, entradas_mov: 2,   // entrada +10 e estorno +2
      saidas_qtd: 3, saidas_mov: 2,        // separação −2 e inventário −1
      internas_mov: 1,                     // armazenagem
      inventario_mov: 1, inventario_liquido: -1,
      estornos_mov: 1,
      saldo_inicial: 0,                    // antes do movimento mais antigo
      saldo_final: 9,                      // depois do mais recente
      ultimo_movimento: "2026-11-12T14:00:00.5+00:00",
      usuarios: 2,                         // "—" não conta
    });
  });

  it("não depende da ordem das linhas", () => {
    const r = calcularResumoMovimentacoes([...linhas].reverse());
    expect(r.saldo_inicial).toBe(0);
    expect(r.saldo_final).toBe(9);
  });

  it("lista vazia devolve zeros e saldos nulos", () => {
    expect(calcularResumoMovimentacoes([])).toMatchObject({
      total: 0, entradas_qtd: 0, saidas_qtd: 0, saldo_inicial: null, saldo_final: null, ultimo_movimento: null,
    });
  });
});
