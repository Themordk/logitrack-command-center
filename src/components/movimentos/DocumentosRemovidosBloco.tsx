import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@/utils/dateTime";
import { listarRemocoesDocumento, listarRemocoesMovimento } from "./remocaoDocumento";
import { History } from "lucide-react";

export function DocumentosRemovidosBloco({ tipo, movimentoId }: { tipo: "ENTRADA" | "SAIDA"; movimentoId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["movimento-documento-remocao", tipo, movimentoId],
    queryFn: () => listarRemocoesMovimento(tipo, movimentoId),
  });
  if (data.length === 0) return null;
  return (
    <div className="rounded-lg border border-border p-4 bg-secondary/20">
      <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3">Documentos removidos</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground uppercase">
              <th className="px-2 py-2 text-left font-medium">{tipo === "ENTRADA" ? "Nº NF" : "Nº Pedido"}</th>
              <th className="px-2 py-2 text-left font-medium">Removido em</th>
              <th className="px-2 py-2 text-left font-medium">Por</th>
              <th className="px-2 py-2 text-left font-medium">Motivo</th>
              <th className="px-2 py-2 text-left font-medium">Status</th>
              <th className="px-2 py-2 text-left font-medium">Observação</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="px-2 py-2 font-mono text-foreground">{r.numero_documento ?? "—"}</td>
                <td className="px-2 py-2 text-muted-foreground">{formatDateTime(r.removido_em)}</td>
                <td className="px-2 py-2 text-foreground">{r.usuario?.nome ?? "—"}</td>
                <td className="px-2 py-2 text-foreground">{r.motivo?.descricao ?? "—"}</td>
                <td className="px-2 py-2 text-muted-foreground">{r.status_movimento ?? "—"} → {r.status_movimento_final ?? "—"}</td>
                <td className="px-2 py-2 text-muted-foreground">{r.observacao || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HistoricoMovimentosCard({ documentoId, tipo }: { documentoId: string; tipo: "entrada" | "saida" }) {
  const { data = [] } = useQuery({
    queryKey: ["movimento-documento-remocao-doc", documentoId],
    queryFn: () => listarRemocoesDocumento(documentoId),
  });
  if (data.length === 0) return null;
  const alvo = tipo === "entrada" ? "movimento" : "onda";
  return (
    <div className="card-surface">
      <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center gap-2">
        <History size={14} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold">Histórico de movimentos</h3>
      </div>
      <ul className="p-4 space-y-2">
        {data.map((r) => (
          <li key={r.id} className="text-xs text-foreground">
            Removido do {alvo}{r.numero_movimento ? ` #${r.numero_movimento}` : ""} em {formatDateTime(r.removido_em)} por {r.usuario?.nome ?? "—"}. Motivo: {r.motivo?.descricao ?? "—"}.
            {r.observacao && <span className="block text-muted-foreground mt-0.5">{r.observacao}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
