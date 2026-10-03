import { Activity, AlertTriangle, ArrowLeft, ArrowLeftRight, Eye, Send, Workflow, type LucideIcon } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { relativeTime } from "../StatusBar";
import { usePermissaoRetorno, useRetornoConfig } from "./useRetornos";
import { DestinosTab } from "./destinos/DestinosTab";
import { DeparaTab } from "./depara/DeparaTab";
import { MotorCard } from "./MotorCard";
import { FluxosTab } from "./fluxos/FluxosTab";

type Aba = "fluxos" | "execucoes" | "destinos" | "depara";
const ABAS: Aba[] = ["fluxos", "execucoes", "destinos", "depara"];

interface Props {
  onNavigate: (path: string) => void;
  params?: URLSearchParams;
}

function urlAba(aba: Aba, extra?: Record<string, string>) {
  const p = new URLSearchParams({ aba, ...(extra ?? {}) });
  return `/config/integracao/retornos?${p.toString()}`;
}

function FaixaStatus({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { data, isLoading, isError, refetch } = useRetornoConfig();

  if (isLoading) return <Skeleton className="h-10 w-full rounded-lg" />;
  if (isError || !data) {
    return (
      <div className="card-surface border-destructive/40 px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 text-destructive"><AlertTriangle size={13} /> Não foi possível carregar o status.</span>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  const ok = data.execucoes_24h?.sucesso ?? 0;
  const err = data.execucoes_24h?.erro ?? 0;
  const sep = <span className="text-muted-foreground">·</span>;

  return (
    <div className="card-surface px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${data.motor === "fluxos" ? "bg-emerald-400 animate-pulse" : "bg-zinc-400"}`} />
        <span className="font-semibold text-foreground">Motor: {data.motor === "fluxos" ? "Fluxos" : "Legado"}</span>
      </span>
      {sep}
      <span><span className="text-foreground font-semibold">{data.fluxos_ativos.toLocaleString("pt-BR")}</span> fluxos ativos</span>
      {sep}
      <span>
        Envios 24 h: <span className="text-emerald-400 font-semibold">{ok.toLocaleString("pt-BR")}</span> sucesso ·{" "}
        <span className={err > 0 ? "text-rose-400 font-semibold" : "text-foreground font-semibold"}>{err.toLocaleString("pt-BR")}</span> erro
      </span>
      {sep}
      <span><span className="text-foreground font-semibold">{data.pendentes.toLocaleString("pt-BR")}</span> pendentes</span>
      {sep}
      <button
        type="button"
        onClick={() => onNavigate(urlAba("execucoes", { status: "erro" }))}
        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <span className={`font-semibold ${data.erros_abertos > 0 ? "text-rose-400" : "text-foreground"}`}>
          {data.erros_abertos.toLocaleString("pt-BR")}
        </span> erros em aberto
      </button>
      {sep}
      <button
        type="button"
        onClick={() => onNavigate(urlAba("destinos"))}
        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <span className={`font-semibold ${data.destinos_pausados > 0 ? "text-amber-400" : "text-foreground"}`}>
          {data.destinos_pausados.toLocaleString("pt-BR")}
        </span> destinos pausados
      </button>
      {sep}
      <span>Último envio: <span className="text-foreground">{relativeTime(data.ultima_execucao_em)}</span></span>
    </div>
  );
}

function Vazio({ icone: Icon, texto }: { icone: LucideIcon; texto: string }) {
  return (
    <div className="card-surface flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
        <Icon size={15} className="text-muted-foreground" aria-hidden />
      </div>
      <p className="text-sm text-muted-foreground max-w-md">{texto}</p>
    </div>
  );
}

function Conteudo({ onNavigate, aba, params }: { onNavigate: (p: string) => void; aba: Aba; params: URLSearchParams }) {
  const { podeEditar } = usePermissaoRetorno();

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onNavigate("/config/integracao")}
          className="self-start flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowLeft size={12} /> Voltar para Integração ERP
        </button>
        <h1 className="text-xl font-bold text-foreground">Retornos ao ERP</h1>
        <p className="text-sm text-muted-foreground">
          Defina o que o WMS devolve ao ERP em cada etapa da operação e acompanhe cada envio.
        </p>
      </div>

      {!podeEditar && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          <Eye size={13} aria-hidden /> Modo somente leitura — você pode ver, mas não alterar os retornos ao ERP.
        </div>
      )}

      <FaixaStatus onNavigate={onNavigate} />

      <Tabs value={aba} onValueChange={(v) => onNavigate(urlAba(v as Aba))} className="flex flex-col gap-3">
        <TabsList className="bg-secondary border border-border self-start">
          <TabsTrigger value="fluxos" className="gap-1.5"><Workflow size={14} /> Fluxos</TabsTrigger>
          <TabsTrigger value="execucoes" className="gap-1.5"><Activity size={14} /> Execuções</TabsTrigger>
          <TabsTrigger value="destinos" className="gap-1.5"><Send size={14} /> Destinos</TabsTrigger>
          <TabsTrigger value="depara" className="gap-1.5"><ArrowLeftRight size={14} /> De-para</TabsTrigger>
        </TabsList>
        <TabsContent value="fluxos" className="mt-0 flex flex-col gap-3">
          {podeEditar && <MotorCard />}
          <FluxosTab onNavigate={onNavigate} />
        </TabsContent>
        <TabsContent value="execucoes" className="mt-0">
          <Vazio icone={Activity} texto="Aqui aparecerá cada envio ao ERP, com o caminho percorrido, a resposta e as opções de reprocessar ou descartar." />
        </TabsContent>
        <TabsContent value="destinos" className="mt-0">
          <DestinosTab params={params} />
        </TabsContent>
        <TabsContent value="depara" className="mt-0">
          <DeparaTab params={params} onNavigate={onNavigate} />
        </TabsContent>
      </Tabs>
    </div>
    </TooltipProvider>
  );
}

export function RetornosPage({ onNavigate, params }: Props) {
  const parametros = params ?? new URLSearchParams();
  const aba = parametros.get("aba");
  const { empresaId, empresaVersion } = useTenant();
  const { can, loading } = usePermissions();
  const abaAtual: Aba = ABAS.includes(aba as Aba) ? (aba as Aba) : "fluxos";

  if (!empresaId) {
    return <div className="text-sm text-muted-foreground p-4">Selecione uma empresa para continuar.</div>;
  }
  if (!loading && !can("web.config.integracao", "READ")) {
    return <div className="text-sm text-muted-foreground p-4">Você não tem permissão para acessar esta tela.</div>;
  }
  return <Conteudo key={`${empresaId}-${empresaVersion}`} onNavigate={onNavigate} aba={abaAtual} params={parametros} />;
}
