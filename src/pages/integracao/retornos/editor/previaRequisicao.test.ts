import { describe, expect, it } from "vitest";
import { payloadAnterior, previaOmie, previaRequisicao } from "./previaRequisicao";
import ctx from "./__paridade__/ctx.json";
import type { Destino } from "../retornos.types";

const destino = (extra: Partial<Destino> = {}): Destino => ({
  id: "d", nome: "ERP", erp_provedor_id: null, modo: "http", metodo: "POST", url_base: "https://erp.exemplo.com/api/",
  auth_tipo: "bearer", auth_config: {}, tem_segredo: true, headers: { "X-Cliente": "{{empresa.codigo}}" }, timeout_ms: 15000,
  max_tentativas: 5, limite_falhas: 20, falhas_consecutivas: 0, pausado_em: null, pausado_motivo: null, ...extra,
} as Destino);

describe("prévia das ações = servidor", () => {
  it("HTTP: codifica o caminho, adiciona headers padrão e mascara a autenticação", async () => {
    const r = await previaRequisicao({ tipo: "acao.http", noId: "h", config: { metodo: "PUT", caminho: "/pedidos/{{documento.numero}}/{{documento.tipo.descricao}} x" }, destino: destino(), contexto: ctx, corpoPayload: { a: 1 } });
    expect(r.url).toBe("https://erp.exemplo.com/api/pedidos/10000/TRANSPORTADOR x");
    expect(r.headers.Authorization).toBe("***");
    expect(r.headers["Idempotency-Key"]).toBe("<id da execução>:h");
    expect(r.headers["X-Cliente"]).toBe("CORE-FL01");
    expect(r.corpo).toEqual({ a: 1 });
    expect(r.bloqueio).toBeNull();
  });
  it("HTTP sem payload: corpo {}", async () => {
    const r = await previaRequisicao({ tipo: "acao.http", noId: "h", config: {}, destino: destino(), contexto: ctx, corpoPayload: undefined });
    expect(r.corpo).toEqual({});
  });
  it("Webhook: envelope com dados = payload anterior e assinatura só com HMAC", async () => {
    const r = await previaRequisicao({ tipo: "acao.webhook", noId: "w", config: {}, destino: destino({ modo: "webhook", auth_tipo: "hmac" }), contexto: ctx, corpoPayload: { p: 1 } });
    expect(r.assinado).toBe(true);
    expect(r.headers["X-LogiTrack-Signature"]).toBe("***");
    expect(r.corpo).toMatchObject({ evento: "saida.expedido", ocorrido_em: ctx.ocorrido_em, tentativa: 1, dados: { p: 1 } });
  });
  it("Webhook sem payload: dados = contexto", async () => {
    const r = await previaRequisicao({ tipo: "acao.webhook", noId: "w", config: {}, destino: destino({ modo: "webhook", auth_tipo: "hmac" }), contexto: ctx, corpoPayload: undefined });
    expect((r.corpo as { dados: unknown }).dados).toEqual(ctx);
  });
  it("URL insegura é sinalizada", async () => {
    const r = await previaRequisicao({ tipo: "acao.http", noId: "h", config: {}, destino: destino({ url_base: "http://10.0.0.1" }), contexto: ctx, corpoPayload: {} });
    expect(r.bloqueio).not.toBeNull();
  });
  it("Omie: recebimento usa nIdReceb/cEtapa; pedido usa codigo_pedido/etapa", () => {
    expect(previaOmie({ operacao: "alterar_etapa_recebimento", parametros: { etapa: "80" } }, { documento: { codigo_erp: "123" } }))
      .toEqual({ ok: true, chamadas: [{ call: "AlterarEtapaRecebimento", endpoint: "/produtos/recebimentonfe/", param: { nIdReceb: 123, cEtapa: "80" } }] });
    expect(previaOmie({ operacao: "trocar_etapa_pedido", parametros: { etapa: "40" } }, { documento: { codigo_erp: "55" } }))
      .toEqual({ ok: true, chamadas: [{ call: "TrocarEtapaPedido", endpoint: "/produtos/pedido/", param: { codigo_pedido: 55, etapa: "40" } }] });
    expect(previaOmie({ operacao: "trocar_etapa_pedido" }, ctx)).toEqual({ ok: false, erro: "Pedido sem código do Omie (codigo_erp)" });
  });
  it("Omie: ajustar cortes lista só os itens cortados", () => {
    const r = previaOmie({ operacao: "ajustar_cortes_pedido" }, { ...ctx, documento: { ...ctx.documento, codigo_erp: "999" } });
    expect(r.ok && r.chamadas[1].param).toEqual({ cabecalho: { codigo_pedido: 999 }, itens_cortados: [{ codigo_produto: "11223785418", atendida: 0, cortada: 2 }] });
  });
  it("payload anterior: o mais próximo no caminho, com aviso de ambiguidade", () => {
    const nos = [{ id: "g", tipo: "gatilho.evento" }, { id: "c", tipo: "logica.condicao" }, { id: "p1", tipo: "dados.payload" }, { id: "p2", tipo: "dados.payload" }, { id: "h", tipo: "acao.http" }, { id: "p0", tipo: "dados.payload" }];
    const lig = [{ de: "g", para: "p0" }, { de: "p0", para: "c" }, { de: "c", para: "p1", saida: "verdadeiro" }, { de: "c", para: "p2", saida: "falso" }, { de: "p1", para: "h" }, { de: "p2", para: "h" }];
    expect(payloadAnterior("h", nos, lig)).toEqual({ id: "p1", ambiguo: true });
    expect(payloadAnterior("c", nos, lig)).toEqual({ id: "p0", ambiguo: false });
    expect(payloadAnterior("p0", nos, lig)).toEqual({ id: null, ambiguo: false });
  });
});
