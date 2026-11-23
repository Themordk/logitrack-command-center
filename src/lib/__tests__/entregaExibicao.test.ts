import { describe, expect, it } from "vitest";
import {
  caminhoFotoEntrega, descreverDocumento, efeitoMotivo, enderecoLinha2, formatarDuracao, formatarHora,
  avisoSemEntregador, linkMapa, linkTelefone, textoAlertaEntrega,
} from "@/lib/entregaExibicao";

const veic = (id: string, usuario_id: string | null) => ({ id, descricao: id, placa: null, peso_total: null, m3: null, total_pallet: null, usuario_id });

describe("entregaExibicao", () => {
  it("monta o link do mapa com o endereço completo e codificado", () => {
    const url = linkMapa({ endereco: "R. das Flores, 120", bairro: "Centro", cidade: "Fortaleza", estado: "CE", cep: "60000-000" });
    expect(url).toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("R. das Flores, 120, Centro, Fortaleza, CE, 60000-000"));
  });

  it("sem endereço nem cidade não há link de mapa", () => {
    expect(linkMapa({ endereco: " ", bairro: "Centro", cidade: null, estado: "CE", cep: null })).toBeNull();
  });

  it("telefone vira tel: só com dígitos e exige ao menos 8 dígitos", () => {
    expect(linkTelefone("(85) 99999-0000")).toBe("tel:85999990000");
    expect(linkTelefone("+55 85 3333-4444")).toBe("tel:+558533334444");
    expect(linkTelefone("123")).toBeNull();
    expect(linkTelefone(null)).toBeNull();
  });

  it("segunda linha do endereço junta bairro e cidade/UF", () => {
    expect(enderecoLinha2({ bairro: "Aldeota", cidade: "Fortaleza", estado: "CE" })).toBe("Aldeota · Fortaleza/CE");
    expect(enderecoLinha2({ bairro: null, cidade: "Fortaleza", estado: null })).toBe("Fortaleza");
  });

  it("documento mostra NF com série e pedido", () => {
    expect(descreverDocumento({ numero_nf: "12345", serie_nf: "1", numero_pedido: "8890" })).toBe("NF 12345-1 · Pedido 8890");
    expect(descreverDocumento({ numero_nf: null, serie_nf: null, numero_pedido: null })).toBe("Sem documento");
  });

  it("duração em texto curto", () => {
    const t0 = "2026-11-23T10:00:00Z";
    expect(formatarDuracao(t0, "2026-11-23T10:00:45Z")).toBe("45 s");
    expect(formatarDuracao(t0, "2026-11-23T10:13:00Z")).toBe("13 min");
    expect(formatarDuracao(t0, "2026-11-23T12:05:00Z")).toBe("2 h 05 min");
    expect(formatarDuracao(null, t0)).toBeNull();
  });

  it("hora no fuso America/Fortaleza", () => {
    expect(formatarHora("2026-11-23T11:31:00Z")).toBe("08:31");
    expect(formatarHora(null)).toBe("—");
  });

  it("caminho da foto segue o formato que a RPC aceita", () => {
    expect(caminhoFotoEntrega("t1", "e1", "p1", "canhoto", 1700)).toBe("t1/entregas/e1/p1/canhoto-1700.jpg");
  });

  it("efeito do motivo na parada", () => {
    expect(efeitoMotivo({ id: "m", descricao: "x", exige_observacao: false, impede_entrega: true })).toMatch(/não entregue/);
    expect(efeitoMotivo({ id: "m", descricao: "x", exige_observacao: false, impede_entrega: false })).toMatch(/continua pendente/);
    expect(efeitoMotivo(null)).toBeNull();
  });

  it("texto do alerta de entrega pendente", () => {
    expect(textoAlertaEntrega([1042])).toBe("Nova carga #1042 para aceitar");
    expect(textoAlertaEntrega([1042, 1043])).toBe("2 cargas para aceitar (#1042, #1043)");
    expect(textoAlertaEntrega([])).toBe("");
  });

  it("aviso de veículo sem entregador só quando o tenant já usa entregas", () => {
    expect(avisoSemEntregador([veic("a", null), veic("b", null)], "a")).toBe(false);
    expect(avisoSemEntregador([veic("a", null), veic("b", "u1")], "a")).toBe(true);
    expect(avisoSemEntregador([veic("a", null), veic("b", "u1")], "b")).toBe(false);
    expect(avisoSemEntregador([veic("a", null), veic("b", "u1")], "")).toBe(false);
  });
});
