export type ArmazenagemOrigem = "ENTRADA" | "CANCELAMENTO";
const CHAVE = "coletor_armazenagem_origem";
export const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
export function definirOrigemArmazenagem(origem: ArmazenagemOrigem): void {
  try { sessionStorage.setItem(CHAVE, origem); } catch { /* Entrada é o padrão sem sessão. */ }
}
export function lerOrigemArmazenagem(): ArmazenagemOrigem {
  try { return sessionStorage.getItem(CHAVE) === "CANCELAMENTO" ? "CANCELAMENTO" : "ENTRADA"; } catch { return "ENTRADA"; }
}
export const rotaListaItens = (origem: ArmazenagemOrigem) => origem === "CANCELAMENTO" ? "/coletor/armazenagem/cancelamentos/itens" : "/coletor/armazenagem/itens";
export type StatusPrazo = "NO_PRAZO" | "ATENCAO" | "VENCIDO";
export function calcularPrazo(entrada: string | null | undefined, horas: number, prazo: number, agora = Date.now()) {
  const inicio = entrada ? Date.parse(entrada) : NaN;
  const horasParado = Number.isFinite(inicio) ? Math.max(0, (agora - inicio) / 3600000) : Number(horas) || 0;
  const limite = Number(prazo) > 0 ? Number(prazo) : 2;
  const status: StatusPrazo = horasParado >= limite ? "VENCIDO" : horasParado >= limite / 2 ? "ATENCAO" : "NO_PRAZO";
  return { horasParado, status };
}
export function formatarHorasParado(horas: number): string {
  if (horas < 1) return `${Math.floor(Math.max(0, horas) * 60)}min`;
  if (horas >= 24) return `${Math.floor(horas / 24)}d ${Math.floor(horas % 24)}h`;
  return `${horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}
export function prazoCancelamentoValido(prazo: number): boolean { return Number.isInteger(prazo) && prazo >= 1; }