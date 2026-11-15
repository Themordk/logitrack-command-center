import { describe, expect, it } from "vitest";
import { parseError } from "@/lib/errorMapper";

describe("SALDO_INSUFICIENTE mostra saldo disponível e solicitado", () => {
  it("erro P0001 com JSON na mensagem (separacao_executar_coleta)", () => {
    const erro = {
      code: "P0001",
      details: null,
      hint: null,
      message: "{\"codigo\" : \"SALDO_INSUFICIENTE\", \"mensagem\" : \"Saldo insuficiente. Disponível: 10.000000, solicitado: 18.\"}",
    };
    const p = parseError(erro, "separacao");
    expect(p.errorCode).toBe("SALDO_INSUFICIENTE");
    expect(p.title).toBe("Saldo insuficiente neste endereço.");
    expect(p.details).toBe("Saldo disponível: 10\nQuantidade solicitada: 18");
  });

  it("retorno estruturado com decimais", () => {
    const p = parseError({ sucesso: false, codigo: "SALDO_INSUFICIENTE", mensagem: "Saldo insuficiente. Disponível: 2.500000, solicitado: 3.75." });
    expect(p.details).toBe("Saldo disponível: 2,5\nQuantidade solicitada: 3,75");
  });

  it("sem números na mensagem, mostra o texto do banco", () => {
    const p = parseError({ sucesso: false, codigo: "SALDO_INSUFICIENTE", mensagem: "Saldo do endereço não atende a quantidade da tarefa." });
    expect(p.details).toBe("Saldo do endereço não atende a quantidade da tarefa.");
  });
});
