import { describe, it, expect } from "vitest";
import { parseError } from "../errorMapper";
describe("erros operacionais de cancelamentos", () => {
  it("identifica bloqueio de transferência recebido como JSON em texto", () => { expect(parseError({ message: JSON.stringify({ codigo: "TRANSFERENCIA_ORIGEM_CANCELAMENTO_BLOQUEADA", mensagem: "bloqueado" }) }).errorCode).toBe("TRANSFERENCIA_ORIGEM_CANCELAMENTO_BLOQUEADA"); });
  it("contexto de saldo de cancelamento não altera os outros fluxos", () => { expect(parseError({ codigo: "SALDO_INSUFICIENTE" }, "armazenagem-execucao").title).toContain("cancelamento"); expect(parseError({ codigo: "SALDO_INSUFICIENTE" }).title).toBe("Saldo insuficiente neste endereço."); });
});