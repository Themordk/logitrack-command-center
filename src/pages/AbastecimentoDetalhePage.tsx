import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Ban } from "lucide-react";

interface Tarefa {
  id: string;
  sku: string;
  descricao: string;
  quantidade_requerida: number;
  quantidade_executada: number;
  endereco_origem: string;
  endereco_destino: string;
  status: string;
}

const statusBadge: Record<string, string> = {
  CRIADA: "bg-muted text-muted-foreground border-border",
  ATRIBUIDA: "bg-primary/15 text-primary border-primary/30",
  EM_ANDAMENTO: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  CONCLUIDA: "bg-green-500/15 text-green-600 border-green-500/30",
  CANCELADA: "bg-destructive/15 text-destructive border-destructive/30",
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

  const fetchTarefas = useCallback(async () => {
    if (!tenantId || !abastecimentoId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("tarefa")
      .select("id, quantidade_requerida, quantidade_executada, status, produto:produto_id(sku, descricao), origem:id_local_origem(descricao), destino:id_local_destino(descricao)")
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
      toast.error(error.message);
    } else {
      toast.success("Tarefa cancelada");
      fetchTarefas();
    }
    setCancelling(null);
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
    </div>
  );
}
