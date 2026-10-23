import { describe, expect, it } from "vitest";
import { armazenagemEmParalelo, recebimentoStatusColor, recebimentoStatusLabel } from "@/lib/recebimentoStatus";

describe("recebimentoStatus", () => {
  it("identifica os status com armazenagem em paralelo", () => {
    expect(armazenagemEmParalelo("LIB_ARMAZENAGEM")).toBe(true);
    expect(armazenagemEmParalelo("ARMAZENAGEM_PARCIAL")).toBe(true);
    expect(armazenagemEmParalelo("EM_CONFERENCIA")).toBe(false);
    expect(armazenagemEmParalelo(null)).toBe(false);
  });

  it("rótulos", () => {
    expect(recebimentoStatusLabel("LIB_ARMAZENAGEM")).toBe("LIB. ARMAZ.");
    expect(recebimentoStatusLabel("ARMAZENAGEM_PARCIAL")).toBe("ARMAZ. PARCIAL");
    expect(recebimentoStatusLabel("EM_CONFERENCIA")).toBe("EM CONFERENCIA");
    expect(recebimentoStatusLabel(undefined)).toBe("");
  });

  it("LIB_ARMAZENAGEM não cai na cor neutra", () => {
    expect(recebimentoStatusColor("LIB_ARMAZENAGEM")).toBe(recebimentoStatusColor("ARMAZENAGEM_PARCIAL"));
    expect(recebimentoStatusColor("LIB_ARMAZENAGEM")).not.toBe(recebimentoStatusColor("QUALQUER"));
  });
});
