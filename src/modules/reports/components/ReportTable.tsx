import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  /** Largura mínima da coluna (ex.: "120px"). */
  width?: string;
  /** Largura máxima da coluna. Use junto com `wrap` para textos longos. */
  maxWidth?: string;
  /** Permite quebra de linha na célula (padrão: sem quebra). */
  wrap?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
  sortable?: boolean;
}

interface ReportTableProps {
  columns: ReportColumn[];
  data: any[];
  loading?: boolean;
  emptyMessage?: string;
  /** A partir de quantas linhas a rolagem virtual é ativada. */
  virtualizeThreshold?: number;
}

type ReportRow = ReportTableProps["data"][number];

/** Acima deste volume a tabela só desenha as linhas visíveis. */
export const REPORT_VIRTUALIZE_THRESHOLD = 300;
const ROW_HEIGHT_ESTIMATE = 30;
const ROW_HEIGHT_ESTIMATE_WRAP = 44;
const OVERSCAN = 12;

function usePrinting() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return printing;
}

export function ReportTable({
  columns,
  data,
  loading,
  emptyMessage = "Nenhum registro encontrado.",
  virtualizeThreshold = REPORT_VIRTUALIZE_THRESHOLD,
}: ReportTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const scrollRef = useRef<HTMLDivElement>(null);
  const printing = usePrinting();

  const hasWrap = columns.some((c) => c.wrap);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const va = a[sortKey] ?? "";
      const vb = b[sortKey] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const virtualize = !printing && sorted.length > virtualizeThreshold;

  const virtualizer = useVirtualizer({
    count: virtualize ? sorted.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (hasWrap ? ROW_HEIGHT_ESTIMATE_WRAP : ROW_HEIGHT_ESTIMATE),
    overscan: OVERSCAN,
    // jsdom/primeiro render: garante algumas linhas antes da medição real
    initialRect: { width: 1024, height: 600 },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        Carregando dados...
      </div>
    );
  }

  const virtualItems = virtualize ? virtualizer.getVirtualItems() : [];
  const paddingTop = virtualize && virtualItems.length ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualize && virtualItems.length
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  const rowsToRender: { row: ReportRow; index: number }[] = virtualize
    ? virtualItems.map((vi) => ({ row: sorted[vi.index], index: vi.index }))
    : sorted.map((row, index) => ({ row, index }));

  const renderRow = (row: ReportRow, index: number) => (
    <TableRow
      key={row.id ?? index}
      data-index={index}
      ref={virtualize ? virtualizer.measureElement : undefined}
      className="border-b border-border/50 hover:bg-secondary/30"
    >
      {columns.map((col) => (
        <TableCell
          key={col.key}
          className={cn(
            "text-xs px-3 py-1.5",
            col.wrap ? "whitespace-normal" : "whitespace-nowrap",
            hasWrap && "align-top",
            col.align === "right" && "text-right",
            col.align === "center" && "text-center",
          )}
          style={col.wrap && col.maxWidth ? { maxWidth: col.maxWidth } : undefined}
        >
          {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
        </TableCell>
      ))}
    </TableRow>
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
      <div ref={scrollRef} data-testid="report-table-scroll" className="flex-1 min-h-0 overflow-auto">
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
                  style={
                    col.width || col.maxWidth
                      ? { minWidth: col.width, maxWidth: col.wrap ? col.maxWidth : undefined }
                      : undefined
                  }
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
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true" style={{ height: paddingTop }}>
                    <td colSpan={columns.length} />
                  </tr>
                )}
                {rowsToRender.map(({ row, index }) => renderRow(row, index))}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true" style={{ height: paddingBottom }}>
                    <td colSpan={columns.length} />
                  </tr>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
