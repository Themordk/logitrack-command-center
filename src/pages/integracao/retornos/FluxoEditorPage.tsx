import { ArrowLeft, Workflow } from "lucide-react";

interface Props {
  onNavigate: (path: string) => void;
  fluxoId: string;
}

export function FluxoEditorPage({ onNavigate }: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onNavigate("/config/integracao/retornos?aba=fluxos")}
          className="self-start flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowLeft size={12} /> Voltar para Retornos ao ERP
        </button>
        <h1 className="text-xl font-bold text-foreground">Editor de fluxo</h1>
      </div>
      <div className="card-surface flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Workflow size={15} className="text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Editor em construção</p>
      </div>
    </div>
  );
}
