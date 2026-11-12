import { describe, expect, it } from "vitest";
import { agruparSugestao, descreverTransporte, moverItem, nivelCapacidade, placaValida } from "@/lib/cargaExibicao";
import type { OndaSugerida } from "@/lib/cargaService";

const onda = (n: number, chave: string, rotulo: string, peso: number): OndaSugerida => ({
  movimento_saida_id: `id-${n}`, numero_onda: n, status: "CONFERIDO", prioridade: "NORMAL",
  veiculo_id: null, veiculo: null, placa: null, box_id: null, box: null, transportadora_id: null, transportadora: null, transportadoras: 0, rota: null, tipo_saida: null,
  parceiros: null, peso_total: peso, m3: 1, documentos: 2, volumes: 0, created_at: null,
  grupo_chave: chave, grupo_rotulo: rotulo,
});

describe("agruparSugestao", () => {
  it("junta ondas da mesma chave e soma peso, m³ e pedidos", () => {
    const grupos = agruparSugestao([onda(1, "A", "Rota Norte", 100), onda(2, "B", "Rota Centro", 50), onda(3, "A", "Rota Norte", 25)]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Rota Centro", "Rota Norte"]);
    const norte = grupos.find((g) => g.chave === "A");
    expect(norte?.ondas.map((o) => o.numero_onda)).toEqual([1, 3]);
    expect(norte?.peso).toBe(125);
    expect(norte?.documentos).toBe(4);
  });
});

describe("moverItem", () => {
  it("move para cima e para baixo sem alterar a lista original", () => {
    const base = ["a", "b", "c", "d"];
    expect(moverItem(base, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moverItem(base, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(base).toEqual(["a", "b", "c", "d"]);
  });
  it("ignora posições inválidas", () => {
    expect(moverItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moverItem(["a", "b"], -1, 1)).toEqual(["a", "b"]);
  });
});

describe("nivelCapacidade", () => {
  it("classifica o percentual de ocupação do veículo", () => {
    expect(nivelCapacidade(null)).toBe("sem-limite");
    expect(nivelCapacidade(50)).toBe("ok");
    expect(nivelCapacidade(95)).toBe("alerta");
    expect(nivelCapacidade(101)).toBe("excedido");
  });
});

describe("descreverTransporte", () => {
  it("mostra a transportadora ou o veículo próprio, com a placa", () => {
    expect(descreverTransporte({ modalidade: "TERCEIRO", transportadora: "ALFA", placa: "ABC1D23" })).toBe("ALFA - ABC1D23");
    expect(descreverTransporte({ modalidade: "TERCEIRO", transportadora: null })).toBe("Transportadora não informada");
    expect(descreverTransporte({ modalidade: "PROPRIA", veiculo: "Truck 01", placa: null })).toBe("Truck 01");
  });
});

describe("placaValida", () => {
  it("aceita padrão antigo e Mercosul, com ou sem hífen", () => {
    expect(placaValida("abc-1234")).toBe(true);
    expect(placaValida("ABC1D23")).toBe(true);
    expect(placaValida("AB12345")).toBe(false);
  });
});
