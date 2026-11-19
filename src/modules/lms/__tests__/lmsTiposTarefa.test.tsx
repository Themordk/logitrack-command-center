import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const listar = vi.fn();
const salvar = vi.fn();
vi.mock("../configuracao/lmsConfig.service", async (orig) => {
  const real = await orig<typeof import("../configuracao/lmsConfig.service")>();
  return { ...real, listarTiposTarefaLms: (...a: unknown[]) => listar(...a), salvarTipoTarefaLms: (...a: unknown[]) => salvar(...a) };
});

import { TiposTarefaSection, validarFormTipo } from "../configuracao/TiposTarefaSection";
import { descreverMudancaTipo, type PadraoTempoConfig, type TipoTarefaLms } from "../configuracao/lmsConfig.service";
import { reservaAcaoLabel } from "@/lib/reservaTarefa";

const ARMZ: TipoTarefaLms = {
  id: "tt-armz", codigo: "ENTR-ARMZ", descricao: "ARMAZENAGEM_ENTRADA", ativo: true, categoria: "ARMAZENAGEM", tipo_movimento: 1,
  unidade_medida: "Unidade", peso_produtividade: 1.1, cor_interface: "#0004ff",
  reserva_acao: "LIBERAR_SEM_EXECUCAO", reserva_expira_min: 240, acoes_reserva: ["LIBERAR_SEM_EXECUCAO", "ALERTAR", "NUNCA"],
};
const PADRAO: PadraoTempoConfig = {
  tipo_tarefa_id: "tt-armz", codigo: "ENTR-ARMZ", descricao: "ARMAZENAGEM_ENTRADA", unidade_medida: "Unidade", categoria: "ARMAZENAGEM",
  efetivo: { tempo_fixo_seg: 180, nivel: "EMPRESA", vigente_desde: "2000-01-01", origem: "MIGRADO" },
  herdado: { tempo_fixo_seg: 180, nivel: "CADASTRO" }, proprio: null, agendados: [],
};

beforeEach(() => { listar.mockReset(); salvar.mockReset(); });

describe("Fase 10.10 · tipos de tarefa no LMS", () => {
  it("validação do formulário", () => {
    const ok = { peso_produtividade: "1", reserva_acao: "LIBERAR_SEM_EXECUCAO" as const, reserva_horas: "4", cor_interface: "#112233" };
    expect(validarFormTipo(ok)).toBeNull();
    expect(validarFormTipo({ ...ok, peso_produtividade: "0" })).toMatch("peso");
    expect(validarFormTipo({ ...ok, reserva_horas: "0.1" })).toMatch("15 minutos");
    expect(validarFormTipo({ ...ok, reserva_acao: "NUNCA", reserva_horas: "0" })).toBeNull();
    expect(validarFormTipo({ ...ok, cor_interface: "azul" })).toMatch("Cor");
  });

  it("descreve a alteração do histórico", () => {
    expect(descreverMudancaTipo({ antes: { reserva_expira_min: 240, ativo: true }, depois: { reserva_expira_min: 60, ativo: false } }, reservaAcaoLabel))
      .toBe("Ativo: sim → não · Prazo sem atividade: 4h → 1h");
  });

  it("lista, edita e envia ao banco só as ações permitidas para o tipo", async () => {
    listar.mockResolvedValue({ pode_editar: true, tipos: [ARMZ], historico: [] });
    salvar.mockResolvedValue({ tipo: ARMZ, alterou: true });
    const onEditarPadrao = vi.fn();
    render(<TiposTarefaSection tenantId="t1" padroes={[PADRAO]} nomeNivel="Empresa Um" onEditarPadrao={onEditarPadrao} />);
    expect(await screen.findByText("ARMAZENAGEM_ENTRADA")).toBeInTheDocument();
    expect(screen.getByText("Liberar se nada foi executado · 4h")).toBeInTheDocument();
    expect(screen.getByText("3 min")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Editar ENTR-ARMZ"));
    const acao = screen.getByLabelText("Quando o operador ficar sem atividade") as HTMLSelectElement;
    expect([...acao.options].map((o) => o.value)).toEqual(["LIBERAR_SEM_EXECUCAO", "ALERTAR", "NUNCA"]);
    expect(screen.queryByText(/Meta de unidades/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Prazo sem atividade (horas)"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect(salvar.mock.calls[0][0]).toMatchObject({
      tenantId: "t1", tipoTarefaId: "tt-armz",
      dados: { reserva_acao: "LIBERAR_SEM_EXECUCAO", reserva_expira_min: 60, categoria: "ARMAZENAGEM", tipo_movimento: 1, ativo: true },
    });
  });

  it("botão do tempo padrão abre o editor de padrão da tela", async () => {
    listar.mockResolvedValue({ pode_editar: true, tipos: [ARMZ], historico: [] });
    const onEditarPadrao = vi.fn();
    render(<TiposTarefaSection tenantId="t1" padroes={[PADRAO]} nomeNivel="Empresa Um" onEditarPadrao={onEditarPadrao} />);
    fireEvent.click(await screen.findByLabelText("Editar ENTR-ARMZ"));
    fireEvent.click(screen.getByRole("button", { name: "Alterar tempo padrão" }));
    expect(onEditarPadrao).toHaveBeenCalledWith(PADRAO);
  });

  it("somente leitura sem permissão de alteração", async () => {
    listar.mockResolvedValue({ pode_editar: false, tipos: [ARMZ], historico: [
      { tipo_tarefa_id: "tt-armz", codigo: "ENTR-ARMZ", antes: { reserva_expira_min: 240 }, depois: { reserva_expira_min: 60 },
        motivo: "teste", alterado_por: "Izaias", alterado_em: "2026-11-19T21:00:00Z" },
    ] });
    render(<TiposTarefaSection tenantId="t1" padroes={[]} nomeNivel="Empresa Um" onEditarPadrao={vi.fn()} />);
    expect(await screen.findByText("ARMAZENAGEM_ENTRADA")).toBeInTheDocument();
    expect(screen.queryByLabelText("Editar ENTR-ARMZ")).not.toBeInTheDocument();
    expect(screen.getByText(/Prazo sem atividade: 4h → 1h/)).toBeInTheDocument();
  });
});
