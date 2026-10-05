import { useEffect, useState } from "react";
import { ArrowLeft, FlaskConical, History, Loader2, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { relativeTime } from "../../StatusBar";
import { StatusRetornoBadge } from "../components/StatusRetornoBadge";
import type { FluxoCompleto } from "../retornos.types";
import type { EstadoSalvamento } from "./useAutosaveFluxo";

interface Props {
  nome: string;
  fluxo: FluxoCompleto;
  somenteLeitura: boolean;
  estado: EstadoSalvamento;
  voltando: boolean;
  onRenomear: (nome: string) => void;
  onVoltar: () => void;
  onExecucoes: () => void;
  onTentarDeNovo: () => void;
}

function EmBreve({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</span></TooltipTrigger>
      <TooltipContent>Disponível na próxima etapa</TooltipContent>
    </Tooltip>
  );
}

export function EditorTopBar({ nome, fluxo, somenteLeitura, estado, voltando, onRenomear, onVoltar, onExecucoes, onTentarDeNovo }: Props) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(nome);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const confirmar = () => {
    const n = rascunho.trim();
    setEditando(false);
    if (n && n !== nome) onRenomear(n);
    else setRascunho(nome);
  };

  return (
    <div className="card-surface flex items-center gap-3 px-3 py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Voltar para Retornos ao ERP" onClick={onVoltar} disabled={voltando}>
            {voltando ? <Loader2 size={15} className="animate-spin" /> : <ArrowLeft size={15} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Voltar para Retornos ao ERP</TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editando ? (
          <Input
            autoFocus
            aria-label="Nome do fluxo"
            value={rascunho}
            maxLength={120}
            onChange={(e) => setRascunho(e.target.value)}
            onBlur={confirmar}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmar();
              if (e.key === "Escape") { setRascunho(nome); setEditando(false); }
            }}
            className="h-8 max-w-sm rounded-lg bg-secondary/40 text-sm font-semibold"
          />
        ) : somenteLeitura ? (
          <h1 className="truncate text-base font-semibold text-foreground">{nome}</h1>
        ) : (
          <button
            type="button"
            title="Clique para renomear"
            onClick={() => { setRascunho(nome); setEditando(true); }}
            className="truncate rounded px-1 text-left text-base font-semibold text-foreground hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {nome}
          </button>
        )}
        <StatusRetornoBadge tipo="fluxo" status={fluxo.status} />
        {fluxo.alteracoes_nao_publicadas && fluxo.versao_publicada != null && (
          <Badge variant="outline" className="shrink-0 bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">Alterações não publicadas</Badge>
        )}
        {!somenteLeitura && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {estado === "salvando" && <><Loader2 size={13} className="animate-spin" aria-hidden /> Salvando…</>}
            {estado === "salvo" && <>Salvo {relativeTime(fluxo.updated_at)}</>}
            {estado === "erro" && (
              <>
                <span className="text-rose-400">Não salvo</span>
                <button type="button" onClick={onTentarDeNovo} className="text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                  Tentar de novo
                </button>
              </>
            )}
          </span>
        )}
      </div>

      <Tabs value="editor" onValueChange={(v) => { if (v === "execucoes") onExecucoes(); }}>
        <TabsList className="h-8 bg-secondary border border-border">
          <TabsTrigger value="editor" className="h-6 text-xs">Editor</TabsTrigger>
          <TabsTrigger value="execucoes" className="h-6 text-xs">Execuções</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex shrink-0 items-center gap-2">
        <EmBreve>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={fluxo.ativo} disabled aria-label="Ativo" /> Ativo
          </label>
        </EmBreve>
        <EmBreve><Button variant="ghost" size="sm" disabled className="gap-1.5"><History size={14} /> Versões</Button></EmBreve>
        <EmBreve><Button variant="outline" size="sm" disabled className="gap-1.5"><FlaskConical size={14} /> Testar</Button></EmBreve>
        <EmBreve><Button size="sm" disabled className="gap-1.5"><Rocket size={14} /> Publicar</Button></EmBreve>
      </div>
    </div>
  );
}
