import { describe, expect, it } from "vitest";
import {
  avisoErrosAnteriores, linhaIntegracao, motivoNaoEnviado, valorResultadoIntegracao, rotuloResultadoIntegracao, AUTOMATICO,
} from "@/lib/integracaoStatus";
import { atendeFiltroErp, erpBadgeApplies } from "@/components/movimentos/ErpStatusBadge";

describe("status de integração (S1) — textos", () => {
  it("Integrado mostra o evento e a hora (fuso de Fortaleza)", () => {
    expect(linhaIntegracao({ estado: "integrado", evento: "saida.expedido", em: "2026-11-15T13:42:00Z" }))
      .toBe("Integrado · Expedição · 15/11 10:42");
  });
  it("Erro mostra o evento; Aguardando mostra o evento sem hora", () => {
    expect(linhaIntegracao({ estado: "erro", evento: "saida.separacao_finalizada", em: "2026-11-15T13:42:00Z" }))
      .toBe("Erro no ERP · Separação · 15/11 10:42");
    expect(linhaIntegracao({ estado: "pendente", evento: "saida.expedido", em: "2026-11-15T13:42:00Z" }))
      .toBe("Aguardando envio · Expedição");
  });
  it("Não integra e Ignorado aparecem juntos como Não enviado, com motivos diferentes", () => {
    expect(linhaIntegracao({ estado: "nao_integra" })).toBe("Não enviado");
    expect(linhaIntegracao({ estado: "ignorado", evento: "saida.expedido" })).toBe("Não enviado");
    expect(motivoNaoEnviado("nao_integra")).not.toBe(motivoNaoEnviado("ignorado"));
  });
  it("aviso de retorno anterior com erro só quando o estado não é erro", () => {
    expect(avisoErrosAnteriores({ estado: "integrado", erros_outros: 1 })).toBe("1 retorno anterior com erro");
    expect(avisoErrosAnteriores({ estado: "integrado", erros_outros: 2 })).toBe("2 retornos anteriores com erro");
    expect(avisoErrosAnteriores({ estado: "erro", erros_outros: 1 })).toBeNull();
    expect(avisoErrosAnteriores({ estado: "integrado", erros_outros: 0 })).toBeNull();
  });
});

describe("nó Atualizar documento — resultado declarado", () => {
  it("valor ausente ou desconhecido é Automático", () => {
    expect(valorResultadoIntegracao(undefined)).toBe(AUTOMATICO);
    expect(valorResultadoIntegracao("talvez")).toBe(AUTOMATICO);
    expect(valorResultadoIntegracao("ignorado")).toBe("ignorado");
    expect(rotuloResultadoIntegracao("ignorado")).toBe("Não precisou enviar");
  });
});

describe("selo e filtro ERP das listas", () => {
  it("o selo não aparece para 'nao_integra'", () => {
    expect(erpBadgeApplies("nao_integra")).toBe(false);
    expect(erpBadgeApplies("integrado")).toBe(true);
    expect(erpBadgeApplies(null)).toBe(false);
  });
  it("filtro usa o resumo de integração, não o status da onda", () => {
    expect(atendeFiltroErp("erro", "erro")).toBe(true);
    expect(atendeFiltroErp("integrado", "erro")).toBe(false);
    expect(atendeFiltroErp("ignorado", "nao_enviado")).toBe(true);
    expect(atendeFiltroErp(null, "nao_enviado")).toBe(true);
    expect(atendeFiltroErp("pendente", "")).toBe(true);
  });
});

describe("eventos de embarque e entrega", () => {
  it("têm nome curto próprio", async () => {
    const { nomeEventoCurto } = await import("../integracaoStatus");
    expect(nomeEventoCurto("saida.entregue")).toBe("Entregue");
    expect(nomeEventoCurto("saida.carga_fechada")).toBe("Carga fechada");
    expect(nomeEventoCurto("saida.entrega_estornada")).toBe("Entrega estornada");
  });
});
