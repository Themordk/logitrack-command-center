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
  salvoEm: number | null;
  onRenomear: (nome: string) => void;
  onVoltar: () => void;
  onExecucoes: () => void;
  onTentarDeNovo: () => void;
  podeEditar: boolean;
  totalErros: number;
  temAlteracoes: boolean;
  bloqueado: boolean;
  publicando: boolean;
  alternandoAtivo: boolean;
  onTestar: () => void;
  onPublicar: () => void;
  onVersoes: () => void;
  onAlternarAtivo: (ativo: boolean) => void;
}

function textoSalvo(salvoEm: number | null, updatedAt: string): string {
  if (salvoEm != null) return relativeTime(new Date(salvoEm).toISOString());
  const t = new Date(updatedAt).getTime();
  return Number.isNaN(t) || t > Date.now() ? "agora" : relativeTime(updatedAt);
}

function ComDica({ dica, children }: { dica: string | null; children: React.ReactNode }) {
  if (!dica) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</span></TooltipTrigger>
      <TooltipContent className="text-xs">{dica}</TooltipContent>
    </Tooltip>
  );
}

export function EditorTopBar(props: Props) {
  const { nome, fluxo, somenteLeitura, estado, voltando, salvoEm, onRenomear, onVoltar, onExecucoes, onTentarDeNovo } = props;
  const nuncaPublicado = fluxo.versao_publicada == null;
  const dicaAtivo = !props.podeEditar ? "Você não tem permissão para alterar" : nuncaPublicado ? "Publique antes de ativar" : null;
  const dicaTestar = props.bloqueado ? "Feche a visualização atual" : props.totalErros > 0 ? "Corrija os problemas do fluxo" : null;
  const dicaPublicar = !props.podeEditar ? "Você não tem permissão para publicar"
    : props.bloqueado ? "Feche a visualização atual"
    : props.totalErros > 0 ? "Corrija os problemas do fluxo"
    : !props.temAlteracoes ? "Não há alterações para publicar" : null;
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
            {(estado === "salvo" || estado === "ocioso") && <>Salvo {textoSalvo(salvoEm, fluxo.updated_at)}</>}
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
        <ComDica dica={dicaAtivo}>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {props.alternandoAtivo && <Loader2 size={13} className="animate-spin" aria-hidden />}
            <Switch
              checked={fluxo.ativo}
              disabled={!!dicaAtivo || props.alternandoAtivo}
              onCheckedChange={props.onAlternarAtivo}
              aria-label="Ativo"
            /> Ativo
          </label>
        </ComDica>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={props.onVersoes}><History size={14} /> Versões</Button>
        <ComDica dica={dicaTestar}>
          <Button variant="outline" size="sm" disabled={!!dicaTestar} className="gap-1.5" onClick={props.onTestar}><FlaskConical size={14} /> Testar</Button>
        </ComDica>
        <ComDica dica={dicaPublicar}>
          <Button size="sm" disabled={!!dicaPublicar || props.publicando} className="gap-1.5" onClick={props.onPublicar}>
            {props.publicando ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />} Publicar
          </Button>
        </ComDica>
      </div>
    </div>
  );
}
