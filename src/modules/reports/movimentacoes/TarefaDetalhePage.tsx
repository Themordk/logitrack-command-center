import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ClipboardList, Play, Package, MapPin, Clock, User, AlertTriangle } from "lucide-react";
import { fetchTarefaDetalhe } from "./movimentacoes.service";
import { Skeleton } from "@/components/ui/skeleton";

interface TarefaDetalhePageProps {
  tarefaExecucaoId: string;
  onNavigate: (path: string) => void;
}

function InfoItem({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value || "—"}</span>
    </div>
  );
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

function getStatusColor(status: string): string {
  switch (status?.toUpperCase()) {
    case "CONCLUIDO":
    case "CONCLUIDA":
      return "bg-[hsl(var(--status-free))]/20 text-[hsl(var(--status-free))] border-[hsl(var(--status-free))]/30";
    case "EM_EXECUCAO":
    case "EM EXECUÇÃO":
      return "bg-[hsl(var(--status-moving))]/20 text-[hsl(var(--status-moving))] border-[hsl(var(--status-moving))]/30";
    case "PENDENTE":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "CANCELADO":
    case "CANCELADA":
      return "bg-[hsl(var(--status-blocked))]/20 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/30";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

export function TarefaDetalhePage({ tarefaExecucaoId, onNavigate }: TarefaDetalhePageProps) {
  const [data, setData] = useState<any>(null);
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
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

  const tarefa = data.tarefa || {};
  const tipoTarefa = tarefa.tipo_tarefa || {};
  const produto = tarefa.produto || {};
  const endOrigTarefa = tarefa.endereco_origem || {};
  const endDestTarefa = tarefa.endereco_destino || {};
  const endOrigExec = data.endereco_origem || {};
  const endDestExec = data.endereco_destino || {};
  const usuario = data.usuario || {};

  const qtdRequerida = Number(tarefa.quantidade_requerida || 0);
  const qtdExecutada = Number(tarefa.quantidade_executada || 0);
  const qtdCortada = Number(tarefa.qtde_cortada || 0);
  const pctExecucao = qtdRequerida > 0 ? Math.round((qtdExecutada / qtdRequerida) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => onNavigate("/relatorios/movimentacoes")}>
          <ArrowLeft size={14} /> Voltar
        </Button>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Detalhe da Tarefa
          </h2>
          <p className="text-xs text-muted-foreground">
            {tipoTarefa.codigo || "—"} · {tipoTarefa.descricao || "—"}
          </p>
        </div>
        <Badge className={`ml-auto ${getStatusColor(tarefa.status)}`}>
          {tarefa.status || "—"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Tarefa */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList size={16} className="text-primary" />
              Informações da Tarefa
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoItem label="Tipo Tarefa" value={`${tipoTarefa.codigo || "—"}`} />
            <InfoItem label="Descrição Tipo" value={tipoTarefa.descricao} />
            <InfoItem label="Doc. Origem" value={tarefa.tipo_documento_origem || "—"} />
            <InfoItem
              label="Status"
              value={
                <Badge className={`text-[10px] ${getStatusColor(tarefa.status)}`}>
                  {tarefa.status || "—"}
                </Badge>
              }
            />
            <InfoItem label="Prioridade" value={tarefa.prioridade} />
            <InfoItem label="Ordem" value={tarefa.ordem_tarefa} />
            <InfoItem
              label="Produto"
              value={produto.sku ? `${produto.sku} - ${produto.descricao}` : "—"}
              icon={<Package size={10} />}
            />
            <InfoItem label="Qtd Requerida" value={qtdRequerida.toLocaleString("pt-BR")} />
            <InfoItem label="Qtd Executada" value={qtdExecutada.toLocaleString("pt-BR")} />
            <InfoItem label="Qtd Cortada" value={qtdCortada > 0 ? qtdCortada.toLocaleString("pt-BR") : "—"} />
            <InfoItem
              label="% Execução"
              value={
                <span className={pctExecucao >= 100 ? "text-[hsl(var(--status-free))]" : pctExecucao > 0 ? "text-[hsl(var(--status-moving))]" : "text-muted-foreground"}>
                  {pctExecucao}%
                </span>
              }
            />
            <InfoItem
              label="Origem"
              value={endOrigTarefa.descricao || "—"}
              icon={<MapPin size={10} />}
            />
            <InfoItem
              label="Destino"
              value={endDestTarefa.descricao || "—"}
              icon={<MapPin size={10} />}
            />
            <InfoItem label="Criado em" value={formatDate(tarefa.criado_em)} icon={<Clock size={10} />} />
            <InfoItem label="Concluído em" value={formatDate(tarefa.concluido_em)} icon={<Clock size={10} />} />
            {tarefa.motivo_ocorrencia && (
              <InfoItem label="Motivo Ocorrência" value={tarefa.motivo_ocorrencia} />
            )}
          </CardContent>
        </Card>

        {/* Card 2: Execução */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Play size={16} className="text-primary" />
              Informações da Execução
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <InfoItem
              label="Status Execução"
              value={
                <Badge className={`text-[10px] ${getStatusColor(data.status)}`}>
                  {data.status || "—"}
                </Badge>
              }
            />
            <InfoItem
              label="Usuário Executor"
              value={usuario.nome || "—"}
              icon={<User size={10} />}
            />
            <InfoItem label="Atribuído em" value={formatDate(data.atribuido_em)} icon={<Clock size={10} />} />
            <InfoItem label="Iniciado em" value={formatDate(data.iniciado_em)} icon={<Clock size={10} />} />
            <InfoItem label="Concluído em" value={formatDate(data.concluido_em)} icon={<Clock size={10} />} />
            <InfoItem label="Qtd Executada" value={Number(data.quantidade_executada || 0).toLocaleString("pt-BR")} />
            <InfoItem label="Lote" value={data.lote} />
            <InfoItem label="Validade" value={data.data_validade ? new Date(data.data_validade).toLocaleDateString("pt-BR") : "—"} />
            <InfoItem label="Fabricação" value={data.data_fabricacao ? new Date(data.data_fabricacao).toLocaleDateString("pt-BR") : "—"} />
            <InfoItem label="Série" value={data.numero_serie} />
            <InfoItem label="HU" value={data.hu_id && data.hu_id !== "00000000-0000-0000-0000-000000000000" ? data.hu_id.substring(0, 8) + "..." : "—"} />
            <InfoItem
              label="Origem Exec."
              value={endOrigExec.descricao || "—"}
              icon={<MapPin size={10} />}
            />
            <InfoItem
              label="Destino Exec."
              value={endDestExec.descricao || "—"}
              icon={<MapPin size={10} />}
            />
            {data.qtde_cortada > 0 && (
              <InfoItem label="Qtd Cortada" value={Number(data.qtde_cortada).toLocaleString("pt-BR")} />
            )}
            {data.motivo_ocorrencia && (
              <InfoItem label="Motivo Ocorrência" value={data.motivo_ocorrencia} />
            )}
            <InfoItem label="ID Execução" value={<span className="text-[10px] font-mono text-muted-foreground">{tarefaExecucaoId}</span>} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
