import { describe, it, expect } from "vitest";
import {
  cidadeUf, identificacaoVolume, numeroDigitado, precisaMotivoReimpressao, textoEmbarque, textoEtiqueta, textoNf,
} from "../volumesExibicao";
import { limparFiltros } from "../volumesService";

describe("volumesExibicao", () => {
  it("identificação volume/total com dois dígitos", () => {
    expect(identificacaoVolume({ numero_volume: 1, total_volumes_pedido: 3 })).toBe("01/03");
    expect(identificacaoVolume({ numero_volume: 12, total_volumes_pedido: null })).toBe("12");
    expect(identificacaoVolume({ numero_volume: null, total_volumes_pedido: 3 })).toBe("—");
  });

  it("NF com série", () => {
    expect(textoNf("9901", "1")).toBe("9901-1");
    expect(textoNf("9901", null)).toBe("9901");
    expect(textoNf(null, "1")).toBe("");
  });

  it("cidade/UF sem repetir a UF", () => {
    expect(cidadeUf("SOBRAL", "CE")).toBe("SOBRAL / CE");
    expect(cidadeUf("SOBRAL - CE", "CE")).toBe("SOBRAL - CE");
    expect(cidadeUf("Fortaleza (CE)", "CE")).toBe("Fortaleza (CE)");
    expect(cidadeUf("", "CE")).toBe("CE");
    expect(cidadeUf("SOBRAL", null)).toBe("SOBRAL");
  });

  it("embarque e etiqueta", () => {
    expect(textoEmbarque({ numero_carga: 26, embarque_status: "EMBARCADA" })).toBe("Carga #26 · embarcado");
    expect(textoEmbarque({ numero_carga: 26, embarque_status: "PENDENTE" })).toBe("Carga #26 · aguardando");
    expect(textoEmbarque({ numero_carga: null, embarque_status: null })).toBe("");
    expect(textoEtiqueta({ etiqueta_impressoes: 0, etiqueta_ultimo_status: null }).texto).toBe("Nunca impressa");
    expect(textoEtiqueta({ etiqueta_impressoes: 2, etiqueta_ultimo_status: "IMPRESSO" }).texto).toBe("Impressa 2x");
    expect(textoEtiqueta({ etiqueta_impressoes: 1, etiqueta_ultimo_status: "ERRO" }).texto).toBe("Erro na última");
  });

  it("motivo de reimpressão quando algum já foi impresso", () => {
    expect(precisaMotivoReimpressao([{ etiqueta_impressoes: 0 }, { etiqueta_impressoes: null }])).toBe(false);
    expect(precisaMotivoReimpressao([{ etiqueta_impressoes: 0 }, { etiqueta_impressoes: 1 }])).toBe(true);
  });

  it("número digitado em formato brasileiro", () => {
    expect(numeroDigitado("12,5")).toBe(12.5);
    expect(numeroDigitado("1.250,75")).toBe(1250.75);
    expect(numeroDigitado("0.08")).toBe(0.08);
    expect(numeroDigitado("")).toBeNull();
    expect(numeroDigitado("abc")).toBeNull();
  });

  it("filtros vazios não vão para o servidor", () => {
    expect(limparFiltros({ status: "", busca: "  VOL-1 ", numero_onda: "", nf: "123" })).toEqual({ busca: "VOL-1", nf: "123" });
  });
});
