import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { Loader2, ArrowDownToLine, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/utils/dateTime";

interface Props { onNavigate: (path: string) => void; }

const TIPO_TAREFA_ABAST = "172beee9-65ac-44dc-95a2-36b67b4aebbe";

interface TarefaAbast {
  id: string;
  produto_id: string;
  produto_desc: string;
  produto_sku: string;
  quantidade_requerida: number;
  quantidade_executada: number;
  status: string;
  criado_em: string;
  endereco_origem_id: string;
  endereco_origem: string;
  endereco_destino_id: string;
  endereco_destino: string;
  endereco_destino_rua: number;
  prioridade_tarefa: string;
}

export function AbastecimentoListPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const [loading, setLoading] = useState(true);
  const [tarefas, setTarefas] = useState<TarefaAbast[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadTarefas = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("tarefa")
      .select("id, produto_id, quantidade_requerida, quantidade_executada, status, criado_em, id_local_origem, id_local_destino, prioridade_tarefa, produto:produto_id(sku, descricao), origem:id_local_origem(descricao), destino:id_local_destino(descricao, rua)")
      .eq("tenant_id", tenantId)
      .eq("empresa_id", empresaId)
      .eq("tipo_tarefa_id", TIPO_TAREFA_ABAST)
      .in("status", ["CRIADA", "ATRIBUIDA", "EM_ANDAMENTO"])
      .order("criado_em", { ascending: false });

    setTarefas((data || []).map((t: any) => ({
      id: t.id,
      produto_id: t.produto_id,
      produto_desc: t.produto?.descricao || "—",
      produto_sku: t.produto?.sku || "—",
      quantidade_requerida: Number(t.quantidade_requerida),
      quantidade_executada: Number(t.quantidade_executada || 0),
      status: t.status,
      criado_em: t.criado_em,
      endereco_origem_id: t.id_local_origem,
      endereco_origem: t.origem?.descricao || "—",
      endereco_destino_id: t.id_local_destino,
      endereco_destino: t.destino?.descricao || "—",
      endereco_destino_rua: t.destino?.rua || 0,
      prioridade_tarefa: t.prioridade_tarefa || "NORMAL",
    })));
    setLoading(false);
  }, [tenantId, empresaId]);

  useEffect(() => {
    loadTarefas();
  }, [loadTarefas]);

  const statusColor: Record<string, string> = {
    CRIADA: "bg-red-500/20 text-red-300",
    ATRIBUIDA: "bg-blue-500/20 text-blue-300",
    EM_ANDAMENTO: "bg-yellow-500/20 text-yellow-300",
  };

  const prioridadeColor: Record<string, string> = {
    URGENTE: "text-red-400",
    ALTA: "text-orange-400",
    NORMAL: "text-blue-400",
    BAIXA: "text-muted-foreground",
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === tarefas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tarefas.map(t => t.id)));
    }
  };

  const handleIniciarColeta = () => {
    if (selectedIds.size === 0) {
      toast.warning("Selecione pelo menos uma tarefa.");
      return;
    }

    const selected = tarefas.filter(t => selectedIds.has(t.id));
    // Sort by endereco_destino_rua ASC
    selected.sort((a, b) => a.endereco_destino_rua - b.endereco_destino_rua);

    const tarefasInfo = selected.map(t => ({
      id: t.id,
      produto_id: t.produto_id,
      produto_sku: t.produto_sku,
      produto_desc: t.produto_desc,
      endereco_origem_id: t.endereco_origem_id,
      endereco_origem_desc: t.endereco_origem,
      endereco_destino_id: t.endereco_destino_id,
      endereco_destino_desc: t.endereco_destino,
      endereco_destino_rua: t.endereco_destino_rua,
      quantidade_requerida: t.quantidade_requerida,
      quantidade_executada: t.quantidade_executada,
    }));

    sessionStorage.setItem("abast_tarefas", JSON.stringify(tarefasInfo));
    sessionStorage.removeItem("abast_coletas");
    onNavigate("/coletor/movimentos/abastecimento/coleta");
  };

  return (
    <ColetorLayout title="Abastecimento" onNavigate={onNavigate} showBack backPath="/coletor/movimentos">
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : tarefas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <ArrowDownToLine size={40} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma tarefa de abastecimento pendente.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{tarefas.length} tarefa(s) pendente(s)</p>
            <button
              onClick={toggleSelectAll}
              className="text-xs text-primary font-medium"
            >
              {selectedIds.size === tarefas.length ? "Desmarcar Todas" : "Selecionar Todas"}
            </button>
          </div>
          {tarefas.map((t) => (
            <div
              key={t.id}
              className={`bg-card border rounded-xl p-3 transition-all ${selectedIds.has(t.id) ? "border-primary bg-primary/5" : "border-border"}`}
              onClick={() => toggleSelect(t.id)}
            >
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <Checkbox
                    checked={selectedIds.has(t.id)}
                    onCheckedChange={() => toggleSelect(t.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-primary">{t.produto_sku}</p>
                      <p className="text-sm text-foreground truncate">{t.produto_desc}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold ${prioridadeColor[t.prioridade_tarefa] || "text-muted-foreground"}`}>
                        {t.prioridade_tarefa}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor[t.status] || "bg-muted text-muted-foreground"}`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">Qtd: <span className="text-foreground font-bold">{t.quantidade_requerida}</span></span>
                    <span className="text-[10px] text-muted-foreground">{formatDate(t.criado_em)}</span>
                  </div>
                  <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground">
                    <span>Origem: <span className="text-foreground/70">{t.endereco_origem}</span></span>
                    <span>Destino: <span className="text-foreground/70">{t.endereco_destino}</span></span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sticky action button */}
      {tarefas.length > 0 && selectedIds.size > 0 && (
        <div className="shrink-0">
          <ActionButton onClick={handleIniciarColeta}>
            <PackageCheck size={20} /> Iniciar Coleta ({selectedIds.size} selecionada{selectedIds.size > 1 ? "s" : ""})
          </ActionButton>
        </div>
      )}
    </ColetorLayout>
  );
}
