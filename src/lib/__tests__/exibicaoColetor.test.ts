import { describe, expect, it } from "vitest";
import { PADRAO_EXIBICAO_COLETOR, deveExibirNomeColetor } from "../exibicaoColetor";

describe("informações exibidas no coletor", () => {
  it("novo tipo permite parceiro na separação", () => {
    expect(PADRAO_EXIBICAO_COLETOR.exibe_parceiro_separacao).toBe(true);
  });
  it("novo tipo não permite vendedor na separação", () => {
    expect(PADRAO_EXIBICAO_COLETOR.exibe_vendedor_separacao).toBe(false);
  });
  it("novo tipo não permite parceiro na conferência", () => {
    expect(PADRAO_EXIBICAO_COLETOR.exibe_parceiro_conferencia).toBe(false);
  });
  it("novo tipo não permite vendedor na conferência", () => {
    expect(PADRAO_EXIBICAO_COLETOR.exibe_vendedor_conferencia).toBe(false);
  });
  it("mostra nome apenas quando permitido e preenchido", () => {
    expect(deveExibirNomeColetor(true, "Vendedor A")).toBe(true);
    expect(deveExibirNomeColetor(false, "Vendedor A")).toBe(false);
  });
  it("pedido sem vendedor não exibe nome mesmo com permissão", () => {
    expect(deveExibirNomeColetor(true, null)).toBe(false);
    expect(deveExibirNomeColetor(true, "")).toBe(false);
  });
  it("cache antigo sem flags não exibe nomes", () => {
    expect(deveExibirNomeColetor(undefined, "Parceiro A")).toBe(false);
    expect(deveExibirNomeColetor()).toBe(false);
  });
});
