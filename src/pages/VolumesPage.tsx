import { useState, useMemo } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/utils/dateTime";
import { Printer, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { PrintEtiquetaVolumeModal } from "@/components/etiqueta/PrintEtiquetaVolumeModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";

const STATUS_MAP: Record<string, number> = { ABERTO: 0, FECHADO: 1, CONFERIDO: 2, EXPEDIDO: 3 };

export function VolumesPage() {
  const { tenantId, usuarioId } = useTenant() as any;
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterOnda, setFilterOnda] = useState<string>("");
  const [filterDataDe, setFilterDataDe] = useState<string>("");
  const [filterDataAte, setFilterDataAte] = useState<string>("");

  const crudFilters = useMemo(() => {
    const f: Record<string, any> = {};
    if (filterStatus !== "all") f.status = filterStatus;
    if (filterOnda.trim() && /^\d+$/.test(filterOnda.trim())) f.numero_onda = Number(filterOnda.trim());
    if (filterDataDe || filterDataAte) {
      f.created_at = {
        gte: filterDataDe ? `${filterDataDe}T00:00:00` : undefined,
        lte: filterDataAte ? `${filterDataAte}T23:59:59` : undefined,
      };
    }
    return f;
  }, [filterStatus, filterOnda, filterDataDe, filterDataAte]);

  const crud = useCrud({
    table: "vw_volume_expedicao_lista",
    writeTable: "volume_expedicao",
    tenantId,
    orderBy: "created_at",
    orderDir: "desc",
    filters: crudFilters,
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);
  const [printVolumes, setPrintVolumes] = useState<any[]>([]);

  const [deleteVolume, setDeleteVolume] = useState<any>(null);
  const [deleteObs, setDeleteObs] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handlePrintSelected = () => {
    const selected = crud.data.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setPrintVolumes(selected);
    setPrintOpen(true);
  };

  const handlePrintSingle = (row: any) => {
    setPrintVolumes([row]);
    setPrintOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteVolume) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc("fn_excluir_volume_expedicao", {
        p_volume_id: deleteVolume.id,
        p_usuario_id: usuarioId,
        p_observacao: deleteObs.trim() || null,
      });
      if (error) throw error;
      const result = data as any;
      toast.success(
        `Volume ${result?.codigo_volume ?? ""} excluído.`,
        { description: `Movimento passou de ${result?.total_antes ?? "?"} para ${result?.total_depois ?? "?"} volume(s). Ocorrência registrada.` }
      );
      setDeleteVolume(null);
      setDeleteObs("");
      await crud.refresh();
    } catch (err: unknown) {
      const parsed = parseError(err, "excluir volume de expedição");
      toast.error(parsed.title, { description: parsed.technicalMessage });
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnSpec[] = [
    { key: "codigo_volume", label: "Código Volume", type: "mono" },
    { key: "numero_onda", label: "Nº Onda", render: (row) => (
      <span className="text-sm font-semibold text-foreground">{row.numero_onda ?? "—"}</span>
    )},
    { key: "parceiro_nome", label: "Razão Social", render: (row) => (
      <span className="text-sm text-muted-foreground">{row.parceiro_nome ?? "—"}</span>
    )},
    { key: "destino_carga", label: "Destino", render: (row) => (
      <span className="text-sm text-muted-foreground">{row.destino_carga ?? "—"}</span>
    )},
    { key: "peso_bruto", label: "Peso (kg)", type: "number" },
    { key: "m3", label: "M³", type: "number" },
    { key: "total_volumes_movimento", label: "Vols. Mov.", render: (row) => (
      <span className="text-sm text-muted-foreground">{row.total_volumes_movimento ?? "—"}</span>
    )},
    { key: "status", label: "Status", render: (row) => (
      <StatusBadge status={STATUS_MAP[row.status] ?? 0} type="volume-status" />
    )},
    { key: "created_at", label: "Criado em", render: (row) => (
      <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>
    )},
  ];

  return (
    <>
      <CrudTable
        title="Volumes de Expedição"
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
        onNew={() => {}}
        onEdit={() => {}}
        onDelete={(row) => setDeleteVolume(row)}
        canCreate={false}
        canEdit={false}
        newLabel="Novo Volume"
        searchPlaceholder="Buscar por código do volume, onda, parceiro ou destino..."
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        extraFilters={
          <>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); crud.setPage(1); }}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            >
              <option value="all">Status: Todos</option>
              <option value="ABERTO">Aberto</option>
              <option value="FECHADO">Fechado</option>
              <option value="CONFERIDO">Conferido</option>
              <option value="EXPEDIDO">Expedido</option>
            </select>
            <input
              type="number"
              placeholder="Nº Onda"
              value={filterOnda}
              onChange={(e) => { setFilterOnda(e.target.value); crud.setPage(1); }}
              className="w-28 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40"
            />
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground">De</label>
              <input
                type="date"
                value={filterDataDe}
                onChange={(e) => { setFilterDataDe(e.target.value); crud.setPage(1); }}
                className="bg-secondary text-foreground text-sm rounded-lg px-2 py-2 outline-none border border-transparent focus:border-primary/40"
              />
              <label className="text-xs text-muted-foreground ml-1">Até</label>
              <input
                type="date"
                value={filterDataAte}
                onChange={(e) => { setFilterDataAte(e.target.value); crud.setPage(1); }}
                className="bg-secondary text-foreground text-sm rounded-lg px-2 py-2 outline-none border border-transparent focus:border-primary/40"
              />
            </div>
            {(filterStatus !== "all" || filterOnda || filterDataDe || filterDataAte) && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus("all");
                  setFilterOnda("");
                  setFilterDataDe("");
                  setFilterDataAte("");
                  crud.setPage(1);
                }}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Limpar filtros
              </button>
            )}
          </>
        }
        headerActions={
          selectedIds.size > 0 ? (
            <button
              onClick={handlePrintSelected}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/50 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              <Printer size={15} />
              Imprimir Selecionados ({selectedIds.size})
            </button>
          ) : null
        }
        extraRowActions={(row) => (
          <button
            onClick={() => handlePrintSingle(row)}
            className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            title="Imprimir etiqueta"
          >
            <Printer size={13} />
          </button>
        )}
      />

      <PrintEtiquetaVolumeModal
        open={printOpen}
        onClose={() => { setPrintOpen(false); setPrintVolumes([]); }}
        volumes={printVolumes}
      />

      {/* Delete dialog customizado */}
      <Dialog open={!!deleteVolume} onOpenChange={(v) => { if (!v && !deleting) { setDeleteVolume(null); setDeleteObs(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <div>
                <DialogTitle>Excluir Volume de Expedição</DialogTitle>
                <DialogDescription className="mt-1">
                  {deleteVolume?.status !== "ABERTO"
                    ? `Este volume está com status "${deleteVolume?.status}". Somente volumes em status ABERTO podem ser excluídos.`
                    : "Uma ocorrência operacional será registrada automaticamente com o histórico do movimento (volume excluído, total antes e depois)."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {deleteVolume?.status === "ABERTO" && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg bg-secondary/50 border border-border p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Código</span><span className="font-mono font-semibold text-primary">{deleteVolume?.codigo_volume}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Onda</span><span className="text-foreground">{deleteVolume?.numero_onda ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total de volumes atual</span><span className="text-foreground font-semibold">{deleteVolume?.total_volumes_movimento ?? "?"}</span></div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium">Observação (opcional)</label>
                <textarea
                  value={deleteObs}
                  onChange={(e) => setDeleteObs(e.target.value)}
                  placeholder="Motivo da exclusão..."
                  rows={3}
                  className="w-full mt-1 bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40 resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <button
              onClick={() => { setDeleteVolume(null); setDeleteObs(""); }}
              disabled={deleting}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            {deleteVolume?.status === "ABERTO" && (
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? "Excluindo..." : "Excluir e registrar ocorrência"}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
