/**
 * Fluxo de Expedição · F6 — regras de EXIBIÇÃO da carga (rótulos, tons, agrupamento, ordem local).
 * Nenhuma regra de negócio: a validação de tudo continua nas RPCs.
 */
import type { CargaDocumento, CargaStatus, ModalidadeTransporte, PrioridadeCarga, OndaSugerida, TransportadoraOpcao, UnidadeEmbarque } from "@/lib/cargaService";

export const CARGA_STATUS_LABEL: Record<CargaStatus, string> = {
  EM_MONTAGEM: "Em montagem",
  LIBERADA: "Liberada",
  EM_CARREGAMENTO: "Em carregamento",
  FECHADA: "Fechada",
  CANCELADA: "Cancelada",
};

/** Classes no padrão do StatusBadge (sempre acompanhadas de texto, nunca só cor). */
export const CARGA_STATUS_TOM: Record<CargaStatus, string> = {
  EM_MONTAGEM: "bg-gray-500/15 text-gray-300 border-gray-500/30",
  LIBERADA: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  EM_CARREGAMENTO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  FECHADA: "bg-green-500/15 text-green-400 border-green-500/30",
  CANCELADA: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const UNIDADE_EMBARQUE_LABEL: Record<UnidadeEmbarque, string> = {
  VOLUME: "Volume",
  HU: "HU",
  DOCUMENTO: "Pedido",
  CONFIRMACAO: "Confirmação",
};

/** Texto do que o operador deve fazer em cada tipo de unidade. */
export const UNIDADE_EMBARQUE_INSTRUCAO: Record<UnidadeEmbarque, string> = {
  VOLUME: "Bipe a etiqueta de cada volume ao colocá-lo no veículo.",
  HU: "Bipe a etiqueta de cada HU ao colocá-la no veículo.",
  DOCUMENTO: "Bipe o número do pedido ao colocá-lo no veículo.",
  CONFIRMACAO: "Confirme cada pedido ao colocá-lo no veículo (ou bipe o número do pedido).",
};

/** Situação de um pedido no embarque por volume. */
export type SituacaoPedidoEmbarque = "SEM_VOLUMES" | "PENDENTE" | "PARCIAL" | "COMPLETO";

export function situacaoPedidoEmbarque(d: Pick<CargaDocumento, "unidades_total" | "unidades_embarcadas">): SituacaoPedidoEmbarque {
  if (d.unidades_total === 0) return "SEM_VOLUMES";
  if (d.unidades_embarcadas >= d.unidades_total) return "COMPLETO";
  return d.unidades_embarcadas > 0 ? "PARCIAL" : "PENDENTE";
}

/** Primeiro pedido, na ordem da carga, que ainda não está todo no veículo (ou que nem tem volume). */
export function proximoPedidoEmbarque<T extends Pick<CargaDocumento, "sequencia" | "unidades_total" | "unidades_embarcadas">>(docs: T[]): T | null {
  return [...docs].sort((a, b) => a.sequencia - b.sequencia).find((d) => situacaoPedidoEmbarque(d) !== "COMPLETO") ?? null;
}

export const MODALIDADE_LABEL: Record<ModalidadeTransporte, string> = {
  PROPRIA: "Veículo próprio",
  TERCEIRO: "Transportadora",
};

/** Nome curto da transportadora (fantasia quando houver). */
export function nomeTransportadora(t: Pick<TransportadoraOpcao, "razaosocial" | "nome_fantasia"> | null | undefined): string {
  if (!t) return "";
  return t.nome_fantasia?.trim() || t.razaosocial;
}

/** Linha "quem leva": veículo próprio (descrição) ou transportadora, com a placa quando houver. */
export function descreverTransporte(c: {
  modalidade?: ModalidadeTransporte | null; veiculo?: string | null; transportadora?: string | null; placa?: string | null;
}): string {
  const base = c.modalidade === "TERCEIRO" ? c.transportadora || "Transportadora não informada" : c.veiculo || "Sem veículo";
  return c.placa ? `${base} - ${c.placa}` : base;
}

/** Placa no padrão antigo (AAA9999) ou Mercosul (AAA9A99); só para orientar o digitador, quem decide é o backend. */
export function placaValida(placa: string): boolean {
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa.replace(/[\s-]/g, "").toUpperCase());
}

/** Campos de transporte editados na montagem / detalhe da carga. */
export interface TransporteValor {
  modalidade: ModalidadeTransporte;
  veiculoId: string;
  transportadoraId: string;
  placa: string;
  motorista: string;
  motoristaDocumento: string;
}

export const TRANSPORTE_VAZIO: TransporteValor = {
  modalidade: "PROPRIA", veiculoId: "", transportadoraId: "", placa: "", motorista: "", motoristaDocumento: "",
};

export interface GrupoSugestao {
  chave: string;
  rotulo: string;
  ondas: OndaSugerida[];
  peso: number;
  m3: number;
  documentos: number;
  /** Volumes de expedição gerados na conferência. */
  volumes: number;
}

/** Agrupa as ondas sugeridas pela chave calculada no backend (critério + transportadora ou veículo + box). */
export function agruparSugestao(ondas: OndaSugerida[]): GrupoSugestao[] {
  const mapa = new Map<string, GrupoSugestao>();
  for (const o of ondas) {
    const g = mapa.get(o.grupo_chave) ?? { chave: o.grupo_chave, rotulo: o.grupo_rotulo, ondas: [], peso: 0, m3: 0, documentos: 0, volumes: 0 };
    g.ondas.push(o);
    g.peso += Number(o.peso_total ?? 0);
    g.m3 += Number(o.m3 ?? 0);
    g.documentos += Number(o.documentos ?? 0);
    g.volumes += Number(o.volumes ?? 0);
    mapa.set(o.grupo_chave, g);
  }
  return [...mapa.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Move um item da lista de `de` para `para` (drag-and-drop ou botões subir/descer). */
export function moverItem<T>(lista: readonly T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return [...lista];
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

/** Percentual de 0 a 100+ para barras de capacidade; null quando o veículo não informa o limite. */
export function nivelCapacidade(pct: number | null | undefined): "sem-limite" | "ok" | "alerta" | "excedido" {
  if (pct === null || pct === undefined) return "sem-limite";
  if (pct > 100) return "excedido";
  if (pct >= 90) return "alerta";
  return "ok";
}

export function formatarNumero(v: number | null | undefined, casas = 0): string {
  return Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// ---------- grid de ondas da montagem (filtros e ordenação locais sobre a sugestão) ----------
export interface FiltrosOndas {
  movimento: string; documento: string; parceiro: string; rota: string; cidade: string; bairro: string; tipoSaidaId: string;
}
export const FILTROS_ONDAS_VAZIOS: FiltrosOndas = { movimento: "", documento: "", parceiro: "", rota: "", cidade: "", bairro: "", tipoSaidaId: "" };

const normalizar = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const contem = (valor: string | null | undefined, termo: string) => !termo || normalizar(valor).includes(normalizar(termo));

export function filtrarOndas(ondas: OndaSugerida[], f: FiltrosOndas): OndaSugerida[] {
  return ondas.filter((o) =>
    contem(String(o.numero_onda), f.movimento)
    && contem(o.pedidos, f.documento)
    && contem(o.parceiros, f.parceiro)
    && contem(o.rota, f.rota)
    && contem(o.cidades, f.cidade)
    && contem(o.bairros, f.bairro)
    && (!f.tipoSaidaId || o.tipo_saida_id === f.tipoSaidaId));
}

export type ColunaOnda =
  | "sugestao" | "numero_onda" | "pedidos" | "parceiros" | "rota" | "cidades" | "bairros" | "tipo_saida" | "transporte"
  | "volumes" | "peso_total" | "m3";
export type DirecaoOrdem = "asc" | "desc";

const transporteOnda = (o: OndaSugerida) => o.transportadora ?? o.veiculo ?? "";
const NUMERICAS = new Set<ColunaOnda>(["numero_onda", "volumes", "peso_total", "m3"]);

/** Ordena as ondas; "sugestao" mantém os grupos sugeridos juntos (transportadora/veículo/box) e, dentro deles, o nº da onda. */
export function ordenarOndas(ondas: OndaSugerida[], coluna: ColunaOnda, direcao: DirecaoOrdem): OndaSugerida[] {
  const sinal = direcao === "asc" ? 1 : -1;
  const valor = (o: OndaSugerida): string | number => {
    switch (coluna) {
      case "sugestao": return o.grupo_rotulo;
      case "transporte": return transporteOnda(o);
      case "pedidos": return o.pedidos ?? "";
      default: {
        const v = o[coluna as keyof OndaSugerida];
        return NUMERICAS.has(coluna) ? Number(v ?? 0) : String(v ?? "");
      }
    }
  };
  return [...ondas].sort((a, b) => {
    const va = valor(a); const vb = valor(b);
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    return c !== 0 ? c * sinal : a.numero_onda - b.numero_onda;
  });
}

// ---------- prioridade da carga (mesmos rótulos/cores da onda) ----------
export const PRIORIDADES_CARGA: PrioridadeCarga[] = ["URGENTE", "ALTA", "NORMAL", "BAIXA"];
export const PRIORIDADE_TOM: Record<PrioridadeCarga, string> = {
  URGENTE: "bg-red-500/15 text-red-400 border-red-500/30",
  ALTA: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  NORMAL: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  BAIXA: "bg-muted text-muted-foreground border-border",
};
