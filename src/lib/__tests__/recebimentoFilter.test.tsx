import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRecebimentoFilter, EMPTY_RECEBIMENTO_FILTERS, type RecebimentoFilters } from "@/hooks/useRecebimentoFilter";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const KEY = "test_filtro_recebimento";

const movimentos = [
  {
    id: "1",
    numero_movimento: 152,
    status: "LIBERADO",
    tipo_entrada: "COMPRA",
    parceiro: "AUTO PECAS PADRE CICERO LTDA",
    parceiro_busca: "auto pecas padre cicero ltda",
    notas: "171717",
  },
  {
    id: "2",
    numero_movimento: 200,
    status: "LIBERADO",
    tipo_entrada: "DEVOLUCAO",
    parceiro: "Distribuidora CÍCERO",
    parceiro_busca: "distribuidora cícero",
    notas: "99881",
  },
];

type HookRetorno = ReturnType<typeof useRecebimentoFilter>;

let raiz: Root | undefined;
let container: HTMLDivElement;
let atual: HookRetorno;

function Sonda() {
  atual = useRecebimentoFilter(KEY);
  return null;
}

async function montar() {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  await act(async () => {
    raiz?.render(<Sonda />);
  });
}

async function definir(f: RecebimentoFilters) {
  await act(async () => {
    atual.setFilters(f);
  });
}

describe("useRecebimentoFilter", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await montar();
  });

  afterEach(async () => {
    await act(async () => {
      raiz?.unmount();
    });
    container.remove();
  });

  it("ignora filtros vazios e retorna a lista inteira", () => {
    expect(atual.apply(movimentos)).toHaveLength(2);
    expect(atual.activeCount).toBe(0);
  });

  it("busca parceiro sem acento em ambos os lados", async () => {
    await definir({ ...EMPTY_RECEBIMENTO_FILTERS, parceiro: "cicero" });
    expect(atual.apply(movimentos)).toHaveLength(2);
    await definir({ ...EMPTY_RECEBIMENTO_FILTERS, parceiro: "padre" });
    const filtrado = atual.apply(movimentos);
    expect(filtrado).toHaveLength(1);
    expect(filtrado[0].id).toBe("1");
  });

  it("filtra por número parcial de movimento e de documento", async () => {
    await definir({ ...EMPTY_RECEBIMENTO_FILTERS, numeroMovimento: "15" });
    expect(atual.apply(movimentos).map((m) => m.id)).toEqual(["1"]);
    await definir({ ...EMPTY_RECEBIMENTO_FILTERS, numeroDocumento: "998" });
    expect(atual.apply(movimentos).map((m) => m.id)).toEqual(["2"]);
  });

  it("combina critérios com E e persiste na sessão", async () => {
    await definir({ ...EMPTY_RECEBIMENTO_FILTERS, tipoEntrada: "compra", parceiro: "padre" });
    expect(atual.activeCount).toBe(2);
    expect(atual.apply(movimentos).map((m) => m.id)).toEqual(["1"]);
    expect(sessionStorage.getItem(KEY)).toBeTruthy();
    await act(async () => {
      atual.clear();
    });
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("filtra lista no formato da armazenagem por parceiro e NF", async () => {
    const armazenagem = [
      { movimento_entrada_id: "a", numero_movimento: 10, tipo_entrada: "COMPRA", parceiro: "PADRE CÍCERO", parceiro_busca: "padre cícero", notas: "5555" },
      { movimento_entrada_id: "b", numero_movimento: 11, tipo_entrada: "COMPRA", parceiro: "OUTRO", parceiro_busca: "outro", notas: "7777" },
    ];
    await definir({ ...EMPTY_RECEBIMENTO_FILTERS, parceiro: "cicero" });
    expect(atual.apply(armazenagem).map((m) => m.movimento_entrada_id)).toEqual(["a"]);
    await definir({ ...EMPTY_RECEBIMENTO_FILTERS, numeroDocumento: "777" });
    expect(atual.apply(armazenagem).map((m) => m.movimento_entrada_id)).toEqual(["b"]);
  });
});

describe("MovimentoEntradaChips", () => {
  it("mostra Urgente e não renderiza nada sem dados", async () => {
    const { MovimentoEntradaChips } = await import("@/components/coletor/MovimentoEntradaChips");
    const el = document.createElement("div");
    const r = createRoot(el);
    await act(async () => {
      r.render(<MovimentoEntradaChips tipoEntrada={null} prioridade="URGENTE" devolucao={false} crossdocking={false} />);
    });
    expect(el.textContent).toContain("Urgente");
    await act(async () => {
      r.render(<MovimentoEntradaChips tipoEntrada={null} prioridade="NORMAL" devolucao={false} crossdocking={false} />);
    });
    expect(el.innerHTML).toBe("");
    await act(async () => r.unmount());
  });
});
