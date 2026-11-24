import { describe, expect, it } from "vitest";
import {
  ajudaEntrega, CARTOES_ACOMPANHAMENTO, ENTREGAS_ORDEM, entregaPedido, ETAPAS_ORDEM, etapaPedido,
  textoResumoEntregaOnda, VISUAL_ENTREGA, VISUAL_ETAPA,
} from "@/lib/situacaoPedido";

describe("situacaoPedido", () => {
  it("cobre os mesmos valores dos CHECKs do banco", () => {
    expect(ETAPAS_ORDEM).toEqual([
      "aguardando_onda", "em_onda", "em_separacao", "separado", "em_conferencia", "conferido",
      "em_carga", "em_carregamento", "embarcado", "expedido", "cancelado", "excluido",
    ]);
    expect([...ENTREGAS_ORDEM].sort()).toEqual([
      "aguardando_expedicao", "aguardando_saida", "com_transportadora", "em_rota",
      "entrega_nao_gerada", "entregue", "nao_entregue", "nao_se_aplica",
    ]);
  });

  it("valida valores desconhecidos", () => {
    expect(etapaPedido("embarcado")).toBe("embarcado");
    expect(etapaPedido("EXPORTADA_ERP")).toBeNull();
    expect(etapaPedido(null)).toBeNull();
    expect(entregaPedido("em_rota")).toBe("em_rota");
    expect(entregaPedido(3)).toBeNull();
  });

  it("tem rótulo para tudo e 'Sem entrega' para nao_se_aplica", () => {
    for (const e of ETAPAS_ORDEM) expect(VISUAL_ETAPA[e].rotulo).toBeTruthy();
    for (const e of ENTREGAS_ORDEM) expect(ajudaEntrega(e)).toBeTruthy();
    expect(VISUAL_ENTREGA.nao_se_aplica.rotulo).toBe("Sem entrega");
  });

  it("usa o motivo do banco na ajuda", () => {
    expect(ajudaEntrega("nao_entregue", "Cliente ausente")).toBe("Não entregue: Cliente ausente");
    expect(ajudaEntrega("entrega_nao_gerada", "Carga sem veículo")).toBe("Carga sem veículo");
  });

  it("resume a entrega da onda", () => {
    expect(textoResumoEntregaOnda(0, 0)).toBeNull();
    expect(textoResumoEntregaOnda(null, null)).toBeNull();
    expect(textoResumoEntregaOnda(1, 0)).toBe("0 de 1 entregue");
    expect(textoResumoEntregaOnda(5, 2)).toBe("2 de 5 entregues");
  });

  it("cartões batem com os ids da RPC", () => {
    expect(CARTOES_ACOMPANHAMENTO.map((c) => c.id)).toEqual([
      "expedidos_sem_entrega", "nao_entregues", "entrega_nao_gerada", "erro_erp",
    ]);
  });
});
