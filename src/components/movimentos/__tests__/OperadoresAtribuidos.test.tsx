import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OperadoresAtribuidos } from "@/components/movimentos/OperadoresAtribuidos";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let raiz: Root | undefined;
let container: HTMLDivElement;

function montar(operadores: string[]) {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  act(() => raiz?.render(<OperadoresAtribuidos operadores={operadores} />));
  return container.textContent || "";
}

describe("card da onda — participantes", () => {
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); });

  it("sem ninguém: Não atribuída", () => {
    expect(montar([])).toMatch(/Não atribuída/);
  });
  it("até dois nomes aparecem inteiros", () => {
    const t = montar(["Ana (SEP)", "Bia (CONF)"]);
    expect(t).toMatch(/Ana \(SEP\), Bia \(CONF\)/);
    expect(t).not.toMatch(/\+/);
  });
  it("mais de dois: dois nomes + contador", () => {
    const t = montar(["Ana (SEP)", "Bia (CONF)", "Caio (SEP)", "Duda (SEP)"]);
    expect(t).toMatch(/Ana \(SEP\), Bia \(CONF\)/);
    expect(t).toMatch(/\+2/);
    expect(t).not.toMatch(/Caio/);
    expect(container.querySelector("[aria-label]")?.getAttribute("aria-label")).toMatch(/Caio \(SEP\), Duda \(SEP\)/);
  });
});
