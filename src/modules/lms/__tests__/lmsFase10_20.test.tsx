import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";
import { PrimeirosPassosPanel, resumoSaude } from "../configuracao/PrimeirosPassosPanel";
import { obterSaudeConfig, padraoCalibrado, type SaudeConfig } from "../configuracao/lmsConfig.service";
import { GLOSSARIO, TermoAjuda, definicaoTermo } from "../glossario";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));
const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

const SAUDE: SaudeConfig = {
  pronto: false,
  passos: [
    { codigo: "METAS", ordem: 4, titulo: "Metas", descricao: "d", situacao: "PENDENTE", detalhe: "Nenhuma meta ativa.", destino: "/lms/metas", acao: "Criar a primeira meta" },
    { codigo: "TURNOS", ordem: 1, titulo: "Turnos e operadores", descricao: "d", situacao: "OK", detalhe: "4 operador(es) com turno.", destino: "/config/usuarios", acao: "Definir turno" },
    { codigo: "TEMPOS", ordem: 2, titulo: "Tempo padrão calibrado", descricao: "d", situacao: "ATENCAO", detalhe: "2 de 2 tipo(s) sem calibrar: SEP, EMB", destino: "#lms-tipos-tarefa", acao: "Revisar tempos padrão", itens: ["EMB", "SEP"] },
    { codigo: "FAIXAS", ordem: 3, titulo: "Faixas", descricao: "d", situacao: "OPCIONAL", detalhe: "Padrão do sistema.", destino: "#lms-faixas", acao: "Revisar faixas" },
  ],
};

describe("Fase 10.20 · primeiros passos e saúde da configuração (P9)", () => {
  beforeEach(() => rpc.mockReset());

  it("lê do banco e põe os passos na ordem", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, ...SAUDE }, error: null });
    const s = await obterSaudeConfig("t1", "e1", null);
    expect(rpc).toHaveBeenCalledWith("rpc_lms_saude_config", { p_tenant_id: "t1", p_empresa_id: "e1", p_armazem_id: null });
    expect(s.passos.map((p) => p.codigo)).toEqual(["TURNOS", "TEMPOS", "FAIXAS", "METAS"]);
  });

  it("resumo diz o que falta", () => {
    expect(resumoSaude(SAUDE)).toMatch(/1 passo\(s\) por fazer e 1 para revisar/);
    expect(resumoSaude({ pronto: true, passos: [SAUDE.passos[1]] })).toBe("Configuração completa.");
  });

  it("abre com pendência, leva para outra tela ou para a seção da página", async () => {
    rpc.mockResolvedValue({ data: { sucesso: true, ...SAUDE }, error: null });
    const onNavigate = vi.fn();
    const alvo = document.createElement("div"); alvo.id = "lms-tipos-tarefa"; alvo.scrollIntoView = vi.fn();
    document.body.appendChild(alvo);
    render(<PrimeirosPassosPanel tenantId="t1" empresaId="e1" armazemId={null} onNavigate={onNavigate} />);
    fireEvent.click(await screen.findByRole("button", { name: "Criar a primeira meta" }));
    expect(onNavigate).toHaveBeenCalledWith("/lms/metas");
    fireEvent.click(screen.getByRole("button", { name: "Revisar tempos padrão" }));
    expect(alvo.scrollIntoView).toHaveBeenCalled();
    // passo pronto que aponta para outra tela não mostra botão
    expect(screen.queryByRole("button", { name: "Definir turno" })).not.toBeInTheDocument();
    alvo.remove();
  });

  it("sem permissão ou erro: o painel não aparece e a página segue", async () => {
    rpc.mockResolvedValue({ data: { sucesso: false, codigo: "SEM_PERMISSAO_MODULO" }, error: null });
    const { container } = render(<PrimeirosPassosPanel tenantId="t1" empresaId="e1" armazemId={null} />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Fase 10.20 · selo de não calibrado (P12) e glossário (P10)", () => {
  it("calibrado só quando a origem é calibrado ou engenharia (mesma regra do banco)", () => {
    expect(padraoCalibrado("CALIBRADO")).toBe(true);
    expect(padraoCalibrado("ENGENHARIA")).toBe(true);
    expect(padraoCalibrado("MIGRADO")).toBe(false);
    expect(padraoCalibrado("MANUAL")).toBe(false);
    expect(padraoCalibrado(null)).toBe(false);
  });

  it("cada termo tem nome e texto, e o score não se confunde com performance", () => {
    for (const t of Object.values(GLOSSARIO)) { expect(t.nome).toBeTruthy(); expect(t.texto.length).toBeGreaterThan(20); }
    expect(definicaoTermo("performance")).toMatch(/Horas-padrão ÷ tempo direto/);
    expect(definicaoTermo("score")).toMatch(/Não é a performance/);
  });

  it("ajuda é acessível pelo nome do termo", () => {
    render(<TermoAjuda termo="utilizacao" />);
    expect(screen.getByRole("button", { name: "O que é utilização" })).toBeInTheDocument();
  });
});
