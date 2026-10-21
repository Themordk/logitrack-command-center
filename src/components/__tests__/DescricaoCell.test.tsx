import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DescricaoCell, DESCRICAO_MAX_WIDTH, DESCRICAO_MIN_WIDTH } from "../DescricaoCell";

// Descrição real do tenant Tiaotruck (500 caracteres, "palavra" de 72 caracteres sem espaço)
const LONGA =
  "FILTRO AR PRIM  -> ARGO/BRAVA/BRAVO/500/CRONOS/DOBLO/FASTBACK/FIORINO/GRANDSIENA/IDEA/LINEA /MAREA/MOBI/PALIO/PULSE/PUNTO/SIENA/STILO/STRADA/TORO/UNO 01/ ECOSPORT ".padEnd(500, "X");

describe("DescricaoCell", () => {
  it("limita a 2 linhas por padrão, com quebra forçada e texto completo no tooltip", () => {
    render(<DescricaoCell text={LONGA} />);
    const el = screen.getByTestId("descricao-cell");
    expect(el).toHaveClass("line-clamp-2");
    expect(el).toHaveClass("whitespace-normal");
    expect(el.className).toContain("[overflow-wrap:anywhere]");
    expect(el).toHaveAttribute("title", LONGA.trim());
    expect(el.textContent).toBe(LONGA.trim());
  });

  it("aplica largura mínima e máxima padrão", () => {
    render(<DescricaoCell text="OLEO" />);
    const el = screen.getByTestId("descricao-cell");
    expect(el.style.minWidth).toBe(`${DESCRICAO_MIN_WIDTH}px`);
    expect(el.style.maxWidth).toBe(`${DESCRICAO_MAX_WIDTH}px`);
  });

  it("aceita número de linhas e larguras customizadas", () => {
    render(<DescricaoCell text="CHAPA" lines={1} minWidth={0} maxWidth={180} />);
    const el = screen.getByTestId("descricao-cell");
    expect(el).toHaveClass("line-clamp-1");
    expect(el.style.maxWidth).toBe("180px");
  });

  it.each([null, undefined, "", "   "])("mostra '—' quando a descrição é vazia (%s)", (v) => {
    render(<DescricaoCell text={v as string | null | undefined} />);
    expect(screen.queryByTestId("descricao-cell")).toBeNull();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
