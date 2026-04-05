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
import { Loader2, ArrowDownToLine, ShieldAlert, Eye, Ban, AlertTriangle } from "lucide-react";

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

interface SimItem {
  sku: string;
  descricao: string;
  necessidade: number;
  saldo_pulmao: number;
  qtd_abastecer: number;
  endereco_origem: string | null;
  endereco_destino: string | null;
}

interface SimAlerta {
  sku: string;
  descricao: string;
  necessidade: number;
  motivo: string;
}

interface Armazem {
  id: string;
  descricao: string;
}

type ModalStep = "select" | "simulating" | "preview" | "generating" | "done";

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

export function AbastecimentoPage() {
  const { tenantId, empresaId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Abastecimento[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTipo, setModalTipo] = useState<"PREVENTIVO" | "CORRETIVO">("PREVENTIVO");
  const [modalStep, setModalStep] = useState<ModalStep>("select");
  const [armazens, setArmazens] = useState<Armazem[]>([]);
  const [selectedArmazem, setSelectedArmazem] = useState<string>("");
  const [simItens, setSimItens] = useState<SimItem[]>([]);
  const [simAlertas, setSimAlertas] = useState<SimAlerta[]>([]);
  const [simTotals, setSimTotals] = useState({ total_tarefas: 0, total_itens: 0 });

  // Detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarefas, setDetailTarefas] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

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
    if (!tenantId) return;
    (supabase as any)
      .from("armazem")
      .select("id, descricao")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("descricao")
      .then(({ data: a }: any) => setArmazens(a || []));
  }, [tenantId]);

  const openModal = (tipo: "PREVENTIVO" | "CORRETIVO") => {
    setModalTipo(tipo);
    setModalStep("select");
    setSelectedArmazem(armazens.length === 1 ? armazens[0].id : "");
    setSimItens([]);
    setSimAlertas([]);
    setModalOpen(true);
  };

  const getUsuarioId = () => localStorage.getItem("core_usuario_id") || "";

  const runRpc = async (simular: boolean) => {
    const { data: result, error } = await (supabase as any).rpc("fn_gerar_abastecimento", {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
      p_armazem_id: selectedArmazem,
      p_tipo: modalTipo,
      p_usuario_id: getUsuarioId(),
      p_simular: simular,
    });
    if (error) throw error;
    return result;
  };

  const handleSimular = async () => {
    if (!selectedArmazem) { toast.error("Selecione um armazém"); return; }
    setModalStep("simulating");
    try {
      const result = await runRpc(true);
      setSimItens(result.itens || []);
      setSimAlertas(result.alertas || []);
      setSimTotals({ total_tarefas: result.total_tarefas, total_itens: Number(result.total_itens) });
      setModalStep("preview");
    } catch (e: any) {
      toast.error("Erro na simulação: " + e.message);
      setModalStep("select");
    }
  };

  const handleGerar = async () => {
    setModalStep("generating");
    try {
      const result = await runRpc(false);
      toast.success(`${result.total_tarefas} tarefa(s) de abastecimento gerada(s)`);
      setModalStep("done");
      fetchData();
      setTimeout(() => setModalOpen(false), 1500);
    } catch (e: any) {
      toast.error("Erro ao gerar: " + e.message);
      setModalStep("preview");
    }
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

  const handleVerTarefas = async (abastId: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    const { data: tarefas } = await (supabase as any)
      .from("tarefa")
      .select("id, quantidade_requerida, quantidade_executada, status, produto:produto_id(sku, descricao), origem:id_local_origem(descricao), destino:id_local_destino(descricao)")
      .eq("id_documento_origem", abastId)
      .order("criado_em", { ascending: true });
    setDetailTarefas(tarefas || []);
    setDetailLoading(false);
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
          <Button onClick={() => openModal("PREVENTIVO")} className="gap-2">
            <ShieldAlert size={16} />
            Gerar Preventivo
          </Button>
          <Button onClick={() => openModal("CORRETIVO")} variant="secondary" className="gap-2">
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

      {/* Generation Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar Abastecimento {modalTipo}</DialogTitle>
            <DialogDescription>
              {modalTipo === "PREVENTIVO"
                ? "Analisa demanda de separação pendente e saldo de picking insuficiente."
                : "Analisa níveis mínimo/máximo de picking_produto."}
            </DialogDescription>
          </DialogHeader>

          {modalStep === "select" && (
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
                <Button onClick={handleSimular} disabled={!selectedArmazem}>
                  <Eye size={16} className="mr-2" /> Simular
                </Button>
              </DialogFooter>
            </div>
          )}

          {(modalStep === "simulating" || modalStep === "generating") && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="animate-spin text-primary" size={32} />
              <p className="text-sm text-muted-foreground">
                {modalStep === "simulating" ? "Simulando..." : "Gerando tarefas..."}
              </p>
            </div>
          )}

          {modalStep === "preview" && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <span className="text-muted-foreground">Tarefas: </span>
                  <span className="font-bold text-foreground">{simTotals.total_tarefas}</span>
                </div>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <span className="text-muted-foreground">Qtd Total: </span>
                  <span className="font-bold text-foreground">{simTotals.total_itens}</span>
                </div>
              </div>

              {simItens.length > 0 && (
                <div className="rounded-lg border border-border overflow-auto max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Necessidade</TableHead>
                        <TableHead className="text-right">Saldo Pulmão</TableHead>
                        <TableHead className="text-right">Qtd Abastecer</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Destino</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {simItens.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                          <TableCell className="text-sm truncate max-w-[180px]">{item.descricao}</TableCell>
                          <TableCell className="text-right text-sm">{Number(item.necessidade)}</TableCell>
                          <TableCell className="text-right text-sm">{Number(item.saldo_pulmao)}</TableCell>
                          <TableCell className="text-right text-sm font-bold">{Number(item.qtd_abastecer)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.endereco_origem || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.endereco_destino || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {simAlertas.length > 0 && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-yellow-600">
                    <AlertTriangle size={16} />
                    Alertas ({simAlertas.length})
                  </div>
                  {simAlertas.map((a, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      <span className="font-mono">{a.sku}</span> — {a.descricao}: necessidade {Number(a.necessidade)} — {a.motivo}
                    </div>
                  ))}
                </div>
              )}

              {simItens.length === 0 && simAlertas.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma necessidade de abastecimento identificada.
                </p>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setModalStep("select")}>Voltar</Button>
                <Button onClick={handleGerar} disabled={simItens.length === 0}>
                  Confirmar Geração ({simTotals.total_tarefas} tarefas)
                </Button>
              </DialogFooter>
            </div>
          )}

          {modalStep === "done" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
                <ArrowDownToLine size={24} className="text-green-600" />
              </div>
              <p className="text-sm font-medium text-foreground">Abastecimento gerado com sucesso!</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tarefas de Abastecimento</DialogTitle>
            <DialogDescription>Lista de tarefas vinculadas a este lote de abastecimento.</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" size={24} /></div>
          ) : detailTarefas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa vinculada.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Requerida</TableHead>
                    <TableHead className="text-right">Executada</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailTarefas.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.produto?.sku || "—"}</TableCell>
                      <TableCell className="text-sm truncate max-w-[160px]">{t.produto?.descricao || "—"}</TableCell>
                      <TableCell className="text-right text-sm">{Number(t.quantidade_requerida)}</TableCell>
                      <TableCell className="text-right text-sm">{Number(t.quantidade_executada)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.origem?.descricao || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.destino?.descricao || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadge[t.status] || ""}>{t.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
