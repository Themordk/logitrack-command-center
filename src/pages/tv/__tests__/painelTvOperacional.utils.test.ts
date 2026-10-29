import { describe, expect, it } from "vitest";
import {
  decidirAlertaSonoro,
  formatDuracao,
  idsNovos,
  intervaloAtualizacaoMs,
  isErroToken,
  nivelAlerta,
} from "../painelTvOperacional.utils";

describe("nivelAlerta", () => {
  const limite = { atencao: 3, critico: 5 };
  it("classifica pelos limites (>=)", () => {
    expect(nivelAlerta(2, limite)).toBe("normal");
    expect(nivelAlerta(3, limite)).toBe("atencao");
    expect(nivelAlerta(4, limite)).toBe("atencao");
    expect(nivelAlerta(5, limite)).toBe("critico");
    expect(nivelAlerta(50, limite)).toBe("critico");
  });
  it("sem limite configurado fica normal", () => {
    expect(nivelAlerta(999, undefined)).toBe("normal");
  });
});

describe("formatDuracao", () => {
  it("mm:ss abaixo de 1 h", () => {
    expect(formatDuracao(0)).toBe("00:00");
    expect(formatDuracao(65)).toBe("01:05");
    expect(formatDuracao(3599)).toBe("59:59");
  });
  it("h:mm:ss a partir de 1 h", () => {
    expect(formatDuracao(3600)).toBe("1:00:00");
    expect(formatDuracao(29051)).toBe("8:04:11");
  });
  it("valores inválidos viram zero", () => {
    expect(formatDuracao(-10)).toBe("00:00");
    expect(formatDuracao(NaN)).toBe("00:00");
  });
});

describe("alerta sonoro", () => {
  it("primeira leitura não gera novos", () => {
    expect(idsNovos(null, ["a", "b"])).toEqual([]);
  });
  it("detecta IDs novos mesmo com a contagem igual", () => {
    expect(idsNovos(["a", "b"], ["b", "c"])).toEqual(["c"]);
  });
  it("toca uma vez para um lote e respeita o intervalo mínimo", () => {
    const base = { intervaloMinimoMs: 20_000 };
    expect(
      decidirAlertaSonoro({ ...base, anteriores: ["a"], atuais: ["a", "b", "c"], agoraMs: 100_000, ultimoSomMs: null }),
    ).toEqual({ tocar: true, novos: 2 });
    expect(
      decidirAlertaSonoro({ ...base, anteriores: ["a", "b", "c"], atuais: ["a", "b", "c", "d"], agoraMs: 105_000, ultimoSomMs: 100_000 }),
    ).toEqual({ tocar: false, novos: 1 });
    expect(
      decidirAlertaSonoro({ ...base, anteriores: ["a"], atuais: ["a", "e"], agoraMs: 121_000, ultimoSomMs: 100_000 }),
    ).toEqual({ tocar: true, novos: 1 });
  });
  it("pedido que sai da fila não toca", () => {
    expect(
      decidirAlertaSonoro({ intervaloMinimoMs: 0, anteriores: ["a", "b"], atuais: ["a"], agoraMs: 1, ultimoSomMs: null }),
    ).toEqual({ tocar: false, novos: 0 });
  });
});

describe("configuração", () => {
  it("atualização padrão de 3 s e ?refresh=N", () => {
    expect(intervaloAtualizacaoMs("#/tv/operacional?token=ABC")).toBe(3000);
    expect(intervaloAtualizacaoMs("#/tv/operacional?token=ABC&refresh=5")).toBe(5000);
    expect(intervaloAtualizacaoMs("#/tv/operacional?refresh=0")).toBe(3000);
    expect(intervaloAtualizacaoMs("#/tv/operacional?refresh=abc")).toBe(3000);
  });
  it("só erro de token volta para a tela de token", () => {
    expect(isErroToken({ message: "Token de TV inválido ou armazém inativo" })).toBe(true);
    expect(isErroToken({ message: "Failed to fetch" })).toBe(false);
    expect(isErroToken(null)).toBe(false);
  });
});

describe("melhor separador", () => {
  it("exibe primeiro e último nome", async () => {
    const { nomeExibicao } = await import("../painelTvOperacional.utils");
    expect(nomeExibicao("Izaias Feitosa")).toBe("Izaias Feitosa");
    expect(nomeExibicao("Maria  da Silva Souza ")).toBe("Maria Souza");
    expect(nomeExibicao("admin")).toBe("admin");
  });
  it("gera iniciais do avatar", async () => {
    const { iniciais } = await import("../painelTvOperacional.utils");
    expect(iniciais("Izaias Feitosa")).toBe("IF");
    expect(iniciais("Maria da Silva Souza")).toBe("MS");
    expect(iniciais("admin")).toBe("AD");
    expect(iniciais("")).toBe("?");
  });
});
