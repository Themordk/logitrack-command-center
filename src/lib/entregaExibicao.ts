/**
 * Módulo de Entregas — rótulos, textos e montagem de links usados pelo coletor e pela web.
 * Nenhuma regra de negócio: o status e a próxima parada vêm prontos das RPCs entrega_*.
 */
import type { EntregaParada, EntregaStatus, MotivoEntrega, ParadaStatus } from "@/lib/entregaService";
import type { VeiculoOpcao } from "@/hooks/useCargaCadastros";

export const ENTREGA_STATUS_LABEL: Record<EntregaStatus, string> = {
  AGUARDANDO_ACEITE: "Aguardando aceite",
  EM_ROTA: "Em rota",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const PARADA_STATUS_LABEL: Record<ParadaStatus, string> = {
  PENDENTE: "Pendente",
  ENTREGUE: "Entregue",
  NAO_ENTREGUE: "Não entregue",
};

export const ENTREGA_EVENTO_LABEL: Record<string, string> = {
  ATRIBUIDA: "Atribuída ao entregador",
  ACEITA: "Aceita pelo entregador",
  PARADA_ENTREGUE: "Parada entregue",
  OCORRENCIA: "Ocorrência registrada",
  PARADA_ESTORNADA: "Parada estornada",
  REATRIBUIDA: "Reatribuída",
  CANCELADA: "Entrega cancelada",
  CONCLUIDA: "Entrega concluída",
  REABERTA: "Entrega reaberta",
};

/** Intervalo de repetição do alerta sonoro enquanto houver entrega aguardando aceite (RN17). */
export const ALERTA_ENTREGA_INTERVALO_MS = 30_000;

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" });
const diaHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza",
});

/** "08:31" (fuso America/Fortaleza). */
export function formatarHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : hora.format(d);
}

/** "23/11 08:31" (fuso America/Fortaleza). */
export function formatarDiaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : diaHora.format(d).replace(",", "");
}

/** Duração entre dois instantes em texto curto: "45 s", "13 min", "2 h 05 min". */
export function formatarDuracao(inicio: string | null | undefined, fim: string | null | undefined): string | null {
  if (!inicio || !fim) return null;
  const s = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 1000));
  if (Number.isNaN(s)) return null;
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/** Linha 1 do endereço: "R. das Flores, 120". */
export function enderecoLinha1(p: Pick<EntregaParada, "endereco">): string {
  return p.endereco?.trim() || "Endereço não cadastrado";
}

/** Linha 2: "Centro · Fortaleza/CE". */
export function enderecoLinha2(p: Pick<EntregaParada, "bairro" | "cidade" | "estado">): string {
  const cidade = [p.cidade?.trim(), p.estado?.trim()].filter(Boolean).join("/");
  return [p.bairro?.trim(), cidade].filter(Boolean).join(" · ");
}

/** Endereço completo para busca em mapa. Null quando não há endereço nem cidade. */
export function enderecoCompleto(p: Pick<EntregaParada, "endereco" | "bairro" | "cidade" | "estado" | "cep">): string | null {
  const partes = [p.endereco, p.bairro, p.cidade, p.estado, p.cep].map((x) => x?.trim()).filter(Boolean);
  return p.endereco?.trim() || p.cidade?.trim() ? partes.join(", ") : null;
}

/** Link universal do Google Maps (abre o app de navegação do aparelho). */
export function linkMapa(p: Pick<EntregaParada, "endereco" | "bairro" | "cidade" | "estado" | "cep">): string | null {
  const end = enderecoCompleto(p);
  return end ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(end)}` : null;
}

/** Link tel: com só dígitos (e + inicial). Null quando não há telefone utilizável. */
export function linkTelefone(telefone: string | null | undefined): string | null {
  const t = (telefone ?? "").replace(/[^\d+]/g, "");
  return t.replace(/\D/g, "").length >= 8 ? `tel:${t}` : null;
}

/** "NF 12345-1 · Pedido 8890" (partes ausentes somem). */
export function descreverDocumento(p: Pick<EntregaParada, "numero_nf" | "serie_nf" | "numero_pedido">): string {
  const nf = p.numero_nf ? `NF ${p.numero_nf}${p.serie_nf ? `-${p.serie_nf}` : ""}` : null;
  const ped = p.numero_pedido ? `Pedido ${p.numero_pedido}` : null;
  return [nf, ped].filter(Boolean).join(" · ") || "Sem documento";
}

/** Efeito do motivo na parada, para o rodapé da tela de ocorrência. */
export function efeitoMotivo(m: MotivoEntrega | null | undefined): string | null {
  if (!m) return null;
  return m.impede_entrega
    ? "Com este motivo, a parada fica como não entregue."
    : "Com este motivo, a parada continua pendente e ainda pode ser confirmada.";
}

/**
 * Caminho da foto no bucket privado 'evidencias'. O backend só aceita
 * {tenant}/entregas/{entrega}/{parada}/... e confere se o arquivo existe.
 */
export function caminhoFotoEntrega(tenantId: string, entregaId: string, paradaId: string, tipo: "canhoto" | "ocorrencia", agora = Date.now()): string {
  return `${tenantId}/entregas/${entregaId}/${paradaId}/${tipo}-${agora}.jpg`;
}

/** Texto do alerta de entrega pendente. */
export function textoAlertaEntrega(numerosCarga: number[]): string {
  if (numerosCarga.length === 0) return "";
  if (numerosCarga.length === 1) return `Nova carga #${numerosCarga[0]} para aceitar`;
  return `${numerosCarga.length} cargas para aceitar (#${numerosCarga.join(", #")})`;
}

/**
 * RN02: avisa, sem bloquear, quando o veículo escolhido na carga não tem entregador.
 * Só aparece se o tenant já usa entregas (algum veículo com entregador), para não incomodar quem não usa.
 */
export function avisoSemEntregador(veiculos: Pick<VeiculoOpcao, "id" | "usuario_id">[], veiculoId: string): boolean {
  if (!veiculoId || !veiculos.some((v) => v.usuario_id)) return false;
  const v = veiculos.find((x) => x.id === veiculoId);
  return !!v && !v.usuario_id;
}
