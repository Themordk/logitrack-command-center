import { describe, expect, it } from "vitest";
import {
  FILTROS_CARGA_COLETOR_VAZIOS, FILTROS_CARGAS_VAZIOS, filtrarCargas, FILTROS_ONDAS_VAZIOS, agruparSugestao, contarFiltrosCarga, descreverResponsavelCarga, filtrarCargasColetor, opcoesFiltroCargas, descreverTransporte, filtrarOndas, ordenarOndas, moverItem, nivelCapacidade, placaValida, proximoPedidoEmbarque, situacaoPedidoEmbarque,
} from "@/lib/cargaExibicao";
import type { OndaSugerida } from "@/lib/cargaService";

const onda = (n: number, chave: string, rotulo: string, peso: number): OndaSugerida => ({
  movimento_saida_id: `id-${n}`, numero_onda: n, status: "CONFERIDO", prioridade: "NORMAL",
  veiculo_id: null, veiculo: null, placa: null, box_id: null, box: null, transportadora_id: null, transportadora: null, transportadoras: 0, rota: null, tipo_saida: null, tipo_saida_id: null,
  parceiros: null, pedidos: null, cidades: null, bairros: null, peso_total: peso, m3: 1, documentos: 2, volumes: 0, created_at: null,
  grupo_chave: chave, grupo_rotulo: rotulo,
});

describe("agruparSugestao", () => {
  it("junta ondas da mesma chave e soma peso, m³ e pedidos", () => {
    const grupos = agruparSugestao([onda(1, "A", "Rota Norte", 100), onda(2, "B", "Rota Centro", 50), onda(3, "A", "Rota Norte", 25)]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Rota Centro", "Rota Norte"]);
    const norte = grupos.find((g) => g.chave === "A");
    expect(norte?.ondas.map((o) => o.numero_onda)).toEqual([1, 3]);
    expect(norte?.peso).toBe(125);
    expect(norte?.documentos).toBe(4);
  });
});

describe("moverItem", () => {
  it("move para cima e para baixo sem alterar a lista original", () => {
    const base = ["a", "b", "c", "d"];
    expect(moverItem(base, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moverItem(base, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(base).toEqual(["a", "b", "c", "d"]);
  });
  it("ignora posições inválidas", () => {
    expect(moverItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moverItem(["a", "b"], -1, 1)).toEqual(["a", "b"]);
  });
});

describe("nivelCapacidade", () => {
  it("classifica o percentual de ocupação do veículo", () => {
    expect(nivelCapacidade(null)).toBe("sem-limite");
    expect(nivelCapacidade(50)).toBe("ok");
    expect(nivelCapacidade(95)).toBe("alerta");
    expect(nivelCapacidade(101)).toBe("excedido");
  });
});

describe("descreverTransporte", () => {
  it("mostra a transportadora ou o veículo próprio, com a placa", () => {
    expect(descreverTransporte({ modalidade: "TERCEIRO", transportadora: "ALFA", placa: "ABC1D23" })).toBe("ALFA - ABC1D23");
    expect(descreverTransporte({ modalidade: "TERCEIRO", transportadora: null })).toBe("Transportadora não informada");
    expect(descreverTransporte({ modalidade: "PROPRIA", veiculo: "Truck 01", placa: null })).toBe("Truck 01");
  });
});

describe("placaValida", () => {
  it("aceita padrão antigo e Mercosul, com ou sem hífen", () => {
    expect(placaValida("abc-1234")).toBe(true);
    expect(placaValida("ABC1D23")).toBe(true);
    expect(placaValida("AB12345")).toBe(false);
  });
});

describe("embarque por volume", () => {
  it("classifica o pedido pelos volumes conferidos", () => {
    expect(situacaoPedidoEmbarque({ unidades_total: 0, unidades_embarcadas: 0 })).toBe("SEM_VOLUMES");
    expect(situacaoPedidoEmbarque({ unidades_total: 10, unidades_embarcadas: 0 })).toBe("PENDENTE");
    expect(situacaoPedidoEmbarque({ unidades_total: 10, unidades_embarcadas: 5 })).toBe("PARCIAL");
    expect(situacaoPedidoEmbarque({ unidades_total: 10, unidades_embarcadas: 10 })).toBe("COMPLETO");
  });
  it("aponta o primeiro pedido incompleto na ordem da carga", () => {
    const docs = [
      { sequencia: 2, unidades_total: 0, unidades_embarcadas: 0 },
      { sequencia: 1, unidades_total: 3, unidades_embarcadas: 3 },
      { sequencia: 3, unidades_total: 2, unidades_embarcadas: 1 },
    ];
    expect(proximoPedidoEmbarque(docs)?.sequencia).toBe(2);
    expect(proximoPedidoEmbarque([{ sequencia: 1, unidades_total: 1, unidades_embarcadas: 1 }])).toBeNull();
  });
});

describe("grid de ondas", () => {
  const base = onda(1, "g", "g", 100);
  const lista = [
    { ...base, movimento_saida_id: "a", numero_onda: 1862, pedidos: "2000000080", parceiros: "Francisco Hércules", rota: "Rota Sul", cidades: "TERESINA (PI)", bairros: "Angelim", tipo_saida_id: "t1", volumes: 5, peso_total: 30 },
    { ...base, movimento_saida_id: "b", numero_onda: 1861, pedidos: "2000000074", parceiros: "Quality Caminhões", rota: null, cidades: "GUARACIABA", bairros: "Centro", tipo_saida_id: "t2", volumes: 10, peso_total: 200 },
  ];
  it("filtra sem diferenciar acento e maiúsculas", () => {
    expect(filtrarOndas(lista, { ...FILTROS_ONDAS_VAZIOS, parceiro: "hercules" }).map((o) => o.numero_onda)).toEqual([1862]);
    expect(filtrarOndas(lista, { ...FILTROS_ONDAS_VAZIOS, documento: "074", tipoSaidaId: "t2" }).map((o) => o.numero_onda)).toEqual([1861]);
    expect(filtrarOndas(lista, { ...FILTROS_ONDAS_VAZIOS, rota: "sul", bairro: "centro" })).toHaveLength(0);
  });
  it("ordena por número e por texto nos dois sentidos", () => {
    expect(ordenarOndas(lista, "peso_total", "desc").map((o) => o.numero_onda)).toEqual([1861, 1862]);
    expect(ordenarOndas(lista, "numero_onda", "asc").map((o) => o.numero_onda)).toEqual([1861, 1862]);
    expect(ordenarOndas(lista, "cidades", "asc").map((o) => o.numero_onda)).toEqual([1861, 1862]);
  });
});

describe("lista de cargas do coletor", () => {
  const cargas = [
    { id: "1", modalidade: "PROPRIA" as const, veiculo: "CAMINHAO", placa: "QAS-123", transportadora: null, box: "BOX 01", motorista: "JOSE" },
    { id: "2", modalidade: "TERCEIRO" as const, veiculo: null, placa: null, transportadora: "Rodo Log", box: null, motorista: "ANA" },
  ];
  it("monta as opções e filtra por veículo, box e motorista", () => {
    const op = opcoesFiltroCargas(cargas);
    expect(op.veiculos).toEqual(["CAMINHAO - QAS-123", "Rodo Log"]);
    expect(op.boxes).toEqual(["BOX 01"]);
    expect(filtrarCargasColetor(cargas, { ...FILTROS_CARGA_COLETOR_VAZIOS, veiculo: "Rodo Log" }).map((c) => c.id)).toEqual(["2"]);
    expect(filtrarCargasColetor(cargas, { veiculo: "", box: "BOX 01", motorista: "ANA" })).toHaveLength(0);
    expect(contarFiltrosCarga({ veiculo: "", box: "BOX 01", motorista: "ANA" })).toBe(2);
  });
  it("descreve com quem está a carga", () => {
    expect(descreverResponsavelCarga({ convocado: false, responsaveis: [], operadores: [] }).tom).toBe("LIVRE");
    expect(descreverResponsavelCarga({ convocado: true, responsaveis: ["Izaias"] })).toEqual({ tom: "VOCE", prefixo: "Com você", nomes: "" });
    expect(descreverResponsavelCarga({ convocado: false, responsaveis: [], operadores: ["Paulo", "Ana"] }).nomes).toBe("Paulo, Ana");
  });
});

describe("filtros da aba Cargas", () => {
  const lista = [
    { numero_carga: 24, prioridade: "NORMAL", box: null, created_at: "2026-11-13T20:20:00Z", modalidade: "PROPRIA" as const, veiculo: "CAMINHAO", transportadora: null, placa: "QAS-123" },
    { numero_carga: 15, prioridade: "ALTA", box: "DOCA", created_at: "2026-11-12T19:23:00Z", modalidade: "TERCEIRO" as const, veiculo: null, transportadora: "2K Intermediação", placa: "HFFF-123" },
  ];
  it("filtra por número, prioridade, veículo e box", () => {
    expect(filtrarCargas(lista, { ...FILTROS_CARGAS_VAZIOS, numero: "24" }).map((c) => c.numero_carga)).toEqual([24]);
    expect(filtrarCargas(lista, { ...FILTROS_CARGAS_VAZIOS, prioridade: "ALTA" }).map((c) => c.numero_carga)).toEqual([15]);
    expect(filtrarCargas(lista, { ...FILTROS_CARGAS_VAZIOS, veiculo: "intermediacao" }).map((c) => c.numero_carga)).toEqual([15]);
    expect(filtrarCargas(lista, { ...FILTROS_CARGAS_VAZIOS, veiculo: "qas" }).map((c) => c.numero_carga)).toEqual([24]);
    expect(filtrarCargas(lista, { ...FILTROS_CARGAS_VAZIOS, box: "doca" }).map((c) => c.numero_carga)).toEqual([15]);
  });
  it("filtra pelo intervalo de datas de criação", () => {
    expect(filtrarCargas(lista, { ...FILTROS_CARGAS_VAZIOS, criadaDe: "2026-11-13" }).map((c) => c.numero_carga)).toEqual([24]);
    expect(filtrarCargas(lista, { ...FILTROS_CARGAS_VAZIOS, criadaAte: "2026-11-12" }).map((c) => c.numero_carga)).toEqual([15]);
    expect(filtrarCargas(lista, { ...FILTROS_CARGAS_VAZIOS, criadaDe: "2026-11-12", criadaAte: "2026-11-13" })).toHaveLength(2);
  });
});
