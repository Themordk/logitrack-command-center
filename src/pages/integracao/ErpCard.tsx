import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertTriangle, CheckCircle2, Settings2, Clock } from "lucide-react";
import { ErpCardData } from "./useErpGallery";
import { relativeTime } from "./StatusBar";
import { formatDateTime } from "@/utils/dateTime";

interface Props {
  data: ErpCardData;
  onSelect: (erpId: string) => void;
}

type Estado = "EM_BREVE" | "ERRO" | "CONECTADO" | "LEGADO" | "NAO_CONFIGURADO";

function getEstado(d: ErpCardData): Estado {
  if (!d.provedor.disponivel) return "EM_BREVE";
  if (d.integracao?.status === "erro") return "ERRO";
  if (d.integracao?.status === "ativo") return "CONECTADO";
  if (d.legadoOmie) return "LEGADO";
  return "NAO_CONFIGURADO";
}

export function ErpCard({ data, onSelect }: Props) {
  const estado = getEstado(data);
  const { provedor, integracao } = data;

  const borderClass =
    estado === "ERRO"
      ? "border-destructive/60 hover:border-destructive"
      : estado === "CONECTADO"
        ? "border-emerald-500/40 hover:border-emerald-500/70"
        : estado === "LEGADO"
          ? "border-emerald-500/25 hover:border-emerald-500/50"
          : estado === "EM_BREVE"
            ? "border-border"
            : "border-border hover:border-primary/60";

  const isDisabled = estado === "EM_BREVE";

  const handleClick = () => {
    if (!isDisabled) onSelect(provedor.id);
  };

  return (
    <div
      className={`card-surface border ${borderClass} p-4 flex flex-col gap-3 transition-colors ${
        isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground truncate">{provedor.nome}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">ERP</p>
        </div>
        <BadgeForEstado estado={estado} />
      </div>

      <div className="text-xs text-muted-foreground min-h-[2.25rem]">
        {estado === "CONECTADO" && integracao?.ultimo_teste_em && (
          <div className="flex items-center gap-1.5">
            <Clock size={11} />
            <span>
              Última sync:{" "}
              <span className="text-foreground" title={formatDateTime(integracao.ultimo_teste_em)}>
                {relativeTime(integracao.ultimo_teste_em)}
              </span>
            </span>
          </div>
        )}
        {estado === "LEGADO" && (
          <div className="flex items-center gap-1.5">
            <Clock size={11} />
            <span>Configuração anterior ativa{data.ultimoLegadoEm ? ` — ${formatDateTime(data.ultimoLegadoEm)}` : ""}</span>
          </div>
        )}
        {estado === "ERRO" && (
          <div className="flex items-start gap-1.5 text-destructive">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{integracao?.mensagem_erro || "Falha de conexão com o ERP."}</span>
          </div>
        )}
        {estado === "NAO_CONFIGURADO" && <span>Integração ainda não configurada para esta empresa.</span>}
        {estado === "EM_BREVE" && <span>Integração disponível em breve.</span>}
      </div>

      <div className="pt-1 mt-auto">
        {!isDisabled && <ActionButton estado={estado} onClick={handleClick} />}
      </div>
    </div>
  );
}

function BadgeForEstado({ estado }: { estado: Estado }) {
  switch (estado) {
    case "EM_BREVE":
      return (
        <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">
          Em breve
        </Badge>
      );
    case "ERRO":
      return (
        <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/40">
          Erro de conexão
        </Badge>
      );
    case "CONECTADO":
      return (
        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40">
          <CheckCircle2 size={10} className="mr-1" /> Conectado
        </Badge>
      );
    case "LEGADO":
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
          Conectado (legado)
        </Badge>
      );
    case "NAO_CONFIGURADO":
    default:
      return (
        <Badge variant="outline" className="bg-secondary/40 text-muted-foreground border-border">
          Não configurado
        </Badge>
      );
  }
}

function ActionButton({ estado, onClick }: { estado: Estado; onClick: () => void }) {
  const cfg =
    estado === "ERRO"
      ? {
          label: "Revisar configuração",
          className:
            "bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25",
        }
      : estado === "CONECTADO" || estado === "LEGADO"
        ? {
            label: "Editar configuração",
            className:
              "bg-secondary/60 text-foreground border border-border hover:bg-secondary",
          }
        : {
            label: "Configurar",
            className: "bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent",
          };
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${cfg.className}`}
    >
      {estado === "ERRO" ? <AlertTriangle size={12} /> : <Settings2 size={12} />}
      {cfg.label}
      <ArrowRight size={12} />
    </button>
  );
}
