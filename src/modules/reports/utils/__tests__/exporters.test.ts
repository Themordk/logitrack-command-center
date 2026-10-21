import { describe, it, expect } from "vitest";
import { calcExcelColWidths, EXCEL_MAX_COL_WCH } from "../exporters";

describe("calcExcelColWidths", () => {
  it("usa o maior conteúdo da coluna (+2)", () => {
    expect(calcExcelColWidths(["SKU", "Saldo"], [["9000039", "1"], ["12", "1000"]])).toEqual([{ wch: 9 }, { wch: 7 }]);
  });

  it("limita a largura da descrição a 60 caracteres", () => {
    const longa = "X".repeat(500);
    expect(calcExcelColWidths(["Descrição"], [[longa]])).toEqual([{ wch: EXCEL_MAX_COL_WCH + 2 }]);
  });

  it("suporta volumes grandes sem estourar a pilha", () => {
    const body = Array.from({ length: 300_000 }, (_, i) => [String(i)]);
    expect(() => calcExcelColWidths(["SKU"], body)).not.toThrow();
  });

  it("trata células vazias", () => {
    expect(calcExcelColWidths(["Marca"], [[""], [undefined as unknown as string]])).toEqual([{ wch: 7 }]);
  });
});
