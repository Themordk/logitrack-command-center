import { useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/StatusBadge";
import { Save, Loader2 } from "lucide-react";
import { parseError } from "@/lib/errorMapper";

interface TipoTarefa {
  id: string;
  codigo: string;
  descricao: string;
  ativo: boolean;
  categoria: string | null;
  tipo_movimento: number | null;
  tempo_estimado_segundos: number | null;
  meta_unidades_hora: number | null;
  meta_tarefas_hora: number | null;
  unidade_medida: string | null;
  peso_produtividade: number;
  cor_interface: string | null;
  empresa_id: string | null;
}

const TIPO_MOV_OPTS = [
  { value: 1, label: "Entrada" },
  { value: 2, label: "Saída" },
  { value: 3, label: "Transferência" },
];

const CATEGORIA_OPTS = [
  "RECEBIMENTO",
  "ARMAZENAGEM",
  "ABASTECIMENTO",
  "MOVIMENTACAO",
  "SEPARACAO",
  "CONFERENCIA",
  "EXPEDICAO",
  "INVENTARIO",
  "AUDITORIA",
  "OUTROS",
];

const CATEGORIA_BADGE: Record<string, string> = {
  RECEBIMENTO: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  ARMAZENAGEM: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  SEPARACAO: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  CONFERENCIA: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  EXPEDICAO: "bg-green-500/15 text-green-400 border-green-500/30",
  ABASTECIMENTO: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  INVENTARIO: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  MOVIMENTACAO: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  AUDITORIA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  OUTROS: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

function tipoMovLabel(v: number | null | undefined) {
  return TIPO_MOV_OPTS.find((o) => o.value === Number(v))?.label ?? "—";
}

export function TiposTarefaPage() {
  const { tenantId } = useTenant();
  const [data, setData] = useState<TipoTarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [editItem, setEditItem] = useState<TipoTarefa | null>(null);

  const load = async () => {
    if (!tenantId) { setData([]); setLoading(false); return; }
    setLoading(true);
    const { data: rows, error } = await (supabase as any)
      .from("tipo_tarefa")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("codigo");
    if (error) toast.error(parseError(error, "carregar tipos-tarefa").title);
    setData(rows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const filtered = data.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.codigo || "").toLowerCase().includes(s) || (r.descricao || "").toLowerCase().includes(s);
  });
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const columns: ColumnSpec[] = [
    { key: "codigo", label: "Código", type: "mono" },
    { key: "descricao", label: "Descrição" },
    {
      key: "categoria", label: "Categoria",
      render: (r) => r.categoria ? (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${CATEGORIA_BADGE[r.categoria] || CATEGORIA_BADGE.OUTROS}`}>
          {r.categoria}
        </span>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "tipo_movimento", label: "Movimento",
      render: (r) => <span className="text-sm text-muted-foreground">{tipoMovLabel(r.tipo_movimento)}</span>,
    },
    {
      key: "tempo_estimado_segundos", label: "SET (s)",
      render: (r) => <span className="text-sm text-muted-foreground">{r.tempo_estimado_segundos ?? "—"}</span>,
    },
    {
      key: "meta_unidades_hora", label: "Meta un./hora",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.meta_unidades_hora != null ? `${r.meta_unidades_hora} ${r.unidade_medida || ""}/h` : "—"}
        </span>
      ),
    },
    {
      key: "peso_produtividade", label: "Peso",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.peso_produtividade != null ? Number(r.peso_produtividade).toFixed(1) : "—"}
        </span>
      ),
    },
    {
      key: "ativo", label: "Ativo",
      render: (r) => <StatusBadge status={r.ativo ? "Sim" : "Não"} type="generic" />,
    },
  ];

  return (
    <>
      <CrudTable
        title="Tipos de Tarefa"
        subtitle={`${total} tipos de tarefa configurados`}
        columns={columns}
        data={paged}
        loading={loading}
        search={search}
        onSearchChange={(s) => { setSearch(s); setPage(1); }}
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onNew={() => {}}
        onEdit={(row) => setEditItem(row)}
        onDelete={() => {}}
        searchPlaceholder="Buscar por código ou descrição..."
        canCreate={false}
        canDelete={false}
      />
      <TipoTarefaEditModal
        item={editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => { setEditItem(null); load(); }}
      />
    </>
  );
}

function TipoTarefaEditModal({
  item, onClose, onSaved,
}: { item: TipoTarefa | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<TipoTarefa>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) setForm({ ...item });
  }, [item]);

  const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-60 disabled:cursor-not-allowed";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide";
  const sectionTitle = "text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3";

  const set = (k: keyof TipoTarefa, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    const payload = {
      categoria: form.categoria || null,
      tipo_movimento: form.tipo_movimento ? Number(form.tipo_movimento) : null,
      ativo: form.ativo !== false,
      tempo_estimado_segundos: form.tempo_estimado_segundos === null || form.tempo_estimado_segundos === undefined || form.tempo_estimado_segundos === ("" as any) ? null : Number(form.tempo_estimado_segundos),
      meta_unidades_hora: form.meta_unidades_hora === null || form.meta_unidades_hora === undefined || form.meta_unidades_hora === ("" as any) ? null : Number(form.meta_unidades_hora),
      meta_tarefas_hora: form.meta_tarefas_hora === null || form.meta_tarefas_hora === undefined || form.meta_tarefas_hora === ("" as any) ? null : Number(form.meta_tarefas_hora),
      unidade_medida: form.unidade_medida || null,
      peso_produtividade: form.peso_produtividade ? Number(form.peso_produtividade) : 1.0,
      cor_interface: form.cor_interface || null,
    };
    const { error } = await (supabase as any).from("tipo_tarefa").update(payload).eq("id", item.id);
    setSaving(false);
    if (error) { toast.error(parseError(error, "salvar tipo-tarefa").title); return; }
    toast.success("Tipo de tarefa atualizado!");
    onSaved();
  };

  const corAtual = form.cor_interface || "#6366f1";

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Tipo de Tarefa</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {/* Seção 1 — Configuração operacional */}
          <h3 className={sectionTitle}>Configuração operacional</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Código</label>
              <input value={form.codigo || ""} disabled className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Descrição</label>
              <input value={form.descricao || ""} disabled className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Categoria</label>
              <select
                value={form.categoria ?? ""}
                onChange={(e) => set("categoria", e.target.value || null)}
                className={inputClass}
              >
                <option value="">—</option>
                {CATEGORIA_OPTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tipo de Movimento</label>
              <select
                value={form.tipo_movimento ?? ""}
                onChange={(e) => set("tipo_movimento", e.target.value ? Number(e.target.value) : null)}
                className={inputClass}
              >
                <option value="">Não se aplica</option>
                {TIPO_MOV_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <Switch checked={form.ativo !== false} onCheckedChange={(v) => set("ativo", v)} />
              <label className="text-sm text-foreground">Ativo</label>
            </div>
          </div>

          {/* Seção 2 — Parâmetros de produtividade (LMS) */}
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className={sectionTitle}>Parâmetros de produtividade (LMS)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Tempo estimado (segundos)</label>
                <input
                  type="number"
                  min={0}
                  value={form.tempo_estimado_segundos ?? ""}
                  onChange={(e) => set("tempo_estimado_segundos", e.target.value)}
                  placeholder="Ex: 120"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Meta de unidades/hora</label>
                <input
                  type="number"
                  min={0}
                  value={form.meta_unidades_hora ?? ""}
                  onChange={(e) => set("meta_unidades_hora", e.target.value)}
                  placeholder="Ex: 80"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Meta de tarefas/hora</label>
                <input
                  type="number"
                  min={0}
                  value={form.meta_tarefas_hora ?? ""}
                  onChange={(e) => set("meta_tarefas_hora", e.target.value)}
                  placeholder="Ex: 15"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Unidade de medida</label>
                <input
                  type="text"
                  value={form.unidade_medida ?? ""}
                  onChange={(e) => set("unidade_medida", e.target.value)}
                  placeholder="Ex: caixas, pallets, SKUs"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Peso de produtividade</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={form.peso_produtividade ?? ""}
                  onChange={(e) => set("peso_produtividade", e.target.value)}
                  placeholder="Ex: 1.0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Cor nos gráficos</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={corAtual}
                    onChange={(e) => set("cor_interface", e.target.value)}
                    className="h-10 w-14 rounded-lg border border-border bg-secondary/40 cursor-pointer"
                  />
                  <div
                    className="w-6 h-6 rounded border border-border"
                    style={{ backgroundColor: corAtual }}
                    aria-label="Preview da cor"
                  />
                  <span className="text-xs text-muted-foreground font-mono">{corAtual}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
