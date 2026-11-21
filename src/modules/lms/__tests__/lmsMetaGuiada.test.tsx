import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));

import { estaMedindo, frasePessoasAtingem, type CatalogoMetas, type ObjetivosMeta, type PreviaMeta } from "../metas/metas.service";
import { NovaMetaGuiadaDialog, fraseMeta } from "../metas/NovaMetaGuiadaDialog";

const catalogo: CatalogoMetas = {
  sucesso: true, metricas: [],
  tipos_tarefa: [{ id: "t1", codigo: "SEP", descricao: "Separação", categoria: "SEPARACAO", unidade_medida: "UN" }],
  categorias: [], armazens: [{ id: "a1", nome: "CD 1" }], turnos: [{ id: "tu1", nome: "Diurno" }], equipes: [{ id: "eq1", nome: "Equipe A" }],
  operadores: [{ id: "u1", nome: "Ana" }], perfis: [], modelos: [], hoje: "2026-11-21",
  exige_aprovacao: false, pode_criar: true, pode_editar: true, pode_excluir: true, pode_aprovar: true,
};

const objetivos: ObjetivosMeta = {
  sucesso: true, recomendado: "RITMO", janela: { de: "2026-10-24", ate: "2026-11-20" },
  objetivos: [
    { codigo: "RITMO", ordem: 1, metrica: "PERFORMANCE", rotulo: "Ritmo certo", pergunta: "Minha equipe faz as tarefas no tempo esperado?", verbo: "o ritmo",
      unidade: "PCT", menor_melhor: false, suficiente: true, hoje: 92.5, motivo: null, permite_atividade: true },
    { codigo: "INDIRETO", ordem: 8, metrica: "TEMPO_INDIRETO_PCT", rotulo: "Menos tempo indireto", pergunta: "Quanto do turno vai para reunião?", verbo: "o tempo indireto",
      unidade: "PCT", menor_melhor: true, suficiente: false, hoje: null, motivo: "Sem dado.", permite_atividade: false },
  ],
};

const previa: PreviaMeta = {
  sucesso: true, metrica: "PERFORMANCE", unidade: "PCT", menor_melhor: false, periodicidade: "DIARIO",
  objetivo: { codigo: "RITMO", rotulo: "Ritmo certo", pergunta: "", verbo: "o ritmo" },
  linha_base: {
    suficiente: true, participantes: 5, com_dado: 4, janela: { de: "2026-10-24", ate: "2026-11-20" }, menor_melhor: false, unidade: "PCT",
    mediana: 92.5, p10: 83, p25: 87.5, p75: 97.5, p90: 102, valores: [80, 90, 95, 105], pct_inicio_real: 100,
    tendencia: { antes: 92.5, depois: 92.5, variacao: 0, direcao: "ESTAVEL" },
  },
  niveis: [
    { codigo: "MANTER", pct: 0, alvo: 92.5, atingem: 2, realismo: "ALCANCAVEL" },
    { codigo: "EVOLUIR", pct: 10, alvo: 101.8, atingem: 1, realismo: "DESAFIADOR", recomendado: true },
    { codigo: "DESAFIAR", pct: 15, alvo: 102, atingem: 1, realismo: "DESAFIADOR", limitado: true },
  ],
  personalizado: null, medir_dias: 14,
  avisos: [{ codigo: "PADRAO_SEM_CALIBRAR", mensagem: "O tempo padrão de Separação ainda não foi calibrado." }],
};

function responder(prev: PreviaMeta = previa) {
  rpc.mockImplementation((fn: string) => {
    if (fn === "rpc_lms_meta_objetivos") return Promise.resolve({ data: objetivos, error: null });
    if (fn === "rpc_lms_meta_previa") return Promise.resolve({ data: prev, error: null });
    if (fn === "rpc_lms_meta_salvar_guiada") return Promise.resolve({ data: { sucesso: true, ids: ["m1"], quantidade: 1, status: "ATIVA", mensagem: "ok" }, error: null });
    return Promise.resolve({ data: null, error: { message: fn } });
  });
}

function abrir(onSalvo = vi.fn(), onModoAvancado = vi.fn()) {
  render(<NovaMetaGuiadaDialog aberto inicial={null} catalogo={catalogo} tenantId="t" empresaId="e"
    onCancelar={() => {}} onSalvo={onSalvo} onModoAvancado={onModoAvancado} />);
  return { onSalvo, onModoAvancado };
}

describe("Fase 10.28 · frases da meta guiada", () => {
  it("escreve a meta como frase", () => {
    expect(fraseMeta({ verbo: "o ritmo", menor_melhor: false }, "PCT", 92.5, 101.8)).toBe("Aumentar o ritmo da equipe de 92,5% para 101,8%");
    expect(fraseMeta({ verbo: "o tempo indireto", menor_melhor: true }, "PCT", 6.3, 5.7)).toBe("Reduzir o tempo indireto da equipe de 6,3% para 5,7%");
    expect(fraseMeta({ verbo: "o ritmo", menor_melhor: false }, "PCT", 92.5, 92.5)).toBe("Manter o ritmo da equipe em 92,5%");
    expect(fraseMeta({ verbo: "o registro do início", menor_melhor: false }, "PCT", null, null)).toMatch(/^Medir o registro do início/);
  });
  it("conta quem chega lá e reconhece o rascunho medindo", () => {
    expect(frasePessoasAtingem(2, 5)).toBe("2 de 5 operadores já chegam lá hoje.");
    expect(frasePessoasAtingem(0, 4)).toMatch(/^Ninguém/);
    expect(estaMedindo({ status: "RASCUNHO", alvo: null, medir_ate: "2026-12-05" })).toBe(true);
    expect(estaMedindo({ status: "RASCUNHO", alvo: 90, medir_ate: null })).toBe(false);
  });
});

describe("Fase 10.28 · assistente de 4 passos", () => {
  beforeEach(() => { rpc.mockReset(); responder(); });

  it("objetivo → para quem → nível Evoluir recomendado → ativa com os dados do assistente", async () => {
    const { onSalvo } = abrir();
    expect(await screen.findByText("Ritmo certo")).toBeInTheDocument();
    expect(screen.getByText("Recomendado")).toBeInTheDocument();
    expect(screen.getByText("92,5%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Ritmo certo/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));

    fireEvent.change(screen.getByLabelText("Adicionar"), { target: { value: "eq1" } });
    expect(screen.getByText(/Vale para equipe Equipe A/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));

    expect(await screen.findByTestId("linha-base")).toHaveTextContent("92,5%");
    expect(screen.getByText(/ainda não foi calibrado/)).toBeInTheDocument();
    const evoluir = screen.getByRole("radio", { name: /Evoluir/ });
    await waitFor(() => expect(evoluir).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("Limitado ao que os melhores da equipe já sustentam.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));

    expect(screen.getByTestId("frase-meta")).toHaveTextContent("Aumentar o ritmo da equipe de 92,5% para 101,8%");
    fireEvent.click(screen.getByRole("button", { name: "Ativar meta" }));
    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    const [, args] = rpc.mock.calls.find((c) => c[0] === "rpc_lms_meta_salvar_guiada")!;
    const d = (args as { p_dados: Record<string, unknown> }).p_dados;
    expect(d).toMatchObject({ objetivo: "RITMO", nivel: "EVOLUIR", ativar: true, medir_primeiro: false, armazem_id: "a1",
      escopo: [{ tipo: "EQUIPE", ref_id: "eq1" }] });
  });

  it("sem histórico: oferece Medir primeiro e salva sem alvo", async () => {
    responder({ ...previa, linha_base: { ...previa.linha_base, suficiente: false, motivo: "Ainda não há trabalho suficiente.", com_dado: 0 }, niveis: [], avisos: [] });
    abrir();
    fireEvent.click(await screen.findByRole("radio", { name: /Ritmo certo/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(await screen.findByText("Ainda não há trabalho suficiente.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("radio", { name: /Medir primeiro/ })).toBeChecked());
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar e começar a medir" }));
    await waitFor(() => expect(rpc.mock.calls.some((c) => c[0] === "rpc_lms_meta_salvar_guiada")).toBe(true));
    const d = (rpc.mock.calls.find((c) => c[0] === "rpc_lms_meta_salvar_guiada")![1] as { p_dados: Record<string, unknown> }).p_dados;
    expect(d).toMatchObject({ medir_primeiro: true, ativar: false });
    expect(d.nivel).toBeUndefined();
  });

  it("outro valor consulta a prévia com o alvo digitado; modo avançado abre o formulário antigo", async () => {
    const { onModoAvancado } = abrir();
    fireEvent.click(await screen.findByRole("radio", { name: /Ritmo certo/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    fireEvent.change(await screen.findByLabelText("Outro valor"), { target: { value: "110" } });
    await waitFor(() => expect(rpc.mock.calls.some((c) => c[0] === "rpc_lms_meta_previa"
      && (c[1] as { p_dados: { alvo: number } }).p_dados.alvo === 110)).toBe(true), { timeout: 2000 });
    fireEvent.click(screen.getByRole("button", { name: /Modo avançado/ }));
    expect(onModoAvancado).toHaveBeenCalled();
  });
});
