import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, GripVertical, Settings2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";

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
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const [agrupamentos, setAgrupamentos] = useState<AgrupamentoItem[]>([]);
  const [agrupConf, setAgrupConf] = useState<AgrupamentoItem[]>([]);
  const [ordens, setOrdens] = useState<OrdemItem[]>([]);
  const [ruasDisponiveis, setRuasDisponiveis] = useState<number[]>([]);
  const [loadingAgrup, setLoadingAgrup] = useState(true);
  const [loadingAgrupConf, setLoadingAgrupConf] = useState(true);
  const [loadingOrdem, setLoadingOrdem] = useState(false);
  const [loadingRuas, setLoadingRuas] = useState(false);

  const [activeSheet, setActiveSheet] = useState<"separacao" | "conferencia" | "ordem" | null>(null);
  const [filtroArmazemId, setFiltroArmazemId] = useState<string>("");
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);

  // Drag state
  const [dragType, setDragType] = useState<"agrup" | "agrupConf" | "ordem" | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

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
    if (filtroArmazemId) {
      query = query.or(`armazem_id.eq.${filtroArmazemId},armazem_id.is.null`);
    }
    const { data, error } = await query;
    if (!error) setOrdens(data || []);
    setLoadingOrdem(false);
  }, [tenantId, empresaId, filtroArmazemId]);

  const fetchRuasArmazem = useCallback(async () => {
    if (!tenantId || !filtroArmazemId) { setRuasDisponiveis([]); return; }
    setLoadingRuas(true);
    const { data } = await (supabase as any)
      .from("endereco")
      .select("rua, setor!inner(armazem_id)")
      .eq("tenant_id", tenantId)
      .eq("setor.armazem_id", filtroArmazemId)
      .not("rua", "is", null);
    if (data) {
      const ruas = [...new Set(data.map((d: any) => Number(d.rua)))].sort((a: number, b: number) => a - b) as number[];
      setRuasDisponiveis(ruas);
    }
    setLoadingRuas(false);
  }, [tenantId, filtroArmazemId]);

  useEffect(() => {
    fetchAgrupamentos();
    fetchAgrupConf();
  }, [fetchAgrupamentos, fetchAgrupConf, empresaVersion]);

  useEffect(() => {
    fetchOrdens();
    fetchRuasArmazem();
  }, [fetchOrdens, fetchRuasArmazem, empresaVersion]);

  // Fetch armazém options (empresa scope)
  useEffect(() => {
    if (!tenantId || !empresaId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("armazem")
        .select("id, descricao")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("descricao");
      if (data) setArmazemOptions(data.map((a: any) => ({ value: a.id, label: a.descricao })));
    })();
  }, [tenantId, empresaId, empresaVersion]);

  // --- CRUD helpers ---
  const addAgrupamentoValue = async (value: string) => {
    const seq = agrupamentos.length + 1;
    const { error } = await (supabase as any).from("agrupamento_separacao").insert({
      tenant_id: tenantId, empresa_id: empresaId, tipo_agrupamento: value, sequencia: seq,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Agrupamento adicionado.");
    fetchAgrupamentos();
  };

  const removeAgrupamento = async (id: string) => {
    await (supabase as any).from("agrupamento_separacao").delete().eq("id", id);
    toast.success("Removido.");
    fetchAgrupamentos();
  };

  const addAgrupConfValue = async (value: string) => {
    const seq = agrupConf.length + 1;
    const { error } = await (supabase as any).from("agrupamento_conferencia").insert({
      tenant_id: tenantId, empresa_id: empresaId, tipo_agrupamento: value, sequencia: seq,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Agrupamento adicionado.");
    fetchAgrupConf();
  };

  const removeAgrupConf = async (id: string) => {
    await (supabase as any).from("agrupamento_conferencia").delete().eq("id", id);
    toast.success("Removido.");
    fetchAgrupConf();
  };

  const addOrdem = async (rua: number, ordem: string) => {
    if (!filtroArmazemId) { toast.error("Selecione um armazém."); return; }
    const seq = ordens.length + 1;
    const { error } = await (supabase as any).from("ordem_expedicao").insert({
      tenant_id: tenantId, empresa_id: empresaId, armazem_id: filtroArmazemId,
      rua, ordem, sequencia: seq,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Rua adicionada.");
    fetchOrdens();
  };

  const removeOrdem = async (id: string) => {
    await (supabase as any).from("ordem_expedicao").delete().eq("id", id);
    toast.success("Removido.");
    fetchOrdens();
  };

  // --- Drag & Drop ---
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

  // --- Resumos inline ---
  const resumoSep = agrupamentos.length > 0
    ? [...agrupamentos].sort((a, b) => a.sequencia - b.sequencia)
        .map((a) => AGRUPAMENTO_SEP_OPTIONS.find((o) => o.value === a.tipo_agrupamento)?.label || a.tipo_agrupamento)
        .join(" | ")
    : "Nenhum agrupamento configurado";

  const resumoConf = agrupConf.length > 0
    ? [...agrupConf].sort((a, b) => a.sequencia - b.sequencia)
        .map((a) => AGRUPAMENTO_CONF_OPTIONS.find((o) => o.value === a.tipo_agrupamento)?.label || a.tipo_agrupamento)
        .join(" | ")
    : "Nenhum agrupamento configurado";

  const resumoOrdem = ordens.length > 0
    ? [...ordens].sort((a, b) => a.sequencia - b.sequencia)
        .map((o) => `Rua ${o.rua} (${o.ordem === "ASC" ? "↑" : "↓"})`)
        .join(" | ")
    : "Nenhuma ordem configurada";

  // --- Renderers ---
  const renderCard = (
    title: string,
    resumo: string,
    onOpen: () => void,
    loading: boolean,
  ) => (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {loading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Carregando...
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1 break-words">{resumo}</p>
          )}
        </div>
        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary transition-colors flex-shrink-0"
        >
          <Settings2 size={13} /> Configurar
        </button>
      </div>
    </div>
  );

  const renderAgrupamentoSheet = () => {
    const isSep = activeSheet === "separacao";
    const items = isSep ? agrupamentos : agrupConf;
    const options = isSep ? AGRUPAMENTO_SEP_OPTIONS : AGRUPAMENTO_CONF_OPTIONS;
    const onAdd = isSep ? addAgrupamentoValue : addAgrupConfValue;
    const onRemove = isSep ? removeAgrupamento : removeAgrupConf;
    const dragKey: "agrup" | "agrupConf" = isSep ? "agrup" : "agrupConf";
    const onDrop = isSep ? handleDropAgrup : handleDropAgrupConf;

    const marcados = options
      .filter((o) => items.some((i) => i.tipo_agrupamento === o.value))
      .sort((a, b) => {
        const seqA = items.find((i) => i.tipo_agrupamento === a.value)?.sequencia || 999;
        const seqB = items.find((i) => i.tipo_agrupamento === b.value)?.sequencia || 999;
        return seqA - seqB;
      });
    const desmarcados = options
      .filter((o) => !items.some((i) => i.tipo_agrupamento === o.value))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [...marcados, ...desmarcados].map((option) => {
      const item = items.find((i) => i.tipo_agrupamento === option.value);
      const isMarcado = !!item;
      const marcadoIdx = marcados.findIndex((m) => m.value === option.value);

      return (
        <div
          key={option.value}
          draggable={isMarcado}
          onDragStart={() => isMarcado && handleDragStart(dragKey, marcadoIdx)}
          onDragOver={handleDragOver}
          onDrop={() => isMarcado && onDrop(marcadoIdx)}
          className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
            isMarcado
              ? "bg-primary/5 border border-primary/20 cursor-grab active:cursor-grabbing"
              : "hover:bg-secondary/30 border border-transparent"
          }`}
        >
          {isMarcado ? (
            <GripVertical size={14} className="text-muted-foreground/50 flex-shrink-0" />
          ) : (
            <span className="w-[14px] flex-shrink-0" />
          )}
          <Checkbox
            checked={isMarcado}
            onCheckedChange={(checked) => {
              if (checked) onAdd(option.value);
              else if (item?.id) onRemove(item.id);
            }}
          />
          <span className="text-sm text-foreground flex-1">{option.label}</span>
          {isMarcado && (
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
              {item?.sequencia || "—"}
            </span>
          )}
        </div>
      );
    });
  };

  const renderOrdemSheet = () => {
    if (!filtroArmazemId) {
      return (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Selecione um armazém para configurar a ordem.
        </div>
      );
    }
    if (loadingRuas || loadingOrdem) {
      return (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (ruasDisponiveis.length === 0) {
      return (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma rua cadastrada neste armazém.
        </div>
      );
    }

    const marcadas = [...ordens]
      .filter((o) => ruasDisponiveis.includes(Number(o.rua)))
      .sort((a, b) => a.sequencia - b.sequencia);
    const desmarcadas = ruasDisponiveis.filter((r) => !ordens.some((o) => Number(o.rua) === r));

    return (
      <>
        {marcadas.map((item, idx) => (
          <div
            key={`m-${item.id}`}
            draggable
            onDragStart={() => handleDragStart("ordem", idx)}
            onDragOver={handleDragOver}
            onDrop={() => handleDropOrdem(idx)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg bg-primary/5 border border-primary/20 cursor-grab active:cursor-grabbing transition-colors"
          >
            <GripVertical size={14} className="text-muted-foreground/50 flex-shrink-0" />
            <Checkbox
              checked
              onCheckedChange={(checked) => { if (!checked && item.id) removeOrdem(item.id); }}
            />
            <span className="text-sm text-foreground flex-1">Rua {item.rua}</span>
            <select
              value={item.ordem || "ASC"}
              onChange={async (e) => {
                await (supabase as any)
                  .from("ordem_expedicao")
                  .update({ ordem: e.target.value })
                  .eq("id", item.id);
                fetchOrdens();
              }}
              className="h-8 px-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none cursor-pointer"
            >
              <option value="ASC">Crescente ↑</option>
              <option value="DESC">Decrescente ↓</option>
            </select>
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
              {item.sequencia}
            </span>
          </div>
        ))}
        {desmarcadas.map((r) => (
          <div
            key={`d-${r}`}
            className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary/30 border border-transparent transition-colors"
          >
            <span className="w-[14px] flex-shrink-0" />
            <Checkbox
              checked={false}
              onCheckedChange={(checked) => { if (checked) addOrdem(r, "ASC"); }}
            />
            <span className="text-sm text-foreground flex-1">Rua {r}</span>
          </div>
        ))}
      </>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-foreground">Roteiro de Separação e Conferência</h1>
        <p className="text-xs text-muted-foreground">Configure os agrupamentos e a ordem de separação por rua.</p>
      </div>

      <div className="flex flex-col gap-4">
        {renderCard("Agrupamento de Separação", resumoSep, () => setActiveSheet("separacao"), loadingAgrup)}
        {renderCard("Agrupamento de Conferência", resumoConf, () => setActiveSheet("conferencia"), loadingAgrupConf)}
        {renderCard("Ordem de Separação", resumoOrdem, () => setActiveSheet("ordem"), loadingOrdem)}
      </div>

      {/* Sheet Agrupamento (Separação / Conferência) */}
      <Sheet
        open={activeSheet === "separacao" || activeSheet === "conferencia"}
        onOpenChange={(v) => !v && setActiveSheet(null)}
      >
        <SheetContent side="right" className="sm:max-w-[480px] w-full p-0 flex flex-col bg-card">
          <SheetHeader className="px-6 pt-6 pb-3 text-left">
            <SheetTitle className="text-lg font-bold">
              {activeSheet === "separacao" ? "Agrupamento de Separação" : "Agrupamento de Conferência"}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Marque os critérios de agrupamento. A ordem define a prioridade na geração da onda.
            </p>
          </SheetHeader>
          <Separator />
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="space-y-1">
              {activeSheet && renderAgrupamentoSheet()}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Sheet Ordem */}
      <Sheet open={activeSheet === "ordem"} onOpenChange={(v) => !v && setActiveSheet(null)}>
        <SheetContent side="right" className="sm:max-w-[480px] w-full p-0 flex flex-col bg-card">
          <SheetHeader className="px-6 pt-6 pb-3 text-left">
            <SheetTitle className="text-lg font-bold">Ordem de Separação</SheetTitle>
            <p className="text-xs text-muted-foreground">
              Selecione as ruas e defina a ordem de percurso do separador.
            </p>
          </SheetHeader>
          <Separator />
          <div className="px-6 py-3 border-b border-border">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Armazém</label>
            <select
              value={filtroArmazemId}
              onChange={(e) => setFiltroArmazemId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">Selecione o armazém...</option>
              {armazemOptions.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="space-y-1">
              {renderOrdemSheet()}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
