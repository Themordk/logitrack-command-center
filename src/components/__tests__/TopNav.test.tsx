import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

let mobile = false;
const permitidos = new Set(["web.dashboard", "web.armazem.box", "web.armazem.setores", "web.config.perfis"]);

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mobile }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ usuarioId: "u1", usuarioNome: "Ana Lima", logout: vi.fn() }),
}));
vi.mock("@/contexts/PermissionsContext", () => ({
  usePermissions: () => ({ can: (m: string, a: string) => a === "READ" && permitidos.has(m) }),
}));
vi.mock("@/components/NotificacoesDropdown", () => ({ NotificacoesDropdown: () => null }));
vi.mock("@/components/navigation/EmpresaSelector", () => ({ EmpresaSelector: () => <span>Empresa</span> }));

import { TopNav } from "@/components/TopNav";

beforeEach(() => {
  localStorage.clear();
  // jsdom não tem ResizeObserver/scrollIntoView, usados pelo cmdk (busca)
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

describe("TopNav", () => {
  it("desktop: mostra só os grupos com telas liberadas", () => {
    mobile = false;
    render(<TopNav currentPath="/" onNavigate={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "Menu principal" });
    expect(within(nav).getAllByText("Armazém").length).toBeGreaterThan(0);
    expect(within(nav).queryAllByText("Relatórios")).toHaveLength(0);
    expect(within(nav).queryAllByText("Operação")).toHaveLength(0);
  });

  it("desktop: abre o grupo e navega pela tela escolhida", () => {
    mobile = false;
    const onNavigate = vi.fn();
    render(<TopNav currentPath="/" onNavigate={onNavigate} />);
    const nav = screen.getByRole("navigation", { name: "Menu principal" });
    const botao = within(nav).getAllByRole("button").find((b) => b.textContent?.includes("Armazém"))!;
    fireEvent.click(botao);
    fireEvent.click(screen.getByRole("button", { name: /^Box$/ }));
    expect(onNavigate).toHaveBeenCalledWith("/armazem/box");
  });

  it("mobile: o menu lateral lista todas as telas liberadas", () => {
    mobile = true;
    const onNavigate = vi.fn();
    render(<TopNav currentPath="/" onNavigate={onNavigate} />);
    expect(screen.queryByRole("navigation", { name: "Menu principal" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Configurações/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Perfis de Acesso" }));
    expect(onNavigate).toHaveBeenCalledWith("/config/perfis");
  });

  it("Ctrl+K abre a busca só com telas liberadas", () => {
    mobile = false;
    render(<TopNav currentPath="/" onNavigate={vi.fn()} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Setores")).toBeTruthy();
    expect(within(dialog).queryByText("Posição de Estoque")).toBeNull();
  });
});
