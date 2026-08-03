import { Edit2, Trash2, Plus, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

export interface ColumnSpec {
  key: string;
  label: string;
  type?: "text" | "mono" | "badge" | "number" | "custom";
  badgeType?: "generic";
  render?: (row: any) => React.ReactNode;
  className?: string;
}

interface CrudTableProps {
  title: string;
  subtitle?: string;
  columns: ColumnSpec[];
  data: any[];
  loading: boolean;
  search?: string;
  onSearchChange?: (s: string) => void;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onNew: () => void;
  onEdit: (row: any) => void;
  onDelete: (row: any) => void;
  newLabel?: string;
  searchPlaceholder?: string;
  extraFilters?: React.ReactNode;
  // Selection support
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectChange?: (ids: Set<string>) => void;
  headerActions?: React.ReactNode;
  extraRowActions?: (row: any) => React.ReactNode;
  selectionBanner?: React.ReactNode;
  // Permission control
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function CrudTable({
  title, subtitle, columns, data, loading,
  search, onSearchChange, page, totalPages, total, pageSize,
  onPageChange, onNew, onEdit, onDelete,
  newLabel = "Novo", searchPlaceholder = "Buscar...",
  extraFilters,
  selectable, selectedIds, onSelectChange, headerActions, extraRowActions, selectionBanner,
  canCreate = true, canEdit = true, canDelete = true,
}: CrudTableProps) {
  const allSelected = selectable && data.length > 0 && data.every((r) => selectedIds?.has(r.id));
  const someSelected = selectable && data.some((r) => selectedIds?.has(r.id));

  const toggleAll = () => {
    if (!onSelectChange) return;
    if (allSelected) {
      const next = new Set(selectedIds);
      data.forEach((r) => next.delete(r.id));
      onSelectChange(next);
    } else {
      const next = new Set(selectedIds);
      data.forEach((r) => next.add(r.id));
      onSelectChange(next);
    }
  };

  const toggleOne = (id: string) => {
    if (!onSelectChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectChange(next);
  };
  const renderCell = (row: any, col: ColumnSpec) => {
    if (col.render) return col.render(row);
    const val = row[col.key];
    if (col.type === "badge") {
      const status = val === true ? "ativo" : val === false ? "inativo" : val;
      return <StatusBadge status={status} type={col.badgeType || "generic"} />;
    }
    if (col.type === "mono") return <span className="font-mono text-sm font-semibold text-primary">{val ?? "—"}</span>;
    if (col.type === "number") return <span className="text-sm text-muted-foreground">{val != null ? Number(val).toLocaleString("pt-BR") : "—"}</span>;
    return <span className="text-sm text-muted-foreground">{val ?? "—"}</span>;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle || `${total} registros`}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          {canCreate && (
            <button
              onClick={onNew}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} />
              {newLabel}
            </button>
          )}
        </div>
      </div>

      <div className="shrink-0 card-surface p-4 flex flex-wrap items-center gap-3">
        {search !== undefined && onSearchChange && (
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-secondary rounded-lg px-3 py-2">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
            />
          </div>
        )}
        {extraFilters}
      </div>

      {selectionBanner}

      <div className="card-surface overflow-hidden flex flex-col flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Carregando...</span>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-secondary/30">
                  {selectable && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={!!allSelected}
                        ref={(el) => { if (el) el.indeterminate = !!someSelected && !allSelected; }}
                        onChange={toggleAll}
                        className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                      />
                    </th>
                  )}
                  {columns.map((col) => (
                    <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1 + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                ) : (
                  data.map((row, idx) => (
                    <tr key={row.id} className={cn("border-b border-border/50 table-row-hover", idx % 2 !== 0 && "bg-secondary/10", selectable && selectedIds?.has(row.id) && "bg-primary/5")}>
                      {selectable && (
                        <td className="px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds?.has(row.id) || false}
                            onChange={() => toggleOne(row.id)}
                            className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key} className={cn("px-4 py-3", col.className)}>
                          {renderCell(row, col)}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {extraRowActions?.(row)}
                          {canEdit && (
                            <button onClick={() => onEdit(row)} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center" title="Editar">
                              <Edit2 size={13} />
                            </button>
                          )}
                          {canDelete && (
                            <button onClick={() => onDelete(row)} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center" title="Excluir">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
            {totalPages > 1 && (
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    Mostrando {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} de {total}
                  </span>
                  {selectable && selectedIds && selectedIds.size > 0 && (
                    <span className="text-xs font-medium text-primary">{selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 7) p = i + 1;
                    else if (page <= 4) p = i + 1;
                    else if (page >= totalPages - 3) p = totalPages - 6 + i;
                    else p = page - 3 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => onPageChange(p)}
                        className={cn(
                          "w-7 h-7 rounded text-xs transition-colors",
                          page === p ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => onPageChange(page + 1)}
                    disabled={page === totalPages}
                    className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Próximo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
