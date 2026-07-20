import { useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/StatusBadge";
import { Save, Loader2 } from "lucide-react";
import { parseError } from "@/lib/errorMapper";

interface TipoTarefa {
  id: string;
  codigo: string;
  descricao: string;
  prioridade_padrao: number | null;
  tempo_estimado_segundos: number | null;
  gera_movimento_estoque: boolean | null;
  bloqueia_estoque: boolean | null;
  exige_conferencia: boolean | null;
  tipo_movimento: number | null;
}

const TIPO_MOV_OPTS = [
  { value: 1, label: "Entrada" },
  { value: 2, label: "Saída" },
  { value: 3, label: "Transferência" },
];

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
      key: "tipo_movimento", label: "Movimento",
      render: (r) => <span className="text-sm text-muted-foreground">{tipoMovLabel(r.tipo_movimento)}</span>,
    },
    {
      key: "prioridade_padrao", label: "Prioridade",
      render: (r) => <span className="text-sm text-muted-foreground">{r.prioridade_padrao ?? "—"}</span>,
    },
    {
      key: "tempo_estimado_segundos", label: "Tempo Est. (s)",
      render: (r) => <span className="text-sm text-muted-foreground">{r.tempo_estimado_segundos ?? "—"}</span>,
    },
    {
      key: "gera_movimento_estoque", label: "Gera Estoque",
      render: (r) => <StatusBadge status={r.gera_movimento_estoque ? "Sim" : "Não"} type="generic" />,
    },
    {
      key: "bloqueia_estoque", label: "Bloqueia",
      render: (r) => <StatusBadge status={r.bloqueia_estoque ? "Sim" : "Não"} type="generic" />,
    },
    {
      key: "exige_conferencia", label: "Conferência",
      render: (r) => <StatusBadge status={r.exige_conferencia ? "Sim" : "Não"} type="generic" />,
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

  const set = (k: keyof TipoTarefa, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    const payload = {
      prioridade_padrao: form.prioridade_padrao === null || form.prioridade_padrao === undefined || form.prioridade_padrao === ("" as any) ? null : Number(form.prioridade_padrao),
      tempo_estimado_segundos: form.tempo_estimado_segundos === null || form.tempo_estimado_segundos === undefined || form.tempo_estimado_segundos === ("" as any) ? null : Number(form.tempo_estimado_segundos),
      gera_movimento_estoque: !!form.gera_movimento_estoque,
      bloqueia_estoque: !!form.bloqueia_estoque,
      exige_conferencia: !!form.exige_conferencia,
      tipo_movimento: form.tipo_movimento ? Number(form.tipo_movimento) : null,
    };
    const { error } = await (supabase as any).from("tipo_tarefa").update(payload).eq("id", item.id);
    setSaving(false);
    if (error) { toast.error(parseError(error, "salvar tipo-tarefa").title); return; }
    toast.success("Tipo de tarefa atualizado!");
    onSaved();
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Tipo de Tarefa</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <div>
            <label className={labelClass}>Código</label>
            <input value={form.codigo || ""} disabled className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Descrição</label>
            <input value={form.descricao || ""} disabled className={inputClass} />
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

          <div>
            <label className={labelClass}>Prioridade Padrão</label>
            <input
              type="number"
              min={1}
              value={form.prioridade_padrao ?? ""}
              onChange={(e) => set("prioridade_padrao", e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Tempo Estimado (segundos)</label>
            <input
              type="number"
              min={0}
              value={form.tempo_estimado_segundos ?? ""}
              onChange={(e) => set("tempo_estimado_segundos", e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-border">
            <div className="flex items-center gap-3">
              <Switch checked={!!form.gera_movimento_estoque} onCheckedChange={(v) => set("gera_movimento_estoque", v)} />
              <label className="text-sm text-foreground">Gera Movimento de Estoque</label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={!!form.bloqueia_estoque} onCheckedChange={(v) => set("bloqueia_estoque", v)} />
              <label className="text-sm text-foreground">Bloqueia Estoque</label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={!!form.exige_conferencia} onCheckedChange={(v) => set("exige_conferencia", v)} />
              <label className="text-sm text-foreground">Exige Conferência</label>
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
