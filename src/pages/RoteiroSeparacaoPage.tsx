import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const AGRUPAMENTO_SEP_OPTIONS = [
  { value: "DOCUMENTO", label: "Documento" },
  { value: "PRODUTO", label: "Produto" },
  { value: "PARCEIRO", label: "Parceiro" },
  { value: "ROTA", label: "Rota" },
  { value: "ZONA_ATIVIDADE", label: "Zona de Atividade" },
  { value: "TIPO_POSICAO", label: "Tipo de Posição" },
  { value: "TIPO_SEP_SKU", label: "Tipo Separação SKU" },
  { value: "CAPACDADE_HU", label: "Capacidade HU" },
  { value: "QUANTIDADE_MAX_SKU", label: "Quantidade Máx SKU" },
];

const AGRUPAMENTO_CONF_OPTIONS = [
  { value: "DOCUMENTO", label: "Documento" },
  { value: "HU", label: "HU" },
  { value: "BOX", label: "Box" },
  { value: "ROTA", label: "Rota" },
];

const ORDENACAO_OPTIONS = [
  { value: "ASC", label: "Crescente" },
  { value: "DESC", label: "Decrescente" },
];

interface AgrupamentoItem {
  id?: string;
  tipo_agrupamento: string;
  sequencia: number;
}

interface OrdemItem {
  id?: string;
  rua: number | null;
  ordem: string;
  sequencia: number;
}

export function RoteiroSeparacaoPage() {
  const { tenantId, empresaId, armazemId, empresaVersion } = useTenant();
  const [armazemNome, setArmazemNome] = useState<string>("");
  const [agrupamentos, setAgrupamentos] = useState<AgrupamentoItem[]>([]);
  const [agrupConf, setAgrupConf] = useState<AgrupamentoItem[]>([]);
  const [ordens, setOrdens] = useState<OrdemItem[]>([]);
  const [ruasDisponiveis, setRuasDisponiveis] = useState<number[]>([]);
  const [loadingAgrup, setLoadingAgrup] = useState(true);
  const [loadingAgrupConf, setLoadingAgrupConf] = useState(true);
  const [loadingOrdem, setLoadingOrdem] = useState(true);
  const [loadingRuas, setLoadingRuas] = useState(false);

  // Modals
  const [showAgrupModal, setShowAgrupModal] = useState(false);
  const [agrupForm, setAgrupForm] = useState({ tipo_agrupamento: "" });
  const [showAgrupConfModal, setShowAgrupConfModal] = useState(false);
  const [agrupConfForm, setAgrupConfForm] = useState({ tipo_agrupamento: "" });
  const [showOrdemModal, setShowOrdemModal] = useState(false);
  const [ordemForm, setOrdemForm] = useState({ rua: "", ordem: "ASC" });

  // Drag state
  const [dragType, setDragType] = useState<"agrup" | "agrupConf" | "ordem" | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!armazemId) { setArmazemNome(""); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from("armazem")
        .select("descricao")
        .eq("id", armazemId)
        .single();
      if (data) setArmazemNome(data.descricao);
    })();
  }, [armazemId]);

  const fetchAgrupamentos = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoadingAgrup(true);
    const { data, error } = await (supabase as any)
      .from("agrupamento_separacao")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("empresa_id", empresaId)
      .order("sequencia", { ascending: true });
    if (!error) setAgrupamentos(data || []);
    setLoadingAgrup(false);
  }, [tenantId, empresaId]);

  const fetchAgrupConf = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoadingAgrupConf(true);
    const { data, error } = await (supabase as any)
      .from("agrupamento_conferencia")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("empresa_id", empresaId)
      .order("sequencia", { ascending: true });
    if (!error) setAgrupConf(data || []);
    setLoadingAgrupConf(false);
  }, [tenantId, empresaId]);

  const fetchOrdens = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoadingOrdem(true);
    let query = (supabase as any)
      .from("ordem_expedicao")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("empresa_id", empresaId)
      .order("sequencia", { ascending: true });
    if (armazemId) {
      query = query.or(`armazem_id.eq.${armazemId},armazem_id.is.null`);
    }
    const { data, error } = await query;
    if (!error) setOrdens(data || []);
    setLoadingOrdem(false);
  }, [tenantId, empresaId, armazemId]);

  const fetchRuasArmazem = useCallback(async () => {
    if (!tenantId || !armazemId) { setRuasDisponiveis([]); return; }
    setLoadingRuas(true);
    const { data } = await (supabase as any)
      .from("endereco")
      .select("rua, setor!inner(armazem_id)")
      .eq("tenant_id", tenantId)
      .eq("setor.armazem_id", armazemId)
      .not("rua", "is", null);
    if (data) {
      const ruas = [...new Set(data.map((d: any) => Number(d.rua)))].sort((a: number, b: number) => a - b) as number[];
      setRuasDisponiveis(ruas);
    }
    setLoadingRuas(false);
  }, [tenantId, armazemId]);

  useEffect(() => {
    fetchAgrupamentos();
    fetchAgrupConf();
    fetchOrdens();
    fetchRuasArmazem();
  }, [fetchAgrupamentos, fetchAgrupConf, fetchOrdens, fetchRuasArmazem, empresaVersion]);


  // Agrupamento Separação CRUD
  const addAgrupamento = async () => {
    if (!agrupForm.tipo_agrupamento) { toast.error("Selecione o tipo de agrupamento."); return; }
    const seq = agrupamentos.length + 1;
    const { error } = await (supabase as any).from("agrupamento_separacao").insert({
      tenant_id: tenantId, empresa_id: empresaId, tipo_agrupamento: agrupForm.tipo_agrupamento, sequencia: seq,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Agrupamento adicionado.");
    setShowAgrupModal(false);
    fetchAgrupamentos();
  };

  const removeAgrupamento = async (id: string) => {
    await (supabase as any).from("agrupamento_separacao").delete().eq("id", id);
    toast.success("Removido.");
    fetchAgrupamentos();
  };

  // Agrupamento Conferência CRUD
  const addAgrupConf = async () => {
    if (!agrupConfForm.tipo_agrupamento) { toast.error("Selecione o tipo de agrupamento."); return; }
    const seq = agrupConf.length + 1;
    const { error } = await (supabase as any).from("agrupamento_conferencia").insert({
      tenant_id: tenantId, empresa_id: empresaId, tipo_agrupamento: agrupConfForm.tipo_agrupamento, sequencia: seq,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Agrupamento adicionado.");
    setShowAgrupConfModal(false);
    fetchAgrupConf();
  };

  const removeAgrupConf = async (id: string) => {
    await (supabase as any).from("agrupamento_conferencia").delete().eq("id", id);
    toast.success("Removido.");
    fetchAgrupConf();
  };

  // Ordem CRUD
  const addOrdem = async () => {
    if (!ordemForm.rua) { toast.error("Informe a rua."); return; }
    const seq = ordens.length + 1;
    const { error } = await (supabase as any).from("ordem_expedicao").insert({
      tenant_id: tenantId, empresa_id: empresaId, rua: Number(ordemForm.rua), ordem: ordemForm.ordem, sequencia: seq,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Ordem adicionada.");
    setShowOrdemModal(false);
    fetchOrdens();
  };

  const removeOrdem = async (id: string) => {
    await (supabase as any).from("ordem_expedicao").delete().eq("id", id);
    toast.success("Removido.");
    fetchOrdens();
  };

  // Drag & Drop handlers
  const handleDragStart = (type: "agrup" | "agrupConf" | "ordem", idx: number) => {
    setDragType(type);
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const handleDropAgrup = async (targetIdx: number) => {
    if (dragType !== "agrup" || dragIdx === null || dragIdx === targetIdx) return;
    const newList = [...agrupamentos];
    const [moved] = newList.splice(dragIdx, 1);
    newList.splice(targetIdx, 0, moved);
    setAgrupamentos(newList);
    setDragIdx(null); setDragType(null);
    await Promise.all(newList.map((item, i) =>
      (supabase as any).from("agrupamento_separacao").update({ sequencia: i + 1 }).eq("id", item.id)
    ));
  };

  const handleDropAgrupConf = async (targetIdx: number) => {
    if (dragType !== "agrupConf" || dragIdx === null || dragIdx === targetIdx) return;
    const newList = [...agrupConf];
    const [moved] = newList.splice(dragIdx, 1);
    newList.splice(targetIdx, 0, moved);
    setAgrupConf(newList);
    setDragIdx(null); setDragType(null);
    await Promise.all(newList.map((item, i) =>
      (supabase as any).from("agrupamento_conferencia").update({ sequencia: i + 1 }).eq("id", item.id)
    ));
  };

  const handleDropOrdem = async (targetIdx: number) => {
    if (dragType !== "ordem" || dragIdx === null || dragIdx === targetIdx) return;
    const newList = [...ordens];
    const [moved] = newList.splice(dragIdx, 1);
    newList.splice(targetIdx, 0, moved);
    setOrdens(newList);
    setDragIdx(null); setDragType(null);
    await Promise.all(newList.map((item, i) =>
      (supabase as any).from("ordem_expedicao").update({ sequencia: i + 1 }).eq("id", item.id)
    ));
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary";

  const renderDragList = (
    title: string,
    items: AgrupamentoItem[],
    loading: boolean,
    options: { value: string; label: string }[],
    onAdd: () => void,
    onRemove: (id: string) => void,
    dragTypeKey: "agrup" | "agrupConf",
    onDrop: (idx: number) => void,
  ) => (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h2>
        <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
          <Plus size={13} /> Adicionar
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Nenhum agrupamento configurado.</div>
      ) : (
        <div className="divide-y divide-border/50">
          {items.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(dragTypeKey, idx)}
              onDragOver={handleDragOver}
              onDrop={() => onDrop(idx)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-grab active:cursor-grabbing"
            >
              <GripVertical size={14} className="text-muted-foreground/50 flex-shrink-0" />
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
              <span className="text-sm text-foreground flex-1">
                {options.find((o) => o.value === item.tipo_agrupamento)?.label || item.tipo_agrupamento}
              </span>
              <button onClick={() => onRemove(item.id!)} className="p-1 rounded hover:bg-destructive/10 transition-colors">
                <Trash2 size={13} className="text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-foreground">Roteiro de Separação e Conferência</h1>
        <p className="text-xs text-muted-foreground">Configure agrupamentos e ordem de separação. Arraste para reordenar.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agrupamento Separação */}
        {renderDragList(
          "Agrupamento de Separação",
          agrupamentos, loadingAgrup,
          AGRUPAMENTO_SEP_OPTIONS,
          () => { setAgrupForm({ tipo_agrupamento: "" }); setShowAgrupModal(true); },
          removeAgrupamento, "agrup", handleDropAgrup,
        )}

        {/* Agrupamento Conferência */}
        {renderDragList(
          "Agrupamento de Conferência",
          agrupConf, loadingAgrupConf,
          AGRUPAMENTO_CONF_OPTIONS,
          () => { setAgrupConfForm({ tipo_agrupamento: "" }); setShowAgrupConfModal(true); },
          removeAgrupConf, "agrupConf", handleDropAgrupConf,
        )}

        {/* Ordem de Separação */}
        <div className="card-surface overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Ordem de Separação</h2>
            <button
              onClick={() => { setOrdemForm({ rua: "", ordem: "ASC" }); setShowOrdemModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={13} /> Adicionar
            </button>
          </div>
          {loadingOrdem ? (
            <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
          ) : ordens.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma ordem configurada.</div>
          ) : (
            <div className="divide-y divide-border/50">
              {ordens.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart("ordem", idx)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDropOrdem(idx)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-grab active:cursor-grabbing"
                >
                  <GripVertical size={14} className="text-muted-foreground/50 flex-shrink-0" />
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                  <span className="text-sm text-foreground flex-1">
                    Rua {item.rua} — {item.ordem === "ASC" ? "Crescente" : "Decrescente"}
                  </span>
                  <button onClick={() => removeOrdem(item.id!)} className="p-1 rounded hover:bg-destructive/10 transition-colors">
                    <Trash2 size={13} className="text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Agrupamento Separação */}
      <Dialog open={showAgrupModal} onOpenChange={setShowAgrupModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Agrupamento de Separação</DialogTitle></DialogHeader>
          <div className="py-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Tipo de Agrupamento *</label>
            <select value={agrupForm.tipo_agrupamento} onChange={(e) => setAgrupForm({ tipo_agrupamento: e.target.value })} className={inputClass}>
              <option value="">Selecione...</option>
              {AGRUPAMENTO_SEP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <DialogFooter>
            <button onClick={() => setShowAgrupModal(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={addAgrupamento} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Adicionar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Agrupamento Conferência */}
      <Dialog open={showAgrupConfModal} onOpenChange={setShowAgrupConfModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Agrupamento de Conferência</DialogTitle></DialogHeader>
          <div className="py-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Tipo de Agrupamento *</label>
            <select value={agrupConfForm.tipo_agrupamento} onChange={(e) => setAgrupConfForm({ tipo_agrupamento: e.target.value })} className={inputClass}>
              <option value="">Selecione...</option>
              {AGRUPAMENTO_CONF_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <DialogFooter>
            <button onClick={() => setShowAgrupConfModal(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={addAgrupConf} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Adicionar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ordem */}
      <Dialog open={showOrdemModal} onOpenChange={setShowOrdemModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Ordem de Separação</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Rua *</label>
              <input type="number" value={ordemForm.rua} onChange={(e) => setOrdemForm({ ...ordemForm, rua: e.target.value })} className={inputClass} placeholder="1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Ordenação *</label>
              <select value={ordemForm.ordem} onChange={(e) => setOrdemForm({ ...ordemForm, ordem: e.target.value })} className={inputClass}>
                {ORDENACAO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowOrdemModal(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={addOrdem} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Adicionar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
