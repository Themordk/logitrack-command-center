import { describe, it, expect } from "vitest";
import { hexZpl, preencherTexto, preencherZpl } from "../etiquetaPreenchimento";

describe("preencherZpl (mesma regra do agente 1.1.0)", () => {
  it("valor com comando ZPL vira texto em hexadecimal com ^FH_", () => {
    const zpl = "^XA^FO10,10^A0N,30,30^FD{{parceiro_nome}}^FS^XZ";
    const out = preencherZpl(zpl, { parceiro_nome: "ACME ^XA~JA_LTDA" });
    expect(out).toBe("^XA^FO10,10^A0N,30,30^FH_^FDACME _5EXA_7EJA_5FLTDA^FS^XZ");
    expect(out).not.toContain("^FDACME ^XA");
  });

  it("texto fixo do mesmo campo tem o _ protegido; campos sem variável não mudam", () => {
    const zpl = "^XA^FO1,1^FDCLIENTE_X: {{a}}^FS^FO2,2^FDFIXO_Y^FS^XZ";
    expect(preencherZpl(zpl, { a: "1" })).toBe("^XA^FO1,1^FH_^FDCLIENTE_5FX: 1^FS^FO2,2^FDFIXO_Y^FS^XZ");
  });

  it("respeita ^FH declarado no template e só remove ^ e ~", () => {
    const zpl = "^XA^FO1,1^FH\\^FD{{a}}^FS^XZ";
    expect(preencherZpl(zpl, { a: "X^Y~Z_W" })).toBe("^XA^FO1,1^FH\\^FDX Y Z_W^FS^XZ");
  });

  it("variável sem valor vira o texto de falta; quebras de linha viram espaço", () => {
    expect(preencherZpl("^XA^FO1,1^FD{{x}}|{{y}}^FS^XZ", { y: "a\nb" })).toBe("^XA^FO1,1^FH_^FD---|a b^FS^XZ");
  });

  it("hexZpl", () => {
    expect(hexZpl("a^b~c_d")).toBe("a_5Eb_7Ec_5Fd");
  });
});

describe("preencherTexto (EPL/TSPL)", () => {
  it("aspas e barra invertida não fecham o campo", () => {
    expect(preencherTexto('A10,10,0,3,1,1,N,"{{n}}"', { n: 'DISTRIB "CENTRAL" C:\\X' }))
      .toBe("A10,10,0,3,1,1,N,\"DISTRIB 'CENTRAL' C:/X\"");
    expect(preencherTexto('TEXT 1,1,"3",0,1,1,"{{falta}}"', {})).toBe('TEXT 1,1,"3",0,1,1,"---"');
  });
});
