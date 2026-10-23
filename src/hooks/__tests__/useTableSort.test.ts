import { describe, it, expect } from "vitest";
import { ordenarLinhas } from "../useTableSort";

describe("ordenarLinhas", () => {
  it("SKU numérico em ordem natural", () => {
    const r = ordenarLinhas([{ sku: "1000186" }, { sku: "101" }, { sku: "100" }], "sku", "asc");
    expect(r.map((x) => x.sku)).toEqual(["100", "101", "1000186"]);
  });
  it("vazios sempre no final, em asc e desc", () => {
    const rows = [{ sku: "1", lote: null }, { sku: "2", lote: "B" }, { sku: "3", lote: "" }, { sku: "4", lote: "A" }];
    expect(ordenarLinhas(rows, "lote", "asc").map((x) => x.sku)).toEqual(["4", "2", "1", "3"]);
    expect(ordenarLinhas(rows, "lote", "desc").map((x) => x.sku)).toEqual(["2", "4", "1", "3"]);
  });
  it("quantidades e datas numéricas, sem mutar", () => {
    const rows = [{ sku: "a", q: 10, d: "2026-01-10" }, { sku: "b", q: 9, d: "2025-12-31" }];
    expect(ordenarLinhas(rows, "q", "asc")[0].sku).toBe("b");
    expect(ordenarLinhas(rows, "d", "desc")[0].sku).toBe("a");
    expect(rows[0].sku).toBe("a");
  });
});
