import { useEffect, useRef, useState } from "react";
import { Loader2, X, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

export interface ParceiroSearchResult {
  id: string;
  razaosocial: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  codigo_erp: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, parceiro?: ParceiroSearchResult | null) => void;
  tenantId: string | null;
  empresaId: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

export function ParceiroSearchInput({
  value,
  onChange,
  tenantId,
  empresaId,
  disabled,
  autoFocus,
  placeholder = "Buscar por razão social, fantasia, CNPJ ou código ERP…",
}: Props) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ParceiroSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [selected, setSelected] = useState<ParceiroSearchResult | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounced = useDebounce(term.trim(), 250);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Hydrate chip when value changes externally
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!value) {
        setSelected(null);
        return;
      }
      if (selected?.id === value) return;
      const { data } = await (supabase as any)
        .from("parceiro")
        .select("id, razaosocial, nome_fantasia, cnpj, codigo_erp")
        .eq("id", value)
        .maybeSingle();
      if (!cancelled && data) setSelected(data as ParceiroSearchResult);
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    if (disabled || !tenantId || !empresaId) {
      setResults([]);
      return;
    }
    const t = debounced;
    if (t.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const escaped = t.replace(/[%,()]/g, " ");
      const pattern = `%${escaped}%`;
      const { data, error } = await (supabase as any)
        .from("parceiro")
        .select("id, razaosocial, nome_fantasia, cnpj, codigo_erp")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .or(
          `razaosocial.ilike.${pattern},nome_fantasia.ilike.${pattern},cnpj.ilike.${pattern},codigo_erp.ilike.${pattern}`,
        )
        .order("razaosocial")
        .limit(30);
      if (cancelled) return;
      setLoading(false);
      if (!error) {
        setResults((data as ParceiroSearchResult[]) || []);
        setHighlight(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, tenantId, empresaId, disabled]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (p: ParceiroSearchResult) => {
    setSelected(p);
    setTerm("");
    setResults([]);
    setOpen(false);
    onChange(p.id, p);
  };

  const clear = () => {
    setSelected(null);
    setTerm("");
    onChange(null, null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (results[highlight]) {
        e.preventDefault();
        pick(results[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown = open && !selected && term.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative">
      {selected ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 h-10 px-3 rounded-lg border bg-secondary/40",
            disabled ? "border-border opacity-60" : "border-primary/40",
          )}
        >
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-medium text-foreground truncate">
              {selected.razaosocial}
            </span>
            <span className="text-[11px] text-muted-foreground truncate flex gap-3">
              {selected.cnpj && <span className="font-mono">{selected.cnpj}</span>}
              {selected.codigo_erp && <span>ERP: {selected.codigo_erp}</span>}
            </span>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center"
              title="Trocar parceiro"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKey}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(
              "w-full h-10 pl-8 pr-3 rounded-lg border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
              "border-border focus:border-primary focus:ring-1 focus:ring-primary/30",
              disabled && "opacity-60 cursor-not-allowed",
            )}
          />
          {loading && (
            <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
          )}
        </div>
      )}

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Buscando...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Nenhum parceiro encontrado.</div>
          ) : (
            results.map((r, idx) => (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => pick(r)}
                className={cn(
                  "w-full text-left px-3 py-2 transition-colors border-b border-border/40 last:border-0",
                  idx === highlight ? "bg-secondary" : "hover:bg-secondary/60",
                )}
              >
                <div className="text-sm font-medium text-foreground truncate">
                  {r.razaosocial}
                  {r.nome_fantasia && (
                    <span className="text-muted-foreground font-normal"> — {r.nome_fantasia}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate flex gap-3">
                  {r.cnpj && <span className="font-mono">{r.cnpj}</span>}
                  {r.codigo_erp && <span>ERP: {r.codigo_erp}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
