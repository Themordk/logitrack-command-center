import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecebimentoFilter, EMPTY_RECEBIMENTO_FILTERS } from "@/hooks/useRecebimentoFilter";

const KEY = "test_filtro_recebimento";

const movimentos = [
  {
    id: "1",
    numero_movimento: 152,
    status: "LIBERADO",
    tipo_entrada: "COMPRA",
    parceiro: "AUTO PECAS PADRE CICERO LTDA",
    parceiro_busca: "auto pecas padre cicero ltda",
    notas: "171717",
  },
  {
    id: "2",
    numero_movimento: 200,
    status: "LIBERADO",
    tipo_entrada: "DEVOLUCAO",
    parceiro: "Distribuidora CÍCERO",
    parceiro_busca: "distribuidora cícero",
    notas: "99881",
  },
];

function setup() {
  return renderHook(() => useRecebimentoFilter(KEY));
}

describe("useRecebimentoFilter", () => {
  beforeEach(() => sessionStorage.clear());

  it("ignora filtros vazios e retorna a lista inteira", () => {
    const { result } = setup();
    expect(result.current.apply(movimentos)).toHaveLength(2);
    expect(result.current.activeCount).toBe(0);
  });

  it("busca parceiro sem acento em ambos os lados", () => {
    const { result } = setup();
    act(() => result.current.setFilters({ ...EMPTY_RECEBIMENTO_FILTERS, parceiro: "cicero" }));
    expect(result.current.apply(movimentos)).toHaveLength(2);
    act(() => result.current.setFilters({ ...EMPTY_RECEBIMENTO_FILTERS, parceiro: "padre" }));
    const filtrado = result.current.apply(movimentos);
    expect(filtrado).toHaveLength(1);
    expect(filtrado[0].id).toBe("1");
  });

  it("filtra por número parcial de movimento e de documento", () => {
    const { result } = setup();
    act(() => result.current.setFilters({ ...EMPTY_RECEBIMENTO_FILTERS, numeroMovimento: "15" }));
    expect(result.current.apply(movimentos).map((m) => m.id)).toEqual(["1"]);
    act(() => result.current.setFilters({ ...EMPTY_RECEBIMENTO_FILTERS, numeroDocumento: "998" }));
    expect(result.current.apply(movimentos).map((m) => m.id)).toEqual(["2"]);
  });

  it("combina critérios com E e persiste na sessão", () => {
    const { result } = setup();
    act(() =>
      result.current.setFilters({
        ...EMPTY_RECEBIMENTO_FILTERS,
        tipoEntrada: "compra",
        parceiro: "padre",
      }),
    );
    expect(result.current.activeCount).toBe(2);
    expect(result.current.apply(movimentos).map((m) => m.id)).toEqual(["1"]);
    expect(sessionStorage.getItem(KEY)).toBeTruthy();
    act(() => result.current.clear());
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
