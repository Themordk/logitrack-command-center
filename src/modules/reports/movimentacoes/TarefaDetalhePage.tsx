import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ClipboardList, Play, FileText, Package, MapPin, Clock, User, AlertTriangle, Hash } from "lucide-react";
import { fetchTarefaDetalhe, getPrioridadeLabel, getPrioridadeColor, type TarefaDetalheResult } from "./movimentacoes.service";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatDate } from "@/utils/dateTime";

interface TarefaDetalhePageProps {
  tarefaExecucaoId: string;
  onNavigate: (path: string) => void;
}

/* ─── helpers ─── */

function InfoItem({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 whitespace-nowrap">
        {icon}{label}
      </span>
      <span className="text-sm font-medium text-foreground break-words">{value || "—"}</span>
    </div>
  );
}

// Aliases locais para clareza semântica (datetime vs date)
const fmtDT = formatDateTime;
const fmtD = formatDate;



const STATUS_TAREFA_COLORS: Record<string, string> = {
  CRIADA: "bg-red-500/15 text-red-400 border-red-500/30",
  ATRIBUIDA: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  EM_ANDAMENTO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  PAUSADA: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  CONCLUIDA: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  AUDITADA: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  CANCELADA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  DIVERGENTE: "bg-pink-500/15 text-pink-400 border-pink-500/30",
};

const STATUS_EXEC_COLORS: Record<string, string> = {
  ATRIBUIDA: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  EM_ANDAMENTO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  PAUSADA: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  CONCLUIDA: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  CANCELADA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  COLETA_PENDENTE: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

function StatusBadgeInline({ status, map }: { status: string; map: Record<string, string> }) {
  const cls = map[status] || "bg-secondary text-secondary-foreground";
  return <Badge className={`text-[10px] ${cls}`}>{status || "—"}</Badge>;
}

/* ─── Documento de Origem ─── */

function DocumentoOrigemCard({ doc }: { doc: any | null }) {
  if (!doc) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            Documento de Origem
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum documento de origem vinculado.</p>
        </CardContent>
      </Card>
    );
  }

  const isEntrada = doc.tipo === "MOVIMENTO_ENTRADA_ITEM";
  const isSaida = doc.tipo === "MOVIMENTO_SAIDA_ITEM";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText size={16} className="text-primary" />
          Documento de Origem
          <Badge className="ml-2 text-[10px] bg-primary/15 text-primary border-primary/30">
            {doc.tipo_label || doc.tipo}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isEntrada && (
          <>
            <InfoItem label="Nº Movimento" value={doc.numero} icon={<Hash size={10} />} />
            <InfoItem label="Status Movimento" value={<StatusBadgeInline status={doc.status} map={STATUS_TAREFA_COLORS} />} />
            <InfoItem label="Box" value={doc.box} />
            <InfoItem label="Observação" value={doc.observacao} />
            <InfoItem label="Produto" value={doc.produto_sku ? `${doc.produto_sku} - ${doc.produto_descricao}` : "—"} icon={<Package size={10} />} />
            <InfoItem label="Status Item" value={doc.status_item} />
            <InfoItem label="Qtd Esperada" value={Number(doc.qtd_esperada || 0).toLocaleString("pt-BR")} />
            <InfoItem label="Qtd Conferida" value={Number(doc.qtd_conferida || 0).toLocaleString("pt-BR")} />
            {doc.qtd_armazenada != null && (
              <InfoItem label="Qtd Armazenada" value={Number(doc.qtd_armazenada || 0).toLocaleString("pt-BR")} />
            )}
          </>
        )}
        {isSaida && (
          <>
            <InfoItem label="Nº Onda" value={doc.numero} icon={<Hash size={10} />} />
            <InfoItem label="Status Movimento" value={<StatusBadgeInline status={doc.status} map={STATUS_TAREFA_COLORS} />} />
            <InfoItem label="Rota" value={doc.rota} />
            <InfoItem label="Destino Carga" value={doc.destino_carga} />
            <InfoItem label="Produto" value={doc.produto_sku ? `${doc.produto_sku} - ${doc.produto_descricao}` : "—"} icon={<Package size={10} />} />
            <InfoItem label="Status Item" value={doc.status_item} />
            <InfoItem label="Qtd Esperada" value={Number(doc.qtd_esperada || 0).toLocaleString("pt-BR")} />
            <InfoItem label="Qtd Separada" value={Number(doc.qtd_separada || 0).toLocaleString("pt-BR")} />
            {Number(doc.qtd_cortada || 0) > 0 && (
              <InfoItem label="Qtd Cortada" value={Number(doc.qtd_cortada).toLocaleString("pt-BR")} />
            )}
          </>
        )}
        {!isEntrada && !isSaida && (
          <>
            <InfoItem label="Tipo" value={doc.tipo_label || doc.tipo} />
            <InfoItem label="ID Documento" value={<span className="font-mono text-[10px]">{doc.id_documento_origem}</span>} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Tarefa Card ─── */

function TarefaCard({ tarefa }: { tarefa: any }) {
  const tipoTarefa = tarefa.tipo_tarefa || {};
  const produto = tarefa.produto || {};
  const endOrig = tarefa.endereco_origem || {};
  const endDest = tarefa.endereco_destino || {};

  const qtdRequerida = Number(tarefa.quantidade_requerida || 0);
  const qtdExecutada = Number(tarefa.quantidade_executada || 0);
  const qtdCortada = Number(tarefa.quantidade_cortada || 0);
  const pct = Number(tarefa.percentual_execucao || (qtdRequerida > 0 ? Math.round((qtdExecutada / qtdRequerida) * 100) : 0));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList size={16} className="text-primary" />
          Informações da Tarefa
          <StatusBadgeInline status={tarefa.status} map={STATUS_TAREFA_COLORS} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="Tipo Tarefa" value={`${tipoTarefa.codigo || "—"} - ${tipoTarefa.descricao || ""}`} />
          <InfoItem label="Doc. Origem" value={tarefa.tipo_documento_origem || "—"} />
          <InfoItem
            label="Prioridade"
            value={
              <Badge className={`text-[10px] ${getPrioridadeColor(tarefa.prioridade_tarefa)}`}>
                {getPrioridadeLabel(tarefa.prioridade_tarefa)}
              </Badge>
            }
          />
          <InfoItem label="Ordem" value={tarefa.ordem_tarefa} />
          <InfoItem
            label="Produto"
            value={produto.sku ? `${produto.sku} - ${produto.descricao}` : "—"}
            icon={<Package size={10} />}
          />
          <InfoItem label="Qtd Requerida" value={qtdRequerida.toLocaleString("pt-BR")} />
          <InfoItem label="Qtd Executada" value={qtdExecutada.toLocaleString("pt-BR")} />
          {qtdCortada > 0 && (
            <InfoItem label="Qtd Cortada" value={qtdCortada.toLocaleString("pt-BR")} />
          )}
          <InfoItem label="Origem" value={endOrig.descricao || "—"} icon={<MapPin size={10} />} />
          <InfoItem label="Destino" value={endDest.descricao || "—"} icon={<MapPin size={10} />} />
          <InfoItem label="Criado em" value={fmtDT(tarefa.criado_em)} icon={<Clock size={10} />} />
          <InfoItem label="Concluído em" value={fmtDT(tarefa.concluido_em)} icon={<Clock size={10} />} />
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progresso de Execução</span>
            <span className={pct >= 100 ? "text-blue-400 font-bold" : pct > 0 ? "text-yellow-400" : ""}>{pct}%</span>
          </div>
          <Progress value={Math.min(pct, 100)} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Execuções Card ─── */

function ExecucoesCard({ execucoes, highlightId }: { execucoes: any[]; highlightId: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Play size={16} className="text-primary" />
          Execuções ({execucoes.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {execucoes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma execução encontrada.</p>
        )}
        {execucoes.map((exec: any, idx: number) => {
          const isHighlighted = exec.id === highlightId;
          const usuario = exec.usuario || {};
          const endOrig = exec.endereco_origem || {};
          const endDest = exec.endereco_destino || {};
          const qtdExec = Number(exec.quantidade_executada || 0);
          const qtdCort = Number(exec.quantidade_cortada || 0);
          const huId = exec.hu && exec.hu !== "00000000-0000-0000-0000-000000000000" ? exec.hu : null;

          return (
            <div
              key={exec.id}
              className={`rounded-lg border p-3 space-y-2 transition-colors ${
                isHighlighted
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card"
              }`}
            >
              {/* Header row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                <StatusBadgeInline status={exec.status} map={STATUS_EXEC_COLORS} />
                <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                  <User size={10} />
                  <span className="font-medium text-foreground">{usuario.nome || "—"}</span>
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <InfoItem label="Qtd Executada" value={qtdExec.toLocaleString("pt-BR")} />
                <InfoItem label="Lote" value={exec.lote} />
                <InfoItem label="Validade" value={fmtD(exec.validade)} />
                <InfoItem label="Fabricação" value={fmtD(exec.fabricacao)} />
                <InfoItem label="Origem" value={endOrig.descricao || "—"} icon={<MapPin size={10} />} />
                <InfoItem label="Destino" value={endDest.descricao || "—"} icon={<MapPin size={10} />} />
                <InfoItem label="Série" value={exec.serie} />
                <InfoItem label="HU" value={huId ? huId.substring(0, 8) + "..." : "—"} />
              </div>

              {/* Timestamps row */}
              <div className="grid grid-cols-3 gap-3">
                <InfoItem label="Atribuído em" value={fmtDT(exec.atribuido_em)} icon={<Clock size={10} />} />
                <InfoItem label="Iniciado em" value={fmtDT(exec.iniciado_em)} icon={<Clock size={10} />} />
                <InfoItem label="Concluído em" value={fmtDT(exec.concluido_em)} icon={<Clock size={10} />} />
              </div>

              {/* Extra info if applicable */}
              {(qtdCort > 0 || exec.motivo_ocorrencia) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-border/50">
                  {qtdCort > 0 && <InfoItem label="Qtd Cortada" value={qtdCort.toLocaleString("pt-BR")} />}
                  {exec.motivo_ocorrencia && <InfoItem label="Motivo Ocorrência" value={exec.motivo_ocorrencia} />}
                </div>
              )}

              {/* ID */}
              <div className="text-[10px] font-mono text-muted-foreground/60 pt-1">
                ID: {exec.id}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ─── Main Page ─── */

export function TarefaDetalhePage({ tarefaExecucaoId, onNavigate }: TarefaDetalhePageProps) {
  const [data, setData] = useState<TarefaDetalheResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchTarefaDetalhe(tarefaExecucaoId);
        setData(result);
      } catch (err: any) {
        console.error(err);
        setError("Não foi possível carregar os detalhes da tarefa.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tarefaExecucaoId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <AlertTriangle className="text-destructive" size={40} />
        <p className="text-muted-foreground">{error || "Tarefa não encontrada."}</p>
        <Button variant="outline" size="sm" onClick={() => onNavigate("/relatorios/movimentacoes")}>
          <ArrowLeft size={14} /> Voltar
        </Button>
      </div>
    );
  }

  const { tarefa, documento_origem, execucoes } = data;
  const tipoTarefa = tarefa.tipo_tarefa || {};

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => onNavigate("/relatorios/movimentacoes")}>
          <ArrowLeft size={14} /> Voltar
        </Button>
        <div>
          <h2 className="text-base font-semibold text-foreground">Detalhe da Tarefa</h2>
          <p className="text-xs text-muted-foreground">
            {tipoTarefa.codigo || "—"} · {tipoTarefa.descricao || "—"}
          </p>
        </div>
      </div>

      {/* Container 1: Documento de Origem */}
      <DocumentoOrigemCard doc={documento_origem} />

      {/* Container 2: Tarefa */}
      <TarefaCard tarefa={tarefa} />

      {/* Container 3: Execuções */}
      <ExecucoesCard execucoes={execucoes} highlightId={tarefaExecucaoId} />
    </div>
  );
}
