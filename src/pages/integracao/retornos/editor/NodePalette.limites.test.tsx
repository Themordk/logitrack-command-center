import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NodePalette } from "./NodePalette";
import type { Catalogo } from "../retornos.types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalogo = (maxNos: number): Catalogo => ({
  eventos: [],
  nos: [{ tipo: "acao.http", grupo: "acao", nome: "Requisição HTTP", descricao: "", saidas: ["sucesso", "erro"], config_exemplo: {}, disponivel: true }],
  operadores: [],
  operacoes_provedor: [],
  auth_tipos: [],
  limites: { max_nos: maxNos, max_ligacoes: maxNos * 2, timeout_ms_max: 10000, max_tentativas: 3 },
});

let raiz: Root | undefined;
let container: HTMLDivElement;

async function montar(props: { catalogo?: Catalogo; totalNos: number }) {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(
      <TooltipProvider>
        <NodePalette catalogo={props.catalogo} totalNos={props.totalNos} totalLigacoes={0} temGatilho={false} onAdicionar={() => undefined} />
      </TooltipProvider>,
    );
  });
}

async function desmontar() {
  await act(async () => raiz?.unmount());
  container.remove();
}

const botaoNo = () => container.querySelector("button[aria-disabled]");

describe("NodePalette — limites do catálogo", () => {
  afterEach(desmontar);

  it("com max_nos = 40, o botão fica desabilitado em 40 e habilitado em 39", async () => {
    await montar({ catalogo: catalogo(40), totalNos: 40 });
    expect(botaoNo()?.getAttribute("aria-disabled")).toBe("true");
    expect(container.textContent).toContain("40/40 nós");
    expect(container.textContent).toContain("0/80 ligações");

    await desmontar();
    await montar({ catalogo: catalogo(40), totalNos: 39 });
    expect(botaoNo()?.getAttribute("aria-disabled")).toBe("false");
    expect(container.textContent).toContain("39/40 nós");
  });

  it("sem catálogo, o limite é zero e o contador mostra 0 como máximo", async () => {
    await montar({ catalogo: undefined, totalNos: 3 });
    expect(container.textContent).toContain("3/0 nós");
    expect(container.textContent).toContain("0/0 ligações");
  });
});
