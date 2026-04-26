import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowDownToLine, ShieldAlert, Eye, Ban } from "lucide-react";

interface Abastecimento {
  id: string;
  tipo: string;
  status: string;
  armazem_descricao: string;
  criado_em: string;
  criado_por_login: string | null;
  total_tarefas: number;
  total_itens: number;
  tarefas_vinculadas: number;
  tarefas_concluidas: number;
}

interface Armazem {
  id: string;
  descricao: string;
}

const tipoBadge: Record<string, string> = {
  PREVENTIVO: "bg-primary/15 text-primary border-primary/30",
  CORRETIVO: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
};

const statusBadge: Record<string, string> = {
  GERADO: "bg-muted text-muted-foreground border-border",
  EM_EXECUCAO: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  FINALIZADO: "bg-green-500/15 text-green-600 border-green-500/30",
  CANCELADO: "bg-destructive/15 text-destructive border-destructive/30",
};

interface AbastecimentoPageProps {
  onNavigate?: (path: string) => void;
}

export function AbastecimentoPage({ onNavigate }: AbastecimentoPageProps) {
  const { tenantId, empresaId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Abastecimento[]>([]);

  // Armazem selection modal
  const [armazemModalOpen, setArmazemModalOpen] = useState(false);
  const [armazemModalTipo, setArmazemModalTipo] = useState<"PREVENTIVO" | "CORRETIVO">("PREVENTIVO");
  const [armazens, setArmazens] = useState<Armazem[]>([]);
  const [selectedArmazem, setSelectedArmazem] = useState<string>("");


  const fetchData = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("vw_abastecimento_lista")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("empresa_id", empresaId)
      .order("criado_em", { ascending: false })
      .limit(100);
    setData(rows || []);
    setLoading(false);
  }, [tenantId, empresaId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!tenantId || !empresaId) { setArmazens([]); return; }
    (supabase as any)
      .from("armazem")
      .select("id, descricao")
      .eq("tenant_id", tenantId)
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("descricao")
      .then(({ data: a }: any) => setArmazens(a || []));
  }, [tenantId, empresaId]);

  const openGerarModal = (tipo: "PREVENTIVO" | "CORRETIVO") => {
    setArmazemModalTipo(tipo);
    setSelectedArmazem(armazens.length === 1 ? armazens[0].id : "");
    setArmazemModalOpen(true);
  };

  const handleNavigateToGeracao = () => {
    if (!selectedArmazem) {
      toast.error("Selecione um armazém");
      return;
    }
    setArmazemModalOpen(false);
    onNavigate?.(`/atividades/abastecimento/gerar?tipo=${armazemModalTipo}&armazem=${selectedArmazem}`);
  };

  const handleCancelar = async (id: string) => {
    const { error } = await (supabase as any)
      .from("abastecimento")
      .update({ status: "CANCELADO" })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Abastecimento cancelado");
    fetchData();
  };

  const handleVerTarefas = (abastId: string) => {
    onNavigate?.(`/atividades/abastecimento/${abastId}/tarefas`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Abastecimento</h1>
          <p className="text-sm text-muted-foreground">Geração e acompanhamento de abastecimento Pulmão → Picking</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openGerarModal("PREVENTIVO")} className="gap-2">
            <ShieldAlert size={16} />
            Gerar Preventivo
          </Button>
          <Button onClick={() => openGerarModal("CORRETIVO")} variant="secondary" className="gap-2">
            <ArrowDownToLine size={16} />
            Gerar Corretivo
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" size={32} /></div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <ArrowDownToLine size={48} className="text-muted-foreground/40" />
          <p className="text-muted-foreground">Nenhum abastecimento gerado ainda.</p>
          <p className="text-xs text-muted-foreground/70">Use os botões acima para gerar abastecimento preventivo ou corretivo.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Armazém</TableHead>
                <TableHead className="text-center">Tarefas</TableHead>
                <TableHead className="text-right">Qtd Itens</TableHead>
                <TableHead>Criado por</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="outline" className={tipoBadge[row.tipo] || ""}>{row.tipo}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusBadge[row.status] || ""}>{row.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{row.armazem_descricao}</TableCell>
                  <TableCell className="text-center text-sm">
                    {row.tarefas_concluidas}/{row.tarefas_vinculadas}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">{Number(row.total_itens)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.criado_por_login || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(row.criado_em).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleVerTarefas(row.id)} title="Ver tarefas">
                        <Eye size={14} />
                      </Button>
                      {row.status === "GERADO" && (
                        <Button size="sm" variant="ghost" onClick={() => handleCancelar(row.id)} title="Cancelar">
                          <Ban size={14} className="text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Armazem Selection Modal */}
      <Dialog open={armazemModalOpen} onOpenChange={setArmazemModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Abastecimento {armazemModalTipo}</DialogTitle>
            <DialogDescription>
              {armazemModalTipo === "PREVENTIVO"
                ? "Analisa demanda de separação pendente e saldo de picking insuficiente."
                : "Analisa níveis mínimo/máximo de picking_produto."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Armazém</label>
              <Select value={selectedArmazem} onValueChange={setSelectedArmazem}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {armazens.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button onClick={handleNavigateToGeracao} disabled={!selectedArmazem}>
                Simular e Revisar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
