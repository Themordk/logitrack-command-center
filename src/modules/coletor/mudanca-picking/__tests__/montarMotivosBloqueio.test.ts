import { describe, expect, it } from "vitest";
import { montarMotivosBloqueio, type MotivoBloqueio } from "../mudancaPicking.service";

describe("montarMotivosBloqueio", () => {
  it("preserva os dois motivos novos, quantidades e SKUs", () => {
    const motivos: MotivoBloqueio[] = [
      { codigo: "SKUS_SEM_MAPEAMENTO", mensagem: "142 SKUs sem picking", quantidade: 142, skus: ["-1", "009.516127", "023.172101"] },
      { codigo: "PENDENCIAS_ABERTAS", mensagem: "7 tarefas em aberto", quantidade: 7 },
    ];
    expect(montarMotivosBloqueio({ motivos_bloqueio: motivos, bloqueios: ["Legado"] })).toEqual(motivos);
  });

  it("converte cada bloqueio legado em OUTRO com quantidade 1", () => {
    expect(montarMotivosBloqueio({ bloqueios: ["Primeiro bloqueio", "Segundo bloqueio"] })).toEqual([
      { codigo: "OUTRO", mensagem: "Primeiro bloqueio", quantidade: 1 },
      { codigo: "OUTRO", mensagem: "Segundo bloqueio", quantidade: 1 },
    ]);
  });

  it("retorna lista vazia sem bloqueios", () => {
    expect(montarMotivosBloqueio({ bloqueios: [] })).toEqual([]);
    expect(montarMotivosBloqueio({ motivos_bloqueio: [], bloqueios: ["Antigo"] })).toEqual([]);
  });
});