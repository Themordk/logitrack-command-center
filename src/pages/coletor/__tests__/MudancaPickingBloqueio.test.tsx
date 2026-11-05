import { fireEvent, render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MudancaPickingListaPage } from "../MudancaPickingListaPage";
import { MUDPICK_KEYS, type PreviewResponse } from "@/modules/coletor/mudanca-picking/mudancaPicking.service";

vi.mock("@/components/coletor/ColetorLayout", () => ({
  ColetorLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/coletor/OnlineOnlyNotice", () => ({
  OnlineOnlyNotice: () => null,
  useOnlineOnlyBlocked: () => false,
}));

const preview: PreviewResponse = {
  sucesso: true,
  origem: { id: "1010", descricao: "R08-P02-N02-A02", armazem_id: "a1" },
  itens: [], produtos: [], pendencias: [], bloqueios: [], pode_prosseguir: false,
  motivos_bloqueio: [{ codigo: "SKUS_SEM_MAPEAMENTO", mensagem: "Use a Transferência", quantidade: 142 }],
  acao_sugerida: "TRANSFERENCIA",
  totais: { qtd_itens: 143, qtd_produtos: 143, qtd_total: 143, qtd_bloqueada: 0, qtd_mapeamentos: 1 },
};

describe("Mudança de Picking — navegação do bloqueio", () => {
  beforeEach(() => {
    sessionStorage.clear();
    Object.values(MUDPICK_KEYS).forEach((chave) => sessionStorage.setItem(chave, "{}"));
    sessionStorage.setItem(MUDPICK_KEYS.preview, JSON.stringify(preview));
  });
  afterEach(cleanup);

  it("limpa toda a sessão antes de abrir a origem da Transferência", () => {
    const navegar = vi.fn(() => {
      Object.values(MUDPICK_KEYS).forEach((chave) => expect(sessionStorage.getItem(chave)).toBeNull());
    });
    const tela = render(<MudancaPickingListaPage onNavigate={navegar} />);
    fireEvent.click(tela.getByRole("button", { name: "Ir para Transferência" }));
    expect(navegar).toHaveBeenCalledExactlyOnceWith("/coletor/movimentos/transferencia/origem");
  });

  it("limpa toda a sessão antes de escanear outra origem", () => {
    const navegar = vi.fn(() => {
      Object.values(MUDPICK_KEYS).forEach((chave) => expect(sessionStorage.getItem(chave)).toBeNull());
    });
    const tela = render(<MudancaPickingListaPage onNavigate={navegar} />);
    fireEvent.click(tela.getByRole("button", { name: "Escanear outra origem" }));
    expect(navegar).toHaveBeenCalledExactlyOnceWith("/coletor/movimentos/mudanca-picking/origem");
  });

  it("mantém o avanço para destino e a sessão no fluxo liberado", () => {
    sessionStorage.setItem(MUDPICK_KEYS.preview, JSON.stringify({ ...preview, pode_prosseguir: true, motivos_bloqueio: [] }));
    const navegar = vi.fn();
    const tela = render(<MudancaPickingListaPage onNavigate={navegar} />);
    fireEvent.click(tela.getByRole("button", { name: "Confirmar Mudança" }));
    expect(navegar).toHaveBeenCalledExactlyOnceWith("/coletor/movimentos/mudanca-picking/destino");
    expect(sessionStorage.getItem(MUDPICK_KEYS.preview)).not.toBeNull();
  });
});