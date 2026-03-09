import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";
import { useState } from "react";

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  width?: string;
  render?: (value: any, row: any) => React.ReactNode;
  sortable?: boolean;
}

interface ReportTableProps {
  columns: ReportColumn[];
  data: any[];
  loading?: boolean;
  emptyMessage?: string;
}

export function ReportTable({ columns, data, loading, emptyMessage = "Nenhum registro encontrado." }: ReportTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const va = a[sortKey] ?? "";
        const vb = b[sortKey] ?? "";
        const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : data;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Carregando dados...
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-secondary">
            <TableRow className="border-b border-border hover:bg-secondary">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "text-xs font-semibold text-foreground whitespace-nowrap px-3 py-2",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.sortable !== false && "cursor-pointer select-none hover:text-primary"
                  )}
                  style={col.width ? { minWidth: col.width } : undefined}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && (
                      <ArrowUpDown size={11} className={cn("opacity-30", sortKey === col.key && "opacity-100 text-primary")} />
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground text-sm">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row, i) => (
                <TableRow key={row.id || i} className="border-b border-border/50 hover:bg-secondary/30">
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        "text-xs whitespace-nowrap px-3 py-1.5",
                        col.align === "right" && "text-right",
                        col.align === "center" && "text-center"
                      )}
                    >
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
