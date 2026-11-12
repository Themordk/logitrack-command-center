import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResponsaveisOndaModal } from "@/components/movimentos/ResponsaveisOndaModal";
import type { EtapaOnda, ResponsaveisOnda } from "@/lib/responsaveisOnda.types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mocks = vi.hoisted(() => ({ obter: vi.fn(), salvar: vi.fn(), sucesso: vi.fn(), erro: vi.fn(), onSuccess: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: mocks.sucesso, error: mocks.erro } }));
vi.mock("@/lib/responsaveisOndaService", async (orig) => ({
  ...(await orig<typeof import("@/lib/responsaveisOndaService")>()),
  obterResponsaveisOnda: mocks.obter,
  salvarResponsaveisOnda: mocks.salvar,
}));
// Seletor simplificado: um botão que convoca "joao"
vi.mock("@/components/movimentos/SeletorConvocados", () => ({
  SeletorConvocados: ({ etapa, onChange }: { etapa: EtapaOnda; onChange: (u: string[], n: Record<string, string>) => void }) => (
    <button type="button" onClick={() => onChange(["joao"], { joao: "JOÃO" })}>convocar {etapa.codigo}</button>
  ),
}));

const totais = { total: 3, concluidas: 0, abertas: 3, livres: 0, com_dono: 3, com_progresso: 1, qtd_requerida: 30, qtd_executada: 5 };
const etapa = (p: Partial<EtapaOnda>): EtapaOnda => ({
  tipo_tarefa_id: "sep", codigo: "SEP", nome: "SEPARAÇÃO", ordem: 1, modo: "EXCLUSIVA", ativa: true, por_zona: false,
  permite_mesmo_operador: true, status: "EM_ANDAMENTO", travada: false, totais, convocados: [],
  operadores: [{ usuario_id: "paulo", nome: "PAULO", tarefas: 3, com_progresso: 1, origem: "COLETOR" }], ...p,
});
const dados = (etapas: EtapaOnda[], pode = true): ResponsaveisOnda => ({
  sucesso: true, pode_convocar: pode, onda: { id: "onda", numero_onda: 10, status: "EM_PICKING", editavel: true }, etapas,
});

let raiz: Root | undefined;
let container: HTMLDivElement;

async function montar() {
  container = document.createElement("div");
  document.body.append(container);
  raiz = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    raiz?.render(
      <QueryClientProvider client={qc}>
        <ResponsaveisOndaModal open movimentoSaidaId="onda" numeroOnda={10} onClose={vi.fn()} onSuccess={mocks.onSuccess} />
      </QueryClientProvider>,
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const todos = () => Array.from(document.body.querySelectorAll("button"));
const botao = (t: RegExp) => todos().find((b) => t.test(b.textContent || ""));
async function clicar(t: RegExp) {
  const b = botao(t);
  if (!b) throw new Error(`sem botão ${t}`);
  await act(async () => { b.click(); });
}
async function esperarSimulacao() {
  await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("ResponsaveisOndaModal", () => {
  beforeEach(() => { Object.values(mocks).forEach((m) => m.mockReset()); document.body.innerHTML = ""; });
  afterEach(() => { act(() => raiz?.unmount()); container?.remove(); });

  it("mostra só etapas ativas, travadas sem seletor, e operadores com a origem", async () => {
    mocks.obter.mockResolvedValue(dados([
      etapa({}),
      etapa({ tipo_tarefa_id: "conf", codigo: "SEP-CONF", nome: "CONFERÊNCIA", status: "CONCLUIDA", travada: true, operadores: [] }),
      etapa({ tipo_tarefa_id: "emb", codigo: "EMB", nome: "EMBARQUE", ativa: false }),
    ]));
    await montar();
    const texto = document.body.textContent || "";
    expect(texto).toMatch(/Reserva total/);
    expect(texto).toMatch(/PAULO · 3/);
    expect(texto).toMatch(/Etapa travada/);
    expect(texto).not.toMatch(/embarque/i);
    expect(botao(/convocar SEP-CONF/)).toBeUndefined();
    expect(botao(/^Aplicar$/)?.disabled).toBe(true);
  });

  it("troca com progresso: simula, exige confirmação e aplica", async () => {
    mocks.obter.mockResolvedValue(dados([etapa({})]));
    mocks.salvar.mockImplementation(async (p: { simular?: boolean }) => p.simular
      ? { sucesso: true, codigo: "SIMULACAO", mensagem: "", com_progresso: 1, resumo: [{ tipo_tarefa_id: "sep", etapa: "SEPARAÇÃO", codigo_etapa: "SEP", ordem: 1, convocados: "JOÃO", aplicado: true, tarefas_movidas: 3, com_progresso: 1, de: [{ usuario_id: "paulo", nome: "PAULO", tarefas: 3 }] }] }
      : { sucesso: true, codigo: "APLICADO", mensagem: "ok" });
    await montar();
    await clicar(/convocar SEP$/);
    await esperarSimulacao();

    expect(mocks.salvar).toHaveBeenCalledWith(expect.objectContaining({ simular: true, alteracoes: [{ tipo_tarefa_id: "sep", usuarios: ["joao"] }] }));
    expect(document.body.textContent).toMatch(/Separação: mover 3 tarefa\(s\) de PAULO para JOÃO/);
    expect(botao(/^Aplicar$/)?.disabled).toBe(true);

    const confirma = document.body.querySelector("button[role=checkbox]") as HTMLButtonElement;
    await act(async () => { confirma.click(); });
    expect(botao(/^Aplicar$/)?.disabled).toBe(false);

    await clicar(/^Aplicar$/);
    expect(mocks.salvar).toHaveBeenLastCalledWith(expect.objectContaining({ confirmarProgresso: true, alteracoes: [{ tipo_tarefa_id: "sep", usuarios: ["joao"] }] }));
    expect(mocks.salvar.mock.lastCall?.[0].simular).toBeUndefined();
    expect(mocks.onSuccess).toHaveBeenCalled();
  });

  it("erro de validação do banco aparece no resumo e bloqueia Aplicar", async () => {
    mocks.obter.mockResolvedValue(dados([etapa({ operadores: [], totais: { ...totais, com_progresso: 0 } })]));
    mocks.salvar.mockResolvedValue({ sucesso: false, codigo: "VALIDACAO", mensagem: "JOÃO: Usuário de outra empresa.", erros: [{ codigo: "OUTRA_EMPRESA", mensagem: "JOÃO: Usuário de outra empresa." }] });
    await montar();
    await clicar(/convocar SEP$/);
    await esperarSimulacao();
    expect(document.body.textContent).toMatch(/JOÃO: Usuário de outra empresa/);
    expect(botao(/^Aplicar$/)?.disabled).toBe(true);
  });

  it("sem permissão de convocar: aviso e nada a aplicar", async () => {
    mocks.obter.mockResolvedValue(dados([etapa({})], false));
    await montar();
    expect(document.body.textContent).toMatch(/não tem permissão para convocar/);
  });
});
