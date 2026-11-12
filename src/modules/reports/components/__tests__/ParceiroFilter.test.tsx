import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParceiroFilter } from "../ParceiroFilter";

const resultado = [
  { id: "p1", razaosocial: "AESA AUTOPECAS LTDA", nome_fantasia: "AESA", cnpj: "12.345.678/0001-90", codigo_erp: "77" },
];
const orMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.or = (f: string) => { orMock(f); return chain; };
  chain.order = () => chain;
  chain.limit = () => Promise.resolve({ data: resultado, error: null });
  return { supabase: { from: () => chain } };
});

beforeAll(() => {
  // cmdk / radix dependem dessas APIs, ausentes no jsdom
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView ??= () => {};
});

describe("ParceiroFilter", () => {
  it("usa o gatilho compacto dos filtros de relatório e mostra 'Todos' sem seleção", () => {
    render(<ParceiroFilter value={null} onChange={() => {}} tenantId="t1" empresaId="e1" />);
    const gatilho = screen.getByRole("button", { name: "Parceiro" });
    expect(gatilho).toHaveTextContent("Todos");
    expect(gatilho.className).toContain("h-8");
    expect(gatilho.className).toContain("text-xs");
  });

  it("mostra o nome selecionado e limpa pelo X", () => {
    const onChange = vi.fn();
    render(<ParceiroFilter value="p1" label="AESA AUTOPECAS LTDA" onChange={onChange} tenantId="t1" empresaId="e1" />);
    expect(screen.getByRole("button", { name: "Parceiro" })).toHaveTextContent("AESA AUTOPECAS LTDA");
    fireEvent.click(screen.getByLabelText("Limpar parceiro"));
    expect(onChange).toHaveBeenCalledWith(null, null);
  });

  it("busca no servidor e seleciona o parceiro", async () => {
    const onChange = vi.fn();
    render(<ParceiroFilter value={null} onChange={onChange} tenantId="t1" empresaId="e1" />);
    fireEvent.click(screen.getByRole("button", { name: "Parceiro" }));
    fireEvent.change(screen.getByPlaceholderText(/Razão social/), { target: { value: "aesa" } });
    const item = await screen.findByText("AESA AUTOPECAS LTDA", {}, { timeout: 2000 });
    expect(orMock).toHaveBeenCalledWith(expect.stringContaining("razaosocial.ilike.%aesa%"));
    fireEvent.click(item);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("p1", resultado[0]));
  });
});
