import { describe, it, expect } from "vitest";
import { parseError } from "@/lib/errorMapper";

// conferencia_buscar_tarefas recusa com RAISE '<CODIGO>: <mensagem>' (PostgrestError.message)
const pgError = (message: string) => ({ message, code: "P0001", details: null, hint: null });

describe("códigos da conferência de saída", () => {
  it("onda aguardando NF (pós-faturamento) traz o detalhe do banco", () => {
    const r = parseError(pgError("CONF_AGUARDANDO_NF: Onda #808 aguardando faturamento: 1 pedido(s) sem NF autorizada."));
    expect(r.errorCode).toBe("CONF_AGUARDANDO_NF");
    expect(r.title).toBe("Onda aguardando faturamento.");
    expect(r.details).toBe("Onda #808 aguardando faturamento: 1 pedido(s) sem NF autorizada.");
  });
  it("CONF_ONDA_NAO_ENCONTRADA não é confundido com ONDA_NAO_ENCONTRADA", () => {
    expect(parseError(pgError("CONF_ONDA_NAO_ENCONTRADA: Onda não encontrada nesta empresa.")).errorCode).toBe("CONF_ONDA_NAO_ENCONTRADA");
  });
  it("onda reservada por outro operador", () => {
    const r = parseError(pgError("CONF_ONDA_RESERVADA: Onda #808 já está em conferência com admin."));
    expect(r.title).toBe("Onda em conferência com outro operador.");
    expect(r.details).toContain("admin");
  });
  it("confirmação bloqueada por NF cancelada (retorno jsonb)", () => {
    expect(parseError({ sucesso: false, codigo: "CONF_NF_NAO_AUTORIZADA", mensagem: "x" }).title)
      .toBe("A NF deste pedido não está mais autorizada.");
  });
});
