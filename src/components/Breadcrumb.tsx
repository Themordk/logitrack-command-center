import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate?: (path: string) => void;
}

export function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, idx) => (
        <span key={idx} className="flex items-center gap-1">
          {idx > 0 && <ChevronRight size={11} className="opacity-40" />}
          {item.path && onNavigate ? (
            <button
              onClick={() => onNavigate(item.path!)}
              className="hover:text-foreground transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className={cn(idx === items.length - 1 && "text-foreground font-medium")}>
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
