import { describe, it, expect } from "vitest";
import { parseInteiroOpcional, parseLocalizacao } from "../parseInteiroOpcional";

describe("parseInteiroOpcional", () => {
  it("vazio = sem filtro", () => expect(parseInteiroOpcional("  ")).toBeUndefined());
  it("-1 é inválido", () => expect(parseInteiroOpcional("-1")).toBeNull());
  it("2.5 é inválido", () => expect(parseInteiroOpcional("2.5")).toBeNull());
  it("0 é válido", () => expect(parseInteiroOpcional("0")).toBe(0));
  it("aviso cita o campo", () => {
    let msg = "";
    const r = parseLocalizacao({ rua: "x", predio: "", nivel: "", apto: "" }, (m) => (msg = m));
    expect(r).toBeNull();
    expect(msg).toBe("Rua deve ser um número inteiro.");
  });
});
