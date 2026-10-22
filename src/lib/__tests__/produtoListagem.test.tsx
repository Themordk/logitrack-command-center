import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProdutoListagem } from "@/hooks/useProdutoListagem";
import { montarGrupoFiltroOptions, type ProdutoListagemFilters } from "@/modules/produtos/produtoListagem.service";

const { buscar } = vi.hoisted(() => ({ buscar: vi.fn().mockResolvedValue({ rows: [], total: 45 }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenantId: "tenant", empresaId: "empresa", empresaVersion: 1 }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/modules/produtos/produtoListagem.service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/modules/produtos/produtoListagem.service")>(),
  fetchProdutoListagem: buscar,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let raiz: Root | undefined;
let container: HTMLDivElement | undefined;
let atual: ReturnType<typeof useProdutoListagem> | undefined;
function Sonda({ filtros }: { filtros: ProdutoListagemFilters }) {
  atual = useProdutoListagem({ filters: filtros });
  return null;
}
afterEach(async () => {
  await act(async () => raiz?.unmount());
  container?.remove();
  buscar.mockClear();
});

describe("listagem de produtos", () => {
  it("na página 3, mudar filtro consulta somente a página 1 uma vez", async () => {
    container = document.createElement("div");
    document.body.append(container);
    raiz = createRoot(container);
    await act(async () => raiz?.render(<Sonda filtros={{}} />));
    await act(async () => atual?.setPage(3));
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }));
    buscar.mockClear();
    await act(async () => raiz?.render(<Sonda filtros={{ sku: "123" }} />));
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(buscar).toHaveBeenCalledWith(expect.objectContaining({ page: 1, filters: { sku: "123" } }));
    expect(atual?.page).toBe(1);
  });

  it("distingue descrições repetidas pelo código ERP e mantém a descrição sem quantidade para PDF", () => {
    const opcoes = montarGrupoFiltroOptions([
      { id: "a", descricao: "Abracadeira", codigo_erp: "10", qtd_produtos: 2540 },
      { id: "b", descricao: "Abracadeira", codigo_erp: null, qtd_produtos: 1 },
    ]);
    expect(opcoes).toEqual([
      { value: "a", label: "Abracadeira (10)", descricao: "Abracadeira", description: "2.540 produtos" },
      { value: "b", label: "Abracadeira (sem código)", descricao: "Abracadeira", description: "1 produtos" },
    ]);
  });
});