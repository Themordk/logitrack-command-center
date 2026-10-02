import type { AuthTipo, Destino, DestinoEntrada } from "../retornos.types";

export const AUTH_ROTULO: Record<AuthTipo, string> = {
  nenhuma: "Nenhuma", api_key: "API key", bearer: "Bearer token", basic: "Basic", hmac: "Assinatura HMAC",
};

export function destinoParaEntrada(d: Destino): DestinoEntrada {
  return {
    id: d.id, nome: d.nome, modo: d.modo, metodo: d.metodo, url_base: d.url_base, auth_tipo: d.auth_tipo,
    auth_config: d.auth_config ?? {}, headers: d.headers ?? {}, timeout_ms: d.timeout_ms,
    max_tentativas: d.max_tentativas, limite_falhas: d.limite_falhas, ativo: d.ativo,
    erp_provedor_id: d.erp_provedor_id,
  };
}
