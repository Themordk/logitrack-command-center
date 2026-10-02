import {
  Archive, Ban, Bell, Braces, CheckCircle2, Clock, FileCheck2, Filter, FlaskConical, GitBranch, Globe,
  Hand, Layers, Loader2, PauseCircle, PencilLine, PlayCircle, Plug, RotateCcw, Split, Timer, Webhook,
  XCircle, Zap, type LucideIcon,
} from "lucide-react";
import type { GrupoNo, ModoExecucao, StatusExecucao, StatusFluxo, StatusPasso, TipoNo } from "./retornos.types";

export interface ApresentacaoStatus { rotulo: string; icone: LucideIcon; classe: string; iconeClasse?: string }

const COR = {
  emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  sky: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  rose: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  zinc: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  violet: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

export const STATUS_EXECUCAO_UI: Record<StatusExecucao, ApresentacaoStatus> = {
  agrupando: { rotulo: "Agrupando", icone: Layers, classe: COR.violet },
  agrupado: { rotulo: "Em lote", icone: Layers, classe: COR.zinc },
  pendente: { rotulo: "Pendente", icone: Clock, classe: COR.sky },
  executando: { rotulo: "Executando", icone: Loader2, classe: `${COR.amber} animate-pulse`, iconeClasse: "animate-spin" },
  aguardando_retry: { rotulo: "Nova tentativa", icone: RotateCcw, classe: COR.amber },
  sucesso: { rotulo: "Sucesso", icone: CheckCircle2, classe: COR.emerald },
  erro: { rotulo: "Erro", icone: XCircle, classe: COR.rose },
  filtrado: { rotulo: "Filtrado", icone: Filter, classe: COR.zinc },
  descartado: { rotulo: "Descartado", icone: Ban, classe: COR.zinc },
};

export const STATUS_PASSO_UI: Record<StatusPasso, ApresentacaoStatus> = {
  sucesso: { rotulo: "Sucesso", icone: CheckCircle2, classe: COR.emerald },
  erro: { rotulo: "Erro", icone: XCircle, classe: COR.rose },
  retry: { rotulo: "Tentativa falhou", icone: RotateCcw, classe: COR.amber },
  simulado: { rotulo: "Simulado", icone: FlaskConical, classe: COR.sky },
  filtrado: { rotulo: "Filtrado", icone: Filter, classe: COR.zinc },
};

export const STATUS_FLUXO_UI: Record<StatusFluxo, ApresentacaoStatus> = {
  rascunho: { rotulo: "Rascunho", icone: PencilLine, classe: COR.zinc },
  publicado: { rotulo: "Ativo", icone: PlayCircle, classe: COR.emerald },
  pausado: { rotulo: "Pausado", icone: PauseCircle, classe: COR.amber },
  arquivado: { rotulo: "Arquivado", icone: Archive, classe: COR.zinc },
};

export const MODO_EXECUCAO_UI: Record<ModoExecucao, string> = {
  automatico: "Automático",
  manual: "Manual",
  teste: "Teste",
  simulacao: "Simulação",
  lote: "Lote",
};

export const TIPO_NO_UI: Record<TipoNo, { icone: LucideIcon; grupo: GrupoNo }> = {
  "gatilho.evento": { icone: Zap, grupo: "gatilho" },
  "gatilho.manual": { icone: Hand, grupo: "gatilho" },
  "logica.condicao": { icone: GitBranch, grupo: "logica" },
  "logica.aguardar": { icone: Timer, grupo: "logica" },
  "logica.dividir_itens": { icone: Split, grupo: "logica" },
  "dados.payload": { icone: Braces, grupo: "dados" },
  "acao.http": { icone: Globe, grupo: "acao" },
  "acao.webhook": { icone: Webhook, grupo: "acao" },
  "acao.provedor": { icone: Plug, grupo: "acao" },
  "acao.atualizar_documento": { icone: FileCheck2, grupo: "acao" },
  "acao.notificar": { icone: Bell, grupo: "acao" },
};

/** Cores de grupo — só borda e ícone. */
export const GRUPO_NO_UI: Record<GrupoNo, { rotulo: string; borda: string; icone: string }> = {
  gatilho: { rotulo: "Gatilhos", borda: "border-primary/60", icone: "text-primary" },
  logica: { rotulo: "Lógica", borda: "border-amber-500/60", icone: "text-amber-400" },
  dados: { rotulo: "Dados", borda: "border-violet-500/60", icone: "text-violet-400" },
  acao: { rotulo: "Ações", borda: "border-emerald-500/60", icone: "text-emerald-400" },
};
