import type { Catalogo, Destino, Regra, TipoNo } from "../retornos.types";

function valorTexto(v: Regra["valor"]): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function nomeTipo(tipo: TipoNo, catalogo?: Catalogo): string {
  return catalogo?.nos.find((n) => n.tipo === tipo)?.nome ?? tipo;
}

export function resumoNo(
  tipo: TipoNo, config: Record<string, unknown>, catalogo?: Catalogo, destinos?: Destino[],
): string {
  const c = config ?? {};
  const destino = (id: unknown) => destinos?.find((d) => d.id === id)?.nome;
  switch (tipo) {
    case "gatilho.evento": {
      const ev = catalogo?.eventos.find((e) => e.codigo === c.evento)?.nome ?? (c.evento ? String(c.evento) : "Escolha o evento");
      return c.modo === "agrupado" ? `${ev} · Agrupado` : ev;
    }
    case "gatilho.manual":
      return c.entidade === "documento_entrada" ? "Manual · Entrada" : "Manual · Saída";
    case "logica.condicao": {
      const regras = Array.isArray(c.regras) ? (c.regras as Regra[]) : [];
      if (!regras.length) return "Configure as regras";
      const r = regras[0];
      const op = catalogo?.operadores.find((o) => o.codigo === r.operador)?.nome ?? r.operador;
      const base = `${r.campo} ${op} ${valorTexto(r.valor)}`.trim();
      return regras.length > 1 ? `${base} +${regras.length - 1}` : base;
    }
    case "logica.aguardar":
      return `${Number(c.minutos ?? 0)} min`;
    case "logica.dividir_itens":
      return "Por item";
    case "dados.payload":
      if (c.modo === "jsonata") return "JSONata";
      return `Mapeamento · ${Array.isArray(c.campos) ? c.campos.length : 0} campos`;
    case "acao.http": {
      const d = destino(c.destino_id);
      return d ? `${String(c.metodo ?? "POST")} · ${d}` : "Escolha o destino";
    }
    case "acao.webhook":
      return destino(c.destino_id) ?? "Escolha o destino";
    case "acao.provedor":
      return catalogo?.operacoes_provedor.find((o) => o.operacao === c.operacao)?.nome ?? String(c.operacao ?? "Escolha a operação");
    case "acao.atualizar_documento":
      return `status = ${String(c.status_integracao ?? "—")}`;
    case "acao.notificar":
      return String(c.titulo ?? "Sem título");
    default:
      return "";
  }
}
