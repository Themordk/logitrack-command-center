import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseError } from "@/lib/errorMapper";

const PRIORIDADE_OPTIONS = ["URGENTE", "ALTA", "NORMAL", "BAIXA"] as const;

interface Tarefa {
  id: string;
  sku: string;
  descricao: string;
  quantidade_requerida: number;
  quantidade_executada: number;
  endereco_origem: string;
  endereco_destino: string;
  status: string;
  prioridade_tarefa: string;
}

const statusBadge: Record<string, string> = {
  CRIADA: "bg-muted text-muted-foreground border-border",
  ATRIBUIDA: "bg-primary/15 text-primary border-primary/30",
  EM_ANDAMENTO: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  CONCLUIDA: "bg-green-500/15 text-green-600 border-green-500/30",
  CANCELADA: "bg-destructive/15 text-destructive border-destructive/30",
};

const prioridadeBadge: Record<string, string> = {
  URGENTE: "bg-red-500/15 text-red-400 border-red-500/30",
  ALTA: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  NORMAL: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  BAIXA: "bg-muted text-muted-foreground border-border",
};

interface Props {
  onNavigate: (path: string) => void;
  abastecimentoId: string;
}

export function AbastecimentoDetalhePage({ onNavigate, abastecimentoId }: Props) {
  const { tenantId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  // Priority dialog
  const [prioridadeDialogId, setPrioridadeDialogId] = useState<string | null>(null);
  const [prioridadeValue, setPrioridadeValue] = useState("");
  const [savingPrioridade, setSavingPrioridade] = useState(false);

  const fetchTarefas = useCallback(async () => {
    if (!tenantId || !abastecimentoId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("tarefa")
      .select("id, quantidade_requerida, quantidade_executada, status, prioridade_tarefa, produto:produto_id(sku, descricao), origem:id_local_origem(descricao), destino:id_local_destino(descricao)")
      .eq("id_documento_origem", abastecimentoId)
      .order("criado_em", { ascending: true });

    setTarefas((data || []).map((t: any) => ({
      id: t.id,
      sku: t.produto?.sku || "—",
      descricao: t.produto?.descricao || "—",
      quantidade_requerida: Number(t.quantidade_requerida),
      quantidade_executada: Number(t.quantidade_executada || 0),
      endereco_origem: t.origem?.descricao || "—",
      endereco_destino: t.destino?.descricao || "—",
      status: t.status,
      prioridade_tarefa: t.prioridade_tarefa || "NORMAL",
    })));
    setLoading(false);
  }, [tenantId, abastecimentoId]);

  useEffect(() => { fetchTarefas(); }, [fetchTarefas]);

  const handleCancelar = async (tarefaId: string) => {
    setCancelling(tarefaId);
    const { error } = await (supabase as any)
      .from("tarefa")
      .update({ status: "CANCELADA" })
      .eq("id", tarefaId);
    if (error) {
      toast.error(parseError(error, "abastecimento-detalhe-page").title);
    } else {
      toast.success("Tarefa cancelada");
      fetchTarefas();
    }
    setCancelling(null);
  };

  const handleSavePrioridade = async () => {
    if (!prioridadeDialogId || !prioridadeValue) return;
    setSavingPrioridade(true);
    try {
      const { error } = await (supabase as any)
        .from("tarefa")
        .update({ prioridade_tarefa: prioridadeValue })
        .eq("id", prioridadeDialogId);
      if (error) throw error;
      toast.success("Prioridade atualizada!");
      setPrioridadeDialogId(null);
      fetchTarefas();
    } catch (err: any) {
      toast.error(parseError(err, "abastecimento-detalhe-page").title);
    } finally {
      setSavingPrioridade(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => onNavigate("/atividades/abastecimento")}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Tarefas de Abastecimento</h1>
          <p className="text-sm text-muted-foreground">
            {tarefas.length} tarefa(s) vinculadas
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" size={32} /></div>
      ) : tarefas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">Nenhuma tarefa vinculada.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Requerida</TableHead>
                <TableHead className="text-right">Executada</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tarefas.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.sku}</TableCell>
                  <TableCell className="text-sm truncate max-w-[200px]">{t.descricao}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{t.quantidade_requerida}</TableCell>
                  <TableCell className="text-right text-sm font-mono">{t.quantidade_executada}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.endereco_origem}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.endereco_destino}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-xs cursor-pointer hover:opacity-80 transition-opacity", prioridadeBadge[t.prioridade_tarefa] || "")}
                      onClick={() => {
                        setPrioridadeValue(t.prioridade_tarefa);
                        setPrioridadeDialogId(t.id);
                      }}
                    >
                      {t.prioridade_tarefa}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${statusBadge[t.status] || ""}`}>
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {(t.status === "CRIADA" || t.status === "ATRIBUIDA") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cancelling === t.id}
                        onClick={() => handleCancelar(t.id)}
                        title="Cancelar tarefa"
                      >
                        {cancelling === t.id ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Ban size={14} className="text-destructive" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Prioridade Dialog */}
      <Dialog open={!!prioridadeDialogId} onOpenChange={(v) => !v && setPrioridadeDialogId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Prioridade</DialogTitle>
            <DialogDescription>Selecione a nova prioridade para esta tarefa.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            {PRIORIDADE_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPrioridadeValue(p)}
                className={cn(
                  "px-4 py-3 rounded-lg border text-sm font-medium text-left transition-colors",
                  prioridadeValue === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/30 text-foreground hover:bg-secondary"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setPrioridadeDialogId(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button onClick={handleSavePrioridade} disabled={savingPrioridade} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {savingPrioridade && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
