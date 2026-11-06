import { beforeEach, describe, expect, it } from "vitest";
import { definirOrigemArmazenagem, lerOrigemArmazenagem, rotaListaItens, calcularPrazo, formatarHorasParado, prazoCancelamentoValido } from "../armazenagemOrigem";
describe("origem e prazo de armazenagem", () => {
  beforeEach(() => sessionStorage.clear());
  it("sem chave usa entrada", () => expect(lerOrigemArmazenagem()).toBe("ENTRADA"));
  it("troca entre cancelamento e entrada", () => { definirOrigemArmazenagem("CANCELAMENTO"); expect(lerOrigemArmazenagem()).toBe("CANCELAMENTO"); definirOrigemArmazenagem("ENTRADA"); expect(lerOrigemArmazenagem()).toBe("ENTRADA"); });
  it("lista correta para cada origem", () => { expect(rotaListaItens("ENTRADA")).toBe("/coletor/armazenagem/itens"); expect(rotaListaItens("CANCELAMENTO")).toBe("/coletor/armazenagem/cancelamentos/itens"); });
  it("prazo padrão é 2 horas", () => { expect(calcularPrazo(null, 1, 0).status).toBe("ATENCAO"); expect(calcularPrazo(null, 2, 0).status).toBe("VENCIDO"); });
  it("atenção começa exatamente em 50%", () => { expect(calcularPrazo(null, .999, 2).status).toBe("NO_PRAZO"); expect(calcularPrazo(null, 1, 2).status).toBe("ATENCAO"); });
  it("vencido começa exatamente em 100%", () => { expect(calcularPrazo(null, 1.999, 2).status).toBe("ATENCAO"); expect(calcularPrazo(null, 2, 2).status).toBe("VENCIDO"); });
  it("passagem do tempo recalcula pelo instante de entrada", () => { const inicio = "2026-11-06T12:00:00Z"; expect(calcularPrazo(inicio, 0, 2, Date.parse("2026-11-06T14:00:00Z")).status).toBe("VENCIDO"); });
  it("prazo mínimo 1 e somente inteiro", () => { expect(prazoCancelamentoValido(1)).toBe(true); expect(prazoCancelamentoValido(2)).toBe(true); expect(prazoCancelamentoValido(0)).toBe(false); expect(prazoCancelamentoValido(1.5)).toBe(false); });
  it("tempo em minutos, horas e dias", () => { expect(formatarHorasParado(.75)).toBe("45min"); expect(formatarHorasParado(3.5)).toBe("3,5h"); expect(formatarHorasParado(52)).toBe("2d 4h"); });
});