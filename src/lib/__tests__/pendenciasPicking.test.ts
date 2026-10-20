import { describe, expect, it } from "vitest";
import { ordenarTarefasPicking, quantidadeAbastecimento, situacaoTarefa } from "../pendenciasPickingService";
import { parseError } from "../errorMapper";
describe("pendências de picking", () => {
  it("sem endereço exige mapeamento offline", () => expect(situacaoTarefa({ endereco_id: null })).toBe("SEM_PICKING_MAPEADO"));
  it("picking zerado aguarda abastecimento", () => expect(situacaoTarefa({ endereco_id: "p", saldo_endereco: 0 })).toBe("SEM_SALDO_PICKING"));
  it("respeita situação ao vivo em vez de pendência da liberação", () => expect(situacaoTarefa({ situacao_saldo: "OK", motivo_pendencia: "SEM_SALDO_PICKING", sem_saldo_na_liberacao: true })).toBe("OK"));
  it("tarefas pendentes ficam no fim sem desaparecer", () => {
    const tarefas = ordenarTarefasPicking([{ tarefa_id: "pendente", ordem_tarefa: 1, situacao_saldo: "SEM_SALDO_PICKING" as const }, { tarefa_id: "ok2", ordem_tarefa: 3, situacao_saldo: "OK" as const }, { tarefa_id: "ok1", ordem_tarefa: 2, situacao_saldo: "OK" as const }]);
    expect(tarefas.map(t => t.tarefa_id)).toEqual(["ok1", "ok2", "pendente"]);
  });
  it("abastece no máximo o saldo da origem ou o faltante", () => { expect(quantidadeAbastecimento(10, 8)).toBe(8); expect(quantidadeAbastecimento(2, 8)).toBe(2); });
  it.each(["AGUARDANDO_ABASTECIMENTO", "PICKING_NAO_MAPEADO", "LIBERADA_COM_AVISOS", "VALIDACAO_BLOQUEOU"])("%s é recusa de negócio, não erro de sistema", codigo => {
    const erro = parseError({ sucesso: false, codigo, mensagem: "" });
    expect(erro.type).toBe("business");
    expect(erro.errorCode).toBe(codigo);
  });
});