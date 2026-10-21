import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { ReportTable, REPORT_VIRTUALIZE_THRESHOLD, type ReportColumn } from "../ReportTable";
import { colDescricaoProduto, colTextoLongo, exportColDescricao, DESCRICAO_PDF_WIDTH_MM } from "../reportColumns";

const columns: ReportColumn[] = [
  { key: "sku", label: "SKU", width: "100px" },
  colDescricaoProduto(),
  { key: "saldo", label: "Saldo", align: "right", width: "100px" },
];

const makeRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    sku: String(9000000 + i),
    descricao: `PRODUTO ${i} -> ARGO/BRAVA/BRAVO/500/CRONOS/DOBLO/FASTBACK/FIORINO/GRANDSIENA/IDEA/LINEA`,
    saldo: i,
  }));

const bodyRows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("tbody tr")).filter((tr) => tr.getAttribute("aria-hidden") !== "true");

describe("colDescricaoProduto / colTextoLongo", () => {
  it("configura a coluna de descrição com quebra e largura limitada", () => {
    const c = colDescricaoProduto();
    expect(c).toMatchObject({ key: "descricao", label: "Descrição", wrap: true, width: "220px", maxWidth: "360px" });
    expect(colDescricaoProduto({ label: "Produto" }).label).toBe("Produto");
    expect(colTextoLongo({ key: "parceiro_nome", label: "Parceiro", maxWidth: 260 })).toMatchObject({
      key: "parceiro_nome", wrap: true, maxWidth: "260px",
    });
  });

  it("define largura fixa da descrição no PDF", () => {
    expect(exportColDescricao()).toEqual({ key: "descricao", label: "Descrição", width: DESCRICAO_PDF_WIDTH_MM });
  });
});

describe("ReportTable — quebra de texto", () => {
  it("só a coluna de descrição quebra linha; as demais continuam sem quebra", () => {
    const { container } = render(<ReportTable columns={columns} data={makeRows(3)} />);
    const cells = bodyRows(container)[0].querySelectorAll("td");
    expect(cells[0]).toHaveClass("whitespace-nowrap");
    expect(cells[1]).toHaveClass("whitespace-normal");
    expect(cells[1].style.maxWidth).toBe("360px");
    expect(cells[2]).toHaveClass("whitespace-nowrap");
    // linhas alinhadas ao topo quando há coluna com quebra
    cells.forEach((td) => expect(td).toHaveClass("align-top"));
    expect(within(cells[1]).getByTestId("descricao-cell")).toHaveClass("line-clamp-2");
  });

  it("cabeçalho da descrição recebe largura mínima e máxima", () => {
    render(<ReportTable columns={columns} data={makeRows(1)} />);
    const th = screen.getByText("Descrição").closest("th")!;
    expect(th.style.minWidth).toBe("220px");
    expect(th.style.maxWidth).toBe("360px");
  });

  it("tabela sem colunas com quebra mantém o comportamento anterior", () => {
    const { container } = render(
      <ReportTable columns={[{ key: "sku", label: "SKU" }, { key: "saldo", label: "Saldo" }]} data={makeRows(2)} />,
    );
    const td = bodyRows(container)[0].querySelector("td")!;
    expect(td).toHaveClass("whitespace-nowrap");
    expect(td).not.toHaveClass("align-top");
  });

  it("mostra mensagem de vazio e estado de carregamento", () => {
    const { rerender } = render(<ReportTable columns={columns} data={[]} />);
    expect(screen.getByText("Nenhum registro encontrado.")).toBeInTheDocument();
    rerender(<ReportTable columns={columns} data={[]} loading />);
    expect(screen.getByText("Carregando dados...")).toBeInTheDocument();
  });
});

describe("ReportTable — rolagem virtual", () => {
  // jsdom não calcula layout: simula viewport de 600px e linhas de 44px
  const offH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  const offW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const gbcr = Element.prototype.getBoundingClientRect;
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() { return this.dataset?.testid === "report-table-scroll" ? 600 : 44; },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1280 });
    Element.prototype.getBoundingClientRect = function () {
      const h = (this as HTMLElement).dataset?.testid === "report-table-scroll" ? 600 : 44;
      return { x: 0, y: 0, top: 0, left: 0, bottom: h, right: 1280, width: 1280, height: h, toJSON: () => ({}) } as DOMRect;
    };
  });
  afterAll(() => {
    if (offH) Object.defineProperty(HTMLElement.prototype, "offsetHeight", offH);
    if (offW) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offW);
    Element.prototype.getBoundingClientRect = gbcr;
  });

  it("renderiza todas as linhas abaixo do limite", () => {
    const { container } = render(<ReportTable columns={columns} data={makeRows(REPORT_VIRTUALIZE_THRESHOLD)} />);
    expect(bodyRows(container)).toHaveLength(REPORT_VIRTUALIZE_THRESHOLD);
  });

  it("com 24.073 linhas (Baixo Giro) desenha só uma janela e reserva a altura total", () => {
    const { container } = render(<ReportTable columns={columns} data={makeRows(24073)} />);
    const rows = bodyRows(container);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
    const spacer = container.querySelector('tbody tr[aria-hidden="true"]') as HTMLElement;
    expect(spacer).not.toBeNull();
    expect(parseInt(spacer.style.height, 10)).toBeGreaterThan(24073 * 20);
  });

  it("ordenação continua funcionando com virtualização", () => {
    const { container } = render(<ReportTable columns={columns} data={makeRows(1000)} />);
    fireEvent.click(screen.getByText("Saldo")); // asc
    fireEvent.click(screen.getByText("Saldo")); // desc
    const first = bodyRows(container)[0].querySelectorAll("td");
    expect(first[2].textContent).toBe("999");
  });

  it("ao imprimir, renderiza todas as linhas e volta a virtualizar depois", () => {
    const { container } = render(<ReportTable columns={columns} data={makeRows(1000)} />);
    const antes = bodyRows(container).length;
    expect(antes).toBeGreaterThan(0);
    expect(antes).toBeLessThan(1000);
    act(() => { window.dispatchEvent(new Event("beforeprint")); });
    expect(bodyRows(container)).toHaveLength(1000);
    act(() => { window.dispatchEvent(new Event("afterprint")); });
    expect(bodyRows(container).length).toBe(antes);
  });
});
