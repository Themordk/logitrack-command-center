import { describe, expect, it } from "vitest";
import { dependentesDe, nosAnteriores, referenciasSaidas } from "./saidasAnteriores";
import type { Ligacao } from "../retornos.types";

const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("nosAnteriores", () => {
  it("linear: payloads antes da requisição, sem condicional", () => {
    const nos = [
      { id: "g", tipo: "gatilho.evento" }, { id: "aq", tipo: "dados.payload" },
      { id: "id", tipo: "dados.payload" }, { id: "http", tipo: "acao.http" },
    ];
    const lig: Ligacao[] = [{ de: "g", para: "aq" }, { de: "aq", para: "id" }, { de: "id", para: "http" }];
    const r = nosAnteriores("http", nos, lig);
    expect(ids(r)).toEqual(["aq", "id"]);
    expect(r.every((x) => !x.condicional && !x.soPeloErro)).toBe(true);
  });

  describe("fluxo real Retorno de recebimento", () => {
    const P = "dados.payload", H = "acao.http", C = "logica.condicao";
    const nos = [
      { id: "gatilho", tipo: "gatilho.evento" }, { id: "cond_a32c", tipo: C }, { id: "cond_fade", tipo: C },
      { id: "payload_fb94", tipo: P, nome: "Id ERP" }, { id: "payload_0e3f", tipo: P, nome: "Id ERP (cópia)" },
      { id: "payload_49ba", tipo: P, nome: "Id ERP (cópia) 2" }, { id: "payload_1adf", tipo: P, nome: "Devolução OS" },
      { id: "payload_6349", tipo: P, nome: "Aquisição" }, { id: "payload_0d9e", tipo: P, nome: "Devolução PD" },
      { id: "http_fbea", tipo: H, nome: "Retorno OS" }, { id: "http_e816", tipo: H, nome: "Retorno Aquisição" },
      { id: "http_fb8d", tipo: H, nome: "Retorno PD" },
      { id: "atualizar_6d65", tipo: "acao.atualizar_documento" }, { id: "notificar_d54c", tipo: "acao.notificar" },
    ];
    const lig: Ligacao[] = [
      { de: "gatilho", para: "cond_a32c" },
      { de: "cond_a32c", para: "payload_0e3f", saida: "verdadeiro" }, { de: "payload_0e3f", para: "payload_6349" }, { de: "payload_6349", para: "http_e816" },
      { de: "cond_a32c", para: "cond_fade", saida: "falso" },
      { de: "cond_fade", para: "payload_49ba", saida: "verdadeiro" }, { de: "payload_49ba", para: "payload_0d9e" }, { de: "payload_0d9e", para: "http_fb8d" },
      { de: "cond_fade", para: "payload_fb94", saida: "falso" }, { de: "payload_fb94", para: "payload_1adf" }, { de: "payload_1adf", para: "http_fbea" },
      ...["http_fbea", "http_e816", "http_fb8d"].flatMap((h) => [
        { de: h, para: "atualizar_6d65", saida: "sucesso" }, { de: h, para: "notificar_d54c", saida: "erro" },
      ]),
    ];
    it("cada requisição só vê os payloads do seu ramo", () => {
      expect(ids(nosAnteriores("http_e816", nos, lig))).toEqual(["payload_0e3f", "payload_6349"]);
      expect(ids(nosAnteriores("http_fb8d", nos, lig))).toEqual(["payload_49ba", "payload_0d9e"]);
      expect(ids(nosAnteriores("http_fbea", nos, lig))).toEqual(["payload_fb94", "payload_1adf"]);
    });
    it("notificar: requisições só pelo erro, payloads condicionais", () => {
      const r = nosAnteriores("notificar_d54c", nos, lig);
      for (const h of ["http_fbea", "http_e816", "http_fb8d"]) expect(r.find((x) => x.id === h)?.soPeloErro).toBe(true);
      for (const p of r.filter((x) => x.tipo === P)) expect(p.condicional).toBe(true);
      expect(r.filter((x) => x.tipo === P)).toHaveLength(6);
    });
  });

  it("condicional: nó em um só ramo", () => {
    const nos = [{ id: "g", tipo: "gatilho.evento" }, { id: "c", tipo: "logica.condicao" }, { id: "p", tipo: "dados.payload" }, { id: "h", tipo: "acao.http" }];
    const lig: Ligacao[] = [{ de: "g", para: "c" }, { de: "c", para: "p", saida: "verdadeiro" }, { de: "c", para: "h", saida: "falso" }, { de: "p", para: "h" }];
    const r = nosAnteriores("h", nos, lig);
    expect(r).toEqual([{ id: "p", tipo: "dados.payload", nome: "p", condicional: true, soPeloErro: false }]);
  });
});

describe("referências", () => {
  it("extrai ids sem repetir", () => {
    expect(referenciasSaidas("{{saidas.a.x}}/{{ saidas.b_1.y }} saidas.a.z")).toEqual(["a", "b_1"]);
  });
  it("dependentesDe acha só quem usa o id exato", () => {
    const nos = [
      { id: "h1", data: { nome: "Usa p", config: { caminho: "/x/{{saidas.p.id}}" } } },
      { id: "h2", data: { nome: "Usa p2", config: { caminho: "/x/{{saidas.p2.id}}" } } },
    ];
    expect(dependentesDe("p", nos)).toEqual([{ id: "h1", nome: "Usa p" }]);
  });
});
