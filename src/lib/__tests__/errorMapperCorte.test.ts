import { describe, it, expect } from "vitest";
import { parseError } from "@/lib/errorMapper";

describe("códigos de autorização de corte", () => {
  it("senha errada do supervisor", () => {
    expect(parseError({ sucesso: false, codigo: "CREDENCIAL_INVALIDA" }).title).toBe("Usuário ou senha do supervisor inválidos.");
  });
  it("supervisor igual ao operador", () => {
    expect(parseError({ sucesso: false, codigo: "AUTORIZADOR_IGUAL_SOLICITANTE" }).title).toBe("O supervisor precisa ser outra pessoa.");
  });
  it("exceção do banco ao atualizar corte direto", () => {
    expect(parseError(new Error("CORTE_SOMENTE_VIA_RPC")).title).toBe("Corte não permitido por este caminho.");
  });
});
