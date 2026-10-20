import { AlertTriangle } from "lucide-react";
import type { SituacaoSaldo } from "@/lib/pendenciasPicking.types";

export function TarjaPendenciaPicking({ situacao, saldoPulmao = 0, abastecimentoPendente = false }: { situacao: SituacaoSaldo; saldoPulmao?: number; abastecimentoPendente?: boolean }) {
  if (situacao === "OK") return null;
  const titulo = situacao === "SEM_PICKING_MAPEADO" ? "SEM PICKING MAPEADO" : situacao === "SEM_SALDO_ENDERECO" ? "SEM SALDO NO ENDEREÇO" : "SEM SALDO NO PICKING";
  const detalhe = situacao === "SEM_PICKING_MAPEADO" ? "Aguardando saldo ou mapeamento de picking — toque em Atualizar tarefa" : abastecimentoPendente ? `Abastecimento em andamento · Pulmão: ${saldoPulmao.toLocaleString("pt-BR")} un` : saldoPulmao > 0 ? `Aguardando abastecimento · Pulmão: ${saldoPulmao.toLocaleString("pt-BR")} un` : "Sem saldo no pulmão — avise a supervisão";
  return <div role="alert" className="w-full rounded-xl border-2 border-destructive bg-destructive/15 px-3 py-2 flex items-start gap-3"><AlertTriangle size={20} className="text-destructive shrink-0" /><div className="min-w-0"><p className="text-sm font-black uppercase tracking-wide text-foreground">{titulo}</p><p className="text-[11px] text-muted-foreground">{detalhe}</p></div></div>;
}