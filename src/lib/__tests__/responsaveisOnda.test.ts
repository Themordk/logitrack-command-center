import { describe, expect, it } from "vitest";
import { acaoColetor, descreverResumo, montarAlteracoes, siglaEtapa } from "@/lib/responsaveisOndaService";
import { montarRotulosOperadores } from "@/lib/operadoresAtribuidos";
import { parseError } from "@/lib/errorMapper";
import type { EtapaOnda, ResumoEtapaColetor } from "@/lib/responsaveisOnda.types";

const etapa = (id: string, convocados: string[]): EtapaOnda => ({
  tipo_tarefa_id: id, codigo: id, nome: id, ordem: 1, modo: "EXCLUSIVA", ativa: true, por_zona: false,
  permite_mesmo_operador: true, status: "AGUARDANDO", travada: false,
  totais: { total: 0, concluidas: 0, abertas: 0, livres: 0, com_dono: 0, com_progresso: 0, qtd_requerida: 0, qtd_executada: 0 },
  convocados: convocados.map((u) => ({ usuario_id: u, nome: u, definido_por: null, definido_em: "" })),
  operadores: [],
});

describe("montarAlteracoes", () => {
  it("envia só as etapas cuja convocação mudou", () => {
    const etapas = [etapa("SEP", ["ana"]), etapa("CONF", [])];
    expect(montarAlteracoes(etapas, { SEP: ["ana"], CONF: [] })).toEqual([]);
    expect(montarAlteracoes(etapas, { SEP: ["joao"], CONF: [] })).toEqual([{ tipo_tarefa_id: "SEP", usuarios: ["joao"] }]);
  });
  it("lista vazia significa voltar a etapa para livre", () => {
    expect(montarAlteracoes([etapa("SEP", ["ana"])], { SEP: [] })).toEqual([{ tipo_tarefa_id: "SEP", usuarios: [] }]);
  });
  it("ignora ordem e repetição na equipe", () => {
    expect(montarAlteracoes([etapa("SEP", ["a", "b"])], { SEP: ["b", "a", "a"] })).toEqual([]);
  });
});

describe("descreverResumo", () => {
  it("descreve troca de dono com progresso", () => {
    const linhas = descreverResumo([{
      tipo_tarefa_id: "x", etapa: "SEPARAÇÃO", codigo_etapa: "SEP", ordem: 1, convocados: "JOSE", aplicado: true,
      tarefas_movidas: 3, tarefas_novas: 0, tarefas_devolvidas: 0, com_progresso: 1,
      de: [{ usuario_id: "p", nome: "PAULO", tarefas: 3 }],
    }]);
    expect(linhas[0]).toBe("Separação: mover 3 tarefa(s) de PAULO para JOSE.");
    expect(linhas[1]).toMatch(/1 tarefa\(s\) com progresso continuarão de onde pararam/);
  });
  it("etapa sem tarefas ainda: convocação vale para as próximas", () => {
    const [linha] = descreverResumo([{
      tipo_tarefa_id: "x", etapa: "CONFERÊNCIA DE ONDA", codigo_etapa: "SEP-CONF", ordem: 2, convocados: "JOSE", aplicado: true,
      tarefas_movidas: 0, tarefas_novas: 0, tarefas_devolvidas: 0,
    }]);
    expect(linha).toMatch(/ainda serão geradas/);
  });
  it("etapa liberada para autoconvocação", () => {
    const [linha] = descreverResumo([{
      tipo_tarefa_id: "x", etapa: "SEPARAÇÃO", codigo_etapa: "SEP", ordem: 1, convocados: "Livre (autoconvocação)",
      aplicado: true, livre: true, tarefas_devolvidas: 2,
    }]);
    expect(linha).toMatch(/volta a ficar livre; 2 tarefa/);
  });
});

describe("acaoColetor (convocação híbrida)", () => {
  const base: ResumoEtapaColetor = { sucesso: true };
  it("etapa livre: assumir", () => {
    expect(acaoColetor({ ...base, pode_assumir: true }, "separação")).toMatchObject({ tipo: "ASSUMIR", rotulo: "Assumir e iniciar separação" });
  });
  it("convocado pelo gestor: iniciar, sem opção de sair", () => {
    expect(acaoColetor({ ...base, ja_e_meu: true, convocado_pelo_gestor: true }, "separação")).toMatchObject({ tipo: "CONTINUAR", podeSair: false });
  });
  it("assumida pelo próprio operador: pode sair", () => {
    expect(acaoColetor({ ...base, ja_e_meu: true, convocado_pelo_gestor: false }, "conferência")).toMatchObject({ tipo: "CONTINUAR", rotulo: "Continuar conferência", podeSair: true });
  });
  it("indisponível mostra o motivo do banco", () => {
    expect(acaoColetor({ ...base, pode_assumir: false, mensagem: "Onda designada para JOSE pelo gestor." }, "separação"))
      .toMatchObject({ tipo: "BLOQUEADA", mensagem: "Onda designada para JOSE pelo gestor." });
  });
});

describe("rótulos do card da onda", () => {
  it("agrupa etapas por operador e ordena SEP antes de CONF", () => {
    expect(montarRotulosOperadores([
      { nome: "Lucas", sigla: "CONF" }, { nome: "Lucas", sigla: "SEP" }, { nome: "Ana", sigla: null },
    ])).toEqual(["Ana", "Lucas (SEP, CONF)"]);
  });
  it("sigla das etapas", () => {
    expect(siglaEtapa("SEP")).toBe("SEP");
    expect(siglaEtapa("SEP-CONF")).toBe("CONF");
    expect(siglaEtapa("ABAST")).toBeNull();
  });
});

describe("errorMapper — códigos da convocação híbrida", () => {
  it("CONF_ONDA_DESIGNADA não cai no ONDA_DESIGNADA genérico", () => {
    const r = parseError({ message: "CONF_ONDA_DESIGNADA: Onda #10: Onda designada para JOSE pelo gestor." });
    expect(r.errorCode).toBe("CONF_ONDA_DESIGNADA");
    expect(r.details).toMatch(/JOSE/);
  });
  it("TAREFA_REATRIBUIDA vindo do gatilho do banco", () => {
    const r = parseError({ message: "TAREFA_REATRIBUIDA: Esta tarefa foi passada para JOSE PEREIRA. A lista será atualizada." });
    expect(r.errorCode).toBe("TAREFA_REATRIBUIDA");
    expect(r.type).toBe("business");
  });
  it("retorno estruturado da RPC usa o mapa", () => {
    const r = parseError({ sucesso: false, codigo: "ETAPA_JA_ASSUMIDA", mensagem: "Esta etapa já está com PAULO." });
    expect(r.title).toBe("Outro operador assumiu esta etapa antes de você.");
    expect(r.details).toBe("Esta etapa já está com PAULO.");
  });
});
