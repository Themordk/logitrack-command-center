import { describe, expect, it } from "vitest";
import { normalizarEntregaTipoSaida, resumoEntregaTipoSaida } from "../entregaTipoSaida";
import { avisoCargaNaoFechada, situacaoVolumesParada } from "../entregaExibicao";

describe("configuração de entrega do tipo de saída", () => {
  it("sem embarque não há entrega e as opções voltam ao padrão", () => {
    const p = normalizarEntregaTipoSaida({ realiza_embarque: false, realiza_entrega: true, entrega_gerar_em: "MONTADA", entrega_confere_volume: true });
    expect(p).toMatchObject({ realiza_entrega: false, entrega_gerar_em: "FECHADA", entrega_confere_volume: false });
  });
  it("com entrega mantém o momento e a conferência escolhidos", () => {
    const p = normalizarEntregaTipoSaida({ realiza_embarque: true, realiza_entrega: true, entrega_gerar_em: "MONTADA", entrega_confere_volume: true });
    expect(p).toMatchObject({ realiza_entrega: true, entrega_gerar_em: "MONTADA", entrega_confere_volume: true });
    expect(normalizarEntregaTipoSaida({ realiza_embarque: true, realiza_entrega: true, entrega_gerar_em: "x" }).entrega_gerar_em).toBe("FECHADA");
  });
  it("resume para a lista", () => {
    expect(resumoEntregaTipoSaida({ realiza_embarque: true, realiza_entrega: false })).toBe("Não");
    expect(resumoEntregaTipoSaida({ realiza_embarque: true, realiza_entrega: true, entrega_gerar_em: "MONTADA", entrega_confere_volume: true })).toBe("Montada · confere vol.");
    expect(resumoEntregaTipoSaida({ realiza_embarque: true, realiza_entrega: true, entrega_gerar_em: "FECHADA" })).toBe("Fechada");
  });
});

describe("conferência de volumes na entrega", () => {
  it("sem exigência sempre pode seguir", () => {
    expect(situacaoVolumesParada({ confere_volume: false, volumes_total: 3, volumes_conferidos: 0, ocorrencia: null }).podeSeguir).toBe(true);
  });
  it("com volume faltando só segue com ocorrência informativa", () => {
    const base = { confere_volume: true, volumes_total: 4, volumes_conferidos: 3 };
    expect(situacaoVolumesParada({ ...base, ocorrencia: null })).toMatchObject({ faltam: 1, completo: false, podeSeguir: false });
    const oc = { id: "o", numero: 1, motivo: "Falta de volume", observacao: null, criada_em: "", impede_entrega: false, foto_path: null };
    expect(situacaoVolumesParada({ ...base, ocorrencia: oc })).toMatchObject({ comRessalva: true, podeSeguir: true });
    expect(situacaoVolumesParada({ ...base, volumes_conferidos: 4, ocorrencia: null }).completo).toBe(true);
  });
  it("avisa quando a carga ainda não fechou", () => {
    expect(avisoCargaNaoFechada({ carga_status: "LIBERADA", status: "EM_ROTA" })).toMatch(/montada/i);
    expect(avisoCargaNaoFechada({ carga_status: "FECHADA", status: "EM_ROTA" })).toBeNull();
    expect(avisoCargaNaoFechada({ status: "EM_ROTA" })).toBeNull();
  });
});
