import { afterEach, describe, expect, it, vi } from "vitest";
import { abrirJanelaImpressao, printPdf } from "../exporters";

const { doc, info } = vi.hoisted(() => ({
  doc: {
    internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
    setFontSize: vi.fn(), setTextColor: vi.fn(), text: vi.fn(),
    autoPrint: vi.fn(), output: vi.fn(() => "blob:pdf"), save: vi.fn(),
  },
  info: vi.fn(),
}));
vi.mock("jspdf", () => ({ default: vi.fn(function () { return doc; }) }));
vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));
vi.mock("sonner", () => ({ toast: { info } }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
const meta = { title: "Produtos", generatedAt: "22/10/2026" };

describe("impressão PDF", () => {
  it("reserva uma aba síncrona e reutiliza após carregar os dados sem baixar", async () => {
    const janela = { closed: false, location: { href: "" }, document: document.implementation.createHTMLDocument() };
    const abrir = vi.spyOn(window, "open").mockReturnValue(janela as unknown as Window);
    const reservada = abrirJanelaImpressao();
    expect(abrir).toHaveBeenCalledWith("", "_blank");
    await Promise.resolve();
    printPdf("produtos", [], [], meta, reservada);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(janela.location.href).toBe("blob:pdf");
    expect(doc.autoPrint).toHaveBeenCalledOnce();
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("mantém abertura direta para relatórios sem janela reservada", () => {
    const abrir = vi.spyOn(window, "open").mockReturnValue({} as Window);
    printPdf("relatorio", [], [], meta);
    expect(abrir).toHaveBeenCalledWith("blob:pdf", "_blank");
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("baixa PDF como alternativa quando o navegador bloqueia a janela", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    printPdf("produtos", [], [], meta, null);
    expect(doc.save).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledOnce();
  });
});