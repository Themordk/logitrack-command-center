import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CatalogoPerfis, ConfiguracaoPerfil } from "@/lib/perfisAcessoService";

const salvarPerfil = vi.fn();
const refresh = vi.fn();

const CATALOGO: CatalogoPerfis = {
  perfis: [
    { id: "adm", nome: "ADMINISTRADOR", descricao: null, sistema: false, acesso_total: true, ativo: true },
    { id: "op", nome: "OPERADOR", descricao: "Chão de armazém", sistema: false, acesso_total: false, ativo: true },
  ],
  modulos: [
    { id: "m1", codigo: "web.armazem.box", descricao: "Box", ambiente: "WEB", menu_grupo: "armazem" },
    { id: "m2", codigo: "web.relatorios.estoque", descricao: "Posição de Estoque", ambiente: "WEB", menu_grupo: "relatorios" },
    { id: "m3", codigo: "coletor.lms.metas", descricao: "LMS - Minhas metas (coletor)", ambiente: "COLETOR", menu_grupo: null },
  ],
  permissoes: [
    { id: "p1r", modulo_id: "m1", acao: "READ" },
    { id: "p1u", modulo_id: "m1", acao: "UPDATE" },
    { id: "p2r", modulo_id: "m2", acao: "READ" },
    { id: "p3r", modulo_id: "m3", acao: "READ" },
  ],
  usuariosPorPerfil: { adm: 2, op: 3 },
};

vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenantId: "t1" }) }));
vi.mock("@/contexts/PermissionsContext", () => ({ usePermissions: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/perfisAcessoService", () => ({
  carregarCatalogo: vi.fn(async () => CATALOGO),
  carregarConfiguracao: vi.fn(async (): Promise<ConfiguracaoPerfil> => ({ permissoes: new Set(["p1r", "p2r"]), menus: {} })),
  salvarPerfil: (...a: unknown[]) => salvarPerfil(...a),
  criarPerfil: vi.fn(),
  excluirPerfil: vi.fn(),
}));

import { PerfisAcessoPage } from "@/pages/PerfisAcessoPage";

beforeEach(() => {
  salvarPerfil.mockReset().mockResolvedValue(undefined);
  refresh.mockReset();
});

async function abrirOperador() {
  render(<PerfisAcessoPage />);
  fireEvent.click(await screen.findByText("OPERADOR"));
  await screen.findByText(/No menu:/);
}

describe("PerfisAcessoPage", () => {
  it("ocultar um menu marca pendência, atualiza a prévia e salva o menu oculto", async () => {
    await abrirOperador();
    const previa = screen.getByText(/No menu:/).parentElement!;
    expect(within(previa).getByText("Relatórios").className).not.toContain("line-through");

    fireEvent.click(screen.getByRole("switch", { name: "Exibir o menu Relatórios no TopNav" }));
    expect(within(previa).getByText("Relatórios").className).toContain("line-through");
    expect(screen.getByText("1 alteração não salva")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Salvar alterações/ }));
    await waitFor(() => expect(salvarPerfil).toHaveBeenCalled());
    const enviado = salvarPerfil.mock.calls[0][0];
    expect(enviado.config.menus).toEqual({ relatorios: false });
    expect([...enviado.config.permissoes].sort()).toEqual(["p1r", "p2r"]);
    expect(refresh).toHaveBeenCalled();
  });

  it("aba Coletor mostra os módulos do coletor sem o sufixo e esconde os do web", async () => {
    await abrirOperador();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Coletor/ }));
    expect(await screen.findByText("LMS - Minhas metas")).toBeTruthy();
    expect(screen.queryByText(/No menu:/)).toBeNull();
  });

  it("perfil de acesso total fica travado", async () => {
    render(<PerfisAcessoPage />);
    fireEvent.click(await screen.findByText("ADMINISTRADOR"));
    expect(await screen.findByText(/Perfil de acesso total/)).toBeTruthy();
    expect((screen.getByRole("switch", { name: "Exibir o menu Armazém no TopNav" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
