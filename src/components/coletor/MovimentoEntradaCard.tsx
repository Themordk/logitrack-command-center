import type { ReactNode } from "react";
import { Building2, FileText, Truck, UserRound } from "lucide-react";
import { recebimentoStatusLabel } from "@/lib/recebimentoStatus";

/**
 * Card de movimento de entrada no coletor (recebimento e armazenagem), no mesmo
 * padrão do card de onda da separação: número em mono, selos de prioridade e
 * status no topo, "Com você / Com / Disponível para assumir" e as linhas com ícone.
 */

export function corPrioridade(p: string | null | undefined): string {
  const u = (p || "NORMAL").toUpperCase();
  if (u === "URGENTE" || u === "ALTA") return "text-red-400 bg-red-500/15 border-red-500/30";
  if (u === "MEDIA") return "text-yellow-400 bg-yellow-500/15 border-yellow-500/30";
  if (u === "BAIXA") return "text-slate-300 bg-slate-500/15 border-slate-500/30";
  return "text-blue-400 bg-blue-500/15 border-blue-500/30";
}

export function corStatusEntrada(status: string | null | undefined): string {
  switch (status) {
    case "LIBERADO": return "text-emerald-400 bg-emerald-500/15 border-emerald-500/30";
    case "DIVERGENCIA": return "text-amber-400 bg-amber-500/15 border-amber-500/30";
    case "LIB_ARMAZENAGEM":
    case "ARMAZENAGEM_PARCIAL": return "text-violet-300 bg-violet-500/15 border-violet-500/30";
    default: return "text-blue-400 bg-blue-500/15 border-blue-500/30";
  }
}

interface Props {
  numero: number;
  status: string;
  prioridade: string | null;
  tipoEntrada: string | null;
  parceiro: string | null;
  notas: string | null;
  qtdDocumentos: number;
  box: string | null;
  itensPendentes: number;
  itensTotal: number;
  volume?: number | null;
  placa?: string | null;
  devolucao?: boolean;
  crossdocking?: boolean;
  /** Quem está com o movimento nesta etapa (null = ninguém). */
  operadorNome: string | null;
  atribuidoAoUsuario: boolean;
  selecionado: boolean;
  onClick: () => void;
  /** Linha extra no fim do card (ex.: armazenagem em paralelo, barra de progresso). */
  rodape?: ReactNode;
}

export function MovimentoEntradaCard(p: Props) {
  return (
    <button
      type="button"
      onClick={p.onClick}
      aria-pressed={p.selecionado}
      className={`w-full flex flex-col gap-1.5 p-4 rounded-2xl border transition-all text-left shrink-0 ${
        p.selecionado
          ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
          : p.atribuidoAoUsuario
          ? "bg-[hsl(222,40%,12%)] border-emerald-500/40"
          : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold text-white font-mono">Movimento #{p.numero}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase ${corPrioridade(p.prioridade)}`}>
            {(p.prioridade || "NORMAL").toUpperCase()}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase ${corStatusEntrada(p.status)}`}>
            {recebimentoStatusLabel(p.status)}
          </span>
        </div>
      </div>

      <div className="text-xs text-[hsl(213,31%,55%)]">
        Itens: <span className="font-bold text-[hsl(213,31%,91%)]">{p.itensPendentes}/{p.itensTotal} pendente(s)</span>
        {p.volume != null && <> · Vol: <span className="font-bold text-[hsl(213,31%,91%)]">{p.volume}</span></>}
      </div>

      {p.operadorNome ? (
        <div className={`flex items-center gap-1.5 text-xs min-w-0 ${p.atribuidoAoUsuario ? "text-emerald-400" : "text-[hsl(213,31%,55%)]"}`}>
          <UserRound size={12} className="shrink-0" />
          <span className="truncate" title={p.operadorNome}>
            {p.atribuidoAoUsuario ? "Com você: " : "Com: "}
            <span className={`font-bold ${p.atribuidoAoUsuario ? "" : "text-[hsl(213,31%,91%)]"}`}>{p.operadorNome}</span>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-blue-400 min-w-0">
          <UserRound size={12} className="shrink-0" />
          <span>Disponível para assumir</span>
        </div>
      )}

      {p.parceiro && (
        <div className="flex items-center gap-1.5 text-xs text-[hsl(213,31%,55%)] min-w-0">
          <Building2 size={12} className="shrink-0" />
          <span className="truncate" title={p.parceiro}>
            Parceiro: <span className="font-bold text-[hsl(213,31%,91%)]">{p.parceiro}</span>
          </span>
        </div>
      )}

      {p.notas && (
        <div className="flex items-center gap-1.5 text-xs text-[hsl(213,31%,55%)] min-w-0">
          <FileText size={12} className="shrink-0" />
          <span className="truncate">
            NF: <span className="font-bold text-[hsl(213,31%,91%)]">{p.notas}</span>
            {p.qtdDocumentos > 1 && <span> (+{p.qtdDocumentos} docs)</span>}
          </span>
        </div>
      )}

      {(p.box || p.placa) && (
        <div className="flex items-center gap-1.5 text-xs text-[hsl(213,31%,55%)] min-w-0">
          <Truck size={12} className="shrink-0" />
          <span className="truncate">
            Box: <span className="font-bold text-[hsl(213,31%,91%)]">{p.box || "—"}</span>
            {p.placa && <> · Placa: <span className="font-bold text-[hsl(213,31%,91%)]">{p.placa}</span></>}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap text-xs text-[hsl(213,31%,45%)]">
        <span>Tipo: <span className="font-medium text-[hsl(213,31%,70%)]">{p.tipoEntrada || "—"}</span></span>
        {p.devolucao && (
          <span className="text-[10px] uppercase rounded-full px-2 py-0.5 bg-violet-500/15 text-violet-300 border border-violet-500/30">Devolução</span>
        )}
        {p.crossdocking && (
          <span className="text-[10px] uppercase rounded-full px-2 py-0.5 bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">Crossdocking</span>
        )}
      </div>

      {p.rodape}
    </button>
  );
}
