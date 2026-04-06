import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Loader2, ArrowLeft, ArrowUpDown, Check } from "lucide-react";

interface SimItem {
  produto_id: string;
  origem: string;
  destino: string;
  quantidade: number;
  sku: string;
  descricao: string;
  endereco_origem_desc: string;
  endereco_destino_desc: string;
  saldo_picking: number;
  saldo_pulmao: number;
  est_minimo: number;
  est_maximo: number;
  em_separacao: number;
  setor_id: string | null;
  setor_descricao: string | null;
}

interface Usuario {
  id: string;
  login: string;
  nome: string;
}

interface AbastecimentoGeracaoPageProps {
  onNavigate: (path: string) => void;
  tipo: string;
  armazemId: string;
}

type SortOrder = "asc" | "desc" | null;

export function AbastecimentoGeracaoPage({ onNavigate, tipo, armazemId }: AbastecimentoGeracaoPageProps) {
  const { tenantId, empresaId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SimItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);
  const [filterSetor, setFilterSetor] = useState<string>("__all__");
  const [generating, setGenerating] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [selectedUsuario, setSelectedUsuario] = useState<string>("");

  // Load simulation data
  useEffect(() => {
    if (!tenantId || !empresaId || !armazemId) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data: result, error } = await (supabase as any).rpc("fn_gerar_abastecimento", {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_armazem_id: armazemId,
          p_tipo: tipo,
          p_usuario_id: localStorage.getItem("core_usuario_id") || "",
          p_simular: true,
        });
        if (error) throw error;
        const parsed: SimItem[] = (result || []).map((r: any) => ({
          ...r,
          quantidade: Number(r.quantidade),
          saldo_picking: Number(r.saldo_picking),
          saldo_pulmao: Number(r.saldo_pulmao),
          est_minimo: Number(r.est_minimo),
          est_maximo: Number(r.est_maximo),
          em_separacao: Number(r.em_separacao),
        }));
        setItems(parsed);
        // Select all by default
        setSelected(new Set(parsed.map((_, i) => i)));
      } catch (e: any) {
        toast.error("Erro na simulação: " + e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId, empresaId, armazemId, tipo]);

  // Load operators
  useEffect(() => {
    if (!tenantId) return;
    (supabase as any)
      .from("usuario")
      .select("id, login, nome")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("nome")
      .then(({ data: u }: any) => setUsuarios(u || []));
  }, [tenantId]);

  // Unique sectors
  const setores = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((i) => {
      if (i.setor_id && i.setor_descricao) map.set(i.setor_id, i.setor_descricao);
    });
    return Array.from(map.entries());
  }, [items]);

  // Filtered + sorted items
  const displayed = useMemo(() => {
    let list = items.map((item, idx) => ({ item, idx }));
    if (filterSetor !== "__all__") {
      list = list.filter(({ item }) => item.setor_id === filterSetor);
    }
    if (sortOrder === "asc") {
      list.sort((a, b) => a.item.saldo_picking - b.item.saldo_picking);
    } else if (sortOrder === "desc") {
      list.sort((a, b) => b.item.saldo_picking - a.item.saldo_picking);
    }
    return list;
  }, [items, filterSetor, sortOrder]);

  const allVisibleSelected = displayed.length > 0 && displayed.every(({ idx }) => selected.has(idx));

  const toggleAll = () => {
    if (allVisibleSelected) {
      const newSet = new Set(selected);
      displayed.forEach(({ idx }) => newSet.delete(idx));
      setSelected(newSet);
    } else {
      const newSet = new Set(selected);
      displayed.forEach(({ idx }) => newSet.add(idx));
      setSelected(newSet);
    }
  };

  const toggleItem = (idx: number) => {
    const newSet = new Set(selected);
    if (newSet.has(idx)) newSet.delete(idx);
    else newSet.add(idx);
    setSelected(newSet);
  };

  const selectedItems = items.filter((_, i) => selected.has(i));
  const totalQtd = selectedItems.reduce((sum, i) => sum + i.quantidade, 0);

  const cycleSortOrder = () => {
    if (sortOrder === null) setSortOrder("asc");
    else if (sortOrder === "asc") setSortOrder("desc");
    else setSortOrder(null);
  };

  const handleConfirmGeneration = async () => {
    if (selectedItems.length === 0) {
      toast.error("Selecione ao menos um item");
      return;
    }
    setAssignOpen(true);
  };

  const handleGenerate = async () => {
    setAssignOpen(false);
    setGenerating(true);
    try {
      const p_itens = selectedItems.map((i) => ({
        produto_id: i.produto_id,
        origem: i.origem,
        destino: i.destino,
        quantidade: i.quantidade,
      }));

      const { data: result, error } = await (supabase as any).rpc("fn_gerar_abastecimento", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_armazem_id: armazemId,
        p_tipo: tipo,
        p_usuario_id: localStorage.getItem("core_usuario_id") || "",
        p_simular: false,
        p_itens: p_itens,
      });
      if (error) throw error;

      const abastId = result?.abastecimento_id;
      const totalTarefas = result?.total_tarefas || selectedItems.length;

      // If user assigned, create tarefa_atribuicao records
      if (selectedUsuario && abastId) {
        const { data: tarefas } = await (supabase as any)
          .from("tarefa")
          .select("id")
          .eq("id_documento_origem", abastId);

        if (tarefas && tarefas.length > 0) {
          const atribuicoes = tarefas.map((t: any) => ({
            tenant_id: tenantId,
            empresa_id: empresaId,
            tarefa_id: t.id,
            usuario_id: selectedUsuario,
            tipo_convocacao: "MANUAL",
            status: "ATRIBUIDA",
          }));
          await (supabase as any).from("tarefa_atribuicao").insert(atribuicoes);

          // Update task status to ATRIBUIDA
          const ids = tarefas.map((t: any) => t.id);
          await (supabase as any)
            .from("tarefa")
            .update({ status: "ATRIBUIDA" })
            .in("id", ids);
        }
      }

      toast.success(`${totalTarefas} tarefa(s) de abastecimento gerada(s)`);
      onNavigate("/atividades/abastecimento");
    } catch (e: any) {
      toast.error("Erro ao gerar: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-sm text-muted-foreground">Simulando abastecimento {tipo.toLowerCase()}...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => onNavigate("/atividades/abastecimento")}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">
            Geração de Abastecimento
            <Badge variant="outline" className="ml-2 text-xs">
              {tipo}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {items.length} item(ns) identificados para abastecimento
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Setor:</span>
          <Select value={filterSetor} onValueChange={setFilterSetor}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {setores.map(([id, desc]) => (
                <SelectItem key={id} value={id}>{desc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={cycleSortOrder}
        >
          <ArrowUpDown size={14} />
          Saldo Picking
          {sortOrder === "asc" && " ↑"}
          {sortOrder === "desc" && " ↓"}
        </Button>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <p className="text-muted-foreground">Nenhuma necessidade de abastecimento identificada.</p>
          <Button variant="outline" onClick={() => onNavigate("/atividades/abastecimento")}>
            Voltar
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card overflow-auto max-h-[calc(100vh-320px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>End. Origem</TableHead>
                  <TableHead>End. Destino</TableHead>
                  <TableHead className="text-right">Saldo Picking</TableHead>
                  <TableHead className="text-right">Saldo Pulmão</TableHead>
                  <TableHead className="text-right">Est. Mínimo</TableHead>
                  <TableHead className="text-right">Est. Máximo</TableHead>
                  <TableHead className="text-right">Em Separação</TableHead>
                  <TableHead className="text-right">Qtd Abastecer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayed.map(({ item, idx }) => (
                  <TableRow
                    key={idx}
                    className={selected.has(idx) ? "bg-primary/5" : ""}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.has(idx)}
                        onCheckedChange={() => toggleItem(idx)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{item.sku}</TableCell>
                    <TableCell className="text-sm truncate max-w-[200px]" title={item.descricao}>
                      {item.descricao}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.endereco_origem_desc}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.endereco_destino_desc}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      <span className={item.saldo_picking <= item.est_minimo ? "text-destructive font-bold" : ""}>
                        {item.saldo_picking}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">{item.saldo_pulmao}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{item.est_minimo}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{item.est_maximo}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{item.em_separacao}</TableCell>
                    <TableCell className="text-right text-sm font-mono font-bold">{item.quantidade}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
            <div className="flex gap-4 text-sm">
              <span className="text-muted-foreground">
                Selecionados: <strong className="text-foreground">{selectedItems.length}</strong> de {items.length}
              </span>
              <span className="text-muted-foreground">
                Qtd Total: <strong className="text-foreground">{totalQtd}</strong>
              </span>
            </div>
            <Button
              onClick={handleConfirmGeneration}
              disabled={selectedItems.length === 0 || generating}
              className="gap-2"
            >
              {generating ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Confirmar Geração ({selectedItems.length} tarefas)
            </Button>
          </div>
        </>
      )}

      {/* Assignment Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atribuir Abastecimento</DialogTitle>
            <DialogDescription>
              Opcionalmente, selecione um operador para atribuir as {selectedItems.length} tarefa(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Operador (opcional)
              </label>
              <Select value={selectedUsuario} onValueChange={setSelectedUsuario}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem atribuição" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem atribuição</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome || u.login}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setAssignOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  if (selectedUsuario === "__none__") setSelectedUsuario("");
                  handleGenerate();
                }}
              >
                Confirmar e Gerar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
