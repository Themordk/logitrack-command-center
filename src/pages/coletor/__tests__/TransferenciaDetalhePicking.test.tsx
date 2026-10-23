import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PickingTransferencia } from "@/types/transferencia";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({ buscar: vi.fn(), navegar: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/transferenciaService", async importar => ({
  ...(await importar<typeof import("@/lib/transferenciaService")>()),
  buscarPickingsTransferencia: mocks.buscar,
}));
vi.mock("@/components/coletor/ColetorLayout", () => ({ ColetorLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
import { TransferenciaDetalhePage } from "../TransferenciaDetalhePage";

const picking: PickingTransferencia = {
  endereco_id: "picking-1", endereco: "R01-P02-N03-A04", situacao: "OCUPADO",
  utilizavel: true, tipo_picking: "FIXO", saldo: 26, est_minimo: 12,
  est_maximo: 50, cabe: 24, e_origem: false,
};
let raiz: Root | undefined;
let container: HTMLDivElement;
const confirmar = () => Array.from(container.querySelectorAll("button")).find(b => /Confirmar e Escanear Destino/.test(b.textContent || ""));
async function montar(lista: PickingTransferencia[] = []) {
  if (!mocks.buscar.getMockImplementation()) mocks.buscar.mockResolvedValue({ sucesso: true, usa_picking: true, varios_pickings: lista.length > 1, pickings: lista });
  container = document.createElement("div"); document.body.append(container);
  raiz = createRoot(container);
  await act(async () => { raiz?.render(<TransferenciaDetalhePage onNavigate={mocks.navegar} />); });
}
async function informarQuantidade(valor: string) {
  const input = container.querySelector("input");
  if (!input) throw new Error("Campo de quantidade ausente");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, valor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
describe("Orientação de picking na transferência", () => {
  beforeEach(() => {
    mocks.buscar.mockReset(); mocks.navegar.mockReset(); sessionStorage.clear();
    Object.entries({ produto_id: "produto-1", origem_id: "origem-1", fator: "12", embalagem: "CX", saldo_disponivel: "120" })
      .forEach(([chave, valor]) => sessionStorage.setItem(`transf_${chave}`, valor));
  });
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); vi.restoreAllMocks(); });
  it("sem pickings remove orientação antiga e não exibe destino sugerido", async () => {
    sessionStorage.setItem("transf_picking_desc", "antigo");
    await montar();
    expect(container.querySelector('[aria-label="Endereço de Picking"]')).toBeNull();
    expect(sessionStorage.getItem("transf_picking_desc")).toBeNull();
  });
  it("exibe saldo de 26 UN como 2 CX + 2 UN e guarda o endereço", async () => {
    await montar([picking]);
    expect(container.textContent).toContain("Saldo atual: 2 CX + 2 UN");
    expect(container.textContent).toContain("Cabe: 2 CX");
    expect(sessionStorage.getItem("transf_picking_desc")).toBe("R01-P02-N03-A04");
    expect(mocks.buscar).toHaveBeenCalledWith({ produtoId: "produto-1", origemId: "origem-1" });
  });
  it("picking de origem é identificado e não gera aviso de capacidade", async () => {
    await montar([{ ...picking, e_origem: true }]);
    await informarQuantidade("3");
    expect(container.textContent).toContain("Você está no picking");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
  it("36 UN com capacidade de 24 UN avisa excesso de 12 UN sem impedir transferência", async () => {
    await montar([picking]);
    await informarQuantidade("3");
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Excede o máximo do picking em 12 UN");
    expect(confirmar()?.disabled).toBe(false);
    await act(async () => { confirmar()?.click(); });
    expect(sessionStorage.getItem("transf_quantidade")).toBe("36");
    expect(mocks.navegar).toHaveBeenCalledWith("/coletor/movimentos/transferencia/destino");
  });
  it("falha de consulta não impede informar quantidade nem seguir", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.buscar.mockRejectedValue(new Error("indisponível"));
    await montar(); await informarQuantidade("1");
    expect(container.querySelector('[aria-label="Endereço de Picking"]')).toBeNull();
    expect(confirmar()?.disabled).toBe(false);
    expect(aviso).toHaveBeenCalled();
  });
  it("prioriza utilizável não-origem e permite consultar todos sem mudar principal", async () => {
    await montar([{ ...picking, endereco_id: "bloq", utilizavel: false, situacao: "BLOQUEADO" }, { ...picking, endereco_id: "origem", e_origem: true }, { ...picking, endereco_id: "outro", endereco: "R02-P01-N01-A01" }]);
    expect(sessionStorage.getItem("transf_picking_desc")).toBe("R02-P01-N01-A01");
    const expandir = container.querySelector('button[aria-expanded]');
    await act(async () => { (expandir as HTMLButtonElement | null)?.click(); });
    expect(container.querySelectorAll('#transferencia-pickings > div')).toHaveLength(3);
    expect(sessionStorage.getItem("transf_picking_desc")).toBe("R02-P01-N01-A01");
  });
});