import {
  Archive, Ban, Bell, Braces, CheckCircle2, Clock, DatabaseZap, FileCheck2, Filter, FlaskConical, GitBranch, Globe,
  Hand, Layers, Loader2, PauseCircle, PencilLine, PlayCircle, Plug, RotateCcw, Split, Timer, Webhook,
  UserCheck, XCircle, Zap, type LucideIcon,
} from "lucide-react";
import type { GrupoNo, ModoExecucao, StatusExecucao, StatusFluxo, StatusPasso, TipoNo } from "./retornos.types";

export interface ApresentacaoStatus { rotulo: string; icone: LucideIcon; classe: string; iconeClasse?: string }

// Tons do design system (src/AGENTS.md): um tom = um significado.
const COR = {
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  info: "bg-info/10 text-info border-info/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  neutral: "bg-neutral/10 text-muted-foreground border-border",
};

export const STATUS_EXECUCAO_UI: Record<StatusExecucao, ApresentacaoStatus> = {
  agrupando: { rotulo: "Agrupando", icone: Layers, classe: COR.info },
  agrupado: { rotulo: "Em lote", icone: Layers, classe: COR.neutral },
  pendente: { rotulo: "Pendente", icone: Clock, classe: COR.info },
  executando: { rotulo: "Executando", icone: Loader2, classe: COR.info, iconeClasse: "animate-spin" },
  aguardando_retry: { rotulo: "Nova tentativa", icone: RotateCcw, classe: COR.warning },
  sucesso: { rotulo: "Sucesso", icone: CheckCircle2, classe: COR.success },
  erro: { rotulo: "Erro", icone: XCircle, classe: COR.danger },
  filtrado: { rotulo: "Filtrado", icone: Filter, classe: COR.neutral },
  descartado: { rotulo: "Descartado", icone: Ban, classe: COR.neutral },
  aguardando_confirmacao: { rotulo: "Aguardando confirmação", icone: UserCheck, classe: COR.warning },
};

export const STATUS_PASSO_UI: Record<StatusPasso, ApresentacaoStatus> = {
  sucesso: { rotulo: "Sucesso", icone: CheckCircle2, classe: COR.success },
  erro: { rotulo: "Erro", icone: XCircle, classe: COR.danger },
  retry: { rotulo: "Tentativa falhou", icone: RotateCcw, classe: COR.warning },
  simulado: { rotulo: "Simulado", icone: FlaskConical, classe: COR.info },
  filtrado: { rotulo: "Filtrado", icone: Filter, classe: COR.neutral },
};

export const STATUS_FLUXO_UI: Record<StatusFluxo, ApresentacaoStatus> = {
  rascunho: { rotulo: "Rascunho", icone: PencilLine, classe: COR.neutral },
  publicado: { rotulo: "Ativo", icone: PlayCircle, classe: COR.success },
  pausado: { rotulo: "Pausado", icone: PauseCircle, classe: COR.warning },
  arquivado: { rotulo: "Arquivado", icone: Archive, classe: COR.neutral },
};

export const MODO_EXECUCAO_UI: Record<ModoExecucao, string> = {
  automatico: "Automático",
  manual: "Manual",
  teste: "Teste",
  simulacao: "Simulação",
  lote: "Lote",
  interativo: "Importar do ERP",
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
  "logica.confirmar_usuario": { icone: UserCheck, grupo: "logica" },
  "acao.gravar_logitrack": { icone: DatabaseZap, grupo: "acao" },
};

/** Cores de grupo — só borda e ícone. */
export const GRUPO_NO_UI: Record<GrupoNo, { rotulo: string; borda: string; icone: string }> = {
  gatilho: { rotulo: "Gatilhos", borda: "border-primary/60", icone: "text-primary" },
  logica: { rotulo: "Lógica", borda: "border-amber-500/60", icone: "text-amber-400" },
  dados: { rotulo: "Dados", borda: "border-violet-500/60", icone: "text-violet-400" },
  acao: { rotulo: "Ações", borda: "border-emerald-500/60", icone: "text-emerald-400" },
};
