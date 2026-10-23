import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/useTableSort";

interface SortableThProps {
  label: string;
  sortKey: string;
  activeKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}

export function SortableTh({ label, sortKey, activeKey, dir, onSort, align = "left", className }: SortableThProps) {
  const active = activeKey === sortKey;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={cn(align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", className)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse",
          active && "text-primary",
        )}
      >
        <span>{label}</span>
        <Icon size={11} />
      </button>
    </th>
  );
}
