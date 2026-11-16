import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Printer, Save, Loader2, AlertCircle, Lock, LockOpen, Ban } from "lucide-react";
import { PrintEtiquetaHUModal } from "@/components/etiqueta/PrintEtiquetaHUModal";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { huService, acoesHU } from "@/lib/huService";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function HUsPage({ onNavigate }: { onNavigate?: (path: string) => void } = {}) {
  const { tenantId, empresaId, armazemId } = useTenant();
  const crud = useCrud({
    table: "hu",
    tenantId,
    orderBy: "codigo_hu",
    filters: empresaId ? { empresa_id: empresaId } : {},
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  // Ações com motivo (reabrir / descartar) — regra e permissão no banco (rpc_hu_*)
  const [acaoMotivo, setAcaoMotivo] = useState<{ tipo: "reabrir" | "descartar"; row: any } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [executando, setExecutando] = useState(false);

  // Selection & Print
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printHUs, setPrintHUs] = useState<any[]>([]);
  const [printOpen, setPrintOpen] = useState(false);

  // Form state
  const [form, setForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handlePrintSelected = () => {
    const selected = crud.data.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setPrintHUs(selected);
    setPrintOpen(true);
  };

  const handlePrintSingle = (row: any) => {
    setPrintHUs([row]);
    setPrintOpen(true);
  };

  const statusMap: Record<string, { color: string; label: string }> = {
    ABERTA: { color: "text-blue-400", label: "Aberta" },
    FECHADA: { color: "text-yellow-400", label: "Fechada" },
    EM_TRANSITO: { color: "text-purple-400", label: "Em Trânsito" },
    ARMAZENADA: { color: "text-green-400", label: "Armazenada" },
    EXPEDIDA: { color: "text-gray-400", label: "Expedida" },
    DESCARTADA: { color: "text-red-400", label: "Descartada" },
    DESMONTADA: { color: "text-gray-400", label: "Desmontada" },
  };

  const executarFechar = async (row: any) => {
    try {
      const r = await huService.fechar(row.id);
      toast.success(r.mensagem || "HU fechada.");
      await crud.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const executarAcaoMotivo = async () => {
    if (!acaoMotivo) return;
    if (!motivo.trim()) { toast.error("Informe o motivo."); return; }
    setExecutando(true);
    try {
      const r = acaoMotivo.tipo === "reabrir"
        ? await huService.reabrir(acaoMotivo.row.id, motivo)
        : await huService.descartar(acaoMotivo.row.id, motivo);
      toast.success(r.mensagem || "Feito.");
      setAcaoMotivo(null);
      setMotivo("");
      await crud.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setExecutando(false);
    }
  };

  const columns: ColumnSpec[] = [
    { key: "codigo_hu", label: "Código HU", type: "mono" },
    { key: "tipo_hu", label: "Tipo" },
    { key: "tamanho", label: "Tamanho" },
    { key: "status", label: "Status", render: (row) => {
      const s = statusMap[row.status] || { color: "text-gray-400", label: row.status || "—" };
      return <span className={`text-xs font-bold ${s.color}`}>{s.label}</span>;
    }},
    { key: "disponibilidade", label: "Disponibilidade", render: (row) => {
      const map: Record<string, number> = { DISPONIVEL: 0, RESERVADA: 1, BLOQUEADA: 2, EM_MOVIMENTO: 3, DESCARTADA: 4 };
      return <StatusBadge status={map[row.disponibilidade] ?? 0} type="hu-disponibilidade" />;
    }},
    { key: "peso_bruto", label: "Peso Bruto", type: "number" },
    { key: "created_at", label: "Criada em", render: (row) => {
      if (!row.created_at) return "—";
      return new Date(row.created_at).toLocaleDateString("pt-BR");
    }},
  ];

  const openNewModal = () => {
    setEditItem(null);
    setForm({
      tipo_hu: "",
      tamanho: "",
      altura: "",
      peso_bruto: "",
      m3: "",
      quantidade: 1,
    });
    setErrors({});
    setModalOpen(true);
  };

  const openEditModal = (row: any) => {
    if (!acoesHU(row.status).editar) {
      toast.info(`A HU ${row.codigo_hu} está encerrada e não pode ser editada.`);
      return;
    }
    setEditItem(row);
    setForm({
      tipo_hu: row.tipo_hu || "",
      tamanho: row.tamanho || "",
      altura: row.altura ?? "",
      peso_bruto: row.peso_bruto ?? "",
      m3: row.m3 ?? "",
      quantidade: 1,
    });
    setErrors({});
    setModalOpen(true);
  };

  const set = (name: string, value: any) => {
    setForm((p) => ({ ...p, [name]: value }));
    setErrors((e) => { const n = { ...e }; delete n[name]; return n; });
  };

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!form.tipo_hu) errs.tipo_hu = "Campo obrigatório";
    if (!form.tamanho) errs.tamanho = "Campo obrigatório";
    if (!editItem) {
      const qty = parseInt(form.quantidade, 10);
      if (!qty || qty < 1) errs.quantidade = "Mínimo 1";
      if (qty > 500) errs.quantidade = "Máximo 500";
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    try {
      // Código, autor e histórico ficam no banco: rpc_hu_gerar / rpc_hu_editar (status não muda por aqui)
      const dados = {
        tipo_hu: form.tipo_hu,
        tamanho: form.tamanho,
        altura: form.altura,
        peso_bruto: form.peso_bruto,
        m3: form.m3,
      };
      if (editItem) {
        await huService.editar(editItem.id, dados);
        toast.success("HU atualizada com sucesso!");
      } else {
        if (!empresaId) throw new Error("Selecione a empresa antes de gerar HUs.");
        const qty = parseInt(form.quantidade, 10) || 1;
        const r = await huService.gerar({ ...dados, quantidade: qty, empresa_id: empresaId, armazem_id: armazemId });
        toast.success(r.mensagem || `${qty} HU(s) gerada(s) com sucesso!`);
      }
      await crud.refresh();
      setModalOpen(false);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = (name: string) => cn(
    "w-full h-10 px-3 rounded-lg border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
    errors[name] ? "border-destructive" : "border-border",
    "focus:border-primary focus:ring-1 focus:ring-primary/30"
  );

  return (
    <>
      <CrudTable
        title="Unidades de Handling (HUs)"
        columns={columns}
        data={crud.data}
        loading={crud.loading}
        search={crud.search}
        onSearchChange={crud.setSearch}
        page={crud.page}
        totalPages={crud.totalPages}
        total={crud.total}
        pageSize={crud.pageSize}
        onPageChange={crud.setPage}
        onNew={openNewModal}
        onEdit={openEditModal}
        onDelete={() => undefined}
        canDelete={false}
        newLabel="Nova HU"
        searchPlaceholder="Buscar HU..."
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        headerActions={
          selectedIds.size > 0 ? (
            <button
              onClick={handlePrintSelected}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/50 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              <Printer size={15} />
              Imprimir HU ({selectedIds.size})
            </button>
          ) : undefined
        }
        extraRowActions={(row) => {
          const acoes = acoesHU(row.status);
          const btn = "w-7 h-7 rounded hover:bg-secondary text-muted-foreground transition-colors flex items-center justify-center";
          return (
            <>
              <button onClick={() => handlePrintSingle(row)} className={cn(btn, "hover:text-foreground")}
                title="Imprimir etiqueta HU" aria-label="Imprimir etiqueta HU">
                <Printer size={13} />
              </button>
              {acoes.fechar && (
                <button onClick={() => executarFechar(row)} className={cn(btn, "hover:text-foreground")}
                  title="Fechar HU" aria-label="Fechar HU">
                  <Lock size={13} />
                </button>
              )}
              {acoes.reabrir && (
                <button onClick={() => { setMotivo(""); setAcaoMotivo({ tipo: "reabrir", row }); }}
                  className={cn(btn, "hover:text-foreground")} title="Reabrir HU" aria-label="Reabrir HU">
                  <LockOpen size={13} />
                </button>
              )}
              {acoes.descartar && (
                <button onClick={() => { setMotivo(""); setAcaoMotivo({ tipo: "descartar", row }); }}
                  className={cn(btn, "hover:text-destructive")} title="Descartar HU vazia" aria-label="Descartar HU vazia">
                  <Ban size={13} />
                </button>
              )}
            </>
          );
        }}
      />

      {/* Custom Sheet */}
      <Sheet open={modalOpen} onOpenChange={(v) => !v && setModalOpen(false)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl !p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
            <SheetTitle>{editItem ? "Editar HU" : "Gerar HU"}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tipo HU */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                Tipo HU<span className="text-destructive ml-0.5">*</span>
              </label>
              <select value={form.tipo_hu || ""} onChange={(e) => set("tipo_hu", e.target.value)}
                className={cn(fieldClass("tipo_hu"), "cursor-pointer", !form.tipo_hu && "text-muted-foreground")}>
                <option value="">Selecionar...</option>
                {["PALLET", "CAIXA", "VOLUME", "OUTRO"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              {errors.tipo_hu && <p className="flex items-center gap-1 mt-1 text-xs text-destructive"><AlertCircle size={11} /> {errors.tipo_hu}</p>}
            </div>

            {/* Tamanho */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                Tamanho<span className="text-destructive ml-0.5">*</span>
              </label>
              <select value={form.tamanho || ""} onChange={(e) => set("tamanho", e.target.value)}
                className={cn(fieldClass("tamanho"), "cursor-pointer", !form.tamanho && "text-muted-foreground")}>
                <option value="">Selecionar...</option>
                {["P", "M", "G", "GG", "EG"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              {errors.tamanho && <p className="flex items-center gap-1 mt-1 text-xs text-destructive"><AlertCircle size={11} /> {errors.tamanho}</p>}
            </div>

            {/* Altura */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Altura</label>
              <input type="number" step="any" value={form.altura ?? ""} onChange={(e) => set("altura", e.target.value)} placeholder="cm" className={fieldClass("altura")} />
            </div>

            {/* Peso Bruto */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Peso Bruto</label>
              <input type="number" step="any" value={form.peso_bruto ?? ""} onChange={(e) => set("peso_bruto", e.target.value)} placeholder="kg" className={fieldClass("peso_bruto")} />
            </div>

            {/* M³ */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">M³</label>
              <input type="number" step="any" value={form.m3 ?? ""} onChange={(e) => set("m3", e.target.value)} placeholder="m³" className={fieldClass("m3")} />
            </div>

            {/* Quantidade - only for new */}
            {!editItem && (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Quantidade a gerar<span className="text-destructive ml-0.5">*</span>
                </label>
                <input type="number" min={1} max={500} step={1} value={form.quantidade ?? 1}
                  onChange={(e) => set("quantidade", e.target.value)} placeholder="Quantidade de HUs a gerar"
                  className={fieldClass("quantidade")} />
                {errors.quantidade && <p className="flex items-center gap-1 mt-1 text-xs text-destructive"><AlertCircle size={11} /> {errors.quantidade}</p>}
                <p className="text-xs text-muted-foreground mt-1">Códigos HU serão gerados automaticamente pelo sistema.</p>
              </div>
            )}
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-border shrink-0 flex-row justify-end gap-2">
            <button onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Salvando..." : editItem ? "Salvar" : "Gerar"}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>


      <Dialog open={!!acaoMotivo} onOpenChange={(v) => { if (!v && !executando) setAcaoMotivo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acaoMotivo?.tipo === "reabrir" ? "Reabrir HU" : "Descartar HU"} {acaoMotivo?.row?.codigo_hu}
            </DialogTitle>
            <DialogDescription>
              {acaoMotivo?.tipo === "reabrir"
                ? "A HU volta a aceitar itens na conferência. O motivo fica no histórico da HU."
                : "Só HU aberta e vazia pode ser descartada. Ela deixa de poder ser usada e o motivo fica no histórico."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obrigatório)"
            aria-label="Motivo" rows={3} />
          <DialogFooter>
            <button onClick={() => setAcaoMotivo(null)} disabled={executando}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Cancelar
            </button>
            <button onClick={executarAcaoMotivo} disabled={executando || !motivo.trim()}
              className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors",
                acaoMotivo?.tipo === "descartar" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90")}>
              {executando && <Loader2 size={14} className="animate-spin" />}
              {acaoMotivo?.tipo === "reabrir" ? "Reabrir" : "Descartar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PrintEtiquetaHUModal
        open={printOpen}
        onClose={() => { setPrintOpen(false); setPrintHUs([]); }}
        hus={printHUs}
        onNavigate={onNavigate}
      />
    </>
  );
}
