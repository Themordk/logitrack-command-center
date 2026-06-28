import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

export interface ProdutoSearchResult {
  id: string;
  sku: string;
  descricao: string;
  referencia: string | null;
  preco_custo: number | null;
  ean_match?: string | null;
}

interface Props {
  value: ProdutoSearchResult | null;
  onChange: (produto: ProdutoSearchResult | null) => void;
  tenantId: string | null;
  empresaId: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

export function ProdutoSearchInput({
  value,
  onChange,
  tenantId,
  empresaId,
  disabled,
  autoFocus,
  placeholder = "Buscar por SKU, descrição, referência ou EAN…",
}: Props) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProdutoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounced = useDebounce(term.trim(), 250);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

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
      const baseFilter = (q: any) =>
        q.eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true);

      const prodPromise = baseFilter(
        (supabase as any)
          .from("produto")
          .select("id, sku, descricao, referencia, preco_custo")
          .or(`sku.ilike.${pattern},descricao.ilike.${pattern},referencia.ilike.${pattern}`)
          .order("descricao")
          .limit(30)
      );

      const numericTerm = /^\d+$/.test(t);
      const eanPromise = numericTerm
        ? (supabase as any)
            .from("produto_embalagem")
            .select("ean, produto:produto_id(id, sku, descricao, referencia, preco_custo, ativo, empresa_id, tenant_id)")
            .ilike("ean", pattern)
            .limit(20)
        : Promise.resolve({ data: [], error: null });

      const [prodRes, eanRes] = await Promise.all([prodPromise, eanPromise]);
      if (cancelled) return;
      setLoading(false);

      const merged = new Map<string, ProdutoSearchResult>();
      ((prodRes as any).data || []).forEach((p: any) => {
        merged.set(p.id, {
          id: p.id,
          sku: p.sku,
          descricao: p.descricao,
          referencia: p.referencia,
          preco_custo: p.preco_custo,
        });
      });
      ((eanRes as any).data || []).forEach((row: any) => {
        const p = row.produto;
        if (!p || p.tenant_id !== tenantId || p.empresa_id !== empresaId || !p.ativo) return;
        if (!merged.has(p.id)) {
          merged.set(p.id, {
            id: p.id,
            sku: p.sku,
            descricao: p.descricao,
            referencia: p.referencia,
            preco_custo: p.preco_custo,
            ean_match: row.ean,
          });
        } else {
          const existing = merged.get(p.id)!;
          if (!existing.ean_match) existing.ean_match = row.ean;
        }
      });

      setResults(Array.from(merged.values()).slice(0, 30));
      setHighlight(0);
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

  const pick = (p: ProdutoSearchResult) => {
    setTerm("");
    setResults([]);
    setOpen(false);
    onChange(p);
  };

  const clear = () => {
    setTerm("");
    onChange(null);
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

  const showDropdown = open && !value && term.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative">
      {value ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 h-10 px-3 rounded-lg border bg-secondary/40",
            disabled ? "border-border opacity-60" : "border-primary/40"
          )}
        >
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-medium text-foreground truncate">
              {value.sku} — {value.descricao}
            </span>
            {value.referencia && (
              <span className="text-[11px] text-muted-foreground truncate">Ref: {value.referencia}</span>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center"
              title="Trocar produto"
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
              disabled && "opacity-60 cursor-not-allowed"
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
            <div className="px-3 py-3 text-xs text-muted-foreground">Nenhum produto encontrado.</div>
          ) : (
            results.map((r, idx) => (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => pick(r)}
                className={cn(
                  "w-full text-left px-3 py-2 transition-colors border-b border-border/40 last:border-0",
                  idx === highlight ? "bg-secondary" : "hover:bg-secondary/60"
                )}
              >
                <div className="text-sm font-medium text-foreground truncate">
                  {r.sku} — {r.descricao}
                </div>
                <div className="text-[11px] text-muted-foreground truncate flex gap-3">
                  {r.referencia && <span>Ref: {r.referencia}</span>}
                  {r.ean_match && <span>EAN: {r.ean_match}</span>}
                  {r.preco_custo != null && (
                    <span className="ml-auto font-mono">
                      {Number(r.preco_custo).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
