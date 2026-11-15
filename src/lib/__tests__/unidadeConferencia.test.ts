import { describe, expect, it } from "vitest";
import { descreverUnidades, rotuloUnidade, unidadeDasTarefas } from "@/lib/unidadeConferencia";

describe("unidade de conferência no coletor", () => {
  it("só aparece quando a onda tem mais de uma unidade", () => {
    expect(unidadeDasTarefas([{ unidade_sequencia: 1, unidade_descricao: "HU 1", unidades_total: 1 }])).toBeNull();
    expect(unidadeDasTarefas([{ unidade_sequencia: null, unidades_total: 0 }])).toBeNull();
    const u = unidadeDasTarefas([{ unidade_sequencia: 2, unidade_descricao: "Grupo de separação 1 · HU 000123", unidades_total: 4 }]);
    expect(u && rotuloUnidade(u)).toBe("Unidade 2 de 4 · Grupo de separação 1 · HU 000123");
  });
  it("resume as unidades da etapa", () => {
    expect(descreverUnidades({ total: 1, livres: 1, em_andamento: 0, concluidas: 0, minha: null }, "SEP-CONF")).toBeNull();
    expect(descreverUnidades({ total: 3, livres: 1, em_andamento: 1, concluidas: 1, minha: null }, "SEP-CONF"))
      .toBe("3 unidades de conferência: 1 livre(s), 1 em andamento, 1 concluída(s)");
  });
});
