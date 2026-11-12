import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, parseDataPura } from "../dateTime";
import { fmtDateBR } from "@/modules/reports/utils/exporters";

// Colunas `date` chegam como "AAAA-MM-DD". Antes eram lidas como meia-noite UTC
// e exibidas 1 dia antes em Fortaleza (UTC-3).
describe("datas puras (colunas date)", () => {
  it("formatDate mantém o dia de calendário", () => {
    expect(formatDate("2026-11-12")).toBe("12/11/2026");
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });

  it("fmtDateBR (exportação) mantém o dia de calendário", () => {
    expect(fmtDateBR("2026-11-12")).toBe("12/11/2026");
    expect(fmtDateBR("1900-01-01")).toBe("");
  });

  it("timestamps com hora continuam convertidos para Fortaleza", () => {
    expect(formatDate("2026-11-12T01:30:00Z")).toBe("11/11/2026");
    expect(formatDateTime("2026-11-12T14:44:54Z")).toBe("12/11/2026 11:44");
  });

  it("parseDataPura só aceita AAAA-MM-DD", () => {
    expect(parseDataPura("2026-11-12")).not.toBeNull();
    expect(parseDataPura("2026-11-12T10:00:00Z")).toBeNull();
    expect(parseDataPura("12/11/2026")).toBeNull();
  });
});
