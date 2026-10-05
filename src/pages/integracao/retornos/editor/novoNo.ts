import type { Catalogo, EntidadeDocumento, TipoNo } from "../retornos.types";
import type { FluxoNode } from "./definicaoRf";

const PREFIXO: Record<TipoNo, string> = {
  "gatilho.evento": "gatilho",
  "gatilho.manual": "gatilho",
  "logica.condicao": "cond",
  "logica.aguardar": "aguardar",
  "logica.dividir_itens": "dividir",
  "dados.payload": "payload",
  "acao.http": "http",
  "acao.webhook": "webhook",
  "acao.provedor": "erp",
  "acao.atualizar_documento": "atualizar",
  "acao.notificar": "notificar",
};

export const ehGatilho = (tipo: string) => tipo.startsWith("gatilho.");

function hex4() {
  return Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
}

export function gerarId(tipo: TipoNo, existentes: FluxoNode[]): string {
  const ids = new Set(existentes.map((n) => n.id));
  let id = "";
  do { id = `${PREFIXO[tipo] ?? "no"}_${hex4()}`; } while (ids.has(id));
  return id;
}

export function nomeUnico(base: string, existentes: FluxoNode[]): string {
  const nomes = new Set(existentes.map((n) => n.data.nome));
  if (!nomes.has(base)) return base;
  let i = 2;
  while (nomes.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function entidadeDoGatilho(nodes: FluxoNode[], catalogo?: Catalogo): EntidadeDocumento | null {
  const g = nodes.find((n) => ehGatilho(n.data.tipo));
  if (!g) return null;
  if (g.data.tipo === "gatilho.manual") return (g.data.config.entidade as EntidadeDocumento) ?? null;
  const ev = g.data.config.evento;
  return catalogo?.eventos.find((e) => e.codigo === ev)?.entidade ?? null;
}

export function configInicial(tipo: TipoNo, nodes: FluxoNode[], catalogo?: Catalogo): Record<string, unknown> {
  switch (tipo) {
    case "logica.condicao": return { regras: [], combinador: "e" };
    case "logica.aguardar": return { minutos: 5 };
    case "dados.payload": return { modo: "mapeamento", campos: [] };
    case "acao.http": return { metodo: "POST", caminho: "" };
    case "acao.webhook": return {};
    case "acao.provedor": {
      const ent = entidadeDoGatilho(nodes, catalogo);
      const ops = catalogo?.operacoes_provedor ?? [];
      const op = ops.find((o) => o.entidade === ent) ?? ops[0];
      return { provedor: "omie", operacao: op?.operacao ?? "", parametros: { ...(op?.parametros ?? {}) } };
    }
    case "acao.atualizar_documento": return { status_integracao: "retornado", marcar_exportado: false };
    case "acao.notificar":
      return { titulo: "Falha no retorno ao ERP", mensagem: "Documento {{documento.numero}}: {{erro.mensagem}}", cor: "red" };
    case "gatilho.evento": return { evento: null, modo: "imediato", filtros: [] };
    case "gatilho.manual": return { entidade: "documento_saida", filtros: [] };
    default: return {};
  }
}

export function criarNo(tipo: TipoNo, posicao: { x: number; y: number }, nodes: FluxoNode[], catalogo?: Catalogo): FluxoNode {
  const base = catalogo?.nos.find((n) => n.tipo === tipo)?.nome ?? tipo;
  return {
    id: gerarId(tipo, nodes),
    type: "fluxo",
    position: posicao,
    selected: true,
    data: { tipo, nome: nomeUnico(base, nodes), config: configInicial(tipo, nodes, catalogo), extra: {} },
  };
}

export const alinhar = (v: number) => Math.round(v / 20) * 20;

/** Procura espaço livre começando em (x,y), descendo 160 px. */
export function posicaoLivre(x: number, y: number, nodes: FluxoNode[]): { x: number; y: number } {
  let yy = y;
  const ocupado = (py: number) => nodes.some((n) => Math.abs(n.position.x - x) < 160 && Math.abs(n.position.y - py) < 120);
  let guarda = 0;
  while (ocupado(yy) && guarda++ < 50) yy += 160;
  return { x: alinhar(x), y: alinhar(yy) };
}

export function normalizarBusca(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
