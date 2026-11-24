import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { mapMotivosRelatorio, mapResumoTentativas, pctTexto, textoResultado, toTentativasParams } from "../entregas.service";
import { filtrosIniciais } from "../filtrosEntregas";

describe("relatórios de entrega · service", () => {
  it("envia filtros vazios como null e estornadas como booleano", () => {
    const p = toTentativasParams({ tenant_id: "t", empresa_id: "e", usuario_id: "", resultado: undefined }, 100, 200);
    expect(p).toMatchObject({
      p_tenant_id: "t", p_empresa_id: "e", p_usuario_id: null, p_resultado: null,
      p_motivo_id: null, p_incluir_estornadas: false, p_limit: 100, p_offset: 200,
    });
  });

  it("lê o resumo da primeira linha da RPC", () => {
    const r = mapResumoTentativas({ total_registros: "5", qtd_entregues: 2, qtd_nao_visitadas: 1, qtd_estornadas: "2" });
    expect(r.total).toBe(5);
    expect(r.entregues).toBe(2);
    expect(r.nao_visitadas).toBe(1);
    expect(r.estornadas).toBe(2);
    expect(mapResumoTentativas(undefined).total).toBe(0);
  });

  it("separa falhas e ressalvas e normaliza grupos", () => {
    const rel = mapMotivosRelatorio({
      resumo: { tentativas: 3, entregues: 2, nao_entregues: 1 },
      motivos: [
        { tipo: "FALHA", motivo_id: "m1", motivo: "Recusa", quantidade: 1, pct: 100 },
        { tipo: "RESSALVA", motivo_id: "m2", motivo: "Avaria parcial", quantidade: 2, pct: null },
      ],
      por_entregador: [{ usuario_id: "u1", nome: "Ana", tentativas: 3, entregues: 2, nao_entregues: 1, entregues_primeira: 2 }],
      por_cliente: [{ parceiro_id: null, nome: null, tentativas: 1, entregues: 0, nao_entregues: 1, pedidos: 1 }],
      por_dia: [{ dia: "2026-11-23", tentativas: 3, entregues: 2, nao_entregues: 1 }],
    });
    expect(rel.motivos.map((m) => m.tipo)).toEqual(["FALHA", "RESSALVA"]);
    expect(rel.motivos[1].pct).toBeNull();
    expect(rel.por_entregador[0]).toMatchObject({ id: "u1", nome: "Ana", entregues_primeira: 2 });
    expect(rel.por_cliente[0]).toMatchObject({ id: null, nome: "—", pedidos: 1 });
    expect(rel.resumo.nao_visitadas).toBe(0);
    expect(mapMotivosRelatorio(null).motivos).toEqual([]);
  });

  it("formata percentual e resultado", () => {
    expect(pctTexto(1, 3)).toBe("33,3%");
    expect(pctTexto(1, 0)).toBe("—");
    expect(textoResultado({ resultado: "NAO_ENTREGUE", estornada: true })).toBe("Não entregue (estornada)");
    expect(textoResultado({ resultado: "NAO_VISITADA", estornada: false })).toBe("Não visitada");
  });

  it("período padrão cobre os últimos 30 dias no fuso de Fortaleza", () => {
    const f = filtrosIniciais(new Date("2026-11-24T02:00:00Z")); // 23/11 23h em Fortaleza
    expect(f.dataFim).toBe("2026-11-23");
    expect(f.dataInicio).toBe("2026-10-25");
  });
});
