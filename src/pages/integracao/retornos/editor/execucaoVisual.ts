import type { ExecucaoDetalhe, Passo, StatusExecucao, StatusPasso } from "../retornos.types";

export interface ExecucaoVisual {
  /** Status do último passo e nº de tentativas por nó percorrido. */
  porNo: Map<string, { status: StatusPasso; tentativas: number }>;
  /** Chaves `${origem}:${saida}->${destino}` das ligações percorridas. */
  arestas: Set<string>;
}

export const STATUS_FINAIS: StatusExecucao[] = ["sucesso", "erro", "filtrado", "descartado", "aguardando_retry"];
export const ehStatusFinal = (s: StatusExecucao) => STATUS_FINAIS.includes(s);

export function passosDoNo(det: ExecucaoDetalhe, noId: string): Passo[] {
  return (det.passos ?? []).filter((p) => p.no_id === noId).sort((a, b) => a.seq - b.seq);
}

export function montarExecucaoVisual(det: ExecucaoDetalhe): ExecucaoVisual {
  const porNo = new Map<string, { status: StatusPasso; tentativas: number }>();
  const passos = [...(det.passos ?? [])].sort((a, b) => a.seq - b.seq);
  if (passos.length) {
    for (const p of passos) {
      const ant = porNo.get(p.no_id);
      porNo.set(p.no_id, { status: p.status, tentativas: Math.max(ant?.tentativas ?? 0, p.tentativa || 1) });
    }
  } else {
    for (const c of det.caminho ?? []) porNo.set(c.no_id, { status: c.status, tentativas: 1 });
  }
  const arestas = new Set<string>();
  const caminho = det.caminho?.length
    ? det.caminho
    : passos.map((p) => ({ no_id: p.no_id, status: p.status, saida: p.saida }));
  for (let i = 0; i < caminho.length - 1; i++) {
    const a = caminho[i];
    const b = caminho[i + 1];
    if (a.no_id === b.no_id) continue;
    arestas.add(`${a.no_id}:${a.saida ?? "principal"}->${b.no_id}`);
  }
  return { porNo, arestas };
}

export function formatarDuracao(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}
